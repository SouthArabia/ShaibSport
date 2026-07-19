# Shaib Sport PWA

Standalone progressive web app. Deploy or serve this folder alone — it does **not** need the iOS Xcode project.

## Run

```bash
cd ~/Desktop/ShaipSportPWA
python3 -m http.server 8765
# or: ./serve.sh
```

Open `http://localhost:8765`

## What’s bundled (offline shell)

| Path | Purpose |
|------|---------|
| `config/live_config.json` | Matches / canvas tiles |
| `config/Knockout.json` | International teams |
| `filters/*.json` | App adblock lists |
| `vendor/hls.min.js` | HLS player |
| `js/`, `css/`, `icons/`, `assets/` | App UI |

First paint uses these files. Optional network refresh updates config/filters when online (`PWA.enableRemoteUpdates` in `js/pwa-config.js`).

## Independence notes

- No imports from the iOS app or other local projects
- Auth gate is PWA-only (`js/auth.js`)
- Community filter lists (EasyList, HaGeZi, etc.) load from public CDNs when online; seed hosts work offline
- Live scores / streams still need the internet (ESPN, TheSportsDB, HLS)

## Update bundled config

Replace files under `config/` and `filters/`, bump the service worker cache name in `sw.js`, then hard-refresh.
