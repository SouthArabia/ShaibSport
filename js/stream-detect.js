/** Port of CanvasAutoStreamBrowser.streamDetectJS — reports streams to parent via postMessage */
export function streamDetectScript(mode = "manual") {
  const modeRaw = String(mode || "manual");
  return `
(function(){
  if(window._shaibDomainInstalled)return;window._shaibDomainInstalled=true;
  window._shaibAutoClickActive=${modeRaw === "manual" ? "false" : "true"};
  window._shaibDomainMode=${JSON.stringify(modeRaw)};
  var _clickTimer=null,_scrollDone=false;

  function report(url){
    if(!url||url.length<8)return;
    if(url.indexOf('blob:')===0)return;
    try{window.parent.postMessage({type:'shaibDomainStream',url:url},'*');}catch(e){}
  }

  var _xOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==='string'&&(u.includes('.m3u8')||u.includes('.mp4')||u.includes('/hls/')))report(u);
    return _xOpen.apply(this,arguments);
  };
  var _fetch=window.fetch;
  if(_fetch){window.fetch=function(input){
    var u=typeof input==='string'?input:(input&&input.url)||'';
    if(u.includes('.m3u8')||u.includes('.mp4')||u.includes('/hls/'))report(u);
    return _fetch.apply(this,arguments);
  };}

  document.addEventListener('play',function(e){
    if(e.target.tagName!=='VIDEO')return;
    var src=e.target.currentSrc||e.target.src||'';
    if(src&&!src.startsWith('blob:'))report(src);
    var sources=e.target.querySelectorAll('source');
    for(var i=0;i<sources.length;i++){if(sources[i].src)report(sources[i].src);}
  },true);

  function clickEl(el){
    if(!el)return false;
    try{
      el.scrollIntoView({behavior:'smooth',block:'center'});
      el.click();
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      return true;
    }catch(e){return false;}
  }

  function findPlay(){
    var sels=[
      '.STING-web-SVG-Play','[class*="STING-web-SVG-Play"]',
      'button.watch-btn','.watch-btn','[class*="play-btn"]','[class*="PlayBtn"]',
      '.vjs-big-play-button','.jw-icon-playback','.plyr__control--overlaid',
      'button[aria-label*="Play"]','button[aria-label*="play"]',
      '.play-button','.btn-play','[class*="video-play"]'
    ];
    for(var i=0;i<sels.length;i++){
      var el=document.querySelector(sels[i]);
      if(el && el.offsetParent!==null){clickEl(el);return true;}
    }
    var vids=document.querySelectorAll('video');
    for(var j=0;j<vids.length;j++){
      try{vids[j].muted=false;vids[j].play();}catch(e){}
    }
    return false;
  }

  function clickMask(){
    var mask=document.querySelector('.MT_MaskText, [class*="MT_MaskText"]');
    if(mask){clickEl(mask);return true;}
    return false;
  }
  function clickOverlay(){
    var el=document.querySelector('.overlay-match .text-match, .text-match, .overlay-match, [class*="text-match"]');
    if(el){clickEl(el);return true;}
    return false;
  }
  function clickLiveStatus(){
    var el=document.querySelector('.fhmc-status.status-live, [data-fhmc-status-label="1"], .fhmc-live-dot');
    if(el){
      var t=el.closest('a,button,[role="button"],.fhmc-status')||el;
      clickEl(t);return true;
    }
    return false;
  }
  function softScroll(){
    if(_scrollDone)return;
    _scrollDone=true;
    try{window.scrollBy({top: Math.min(600, window.innerHeight*0.7), behavior:'smooth'});}catch(e){}
  }

  function step(){
    if(!window._shaibAutoClickActive)return;
    var mode=window._shaibDomainMode;
    if(mode==='manual')return;
    if(mode==='mtMask'){ clickMask(); softScroll(); findPlay(); }
    else if(mode==='stingPlay'){ findPlay(); clickEl(document.querySelector('.STING-web-SVG-Play')); }
    else if(mode==='overlayMatch'){ clickOverlay(); softScroll(); findPlay(); }
    else if(mode==='liveStatus'){ clickLiveStatus(); softScroll(); findPlay(); }
    _clickTimer=setTimeout(step, 900);
  }

  window._shaibSetAutoClick=function(active){
    window._shaibAutoClickActive=active;
    if(_clickTimer){clearTimeout(_clickTimer);_clickTimer=null;}
    if(active){ _scrollDone=false; setTimeout(step, 400); }
  };

  function start(){ setTimeout(step, 600); }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded', start);}
  else{start();}

  var _push=history.pushState,_replace=history.replaceState;
  function onNav(){ _scrollDone=false; if(_clickTimer){clearTimeout(_clickTimer);_clickTimer=null;} setTimeout(step,500); }
  history.pushState=function(){_push.apply(this,arguments);onNav();};
  history.replaceState=function(){_replace.apply(this,arguments);onNav();};
  window.addEventListener('popstate', onNav);
})();`;
}

/** Fast-server click for قناة 6 / majed-koora */
export function fastServerScript() {
  return `
(function(){
  if(window._shaibFastServer)return;window._shaibFastServer=true;
  var tries=0;
  function tick(){
    tries++;
    var buttons=document.querySelectorAll('button.watch-btn, .watch-btn, button');
    for(var i=0;i<buttons.length;i++){
      var t=(buttons[i].textContent||'');
      if(t.indexOf('مشاهدة بسيرفر سريع')!==-1 || t.indexOf('سيرفر سريع')!==-1){
        try{buttons[i].click();return;}catch(e){}
      }
    }
    var first=document.querySelector('button.watch-btn, .watch-btn');
    if(first){try{first.click();}catch(e){}}
    if(tries<24)setTimeout(tick,400);
  }
  setTimeout(tick,800);
})();`;
}

export function syriaHelpersScript() {
  return `
(function(){
  if(window._shaibSyria)return;window._shaibSyria=true;
  try{
    var _assign=location.assign.bind(location);
    var _replace=location.replace.bind(location);
    location.assign=function(u){ try{var h=new URL(u,location.href).hostname; if(h&&h.indexOf('syria-player')===-1&&h.indexOf('shootsync')===-1) return;}catch(e){} return _assign(u); };
    location.replace=function(u){ try{var h=new URL(u,location.href).hostname; if(h&&h.indexOf('syria-player')===-1&&h.indexOf('shootsync')===-1) return;}catch(e){} return _replace(u); };
    window.open=function(){return null;};
  }catch(e){}
  document.querySelectorAll('video').forEach(function(v){
    try{v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');}catch(e){}
  });
})();`;
}

/** Auto-click play + start videos when a tile opens (injected into embeds). */
export function autoPlayScript() {
  return `
(function(){
  if(window._shaibAutoPlay)return;window._shaibAutoPlay=true;
  var tries=0;
  function clickPlayUi(){
    var sels=[
      '.vjs-big-play-button','.jw-icon-playback','.plyr__control--overlaid',
      'button.watch-btn','.watch-btn','[class*="play-btn"]','[class*="PlayBtn"]',
      '.STING-web-SVG-Play','[class*="STING-web-SVG-Play"]',
      '.MT_MaskText','[class*="MT_MaskText"]',
      '.overlay-match .text-match','.text-match','.overlay-match',
      'button[aria-label*="Play"]','button[aria-label*="play"]','button[aria-label*="تشغيل"]',
      '.play-button','.btn-play','[class*="video-play"]','[class*="big-play"]',
      'video'
    ];
    for(var i=0;i<sels.length;i++){
      var nodes=document.querySelectorAll(sels[i]);
      for(var j=0;j<nodes.length;j++){
        var el=nodes[j];
        if(!el) continue;
        try{
          if(el.tagName==='VIDEO'){
            el.setAttribute('playsinline','');
            el.setAttribute('webkit-playsinline','');
            el.setAttribute('autoplay','');
            el.playsInline=true;
            var p=el.play();
            if(p&&p.catch){
              p.catch(function(){
                try{el.muted=true;el.defaultMuted=true;el.play().then(function(){
                  setTimeout(function(){try{el.muted=false;}catch(e){}},400);
                }).catch(function(){});}catch(e){}
              });
            }
          } else {
            el.click();
            el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
          }
        }catch(e){}
      }
    }
  }
  function tick(){
    tries++;
    clickPlayUi();
    if(tries<40) setTimeout(tick, 500);
  }
  function start(){ setTimeout(tick, 200); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  try{
    new MutationObserver(function(){ clickPlayUi(); }).observe(document.documentElement,{childList:true,subtree:true});
  }catch(e){}
})();`;
}
