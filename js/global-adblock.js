/**
 * App-wide adblock for every tab: network hooks, cosmetic hide,
 * and continuous scrub of third-party iframes / scripts in the shell.
 */
import {
  cosmeticStyleTag,
  isAdHost,
  isAdUrl,
  syncAdblockFromEngine,
} from "./adblock.js";
import { getFilterStats } from "./filter-engine.js";

let installed = false;
let scrubTimer = null;

function injectCosmeticCss() {
  const html = cosmeticStyleTag();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const style = tmp.firstElementChild;
  if (!style) return;
  style.id = "shaib-global-cosmetic";
  const prev = document.getElementById("shaib-global-cosmetic");
  if (prev) prev.replaceWith(style);
  else document.documentElement.prepend(style);
}

function hostnameSafe(url) {
  try {
    return new URL(url, location.href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function neutralizeNode(el) {
  if (!el || el.nodeType !== 1) return;
  try {
    const tag = el.tagName;
    if (tag === "SCRIPT" && el.src && isAdUrl(el.src)) {
      el.remove();
      return;
    }
    if (tag === "IFRAME" || tag === "EMBED" || tag === "OBJECT") {
      const src = el.src || el.getAttribute("data-src") || "";
      if (!src) return;
      if (el.id === "bracket-frame" || el.classList.contains("player-iframe")) return;
      if (isAdUrl(src) || isAdHost(hostnameSafe(src))) {
        el.remove();
        return;
      }
    }
    if (tag === "IMG") {
      const src = el.src || el.getAttribute("data-src") || "";
      if (src && isAdUrl(src) && /ad|banner|pixel|track/i.test(src)) el.remove();
    }
    if (tag === "A") {
      const href = el.getAttribute("href") || "";
      if (href && isAdUrl(href)) {
        el.addEventListener(
          "click",
          (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          },
          true
        );
        el.removeAttribute("href");
      }
    }
  } catch (_) {}
}

function scrubDom() {
  try {
    document
      .querySelectorAll(
        "iframe:not(#bracket-frame):not(.player-iframe), embed, object, script[src], img[src], a[href]"
      )
      .forEach(neutralizeNode);
  } catch (_) {}
  try {
    document.querySelectorAll("[data-ad], .adsbygoogle, ins.adsbygoogle").forEach((el) => {
      el.style.setProperty("display", "none", "important");
    });
  } catch (_) {}
}

function installNetworkHooks() {
  try {
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...rest) {
      if (u && isAdUrl(String(u))) {
        this.__shaibBlocked = true;
        u = "about:blank";
      }
      return _open.call(this, m, u, ...rest);
    };
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__shaibBlocked) {
        try {
          this.abort();
        } catch (_) {}
        return;
      }
      return _send.apply(this, args);
    };
  } catch (_) {}

  try {
    const _fetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const u = typeof input === "string" ? input : input?.url || "";
      if (u && isAdUrl(u)) return Promise.reject(new TypeError("shaib-blocked"));
      return _fetch(input, init);
    };
  } catch (_) {}

  try {
    window.open = function () {
      return null;
    };
  } catch (_) {}
}

function installObserver() {
  try {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) {
            neutralizeNode(n);
            n.querySelectorAll?.("iframe,script[src],embed,object,img,a").forEach(neutralizeNode);
          }
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}

/** Install once; safe to call again after filters sync. */
export function installGlobalAdblock() {
  syncAdblockFromEngine();
  injectCosmeticCss();
  if (!installed) {
    installed = true;
    installNetworkHooks();
    installObserver();
    document.addEventListener(
      "click",
      (e) => {
        const a = e.target?.closest?.("a,area");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (href && isAdUrl(href)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }
  scrubDom();
  if (scrubTimer) clearInterval(scrubTimer);
  scrubTimer = setInterval(scrubDom, 1200);

  const stats = getFilterStats();
  try {
    document.documentElement.dataset.shaibAdblock = stats.hosts > 0 ? "on" : "seed";
    document.documentElement.dataset.shaibHosts = String(stats.hosts || 0);
  } catch (_) {}
}

/** Load third-party page into an iframe with adblock shielding when possible. */
export async function loadShieldedIframe(iframe, url) {
  if (!iframe || !url) return;
  const { createBlockedWebFrame } = await import("./adblock.js");
  try {
    const wrap = await createBlockedWebFrame(url);
    const shielded = wrap.querySelector("iframe");
    if (shielded?.srcdoc) {
      iframe.removeAttribute("src");
      iframe.srcdoc = shielded.srcdoc;
      return;
    }
  } catch (_) {}
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-presentation"
  );
  iframe.src = url;
}
