import {
  attachHlsAdblock,
  cleanHtml,
  isAdUrl,
  syncAdblockFromEngine,
} from "./adblock.js";
import { prepareFilters } from "./filter-engine.js";
import { streamDetectScript, fastServerScript, syriaHelpersScript } from "./stream-detect.js";

/** Never block the player on filter downloads — seed lists already work. */
async function ensurePlayerFilters() {
  try {
    await Promise.race([
      prepareFilters(),
      new Promise((r) => setTimeout(r, 600)),
    ]);
  } catch (_) {}
  syncAdblockFromEngine();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function fetchHtml(url) {
  const tries = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 7000);
      if (!res.ok) continue;
      const text = await withTimeout(res.text(), 7000);
      if (text && text.length > 80) return text;
    } catch (_) {}
  }
  return null;
}

function isDirectPlayerUrl(url = "") {
  return /syria-player|shootsync|albaplayer|beinmax/i.test(url);
}

function normalizeNavUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(" ") || !trimmed.includes(".")) {
    const q = encodeURIComponent(trimmed);
    return `https://www.google.com/search?q=${q}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isMediaUrl(url) {
  return /\.(m3u8|m3u|ts|mp4)($|\?)/i.test(url) || /\/hls\//i.test(url);
}

function toolbar(buttons) {
  const bar = document.createElement("div");
  bar.className = "player-tools";
  buttons.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-tool-btn";
    btn.textContent = b.label;
    btn.title = b.title || b.label;
    btn.disabled = !!b.disabled;
    btn.addEventListener("click", b.onClick);
    bar.appendChild(btn);
  });
  return bar;
}

/**
 * Player iframe. Stream hosts reject sandbox + no-referrer ("إخفاء المصدر").
 * Never set referrerpolicy=no-referrer on embeds — players block that.
 */
function mountLockedIframe(url, { sandbox = false } = {}) {
  const frame = document.createElement("iframe");
  frame.className = "player-iframe";
  frame.src = url;
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  );
  frame.setAttribute("allowfullscreen", "");
  // Explicit referrer — empty/no-referrer triggers syria-player "إخفاء المصدر" block
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  if (sandbox) {
    // NO allow-popups, NO allow-top-navigation
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock"
    );
  }
  return frame;
}

function configureFrame(frame) {
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  );
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  return frame;
}

/**
 * @param {object} opts
 */
export function createPlayerController(opts) {
  const { body, titleEl, destroyHls, setHls, t } = opts;
  let streamListener = null;
  let currentIframe = null;

  function clear() {
    destroyHls();
    if (streamListener) {
      window.removeEventListener("message", streamListener);
      streamListener = null;
    }
    currentIframe = null;
    body.innerHTML = "";
  }

  function playHls(title, url) {
    titleEl.textContent = title;
    clear();
    const wrap = document.createElement("div");
    wrap.className = "hls-wrap";
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "");
    wrap.appendChild(video);
    body.appendChild(wrap);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return;
    }
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ enableWorker: true });
      attachHlsAdblock(hls);
      setHls(hls);
      hls.loadSource(url);
      hls.attachMedia(video);
      return;
    }
    video.src = url;
  }

  async function mountShielded(url, injectExtra = "") {
    // Direct embed players — skip proxy/srcdoc (proxies hang; sandbox breaks playback)
    if (isDirectPlayerUrl(url)) {
      const frame = configureFrame(mountLockedIframe(url, { sandbox: false }));
      currentIframe = frame;
      return { frame, mode: "direct" };
    }

    ensurePlayerFilters(); // background; seeds already active
    const html = await fetchHtml(url);
    if (html && /<html|<body|<div|<script/i.test(html)) {
      let cleaned = cleanHtml(html, url);
      if (injectExtra) {
        const extras = `<script>${injectExtra}</script>`;
        if (/<\/body>/i.test(cleaned)) {
          cleaned = cleaned.replace(/<\/body>/i, `${extras}</body>`);
        } else {
          cleaned += extras;
        }
      }
      const frame = configureFrame(document.createElement("iframe"));
      frame.className = "player-iframe";
      frame.srcdoc = cleaned;
      currentIframe = frame;
      return { frame, mode: "shielded" };
    }

    // Last resort: direct iframe (no sandbox / no referrer hiding — players reject both)
    const frame = configureFrame(mountLockedIframe(url, { sandbox: false }));
    currentIframe = frame;
    return { frame, mode: "direct" };
  }

  function listenForStreams(onStream, { once = true } = {}) {
    if (streamListener) window.removeEventListener("message", streamListener);
    streamListener = (ev) => {
      const data = ev.data;
      if (!data || data.type !== "shaibDomainStream" || !data.url) return;
      if (isAdUrl(data.url)) return;
      if (once && streamListener) {
        window.removeEventListener("message", streamListener);
        streamListener = null;
      }
      onStream(data.url);
    };
    window.addEventListener("message", streamListener);
  }

  function openLive(tile) {
    playHls(tile.title, tile.url);
  }

  /** Browser / Fox — always shielded (continuous AdBlock) */
  async function openBrowser(tile) {
    titleEl.textContent = tile.title;
    clear();
    body.innerHTML = `<div class="loading" style="margin:40px;border:0">${t("adblockLoading")}</div>`;

    const wrap = document.createElement("div");
    wrap.className = "player-stack";
    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = t("adblockOn");

    const tools = toolbar([
      {
        label: "↻",
        title: "Reload",
        onClick: () => openBrowser(tile),
      },
    ]);
    wrap.appendChild(tools);
    wrap.appendChild(status);

    const stage = document.createElement("div");
    stage.className = "player-stage";
    wrap.appendChild(stage);

    let inject = syriaHelpersScript();
    if (tile.autoFastServer) inject += fastServerScript();

    const mounted = await mountShielded(tile.url, inject);
    stage.innerHTML = "";
    if (mounted.mode === "blocked-wrap") {
      stage.appendChild(mounted.frame);
    } else {
      stage.appendChild(mounted.frame);
    }
    status.textContent = t("adblockScanning");

    body.innerHTML = "";
    body.appendChild(wrap);
  }

  /** Domain — shield + stream detect; no unblocked direct open */
  async function openDomain(tile) {
    titleEl.textContent = tile.title;
    clear();
    body.innerHTML = `<div class="loading" style="margin:40px;border:0">${t("adblockLoading")}</div>`;

    const mode = tile.mode || "manual";
    let autoOn = mode !== "manual";

    const wrap = document.createElement("div");
    wrap.className = "player-stack";
    const stage = document.createElement("div");
    stage.className = "player-stage";

    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = t("adblockScanning");

    const tools = toolbar([
      {
        label: "‹",
        title: "Back",
        onClick: () => {
          try {
            currentIframe?.contentWindow?.history.back();
          } catch (_) {}
        },
      },
      {
        label: "›",
        title: "Forward",
        onClick: () => {
          try {
            currentIframe?.contentWindow?.history.forward();
          } catch (_) {}
        },
      },
      {
        label: "↻",
        title: "Reload",
        onClick: () => openDomain(tile),
      },
      {
        label: autoOn ? "Auto ●" : "Auto ○",
        title: "Auto click",
        onClick: (ev) => {
          autoOn = !autoOn;
          ev.currentTarget.textContent = autoOn ? "Auto ●" : "Auto ○";
          try {
            currentIframe?.contentWindow?._shaibSetAutoClick?.(autoOn);
          } catch (_) {}
        },
      },
    ]);

    wrap.appendChild(tools);
    wrap.appendChild(status);
    wrap.appendChild(stage);

    if (mode !== "manual") {
      listenForStreams((streamUrl) => {
        status.textContent = t("streamFound");
        playHls(tile.title, streamUrl);
      });
    }

    const inject = streamDetectScript(mode) + syriaHelpersScript();
    const mounted = await mountShielded(tile.url, inject);
    stage.innerHTML = "";
    stage.appendChild(mounted.frame);
    status.textContent =
      mode === "manual" ? t("adblockOn") : `${t("adblockOn")} · ${t("domainAuto")}`;

    body.innerHTML = "";
    body.appendChild(wrap);
  }

  /** Custom browser — every navigation goes through AdBlock */
  function openCustom(tile) {
    titleEl.textContent = tile.title;
    clear();

    const wrap = document.createElement("div");
    wrap.className = "player-stack";
    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = t("adblockOn");

    const form = document.createElement("form");
    form.className = "player-urlbar";
    form.innerHTML = `
      <input id="custom-url" type="text" enterkeyhint="go" placeholder="https://…" />
      <button class="btn" type="submit">${t("go")}</button>
    `;
    const stage = document.createElement("div");
    stage.className = "player-stage";

    const load = async (raw) => {
      const url = normalizeNavUrl(raw);
      if (!url || isAdUrl(url)) {
        status.textContent = t("adBlockedNav");
        return;
      }
      status.textContent = t("adblockLoading");
      stage.innerHTML = `<div class="loading" style="margin:40px;border:0">${t("adblockLoading")}</div>`;
      const mounted = await mountShielded(url, syriaHelpersScript());
      stage.innerHTML = "";
      stage.appendChild(mounted.frame);
      status.textContent = t("adblockScanning");
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      load(form.querySelector("#custom-url").value);
    });

    wrap.appendChild(form);
    wrap.appendChild(status);
    wrap.appendChild(stage);
    body.appendChild(wrap);

    const start = tile.url || "https://www.google.com";
    form.querySelector("#custom-url").value = start;
    load(start);
  }

  /** CH4 — paste; media → video; pages → shielded */
  function openCH4(tile) {
    titleEl.textContent = tile.title;
    clear();

    const wrap = document.createElement("div");
    wrap.className = "player-stack";
    wrap.innerHTML = `
      <div class="ch4-box">
        <p style="color:var(--muted);margin:0">${tile.subtitle || ""}</p>
        <input id="ch4-input" type="text" placeholder="https://…" enterkeyhint="go" />
        <button class="btn" id="ch4-go" type="button">${t("openLink")}</button>
      </div>
    `;
    body.appendChild(wrap);

    const go = async () => {
      let raw = wrap.querySelector("#ch4-input").value.trim();
      if (!raw) return;
      if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
      if (isAdUrl(raw)) return;
      if (isMediaUrl(raw)) {
        playHls(tile.title, raw);
        return;
      }
      titleEl.textContent = tile.title;
      clear();
      body.innerHTML = `<div class="loading" style="margin:40px;border:0">${t("adblockLoading")}</div>`;
      const stack = document.createElement("div");
      stack.className = "player-stack";
      const status = document.createElement("div");
      status.className = "player-status";
      status.textContent = t("adblockScanning");
      const tools = toolbar([
        { label: "✎", title: "Paste again", onClick: () => openCH4(tile) },
        { label: "↻", title: "Reload", onClick: () => go() },
      ]);
      const st = document.createElement("div");
      st.className = "player-stage";
      const mounted = await mountShielded(raw, syriaHelpersScript());
      st.appendChild(mounted.frame);
      stack.appendChild(tools);
      stack.appendChild(status);
      stack.appendChild(st);
      body.innerHTML = "";
      body.appendChild(stack);
    };

    wrap.querySelector("#ch4-go").onclick = go;
    wrap.querySelector("#ch4-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }

  async function openTile(tile) {
    titleEl.textContent = tile.title;
    // Kick filter refresh in background — never gate the player on it
    if (tile.kind !== "live") ensurePlayerFilters();
    switch (tile.kind) {
      case "live":
        return openLive(tile);
      case "browser":
        return openBrowser(tile);
      case "domain":
        return openDomain(tile);
      case "custom":
        return openCustom(tile);
      case "ch4":
        return openCH4(tile);
      default:
        return openBrowser({ ...tile, streamSafe: true });
    }
  }

  return { openTile, playHls, clear, mountLockedIframe };
}
