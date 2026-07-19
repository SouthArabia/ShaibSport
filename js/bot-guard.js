/* Classic script — usable from page + importScripts in SW */
(function (root) {
  var BOT_UA_RE =
    /bot|crawl|spider|slurp|scrap(e|er|ing)|fetch|monitor|preview|facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|embedly|quora|redditbot|applebot|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|chatgpt|ccbot|anthropic|claudebot|claude-web|google-extended|amazonbot|meta-externalagent|cohere|perplexity|yandex|baidu|sogou|duckduck|bingpreview|adsbot|mediapartners|ia_archiver|archive\.org|wayback|httrack|wget|curl\/|python-requests|httpclient|libwww|java\/|go-http|okhttp|axios|node-fetch|headless|phantom|selenium|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|statuscake|siteaudit/i;

  function isBotUserAgent(ua) {
    var s = String(ua || "");
    if (!s) return true;
    var looksBrowser =
      /mozilla\/|applewebkit|chrome\/|safari\/|firefox\/|edg\/|opr\/|mobile|android|iphone|ipad/i.test(
        s
      );
    if (BOT_UA_RE.test(s)) return true;
    if (!looksBrowser) return true;
    return false;
  }

  root.SHAIB_IS_BOT = isBotUserAgent;
  if (typeof self !== "undefined") self.SHAIB_IS_BOT = isBotUserAgent;
})(typeof globalThis !== "undefined" ? globalThis : this);
