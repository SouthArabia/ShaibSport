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

  function isPlayerAssetUrl(u) {
    return /syria-player|shootsync|albaplayer|beinmax|jwplayer|jwplatform|jwpcdn|cloudflare|cloudfront|akamai|fastly|hlsjs|videojs|plyr|clappr|googleapis|gstatic/i.test(
      String(u || "")
    );
  }

  function stripAds(html) {
    let out = String(html || "");
    const isAdReq =
      typeof global.SHAIB_IS_AD_REQUEST === "function"
        ? global.SHAIB_IS_AD_REQUEST
        : (u) => AD_SRC_RE.test(String(u || ""));

    // Remove ad scripts / iframes — never strip the stream player itself
    out = out.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (full, src) => {
      if (isPlayerAssetUrl(src)) return full;
      return AD_SRC_RE.test(full) || isAdReq(src) ? "<!-- shaib: ad script removed -->" : full;
    });
    out = out.replace(/<iframe\b[^>]*src=["']([^"']+)["'][^>]*>[\s\S]*?<\/iframe>/gi, (full, src) => {
      if (isPlayerAssetUrl(src)) return full;
      return AD_SRC_RE.test(full) || isAdReq(src) ? "<!-- shaib: ad iframe removed -->" : full;
    });
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (full) => {
      if (/function\s+_kill|SB_Blocked|تنبيه حماية/i.test(full)) {
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
    out = out.replace(/aclib\.run(?:Pop|Banner)\([\s\S]*?\);?/gi, "/* shaib: aclib removed */");
    return out;
  }

  /** Light EasyList runtime — no giant host dump (that was blanking the player). */
  function easyListRuntimeShield() {
    return `<script id="shaib-easylist-runtime">
(function(){
  if(window.__shaibEasyListRuntime)return;window.__shaibEasyListRuntime=true;
  var allow=/syria-player|shootsync|albaplayer|beinmax|jwplayer|jwplatform|jwpcdn|cloudflare|cloudfront|akamai|fastly|googleapis|gstatic|hlsjs|videojs|plyr/i;
  var adRe=/acscdn|aclib|baillieumbered|doubleclick|googlesyndication|pagead|popads|propeller|exoclick|trafficjunky|juicyads|adsterra|adservice|adsystem|\\/pagead\\/|adsbygoogle|popunder|clickunder/i;
  function bad(u){
    u=String(u||'');
    if(!u||u.indexOf('blob:')===0||u.indexOf('data:')===0) return false;
    if(allow.test(u)) return false;
    return adRe.test(u);
  }
  try{window.open=function(){return null;};}catch(e){}
  try{
    var _x=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){ if(bad(u)){this.__b=1;u='about:blank';} return _x.apply(this,arguments); };
  }catch(e){}
  try{
    var _f=window.fetch;
    window.fetch=function(input,init){ var u=typeof input==='string'?input:(input&&input.url)||''; if(bad(u)) return Promise.reject(new TypeError('blocked')); return _f.apply(this,arguments); };
  }catch(e){}
  function scrub(){
    try{
      document.querySelectorAll('script[src],iframe[src]').forEach(function(el){
        var v=el.src||''; if(bad(v)) el.remove();
      });
    }catch(e){}
  }
  scrub(); setInterval(scrub,1000);
})();
</script>`;
  }

  function injectShield(html, pageUrl) {
    const base = `<base href="${String(pageUrl).replace(/"/g, "&quot;")}">`;
    const shield = `<style id="shaib-player-cosmetic">
iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[src*="acscdn"],
iframe[src*="popads"],iframe[id*="google_ads"],iframe[class*="adsbox"],
[class*="adsbox"],[id*="adsbox"],[class*="ad-container"],[id*="ad-container"],
[class*="OverlayAd"],a[href*="doubleclick"],
#aclib-wrapper,.aclib-widget,[class*="aclib"],
/* AlbaPlayer / syria-live chrome */
.aplr-link,a.aplr-link,.aplr-exbtns,
.aplr-action.showrefresh,.aplr-action.showshare,
.aplr-icon-refresh,.aplr-icon-share,
a[href*="?serv="],a[href*="&serv="],
a[href*="javascript:window.location.reload"],
a[href*="location.reload"]{
  display:none!important;visibility:hidden!important;pointer-events:none!important;
  height:0!important;width:0!important;max-height:0!important;overflow:hidden!important;
  opacity:0!important;margin:0!important;padding:0!important;border:0!important
}
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
  var uiHide=/bein\\s*max|تحديث|مشاركة|share|refresh|بث\\s*\\d+/i;
  function hide(el){
    if(!el||!el.style)return;
    el.style.setProperty('display','none','important');
    el.style.setProperty('visibility','hidden','important');
    el.style.setProperty('pointer-events','none','important');
    el.setAttribute('hidden','');
  }
  function scrub(){
    try{
      document.querySelectorAll('script[src],iframe[src],img[src],a[href]').forEach(function(el){
        var v=el.src||el.href||'';
        if(re.test(v)){el.remove();}
      });
      document.querySelectorAll('.aplr-link,a.aplr-link,.aplr-exbtns,.aplr-action.showrefresh,.aplr-action.showshare,.aplr-icon-refresh,.aplr-icon-share,a[href*="serv="]').forEach(hide);
      document.querySelectorAll('a,button,span,div,li').forEach(function(el){
        var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
        if(!t||t.length>40)return;
        if(uiHide.test(t)) hide(el);
      });
    }catch(e){}
  }
  scrub();
  setInterval(scrub,700);
  try{new MutationObserver(scrub).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();
</script>
<script id="shaib-player-autoplay">
(function(){
  if(window.__shaibPlayerAutoPlay)return;window.__shaibPlayerAutoPlay=true;
  var tries=0;
  function kick(){
    tries++;
    try{
      document.querySelectorAll('video,audio').forEach(function(v){
        try{
          v.setAttribute('playsinline','');
          v.setAttribute('webkit-playsinline','');
          v.setAttribute('autoplay','');
          v.playsInline=true;
          var p=v.play();
          if(p&&p.catch)p.catch(function(){
            v.muted=true;v.defaultMuted=true;
            v.play().then(function(){setTimeout(function(){try{v.muted=false;}catch(e){}},400);}).catch(function(){});
          });
        }catch(e){}
      });
      var sels=['.vjs-big-play-button','.jw-icon-playback','.plyr__control--overlaid','button.watch-btn','.watch-btn','[class*="play"]','button[aria-label*="Play"]','button[aria-label*="تشغيل"]'];
      for(var i=0;i<sels.length;i++){
        document.querySelectorAll(sels[i]).forEach(function(el){
          try{el.click();}catch(e){}
        });
      }
    }catch(e){}
    if(tries<36)setTimeout(kick,500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(kick,150);});
  else setTimeout(kick,150);
  try{new MutationObserver(function(){kick();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();
</script>`;
    const easy = easyListRuntimeShield();
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => `${m}\n${base}\n${shield}\n${easy}`);
    }
    return `<!DOCTYPE html><html><head>${base}\n${shield}\n${easy}</head><body>${html}</body></html>`;
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
