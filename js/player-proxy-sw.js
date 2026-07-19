/* Service-worker helper: fetch stream player HTML, unwrap document.write, strip ads */
(function (global) {
  const PLAYER_HOST_OK =
    /syria-player|shootsync|albaplayer|beinmax|thehlive/i;

  const AD_SRC_RE =
    /acscdn\.com|aclib\.js|baillieumbered|doubleclick|googlesyndication|pagead|popads|propeller|exoclick|trafficjunky|juicyads|adsterra|mgid|revcontent|adservice|adsystem|popunder|clickunder|ad-delivery|adserver|\/ads\/|adsbygoogle|histats|statcounter|yandex\.ru\/ads|mc\.yandex/i;

  function unwrapDocumentWrite(html) {
    const m = String(html || "").match(
      /document\.write\(["']((?:\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\[^"']|[^"'])*)["']\)/i
    );
    if (!m) return String(html || "");
    return m[1]
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }

  function stripAds(html) {
    let out = String(html || "");
    // Remove ad scripts / iframes / pixels
    out = out.replace(/<script\b[^>]*src=["'][^"']*["'][^>]*>\s*<\/script>/gi, (full) =>
      AD_SRC_RE.test(full) ? "<!-- shaib: ad script removed -->" : full
    );
    out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (full) =>
      AD_SRC_RE.test(full) ? "<!-- shaib: ad iframe removed -->" : full
    );
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (full) => {
      if (/function\s+_kill|SB_Blocked|تنبيه حماية/i.test(full)) {
        // Drop anti-embed killer — we serve same-origin; keep player working
        return "<!-- shaib: embed guard removed -->";
      }
      if (
        AD_SRC_RE.test(full) ||
        /adsbygoogle|aclib\s*\.|aclib\.run|runPop|runBanner|push\(.*ads/i.test(full)
      ) {
        return "<!-- shaib: ad inline removed -->";
      }
      return full;
    });
    // Naked ad loader leftovers
    out = out.replace(/aclib\.run(?:Pop|Banner)\([\s\S]*?\);?/gi, "/* shaib: aclib removed */");
    return out;
  }

  function injectShield(html, pageUrl) {
    const base = `<base href="${String(pageUrl).replace(/"/g, "&quot;")}">`;
    const shield = `<style id="shaib-player-cosmetic">
iframe[src*="ad"],iframe[src*="banner"],iframe[src*="pop"],iframe[id*="ad"],iframe[class*="ad"],
[class*="adsbox"],[id*="adsbox"],[class*="ad-container"],[id*="ad-container"],
[class*="popup"],[id*="popup"],[class*="OverlayAd"],a[href*="doubleclick"],
#aclib-wrapper,.aclib-widget,[class*="aclib"]{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important}
</style>
<script id="shaib-player-shield">
(function(){
  if(window.__shaibPlayerShield)return;window.__shaibPlayerShield=true;
  window.open=function(){return null;};
  try{Object.defineProperty(window,'open',{configurable:false,writable:false,value:function(){return null}});}catch(e){}
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest&&ev.target.closest('a[target="_blank"],a[href*="http"]');
    if(!a)return;
    var href=a.getAttribute('href')||'';
    if(/acscdn|baillieumbered|doubleclick|popunder|clickunder|exoclick|propeller/i.test(href)){
      ev.preventDefault();ev.stopPropagation();
    }
  },true);
  var re=/acscdn|aclib|baillieumbered|doubleclick|googlesyndication|pagead|popads|propeller|exoclick|trafficjunky|juicyads|adsterra|\\/ads\\//i;
  function scrub(){
    try{
      document.querySelectorAll('script[src],iframe[src],img[src],a[href]').forEach(function(el){
        var v=el.src||el.href||'';
        if(re.test(v)){el.remove();}
      });
    }catch(e){}
  }
  scrub();
  setInterval(scrub,800);
  try{new MutationObserver(scrub).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();
</script>`;
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => `${m}\n${base}\n${shield}`);
    }
    return `<!DOCTYPE html><html><head>${base}\n${shield}</head><body>${html}</body></html>`;
  }

  function isAllowedPlayerUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") return false;
      return PLAYER_HOST_OK.test(u.hostname + u.pathname);
    } catch (_) {
      return false;
    }
  }

  async function fetchPlayerHtml(targetUrl) {
    // Direct fetch fails in SW without CORS ACAO — use CORS proxies first.
    const tries = [
      `https://proxy.cors.sh/${targetUrl}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      targetUrl,
    ];
    let lastErr = "fetch failed";
    for (const u of tries) {
      try {
        const res = await fetch(u, {
          redirect: "follow",
          credentials: "omit",
          cache: "no-store",
          headers: {
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
        });
        if (!res.ok) {
          lastErr = `HTTP ${res.status}`;
          continue;
        }
        let text = await res.text();
        // allorigins /get-style JSON envelope
        try {
          const j = JSON.parse(text);
          if (j && typeof j.contents === "string") text = j.contents;
        } catch (_) {}
        if (text && text.length > 80 && /<html|document\.write|<video|<script/i.test(text)) {
          return text;
        }
        lastErr = "empty upstream";
      } catch (err) {
        lastErr = err && err.message ? err.message : String(err);
      }
    }
    throw new Error(lastErr);
  }

  async function buildPlayerProxyResponse(targetUrl) {
    if (!isAllowedPlayerUrl(targetUrl)) {
      return new Response("Forbidden player host", { status: 403 });
    }
    let html = await fetchPlayerHtml(targetUrl);
    html = unwrapDocumentWrite(html);
    html = stripAds(html);
    html = injectShield(html, targetUrl);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Shaib-Player-Proxy": "1",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  global.SHAIB_IS_PLAYER_PROXY = function (url) {
    try {
      return new URL(url).pathname.endsWith("/__shaib_player");
    } catch (_) {
      return false;
    }
  };

  global.SHAIB_HANDLE_PLAYER_PROXY = async function (request) {
    const u = new URL(request.url);
    const target = u.searchParams.get("u") || u.searchParams.get("url") || "";
    try {
      return await buildPlayerProxyResponse(target);
    } catch (err) {
      return new Response(String(err && err.message ? err.message : err), {
        status: 502,
      });
    }
  };
})(self);
