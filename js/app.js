import { store } from "./store.js";
import { t, applyDir } from "./i18n.js";
import {
  fetchTodayBoard,
  fetchInternationalBoard,
  fetchKnockout,
  bracketUrl,
} from "./api.js";
import { loadCanvasConfig } from "./config.js";
import { icons, iconWrap } from "./icons.js";
import { isLoggedIn, login, logout } from "./auth.js";
import { createPlayerController } from "./player.js";
import { prepareFilters } from "./filter-engine.js";
import { installGlobalAdblock, loadShieldedIframe } from "./global-adblock.js";

const SOUTH_ARABIA_FLAG = "./assets/flags/south-yemen.svg";

function isSouthArabiaTeam(team) {
  const blob = [
    team?.name,
    team?.nameAr,
    team?.nameSY,
    team?.country,
    team?.flagCode,
    team?.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    blob.includes("الجنوب العربي") ||
    blob.includes("الجنوب_العربي") ||
    blob.includes("جنوب عربي") ||
    blob.includes("south arabia") ||
    blob.includes("south yemen") ||
    blob.includes("southyemen") ||
    blob.includes("democratic yemen")
  );
}

function teamFlagHtml(team, name) {
  if (isSouthArabiaTeam(team) || /الجنوب\s*العربي/i.test(name || "")) {
    return `<img class="flag-img" src="${SOUTH_ARABIA_FLAG}" alt="الجنوب العربي" loading="lazy" onerror="this.outerHTML='<div class=&quot;flag&quot;>🇾🇪</div>'" />`;
  }
  if (team.flagCode) {
    const flag = String.fromCodePoint(
      ...[...String(team.flagCode).toUpperCase()].map((c) => 127397 + c.charCodeAt(0))
    );
    return `<div class="flag">${flag}</div>`;
  }
  return `<div class="flag">🏳️</div>`;
}

const state = {
  prefs: store.load(),
  cache: {
    canvas: null,
    today: null,
    international: null,
    knockout: null,
  },
  deferredInstall: null,
  hls: null,
  player: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function crest(url, name) {
  if (url) return `<img src="${url}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return `<span style="width:28px;height:28px;border-radius:6px;display:grid;place-items:center;background:rgba(255,255,255,.06);font-weight:800">${letter}</span>`;
}

function statusBadge(match, lang) {
  if (match.status === "IN_PLAY" || match.status === "PAUSED") {
    const clock = match.minute ? ` ${match.minute}` : "";
    return `<span class="badge live">${t(lang, "live")}${clock}</span>`;
  }
  if (match.status === "FINISHED") return `<span class="badge ft">${t(lang, "ft")}</span>`;
  return `<span class="badge ns">${match.time || t(lang, "upcoming")}</span>`;
}

function renderMatchCard(match, lang) {
  const score =
    match.score != null ? `${match.score.home} – ${match.score.away}` : "vs";
  return `
    <article class="match-card">
      <div class="comp">
        <span>${match.competition || ""}</span>
        ${statusBadge(match, lang)}
      </div>
      <div class="teams">
        <div class="team home">
          ${crest(match.homeTeam.crest, match.homeTeam.name)}
          <div class="name">${match.homeTeam.name}</div>
        </div>
        <div class="scorebox">
          <div class="score">${score}</div>
          <div class="meta">${match.dateString || ""} · ${match.time || ""}</div>
        </div>
        <div class="team away">
          ${crest(match.awayTeam.crest, match.awayTeam.name)}
          <div class="name">${match.awayTeam.name}</div>
        </div>
      </div>
    </article>
  `;
}

function renderList(el, matches, lang, error) {
  if (error) {
    el.innerHTML = `<div class="error">${t(lang, "error")}<div style="margin-top:12px"><button class="btn" data-retry>${t(lang, "refresh")}</button></div></div>`;
    el.querySelector("[data-retry]")?.addEventListener("click", () => refreshActive(true));
    return;
  }
  if (!matches?.length) {
    el.innerHTML = `<div class="empty">${t(lang, "empty")}</div>`;
    return;
  }
  el.innerHTML = `<div class="match-list">${matches.map((m) => renderMatchCard(m, lang)).join("")}</div>`;
}

function tileButton(tile, extraClass = "") {
  const cls = `tile ${tile.emphasized ? "emphasized" : ""} ${extraClass}`.trim();
  const badge = tile.live
    ? `<span class="live-pill">مباشر</span>`
    : tile.emphasized && tile.kind === "domain"
      ? `<span style="color:var(--ok)">${icons.play}</span>`
      : tile.kind === "browser"
        ? `<span class="dot-live"></span>`
        : "";

  if (tile.kind === "custom" || tile.kind === "ch4") {
    const shield =
      tile.kind === "custom"
        ? `<span class="shield">${icons.shield}</span>`
        : "";
    return `
      <button type="button" class="${cls} tile-wide" data-tile-id="${tile.id}">
        ${iconWrap(tile.icon || (tile.kind === "ch4" ? "search" : "safari"))}
        <div class="tile-copy">
          <div class="tile-title">${tile.title}</div>
          <div class="tile-sub">${tile.subtitle || ""}</div>
        </div>
        ${shield}
        <span class="chev">‹</span>
      </button>`;
  }

  return `
    <button type="button" class="${cls}" data-tile-id="${tile.id}">
      <div class="tile-top">
        ${icons[tile.icon] || icons.tv}
        ${badge}
      </div>
      <div>
        <div class="tile-title">${tile.title}</div>
        ${tile.subtitle ? `<div class="tile-sub">${tile.subtitle}</div>` : ""}
      </div>
    </button>`;
}

function bindCanvasClicks(root, model) {
  root.querySelectorAll("[data-tile-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tileId;
      const all = [
        ...model.topTiles,
        model.custom,
        model.ch4,
        ...model.bottomTiles,
      ].filter(Boolean);
      const tile = all.find((x) => x.id === id);
      if (tile) openPlayer(tile);
    });
  });
}

function renderCanvas(model, lang) {
  const root = $("#canvas-root");
  if (!model || (!model.topTiles.length && !model.bottomTiles.length && !model.custom && !model.ch4)) {
    root.innerHTML = `
      <div class="empty">
        <div style="font-size:2rem;margin-bottom:8px;opacity:.5">📺</div>
        ${t(lang, "noPlayers")}
      </div>`;
    return;
  }

  const title = lang === "ar" ? model.tabTitleAr : model.tabTitleEn;
  $("#matches-heading").textContent = title;

  let html = "";
  if (model.topTiles.length) {
    html += `<div class="canvas-grid">${model.topTiles.map((tile) => tileButton(tile)).join("")}</div>`;
  }
  if (model.custom) {
    html += `<div class="canvas-wide">${tileButton(model.custom)}</div>`;
  }
  if (model.ch4) {
    const ch4 = {
      ...model.ch4,
      title: lang === "ar" ? model.ch4.title : model.ch4.titleEn,
      subtitle: lang === "ar" ? model.ch4.subtitle : model.ch4.subtitleEn,
    };
    html += `<div class="canvas-wide">${tileButton(ch4)}</div>`;
  }
  if (model.bottomTiles.length) {
    html += `<div class="canvas-grid" style="margin-top:12px">${model.bottomTiles
      .map((tile) => tileButton(tile))
      .join("")}</div>`;
  }
  root.innerHTML = html;
  bindCanvasClicks(root, model);
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy();
    } catch (_) {}
    state.hls = null;
  }
}

function ensurePlayer() {
  if (state.player) return state.player;
  state.player = createPlayerController({
    body: $("#player-body"),
    titleEl: $("#player-title"),
    destroyHls,
    setHls: (hls) => {
      state.hls = hls;
    },
    t: (key) => t(state.prefs.lang, key),
  });
  return state.player;
}

function openPlayer(tile) {
  const sheet = $("#player-sheet");
  sheet.hidden = false;
  ensurePlayer().openTile(tile);
}

function closePlayer() {
  if (state.player) state.player.clear();
  else {
    destroyHls();
    $("#player-body").innerHTML = "";
  }
  $("#player-sheet").hidden = true;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme === "royale" ? "royale" : "classic";
}

function paintChrome() {
  const lang = state.prefs.lang;
  applyDir(lang);
  setTheme(state.prefs.theme);

  $("#brand-sub").textContent = t(lang, "brandSub");
  $$(".tabbar button").forEach((btn) => {
    btn.querySelector("span").textContent = t(lang, btn.dataset.tab);
    btn.classList.toggle("active", btn.dataset.tab === state.prefs.tab);
  });

  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n);
  });

  $$(".page").forEach((p) => {
    p.hidden = p.dataset.page !== state.prefs.tab;
  });

  $("#lbl-language").childNodes[0].textContent = `${t(lang, "language")} `;
  $("#lbl-theme").childNodes[0].textContent = `${t(lang, "theme")} `;
  $("#lbl-privacy").textContent = t(lang, "privacy");
  $("#lbl-contact").textContent = t(lang, "contact");
  $("#lbl-about").textContent = t(lang, "about");
  $("#privacy-body").textContent = t(lang, "privacyBody");
  $("#about-body").textContent = t(lang, "aboutBody");
  $("#btn-wa").textContent = t(lang, "openWhatsApp");
  $("#btn-mail").textContent = t(lang, "email");
  if ($("#lbl-logout")) $("#lbl-logout").textContent = t(lang, "logout");
  if ($("#btn-logout")) $("#btn-logout").textContent = t(lang, "logout");
  $("#theme-classic").textContent = t(lang, "classic");
  $("#theme-royale").textContent = t(lang, "royale");
  $("#lang-ar").classList.toggle("active", lang === "ar");
  $("#lang-en").classList.toggle("active", lang === "en");
  $("#theme-classic").classList.toggle("active", state.prefs.theme === "classic");
  $("#theme-royale").classList.toggle("active", state.prefs.theme === "royale");

  const banner = $("#install-banner");
  const dismissed = sessionStorage.getItem("shaib_install_dismissed");
  banner.hidden = !(state.deferredInstall && !dismissed);
  $("#install-title").textContent = t(lang, "installTitle");
  $("#install-body").textContent = t(lang, "installBody");
  $("#install-btn").textContent = t(lang, "installBtn");
  $("#install-dismiss").textContent = t(lang, "dismiss");
}

async function loadMatches(force) {
  const lang = state.prefs.lang;
  const root = $("#canvas-root");
  if (!force && state.cache.canvas) {
    renderCanvas(state.cache.canvas, lang);
    return;
  }
  root.innerHTML = `<div class="loading">${t(lang, "loading")}</div>`;
  try {
    state.cache.canvas = await loadCanvasConfig(force);
    renderCanvas(state.cache.canvas, lang);
  } catch {
    root.innerHTML = `<div class="error">${t(lang, "error")}<div style="margin-top:12px"><button class="btn" id="retry-canvas">${t(lang, "refresh")}</button></div></div>`;
    $("#retry-canvas")?.addEventListener("click", () => loadMatches(true));
  }
}

async function loadToday(force) {
  const el = $("#today-list");
  if (!force && state.cache.today) {
    renderList(el, state.cache.today, state.prefs.lang);
    return;
  }
  el.innerHTML = `<div class="loading">${t(state.prefs.lang, "loading")}</div>`;
  try {
    state.cache.today = await fetchTodayBoard();
    renderList(el, state.cache.today, state.prefs.lang);
  } catch {
    renderList(el, null, state.prefs.lang, true);
  }
}

async function loadInternational(force) {
  const listEl = $("#intl-list");
  const koEl = $("#knockout-grid");
  const frame = $("#bracket-frame");
  const lang = state.prefs.lang;

  $("#bracket-label").textContent = t(lang, "bracket");
  $("#teams-label").textContent = t(lang, "teams");
  // International bracket iframe — load through AdBlock shield
  loadShieldedIframe(frame, bracketUrl(lang));

  if (!force && state.cache.knockout) {
    renderKnockout(koEl, state.cache.knockout, lang);
  } else {
    koEl.innerHTML = `<div class="loading">${t(lang, "loading")}</div>`;
    state.cache.knockout = await fetchKnockout();
    renderKnockout(koEl, state.cache.knockout, lang);
  }

  if (!force && state.cache.international) {
    renderList(listEl, state.cache.international.slice(0, 40), lang);
    return;
  }
  listEl.innerHTML = `<div class="loading">${t(lang, "loading")}</div>`;
  try {
    state.cache.international = await fetchInternationalBoard();
    renderList(listEl, state.cache.international.slice(0, 40), lang);
  } catch {
    renderList(listEl, null, lang, true);
  }
}

function renderKnockout(el, data, lang) {
  const teams = data?.teams || [];
  if (!teams.length) {
    el.innerHTML = `<div class="empty">${t(lang, "empty")}</div>`;
    return;
  }
  el.innerHTML = teams
    .map((team) => {
      const qualified = String(team.status || "").toLowerCase() === "qualified";
      const name = lang === "ar" ? team.nameAr || team.nameSY || team.name : team.name;
      const st = qualified ? t(lang, "qualified") : t(lang, "eliminated");
      return `
        <div class="ko-card ${qualified ? "qualified" : "eliminated"}">
          ${teamFlagHtml(team, name)}
          <div class="tname">${name || "—"}</div>
          <div class="status">${st}</div>
        </div>`;
    })
    .join("");
}

async function refreshActive(force = false) {
  paintChrome();
  const tab = state.prefs.tab;
  if (tab === "matches") await loadMatches(force);
  else if (tab === "today") await loadToday(force);
  else if (tab === "international") await loadInternational(force);
}

function switchTab(tab) {
  state.prefs = store.save({ tab });
  refreshActive(false);
}

function paintLogin() {
  const lang = state.prefs.lang || "ar";
  applyDir(lang);
  $("#login-sub").textContent = t(lang, "loginSub");
  $("#lbl-user").textContent = t(lang, "username");
  $("#lbl-pass").textContent = t(lang, "password");
  $("#login-submit").textContent = t(lang, "loginBtn");
}

function showApp() {
  hideSplash();
  const gate = $("#login-gate");
  const shell = $("#app-shell");
  if (gate) {
    gate.hidden = true;
    gate.style.display = "none";
    gate.style.pointerEvents = "none";
  }
  if (shell) {
    shell.hidden = false;
    shell.style.display = "";
    shell.style.pointerEvents = "";
  }
  // Remove any leaked shell cosmetics that could freeze UI
  document.getElementById("shaib-global-cosmetic")?.remove();
  document.getElementById("shaib-adblock-cosmetic")?.remove();
  paintChrome();
  refreshActive(true);
}

function showLogin() {
  const shell = $("#app-shell");
  const gate = $("#login-gate");
  if (shell) {
    shell.hidden = true;
    shell.style.display = "none";
  }
  if (gate) {
    gate.hidden = false;
    gate.style.display = "";
    gate.style.pointerEvents = "";
  }
  paintLogin();
}

function bind() {
  const onTab = (btn) => {
    if (!btn?.dataset?.tab) return;
    switchTab(btn.dataset.tab);
  };
  // Single delegated handler (SVG/span have pointer-events:none)
  document.querySelector(".tabbar")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-tab]");
    if (btn) {
      e.preventDefault();
      onTab(btn);
    }
  });

  function tryLogin(e) {
    e?.preventDefault?.();
    const userEl = $("#login-user");
    const passEl = $("#login-pass");
    const err = $("#login-error");
    const ok = login(userEl?.value, passEl?.value);
    if (ok) {
      if (err) err.hidden = true;
      // Show app immediately — never wait on filter downloads
      showApp();
      ensureFiltersReady().catch(() => {});
      return;
    }
    if (err) {
      err.textContent = t(state.prefs.lang, "loginError");
      err.hidden = false;
    }
  }

  $("#login-form")?.addEventListener("submit", tryLogin);
  $("#login-submit")?.addEventListener("click", tryLogin);
  window.addEventListener("shaib-login", () => {
    showApp();
    ensureFiltersReady().catch(() => {});
  });

  $("#refresh-btn")?.addEventListener("click", () => refreshActive(true));
  $("#player-close")?.addEventListener("click", closePlayer);

  $("#lang-ar")?.addEventListener("click", () => {
    state.prefs = store.save({ lang: "ar" });
    refreshActive(true);
  });
  $("#lang-en")?.addEventListener("click", () => {
    state.prefs = store.save({ lang: "en" });
    refreshActive(true);
  });
  $("#theme-classic")?.addEventListener("click", () => {
    state.prefs = store.save({ theme: "classic" });
    paintChrome();
    if (state.cache.canvas) renderCanvas(state.cache.canvas, state.prefs.lang);
  });
  $("#theme-royale")?.addEventListener("click", () => {
    state.prefs = store.save({ theme: "royale" });
    paintChrome();
    if (state.cache.canvas) renderCanvas(state.cache.canvas, state.prefs.lang);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    paintChrome();
  });

  $("#install-btn")?.addEventListener("click", async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    paintChrome();
  });
  $("#install-dismiss")?.addEventListener("click", () => {
    sessionStorage.setItem("shaib_install_dismissed", "1");
    paintChrome();
  });

  $("#btn-logout")?.addEventListener("click", () => {
    logout();
    location.reload();
  });
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await Promise.race([
      navigator.serviceWorker.register("./sw.js?v=22"),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (_) {}
}

function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("hide");
  splash.hidden = true;
  splash.style.display = "none";
  splash.style.pointerEvents = "none";
  splash.setAttribute("aria-hidden", "true");
  try {
    splash.remove();
  } catch (_) {}
}

async function ensureFiltersReady() {
  // Shell AdBlock is SW-only (non-aggressive). Heavy lists load in background.
  installGlobalAdblock();
  const run = () =>
    prepareFilters()
      .then((stats) => {
        // Player shields sync later on open — not here (avoids UI freeze)
        installGlobalAdblock();
        return stats;
      })
      .catch(() => {
        installGlobalAdblock();
      });

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {
      run();
    }, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}

try {
  bind();
} catch (err) {
  console.error("bind failed", err);
}

(function boot() {
  try {
    if (typeof window.__shaibBootUI === "function") window.__shaibBootUI();
    if (isLoggedIn()) showApp();
    else showLogin();
  } catch (err) {
    console.error("boot failed", err);
    try {
      showLogin();
    } catch (_) {}
  }
  hideSplash();
  registerSW().catch(() => {});
  // Filters only after UI is up — never block splash/login
  setTimeout(() => {
    ensureFiltersReady().catch(() => {});
  }, 500);
})();

window.__shaibLogout = () => {
  logout();
  location.reload();
};
