/**
 * App-shell adblock only — network hooks + tiny safe cosmetics.
 * Full EasyList cosmetics must NOT be injected here (they freeze/hide the UI).
 * Full cosmetics belong in player srcdoc shields only.
 */
import { isAdHost, isAdUrl, syncAdblockFromEngine } from "./adblock.js";
import { getFilterStats } from "./filter-engine.js";

/** Safe selectors for OUR app document only */
const SHELL_COSMETICS = [
  "ins.adsbygoogle",
  ".adsbygoogle",
  "[data-ad]",
  "[data-ad-slot]",
  "iframe[src*='googlesyndication']",
  "iframe[src*='doubleclick']",
  "iframe[src*='googletagmanager']",
  "iframe[id*='google_ads']",
  "#google_ads_frame",
  ".OUTBRAIN",
  ".taboola",
  ".trc_rbox",
];

let installed = false;
let scrubTimer = null;

function injectShellCosmeticCss() {
  const prev = document.getElementById("shaib-global-cosmetic");
  const style = document.createElement("style");
  style.id = "shaib-global-cosmetic";
  style.textContent = `${SHELL_COSMETICS.join(",")}{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important}`;
  if (prev) prev.replaceWith(style);
  else document.documentElement.appendChild(style);
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
    // Never touch app chrome
    if (el.closest?.("#app-shell, #login-gate, #player-sheet, .tabbar, .app-header")) {
      // Still allow killing injected third-party ad scripts under shell
      if (tag === "SCRIPT" && el.src && isAdUrl(el.src)) el.remove();
      return;
    }
    if (tag === "SCRIPT" && el.src && isAdUrl(el.src)) {
      el.remove();
      return;
    }
    if (tag === "IFRAME" || tag === "EMBED" || tag === "OBJECT") {
      if (el.id === "bracket-frame" || el.classList?.contains("player-iframe")) return;
      const src = el.src || el.getAttribute("data-src") || "";
      if (src && (isAdUrl(src) || isAdHost(hostnameSafe(src)))) el.remove();
    }
  } catch (_) {}
}

function scrubDom() {
  try {
    document
      .querySelectorAll("script[src], iframe:not(#bracket-frame):not(.player-iframe)")
      .forEach(neutralizeNode);
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
}

function installObserver() {
  try {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) neutralizeNode(n);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}

/** Install once; safe to call again after filters sync. */
export function installGlobalAdblock() {
  syncAdblockFromEngine();
  injectShellCosmeticCss();
  if (!installed) {
    installed = true;
    installNetworkHooks();
    installObserver();
  }
  scrubDom();
  if (scrubTimer) clearInterval(scrubTimer);
  scrubTimer = setInterval(scrubDom, 2000);

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
