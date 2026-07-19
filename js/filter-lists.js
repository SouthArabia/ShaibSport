/**
 * PWA filter catalog — bundled app lists first, then public community lists.
 * Standalone: works from /filters/*.json without any other app.
 */
import { LOCAL, REMOTE_UPDATE } from "./pwa-config.js";

export const FILTER_LISTS = [
  // Bundled with this PWA (local first, optional remote refresh)
  {
    id: "adblocker-json",
    urls: [LOCAL.adblocker, REMOTE_UPDATE.adblocker],
    type: "json-domains",
  },
  {
    id: "element-block",
    urls: [LOCAL.elementBlock, REMOTE_UPDATE.elementBlock],
    type: "json-elements",
  },
  {
    id: "blocklist-json",
    urls: [LOCAL.blocklist, REMOTE_UPDATE.blocklist],
    type: "json-wkrules",
  },
  {
    id: "channel-blocklist",
    urls: [LOCAL.channelBlocklist, REMOTE_UPDATE.channelBlocklist],
    type: "json-domains",
  },

  // EasyList family
  { id: "easylist", url: "https://easylist.to/easylist/easylist.txt", type: "abp" },
  { id: "easyprivacy", url: "https://easylist.to/easylist/easyprivacy.txt", type: "abp" },
  {
    id: "fanboy-annoyance",
    url: "https://easylist.to/easylist/fanboy-annoyance.txt",
    type: "abp",
  },
  {
    id: "easylist-cookie",
    url: "https://easylist-downloads.adblockplus.org/easylistcookie.txt",
    type: "abp",
  },

  // HaGeZi
  {
    id: "hagezi-ultimate",
    url: "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/ultimate.txt",
    type: "abp",
  },
  {
    id: "hagezi-proplus",
    url: "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/pro.plus.txt",
    type: "abp",
  },
  {
    id: "hagezi-tif",
    url: "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/tif.txt",
    type: "abp",
  },

  // AdGuard (uBO-compatible)
  {
    id: "adguard-base",
    url: "https://filters.adtidy.org/extension/ublock/filters/2.txt",
    type: "abp",
  },
  {
    id: "adguard-tracking",
    url: "https://filters.adtidy.org/extension/ublock/filters/3.txt",
    type: "abp",
  },
  {
    id: "adguard-url-tracking",
    url: "https://filters.adtidy.org/extension/ublock/filters/17.txt",
    type: "abp",
  },
  {
    id: "adguard-annoyances",
    url: "https://filters.adtidy.org/extension/ublock/filters/14.txt",
    type: "abp",
  },

  // uBlock Origin uAssets
  {
    id: "ublock-filters",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
    type: "abp",
  },
  {
    id: "ublock-privacy",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt",
    type: "abp",
  },
  {
    id: "ublock-badware",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
    type: "abp",
  },
  {
    id: "ublock-quick-fixes",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt",
    type: "abp",
  },
  {
    id: "ublock-resource-abuse",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt",
    type: "abp",
  },
  {
    id: "ublock-filters-mobile",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-mobile.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances-cookies",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-cookies.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances-others",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-others.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances-overlays",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-overlays.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances-widgets",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-widgets.txt",
    type: "abp",
  },
  {
    id: "ublock-annoyances-social",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-social.txt",
    type: "abp",
  },
  {
    id: "ublock-filters-general",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-general.txt",
    type: "abp",
  },
  {
    id: "ublock-filters-2024",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2024.txt",
    type: "abp",
  },
  {
    id: "ublock-filters-2025",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2025.txt",
    type: "abp",
  },
  {
    id: "ublock-filters-2026",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2026.txt",
    type: "abp",
  },
  {
    id: "ublock-ubol-filters",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/ubol-filters.txt",
    type: "abp",
  },

  // 1Hosts / StevenBlack
  {
    id: "1hosts-xtra",
    urls: [
      "https://o0.pages.dev/Xtra/adblock.txt",
      "https://cdn.jsdelivr.net/gh/badmojr/1Hosts@latest/Xtra/adblock.txt",
    ],
    type: "abp",
  },
  {
    id: "stevenblack-hosts",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    type: "hosts",
  },
];

/** Media / player CDN allowlist (do not block stream hosts) */
export const MEDIA_ALLOWLIST = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "gstatic.com",
  "googleapis.com",
  "syria-player.live",
  "syria-player",
  "shootsync",
  "albaplayer",
  "majed-koora.com",
  "jwplayer.com",
  "jwplatform.com",
  "cloudflare.com",
  "cloudfront.net",
  "akamaihd.net",
  "fastly.net",
  "365scores.com",
  "dmcdn.net",
  "dmxleo.com",
  "alarabiya",
  "aljazeera",
  "thehlive",
  "clappr",
  "hlsjs",
  "videojs",
  "plyr",
];
