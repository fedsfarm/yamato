(() => {
  const api = typeof browser === 'undefined' ? chrome : browser;
  const replacement = api.runtime.getURL(yamatoJC.video.slice(1));
  const replacementImage = api.runtime.getURL(yamatoJC.image.slice(1));
  const emptyImage = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const mediaSelector = 'img, video, audio, iframe, embed, object';
  const selector = mediaSelector + ', [data-yamato-background]';
  const replacements = new WeakSet();
  const pending = new Set();
  let scheduled = false;
  const sites = globalThis.yamatoSites;
  let settings = sites.settings({ enableSiteModules: false });
  let activeSite;
  let settingsLoaded = false;
  let pageRequested = false;
  const flaggedItems = new WeakSet();
  const playedMedia = new WeakMap();
  const waitingJC = new Map();
  const sitePending = new Set();
  // Batch and cache URL checks across renderers.
  let policyCache = new Map();
  let policyPending = new Map();
  function checkURLs(urls) {
    return Promise.all(urls.map(url => {
      if (!policyCache.has(url)) {
        const promise = new Promise((resolve, reject) => {
          policyPending.set(url, { resolve, reject });
        });
        policyCache.set(url, promise);
        if (policyPending.size === 1) queueMicrotask(flushPolicy);
      }
      return policyCache.get(url).then(blocked => blocked ? url : null);
    })).then(results => results.filter(url => url !== null));
  }
  async function flushPolicy() {
    const entries = [...policyPending];
    const cache = policyCache;
    policyPending = new Map();
    for (let i = 0; i < entries.length; i += 256) {
      const batch = entries.slice(i, i + 256);
      try {
        const result = await api.runtime.sendMessage({ action: 'checkMediaURLs', urls: batch.map(([url]) => url) });
        if (!Array.isArray(result?.blocked)) throw new Error('No media policy response');
        const blocked = new Set(result.blocked);
        for (const [url, request] of batch) request.resolve(blocked.has(url));
      } catch (error) {
        for (const [url, request] of batch) { cache.delete(url); request.reject(error); }
      }
    }
    while (cache.size > 4096) cache.delete(cache.keys().next().value);
  }

  function configureSite(force = false) {
    activeSite = sites.forDocument(document, location.hostname);
    const enabled = settings.enableSiteModules && activeSite && settings.siteModules[activeSite.id] !== 'off';
    if (document.documentElement) {
      const id = enabled ? activeSite.id : '';
      const changed = document.documentElement.getAttribute('data-yamato-site-enabled') !== id;
      if (changed) document.documentElement.setAttribute('data-yamato-site-enabled', id);
      if (changed || force) document.dispatchEvent(new Event('yamato-site-config'));
    }
    return enabled;
  }
  async function loadSettings() {
    try {
      settings = sites.settings(await api.storage.local.get(['mediaBlockMode', 'siteModules', 'enableSiteModules']));
    } catch (error) {
      settings = sites.settings();
      console.warn('Yamato settings failed:', error);
    } finally {
      settingsLoaded = true;
      configureSite();
      scan(document);
    }
  }
  function fullPage(moduleId, urls = []) {
    if (pageRequested) return;
    pageRequested = true;
    api.runtime.sendMessage({ action: 'mediaFullPage', moduleId, urls }).then(result => {
      if (!result?.success) pageRequested = false;
    }).catch(() => { pageRequested = false; });
  }
  const registeredMedia = new WeakMap();
  function blockSiteItem(item) {
    flaggedItems.add(item);
    const media = standaloneBackground(item) ? [] : sites.query(item, selector);
    if (item.matches?.(selector)) media.unshift(item);
    if (activeSite.search) {
      const urls = [...new Set(media.flatMap(urlsFor))];
      const key = JSON.stringify(urls);
      if (urls.length && registeredMedia.get(item) !== key) {
        registeredMedia.set(item, key);
        for (let i = 0; i < urls.length; i += 256) api.runtime.sendMessage({ action: 'blockSearchMedia', urls: urls.slice(i, i + 256) })
          .catch(() => registeredMedia.delete(item));
      }
    }
    for (const element of media) replace(element, item);
    if (settings.siteModules[activeSite.id] === 'jce') fullPage(activeSite.id);
  }
  const heldSelector = '[data-yamato-held-src], [data-yamato-held-srcset], [data-yamato-held-poster], [data-yamato-held-data]';
  let releasedSources = new WeakMap();
  function releaseHeld(root, disabled = false) {
    if (disabled) {
      for (const element of [root, ...(root.querySelectorAll ? sites.query(root, '[data-yamato-background]') : [])]) {
        const value = element.getAttribute?.('data-yamato-background');
        if (value && !element.hasAttribute('data-yamato-approved') && !replacements.has(element)) {
          element.setAttribute('data-yamato-approved', '');
          element.style.backgroundImage = value;
        }
      }
    }
    for (const element of [root, ...(root.querySelectorAll ? sites.query(root, heldSelector) : [])]) {
      for (const name of ['src', 'srcset', 'poster', 'data']) {
        const value = element.getAttribute?.('data-yamato-held-' + name);
        if (value !== null && value !== undefined) {
          element.removeAttribute('data-yamato-held-' + name);
          if (element.getAttribute(name) !== value) {
            const released = releasedSources.get(element) || new Map();
            released.set(name, value);
            releasedSources.set(element, released);
            element.setAttribute(name, value);
          }
        }
      }
    }
  }
  let searchChecks = new WeakMap();
  function standaloneBackground(item) {
    return item.hasAttribute?.('data-yamato-background') && !sites.closestItem(item, activeSite);
  }
  function allowSearchItem(item) {
    return () => {
      releaseHeld(item);
      for (const element of [item, ...sites.query(item, selector)]) {
        element.setAttribute('data-yamato-checked', '');
      }
    };
  }
  function searchURLs(item) {
    if (standaloneBackground(item)) return [...new Set([...urlsFor(item), ...sites.searchURLs(item, true)])].sort();
    const urls = new Set(sites.searchURLs(item));
    for (const element of sites.query(item, selector + ', source')) {
      urlsFor(element).forEach(url => urls.add(url));
      for (const name of ['src', 'poster', 'data']) {
        const value = element.getAttribute('data-yamato-held-' + name);
        if (value) try { urls.add(new URL(value, element.baseURI).href); } catch { /* Invalid media URL. */ }
      }
      for (const candidate of (element.getAttribute('data-yamato-held-srcset') || '').split(',')) {
        if (candidate.trim()) try { urls.add(new URL(candidate.trim().split(/\s+/)[0], element.baseURI).href); } catch { /* Invalid candidate. */ }
      }
    }
    return [...urls].sort();
  }
  async function checkSearchItem(item, siteId) {
    const urls = searchURLs(item);
    const key = JSON.stringify(urls);
    const previous = searchChecks.get(item);
    if (previous?.key === key) {
      if (previous.blocked === false) previous.release?.();
      else if (previous.blocked === true) blockSiteItem(item);
      return;
    }
    const check = { key };
    searchChecks.set(item, check);
    // Checked media stays visible: new sources are held and changed
    // backgrounds lose their check before the item is rechecked.
    try {
      const blocked = (await checkURLs(urls)).length > 0;
      if (searchChecks.get(item) !== check || !item.isConnected) return;
      if (!settings.enableSiteModules || activeSite?.id !== siteId || settings.siteModules[siteId] === 'off') { releaseHeld(item); return; }
      if (JSON.stringify(searchURLs(item)) !== key) { scan(item); return; }
      if (blocked) { check.blocked = true; blockSiteItem(item); }
      else {
        const release = allowSearchItem(item);
        if (searchChecks.get(item) !== check || !item.isConnected) return;
        if (JSON.stringify(searchURLs(item)) !== key || !standaloneBackground(item) && sites.sensitive(item, activeSite) || flaggedItems.has(item)) {
          searchChecks.delete(item); scan(item); return;
        }
        check.blocked = false;
        check.release = release;
        release();
      }
    } catch (error) {
      searchChecks.delete(item);
      // An unavailable check must not turn into permission to load the media.
      console.warn('Yamato search check failed:', error);
    }
  }
  function scanSites(node) {
    if (!configureSite()) { releaseHeld(node, true); return; }
    if (activeSite.search) {
      // Check computed background URLs, including stylesheet images.
      const backgrounds = [];
      for (const element of [node, ...(node.querySelectorAll ? sites.query(node, '*') : [])]) {
        if (element.nodeType !== Node.ELEMENT_NODE) continue;
        if (replacements.has(element) || element.hasAttribute('data-yamato-replacement')) continue;
        const value = getComputedStyle(element).backgroundImage;
        backgrounds.push([element, value]);
      }
      // Read styles before writing attributes that invalidate those styles.
      for (const [element, value] of backgrounds) {
        if (sites.backgroundURLs(value).length && element.getAttribute('data-yamato-background') !== value) {
          element.setAttribute('data-yamato-background', value);
          element.removeAttribute('data-yamato-approved');
          element.removeAttribute('data-yamato-checked');
        } else if (!sites.backgroundURLs(value).length) element.removeAttribute('data-yamato-background');
      }
    }
    const item = sites.closestItem(node, activeSite);
    const items = new Set(node.querySelectorAll ? sites.query(node, activeSite.items) : []);
    if (item) items.add(item);
    if (activeSite.search) {
      // Check media outside cards without inheriting card ratings.
      const media = node.querySelectorAll ? sites.query(node, selector) : [];
      if (node.matches?.(selector)) media.push(node);
      for (const element of media) {
        if (!replacements.has(element) && !sites.closestItem(element, activeSite)) items.add(element);
      }
    }
    for (const candidate of items) {
      const owner = sites.closestItem(candidate, activeSite);
      if (activeSite.search && owner && owner !== candidate) continue;
      if (standaloneBackground(candidate)) checkSearchItem(candidate, activeSite.id);
      else if (flaggedItems.has(candidate) || sites.sensitive(candidate, activeSite)) blockSiteItem(candidate);
      else if (activeSite.search) checkSearchItem(candidate, activeSite.id);
    }
    // API hooks replace rated URLs before the site's renderer receives them.
    const marked = '[data-yamato-sensitive], [src$="#yamato-blocked"], [poster$="#yamato-blocked"]';
    const elements = node.querySelectorAll ? sites.query(node, marked) : [];
    if (node.matches?.(marked)) elements.push(node);
    for (const element of elements) {
      const owner = element.tagName === 'SOURCE' ? element.closest('video, audio, picture') : element;
      if (owner) blockSiteItem(owner);
    }
  }
  document.addEventListener('yamato-site-ready', () => configureSite(true));
  document.addEventListener('yamato-search-media', event => scan(event.target));
  document.addEventListener('yamato-shadow', event => scan(event.target));
  document.addEventListener('yamato-sensitive', event => scan(event.target));
  document.addEventListener('yamato-sensitive-data', () => {
    if (configureSite() && settings.siteModules[activeSite.id] === 'jce') fullPage(activeSite.id);
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.mediaBlockMode || changes.siteModules || changes.enableSiteModules)) loadSettings();
  });

  function urlsFor(element) {
    const urls = new Set();
    function add(value) {
      if (!value) return;
      try {
        const url = new URL(value, element.baseURI);
        if (url.protocol === 'http:' || url.protocol === 'https:') urls.add(url.href);
      } catch { /* Malformed page URLs are not media requests. */ }
    }
    add(element.currentSrc);
    add(element.getAttribute('src'));
    add(element.getAttribute('poster'));
    add(element.getAttribute('data'));
    for (const name of ['src', 'poster', 'data']) add(element.getAttribute('data-yamato-held-' + name));
    sites.backgroundURLs(element.getAttribute('data-yamato-background')).forEach(add);
    const sources = [element, ...element.querySelectorAll('source')];
    if (element.parentElement?.tagName === 'PICTURE') {
      sources.push(...element.parentElement.querySelectorAll('source'));
    }
    for (const source of sources) {
      add(source.getAttribute('src'));
      // Include responsive candidates before currentSrc has been selected.
      for (const candidate of (source.getAttribute('data-yamato-held-srcset') || source.getAttribute('srcset') || '').split(',')) {
        add(candidate.trim().split(/\s+/)[0]);
      }
    }
    return [...urls];
  }

  function replace(element, item) {
    if (!element.isConnected || replacements.has(element)) return;
    const isCSS = !element.matches(mediaSelector);
    const owner = item || element;
    const key = JSON.stringify([...new Set(urlsFor(element))].sort());
    const mode = item && activeSite && settings.enableSiteModules ? settings.siteModules[activeSite.id] : settings.mediaBlockMode;
    const rect = element.getBoundingClientRect();
    replacements.add(element);
    element.setAttribute('data-yamato-replacement', 'true');
    if (!isCSS) {
      element.setAttribute('data-yamato-sensitive', 'true');
    }
    const picture = element.parentElement?.tagName === 'PICTURE' ? element.parentElement : element;
    for (const source of picture.querySelectorAll('source')) {
      source.removeAttribute('src'); source.removeAttribute('srcset');
    }
    if (element instanceof HTMLMediaElement) {
      element.pause(); element.srcObject = null;
      element.querySelectorAll('source').forEach(source => source.remove());
    }
    for (const name of ['src', 'srcset', 'poster', 'data']) {
      element.removeAttribute(name);
      element.removeAttribute('data-yamato-held-' + name);
    }
    if (!isCSS) {
      if (rect.width) element.style.width = rect.width + 'px';
      if (rect.height) element.style.height = rect.height + 'px';
      element.style.setProperty('filter', 'none', 'important');
      element.style.setProperty('opacity', '1', 'important');
      element.style.setProperty('visibility', 'visible', 'important');
      element.style.setProperty('object-fit', 'cover', 'important');
    }
    if (isCSS) element.style.setProperty('background-image', 'none', 'important');
    else if (element instanceof HTMLImageElement || element instanceof HTMLIFrameElement) element.src = emptyImage;
    else if (element instanceof HTMLObjectElement) element.data = emptyImage;
    else if (element instanceof HTMLMediaElement) element.load();
    if (mode === 'jce') return;

    // Preserve DOM nodes; replace images with APNG, video/audio with WebM.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect(); waitingJC.delete(element);
      if (!element.isConnected) return;
      const played = playedMedia.get(owner) || new Set();
      if (played.has(key)) return;
      played.add(key); playedMedia.set(owner, played);
      // Play audio once per visible slot through the extension.
      api.runtime.sendMessage({ action: 'playJCSound' }).then(result => {
        if (!result?.started) console.warn('Yamato JC sound failed to start');
      }).catch(error => console.warn('Yamato JC sound failed:', error));
      // A unique resource URL gives each new slot its own animation timeline.
      const image = replacementImage + '?slot=' + crypto.randomUUID();
      if (isCSS) {
        element.style.setProperty('background-image', 'url("' + image + '")', 'important');
        element.style.setProperty('background-size', 'cover', 'important');
        element.style.setProperty('background-repeat', 'no-repeat', 'important');
        element.style.setProperty('background-position', 'center', 'important');
      } else if (element instanceof HTMLMediaElement) {
        // The background player supplies audio for both images and videos.
        element.autoplay = true; element.muted = true; element.loop = false;
        element.playsInline = true; element.controls = false;
        element.src = replacement;
        element.addEventListener('ended', () => element.style.setProperty('visibility', 'hidden', 'important'), { once: true });
        element.play().catch(() => {});
      } else if (element instanceof HTMLObjectElement) {
        element.type = 'image/png'; element.data = image;
      } else element.src = image;
    });
    waitingJC.set(element, observer); observer.observe(element);
  }

  async function flush() {
    scheduled = false;
    if (!settingsLoaded) return;
    const policy = policyCache;
    for (const [slot, observer] of waitingJC) {
      if (!slot.isConnected) { observer.disconnect(); waitingJC.delete(slot); }
    }
    const nodes = [...sitePending].filter(node => {
      // If a parent is already queued, its scan includes this subtree (and shadows).
      for (let parent = node?.parentNode || node?.host; parent; parent = parent.parentNode || parent.host) {
        if (sitePending.has(parent)) return false;
      }
      return true;
    });
    sitePending.clear();
    for (const node of nodes) if (node && (node.isConnected || node === document)) collectMedia(node);
    for (const node of nodes) if (node && (node.isConnected || node === document)) scanSites(node);
    document.documentElement?.setAttribute('data-yamato-ready', '');
    const entries = [...pending].filter(element => element.isConnected && !replacements.has(element))
      .map(element => ({ element, urls: urlsFor(element) }));
    pending.clear();
    const urls = [...new Set(entries.flatMap(entry => entry.urls))];
    try {
      const blocked = new Set(await checkURLs(urls));
      if (policy !== policyCache) { scan(document); return; }
      for (const { element, urls: checkedURLs } of entries) {
        // Re-read sources in case the page changed them while the message waited.
        const currentURLs = urlsFor(element);
        if (JSON.stringify(currentURLs) !== JSON.stringify(checkedURLs)) { scan(element); continue; }
        const matches = currentURLs.filter(url => blocked.has(url));
        if (matches.length) {
          replace(element);
          if (settings.mediaBlockMode === 'jce') fullPage(null, matches);
        } else if (!settings.enableSiteModules || !activeSite?.search || settings.siteModules[activeSite.id] === 'off') {
          element.setAttribute('data-yamato-checked', '');
        }
      }
    } catch (error) {
      console.warn('Yamato media replacement failed:', error);
    }
  }

  function scan(node) {
    if (!node) return;
    if (node.hasAttribute?.('data-yamato-replacement')) return;
    sitePending.add(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    if (!scheduled) {
      scheduled = true;
      // Coalesce render bursts across tasks and let the page handle input.
      // A timer also runs in background tabs, where animation frames can stop.
      setTimeout(flush, 16);
    }
  }

  function collectMedia(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches(selector)) pending.add(node);
      if (node.tagName === 'SOURCE') {
        const owner = node.closest('video, audio, picture');
        if (owner?.tagName === 'PICTURE') owner.querySelectorAll('img').forEach(img => pending.add(img));
        else if (owner) pending.add(owner);
      }
    }
    node.querySelectorAll?.(selector).forEach(element => pending.add(element));
    // Reddit and other web-component clients render attachments in open shadows.
    const hosts = [node, ...(node.querySelectorAll?.('*') || [])];
    for (const host of hosts) {
      if (host.shadowRoot && !observedRoots.has(host.shadowRoot)) {
        observedRoots.add(host.shadowRoot);
        // Manifest styles do not cross shadow boundaries.
        const style = document.createElement('style');
        style.textContent = ':is(' + selector + '):not([data-yamato-checked]):not([data-yamato-replacement]) { visibility:hidden!important; opacity:0!important; }';
        host.shadowRoot.prepend(style);
        observer.observe(host.shadowRoot, observerOptions);
        scan(host.shadowRoot);
      }
    }
  }

  const observedRoots = new WeakSet();
  const observer = new MutationObserver(records => {
    const released = releasedSources;
    releasedSources = new WeakMap();
    for (const record of records) {
      // Reassigning an unchanged attribute must not hide checked thumbnails.
      if (record.type === 'attributes' &&
          record.oldValue === record.target.getAttribute(record.attributeName)) continue;
      // Restoring an approved source is our own write, not new page content.
      // If the page changed it again, the new value still needs a check.
      if (record.type === 'attributes' && released.get(record.target)?.has(record.attributeName) &&
          released.get(record.target).get(record.attributeName) === record.target.getAttribute(record.attributeName)) continue;
      if (record.type === 'attributes' && ['src', 'srcset', 'poster', 'data'].includes(record.attributeName) &&
          !replacements.has(record.target)) {
        record.target.removeAttribute('data-yamato-checked');
        if (record.target.tagName === 'SOURCE') {
          const owner = record.target.closest('video, audio, picture');
          owner?.removeAttribute('data-yamato-checked');
          owner?.querySelectorAll('img').forEach(img => img.removeAttribute('data-yamato-checked'));
        }
      }
      if (record.type === 'characterData' && record.target.parentElement?.closest('style')) scan(document);
      else if (record.type === 'attributes' || record.type === 'characterData') scan(record.target);
      else {
        // Rescan the owning result; stylesheet changes need a full scan.
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target?.closest('style') || [...record.addedNodes, ...record.removedNodes].some(node =>
          node.matches?.('style, link[rel="stylesheet"]') || node.querySelector?.('style, link[rel="stylesheet"]'))) scan(document);
        else if (target?.matches('video, audio, picture')) scan(target);
        else if (activeSite) {
          const item = sites.closestItem(target, activeSite);
          if (item) scan(item);
        }
        record.addedNodes.forEach(scan);
      }
    }
  });
  const observerOptions = {
    subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'poster', 'data', 'class', 'style', 'aria-label', 'nsfw', 'spoiler', 'data-nsfw', 'data-over18', 'data-sensitive', 'data-possibly-sensitive', 'data-is-nsfw', 'data-age-restricted', 'data-has-mature', 'data-yamato-sensitive', 'href', 'data-lpage', 'data-ou', 'data-iurl', 'm', 'data-bem', 'data-yamato-held-src', 'data-yamato-held-srcset', 'data-yamato-held-poster', 'data-yamato-held-data'],
  };
  observer.observe(document, observerOptions);
  document.addEventListener('error', event => scan(event.target), true);
  document.addEventListener('load', event => scan(event.target?.tagName === 'LINK' ? document : event.target), true);
  api.runtime.onMessage.addListener(message => {
    if (message?.action === 'mediaRulesChanged') {
      // Flush requests before clearing their cache.
      if (policyPending.size) flushPolicy();
      policyCache = new Map(); searchChecks = new WeakMap(); scan(document);
    }
  });
  loadSettings();
  scan(document);
})();
