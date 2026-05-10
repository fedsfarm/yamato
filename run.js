if (typeof browser === 'undefined') {
  var browser = chrome;
}

(function () {

  let currentModeData;

  const getCurrentModeData = async () => {
    const modeRes = await new Promise(resolve => browser.runtime.sendMessage({ action: 'getMode' }, resolve));
    const modeKey = modeRes.mode || 'vergil';
    const danteRetro = modeRes.danteRetro || false;
    const effective = (modeKey === 'dante' && danteRetro) ? 'dante_retro' : modeKey;
    const modesRes = await new Promise(resolve => browser.runtime.sendMessage({ action: 'getModes' }, resolve));
    const modes = modesRes.modes;
    return modes[effective] || modes.vergil;
  };
  if (document.getElementById('efxt-transparent-video-overlay-host')) return;
  // Secondary guard: sessionStorage persists for the lifetime of the tab's
  // document. If run.js already initialised in this document (e.g. injected
  // twice due to a race), bail out immediately.
  try {
    if (sessionStorage.getItem('efxt-active') === '1') return;
    sessionStorage.setItem('efxt-active', '1');
  } catch (_) { /* private-browsing or sandboxed frame — ignore */ }

  let isBlockingActive = false;
  let mo, pointerEventsListeners, keyEventsListeners;
  let blockEventFunc, blockKeyEventFunc;

  async function initBlock() {
    if (isBlockingActive) return;
    isBlockingActive = true;
    currentModeData = await getCurrentModeData();

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
    Object.assign(host.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'auto', zIndex: '2147483647', background: 'transparent', cursor: 'url("' + browser.runtime.getURL('public/assets/' + "yamato.png") + '"), auto' });
    host.setAttribute('aria-hidden', 'true');

    const shadow = host.attachShadow({ mode: 'closed' });
    const container = document.createElement('div');
    Object.assign(container.style, { width: '100%', height: '100%', display: 'block', overflow: 'hidden' });
    container.id = 'efxt-transparent-video-overlay';

    const video = document.createElement('video');
    video.id = 'efxt-extension-video';
    video.src = browser.runtime.getURL('public/statuses/' + currentModeData.video);
    video.autoplay = true;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.volume = 1;
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' });
    video.play().catch(console.error);

    // Chrome throttles background tabs and can freeze video playback when the
    // tab loses focus. Two complementary fixes:
    //
    // 1. Web Locks API: holding a lock prevents Chrome from fully suspending
    //    the page's task queue, keeping timers and media alive.
    // 2. visibilitychange: re-call play() when the tab becomes visible again
    //    in case Chrome paused the video while hidden.
    if (navigator.locks?.request) {
      navigator.locks.request('efxt-video-keep-alive', { mode: 'exclusive' }, () => {
        // Return a promise that never resolves — holds the lock for the tab's lifetime.
        return new Promise(() => {});
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        video.play().catch(console.error);
      }
    });

    // Listen for video end event to close the tab
    video.addEventListener('ended', () => {
      (browser.runtime.sendMessage || chrome.runtime.sendMessage)({ action: 'close-this-tab' });
    }, { once: true });

    // Fallback: if video fails to load, close tab after a reasonable timeout
    video.addEventListener('error', () => {
      console.warn('Video failed to load, closing tab after timeout');
      setTimeout(() => {
        (browser.runtime.sendMessage || chrome.runtime.sendMessage)({ action: 'close-this-tab' });
      }, 3000);
    }, { once: true });

    container.appendChild(video);
    shadow.appendChild(container);
    document.documentElement.appendChild(host);

    // Notify background that the overlay is live in this tab.
    // Background uses this to cancel any further navigations (redirects,
    // meta-refresh, JS location changes) and close the tab.
    browser.runtime.sendMessage({ action: 'videoStarted' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('videoStarted message failed:', chrome.runtime.lastError);
      }
    });

    browser.runtime.sendMessage({ action: 'playSoundInBackground' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to play background sound:', chrome.runtime.lastError);
      } else if (response && !response.success) {
        console.log('Background sound play failed');
      }
    });

    document.documentElement.style.cursor = 'url("' + browser.runtime.getURL('public/assets/' + "yamato.png") + '"), auto';
    document.body && (document.body.style.cursor = 'url("' + browser.runtime.getURL('public/assets/' + "yamato.png") + '"), auto');

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
        el.addEventListener('load', e => e.stopImmediatePropagation(), { capture: true });
        el.addEventListener('error', e => e.stopImmediatePropagation(), { capture: true });
        el.addEventListener('contextmenu', blockEvent, { capture: true });
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

    pointerEventsListeners = pointerEvents.map(ev => window.addEventListener(ev, blockEvent, { capture: true, passive: false }));
    keyEventsListeners = keyEvents.map(ev => window.addEventListener(ev, blockKeyEvent, { capture: true, passive: false }));

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
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'download', 'data-src', 'poster'] });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => processNode(document), { once: true });
    } else {
      processNode(document);
    }

    (browser.runtime.onMessage || chrome.runtime.onMessage).addListener(msg => {
      if (msg?.action === 'toggleOverlay') {
        const currentHost = document.getElementById('efxt-transparent-video-overlay-host');
        if (currentHost) currentHost.style.display = currentHost.style.display === 'none' ? 'block' : 'none';
      }
    });

    window.addEventListener('unload', cleanup, { once: true });
  }

  function cleanup() {
    if (mo) mo.disconnect();
    if (pointerEventsListeners && blockEventFunc) {
      const pointerEvents = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'dragstart'];
      pointerEvents.forEach((ev, i) => window.removeEventListener(ev, blockEventFunc, { capture: true }));
    }
    if (keyEventsListeners && blockKeyEventFunc) {
      const keyEvents = ['keydown', 'keypress', 'keyup'];
      keyEvents.forEach((ev, i) => window.removeEventListener(ev, blockKeyEventFunc, { capture: true }));
    }
  }


  const url = new URL(window.location.href);
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  browser.runtime.sendMessage({ action: 'isBlocked', hostname: hostname, pathname: pathname }, (response) => {
    if (chrome.runtime.lastError || !response || !response.isBlocked) return;
    initBlock();
  });

  (browser.runtime.onMessage || chrome.runtime.onMessage).addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'forceBlock') {
      initBlock();
      sendResponse({ success: true });
      return true;
    }
  });
})();