if (typeof browser === 'undefined') {
  var browser = chrome;
}

(function() {
  if (document.getElementById('efxt-transparent-video-overlay-host')) return;

  let isBlockingActive = false;
  let mo, pointerEventsListeners, keyEventsListeners;
  let blockEventFunc, blockKeyEventFunc;

  function initBlock() {
    if (isBlockingActive) return;
    isBlockingActive = true;

    const style = document.createElement('style');
    style.id = 'efxt-media-blocker';
    style.textContent = `
      video, audio, img, iframe[src*="youtube"], iframe[src*="vimeo"], embed, object {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        opacity: 0 !important;
      }
      video, audio {
        pause: true !important;
      }
      * {
        background-image: none !important;
      }
      a[href*=".jpg"], a[href*=".png"], a[href*=".gif"], a[href*=".mp4"], a[href*=".webm"] {
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    const host = document.createElement('div');
    host.id = 'efxt-transparent-video-overlay-host';
    Object.assign(host.style, {position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'auto', zIndex: '2147483647', background: 'transparent', cursor: 'url("' + browser.runtime.getURL('vergil.jpeg') + '"), auto'});
    host.setAttribute('aria-hidden', 'true');

    const shadow = host.attachShadow({mode: 'closed'});
    const container = document.createElement('div');
    Object.assign(container.style, {width: '100%', height: '100%', display: 'block', overflow: 'hidden'});
    container.id = 'efxt-transparent-video-overlay';

    const video = document.createElement('video');
    video.id = 'efxt-extension-video';
    video.src = browser.runtime.getURL('public/vergil.webm');
    video.autoplay = true;
    video.loop = false;
    video.playsInline = true;
    video.muted = true;
    video.volume = 0;
    Object.assign(video.style, {width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none'});

  
    container.appendChild(video);
    shadow.appendChild(container);
    document.documentElement.appendChild(host);

    browser.runtime.sendMessage({action: 'playSoundInBackground'}, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to play background sound:', chrome.runtime.lastError);
      } else if (response && !response.success) {
        console.warn('Background sound play failed');
      }
    });

    document.documentElement.style.cursor = 'url("' + browser.runtime.getURL('vergil.jpeg') + '"), auto';
    document.body && (document.body.style.cursor = 'url("' + browser.runtime.getURL('vergil.jpeg') + '"), auto');

    const MEDIA_EXT_RE = /\.(png|jpg|svg|mp4|webm|ogg|mp3|wav|m4a|flac|aac)(\?|#|$)/i;

    function isMediaLink(href) { return href && MEDIA_EXT_RE.test(href); }

    function processNode(node) {
      if (!(node instanceof Element)) return;
      const anchors = node.querySelectorAll('a[href], area[href]');
      anchors.forEach(a => {
        a.removeAttribute('download');
        if (isMediaLink(a.href)) {
          a.dataset._efxt_blocked = '1';
          a.style.pointerEvents = 'none';
        }
      });
      const mediaEls = node.querySelectorAll('video, audio, img, iframe, embed, object');
      mediaEls.forEach(el => {
        if (el.id === 'efxt-extension-video') return;
        el.removeAttribute('controls');
        el.controls = false;
        el.controlsList = 'nodownload';
        el.preload = 'none';
        el.style.display = 'none !important';
        el.style.visibility = 'hidden !important';
        el.style.width = '0 !important';
        el.style.height = '0 !important';
        el.style.opacity = '0 !important';
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
          el.pause();
          el.currentTime = 0;
          el.muted = true;
        }
        if (el.tagName === 'IMG') {
          el.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }
        if (el.src && el.src !== el.dataset._efxt_orig_src && !el.src.startsWith('data:')) {
          el.dataset._efxt_orig_src = el.src;
          el.removeAttribute('src');
        }
        if (el.getAttribute('data-src') && el.getAttribute('data-src') !== el.dataset._efxt_orig_data_src) {
          el.dataset._efxt_orig_data_src = el.getAttribute('data-src');
          el.removeAttribute('data-src');
        }
        el.querySelectorAll('source').forEach(s => {
          if (s.src && s.src !== s.dataset._efxt_orig_src) {
            s.dataset._efxt_orig_src = s.src;
            s.removeAttribute('src');
            s.remove();
          }
        });
        el.load?.();
        el.addEventListener('load', e => e.stopImmediatePropagation(), {capture: true});
        el.addEventListener('error', e => e.stopImmediatePropagation(), {capture: true});
        el.addEventListener('contextmenu', blockEvent, {capture: true});
      });
      if (node.tagName === 'STYLE' || node.tagName === 'LINK') {
      }
      if (node.style) node.style.cursor = host.style.cursor;
    }

    const pointerEvents = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'dragstart'];
    const keyEvents = ['keydown', 'keypress', 'keyup'];

    function blockEvent(e) {
      if (e.target?.id === 'efxt-transparent-video-overlay-host') return;
      const a = e.target?.closest('a[href]');
      if (a?.dataset._efxt_allow === '1') return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  
    function blockKeyEvent(e) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  
    blockEventFunc = blockEvent;
    blockKeyEventFunc = blockKeyEvent;
  
    pointerEventsListeners = pointerEvents.map(ev => window.addEventListener(ev, blockEvent, {capture: true, passive: false}));
    keyEventsListeners = keyEvents.map(ev => window.addEventListener(ev, blockKeyEvent, {capture: true, passive: false}));

    window.addEventListener('dragstart', e => {
      const target = e.target;
      if (target && ['IMG', 'VIDEO', 'AUDIO', 'A'].includes(target.tagName)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);

    mo = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(processNode);
        } else if (m.type === 'attributes' && ['src', 'href', 'download', 'data-src', 'poster', 'background-image'].includes(m.attributeName)) {
          processNode(m.target);
        }
      });
    });
    mo.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'download', 'data-src', 'poster']});

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => processNode(document), {once: true});
    } else {
      processNode(document);
    }



    (browser.runtime.onMessage || chrome.runtime.onMessage).addListener(msg => {
      if (msg?.action === 'toggleOverlay') {
        const currentHost = document.getElementById('efxt-transparent-video-overlay-host');
        if (currentHost) currentHost.style.display = currentHost.style.display === 'none' ? 'block' : 'none';
      }
    });

    setTimeout(() => (browser.runtime.sendMessage || chrome.runtime.sendMessage)({action: 'close-this-tab'}), 10100);

    window.addEventListener('unload', cleanup, {once: true});
  }

  function cleanup() {
    if (mo) mo.disconnect();
    if (pointerEventsListeners && blockEventFunc) {
      const pointerEvents = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'dragstart'];
      pointerEvents.forEach((ev, i) => window.removeEventListener(ev, blockEventFunc, {capture: true}));
    }
    if (keyEventsListeners && blockKeyEventFunc) {
      const keyEvents = ['keydown', 'keypress', 'keyup'];
      keyEvents.forEach((ev, i) => window.removeEventListener(ev, blockKeyEventFunc, {capture: true}));
    }
  }


  const url = new URL(window.location.href);
  const hostname = url.hostname.toLowerCase();

  browser.runtime.sendMessage({action: 'isBlocked', hostname: hostname}, (response) => {
    if (chrome.runtime.lastError || !response || !response.isBlocked) return;
    initBlock();
  });

  (browser.runtime.onMessage || chrome.runtime.onMessage).addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'forceBlock') {
      initBlock();
      sendResponse({success: true});
      return true;
    }
  });
})();
