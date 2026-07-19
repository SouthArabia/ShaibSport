/* Shaib Sport PWA — standalone service worker (app shell + ad blocking) */
importScripts("./js/adblock-sw-hosts.js");
importScripts("./js/bot-guard.js");

const CACHE = "shaib-sport-pwa-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./robots.txt",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/store.js",
  "./js/i18n.js",
  "./js/api.js",
  "./js/config.js",
  "./js/pwa-config.js",
  "./js/local-store.js",
  "./js/icons.js",
  "./js/auth.js",
  "./js/adblock-data.js",
  "./js/adblock.js",
  "./js/adblock-sw-hosts.js",
  "./js/filter-lists.js",
  "./js/filter-engine.js",
  "./js/global-adblock.js",
  "./js/bot-guard.js",
  "./js/stream-detect.js",
  "./js/player.js",
  "./js/app.js",
  "./config/live_config.json",
  "./config/Knockout.json",
  "./filters/Adblocker.json",
  "./filters/elementBlock.json",
  "./filters/blocklist.json",
  "./filters/channel_blocklist.json",
  "./vendor/hls.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/brand/mainicon.png",
  "./assets/brand/splash.png",
];

function withNoIndex(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex, nocache"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function botForbidden() {
  return new Response("Forbidden", {
    status: 403,
    statusText: "Forbidden",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
    },
  });
}

const ALLOW_PARTS = [
  "syria-player",
  "shootsync",
  "albaplayer",
  "alarabiya",
  "aljazeera",
  "thehlive",
  "akamai",
  "cloudfront",
  "cloudflare",
  "jsdelivr",
  "googleapis",
  "gstatic",
  "youtube",
  "ytimg",
  "jwplatform",
  "jwpcdn",
  "espn",
  "thesportsdb",
  "githubusercontent",
  "corsproxy",
  "allorigins",
  "365scores",
  "easylist",
  "adtidy.org",
  "o0.pages.dev",
  "filters.adtidy",
  "oisd.nl",
  "yoyo.org",
  "ublockorigin.github.io",
  "hagezi",
  "1hosts",
  "badmojr",
  "jerryn70",
  "stevenblack",
];

let hostSet = new Set((self.AD_HOSTS || []).map((h) => String(h).toLowerCase()));

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowed(host) {
  return !host || ALLOW_PARTS.some((p) => host.includes(p));
}

function isAdHost(host) {
  if (!host || isAllowed(host)) return false;
  let h = host;
  while (h) {
    if (hostSet.has(h)) return true;
    const i = h.indexOf(".");
    if (i === -1) break;
    h = h.slice(i + 1);
  }
  return /(^|\.)ads?\d*\.|doubleclick|adservice|adsystem|pagead|popads|propeller|exoclick|taboola|outbrain|criteo|prebid|adnxs|googlesyndication/.test(
    host
  );
}

function isAdRequest(url) {
  const host = hostnameOf(url);
  if (isAdHost(host)) return true;
  const u = String(url).toLowerCase();
  return (
    u.includes("googlesyndication") ||
    u.includes("doubleclick.net") ||
    u.includes("/pagead/") ||
    u.includes("adsbygoogle") ||
    u.includes("popunder")
  );
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "SHAIB_FILTER_UPDATE") return;
  if (!Array.isArray(data.hosts)) return;
  hostSet = new Set(data.hosts.map((h) => String(h).toLowerCase()));
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          ASSETS.map((url) =>
            cache.add(url).catch(() => {
              /* skip missing optional asset */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const ua = request.headers.get("user-agent") || "";
  if (typeof self.SHAIB_IS_BOT === "function" && self.SHAIB_IS_BOT(ua)) {
    event.respondWith(botForbidden());
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") return;

  if (isAdRequest(request.url)) {
    event.respondWith(
      new Response("", {
        status: 204,
        statusText: "Blocked by Shaib AdBlock",
        headers: { "X-Shaib-AdBlock": "1" },
      })
    );
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Bundled config / filters / vendor — cache first
  if (
    sameOrigin &&
    (url.pathname.includes("/config/") ||
      url.pathname.includes("/filters/") ||
      url.pathname.includes("/vendor/") ||
      url.pathname.endsWith(".json"))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }))
    );
    return;
  }

  const isApi =
    url.hostname.includes("espn.com") ||
    url.hostname.includes("thesportsdb.com") ||
    url.hostname.includes("openligadb.de") ||
    url.hostname.includes("githubusercontent.com") ||
    url.hostname.includes("corsproxy") ||
    url.hostname.includes("allorigins") ||
    url.hostname.includes("jsdelivr.net") ||
    url.hostname.includes("easylist") ||
    url.hostname.includes("adtidy.org") ||
    url.hostname.includes("o0.pages.dev") ||
    url.hostname.includes("pages.dev") ||
    url.hostname.includes("oisd.nl") ||
    url.hostname.includes("yoyo.org") ||
    url.hostname.includes("ublockorigin.github.io") ||
    url.hostname.includes("hagezi") ||
    url.pathname.includes(".m3u8");

  if (isApi) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  const isNavigate = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          if (res.ok && sameOrigin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return withNoIndex(res);
        })
        .catch(() => (cached ? withNoIndex(cached) : cached));
      const hit = cached || fetched;
      return cached ? withNoIndex(cached) : hit;
    })
  );
});
