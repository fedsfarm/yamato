// MAIN-world media hooks; parser requests can arrive before warnings.
(() => {
  const sites = globalThis.yamatoSites;
  const mediaSelector = 'img, video, audio, source, iframe, embed, object';
  // Use an image placeholder to avoid frame downloads.
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const empty = blank + '#yamato-blocked';
  const blockedURLs = new Set();
  let enabled = false;
  let site;
  let busy = false;
  const nativeSet = Element.prototype.setAttribute;
  const nativeParse = JSON.parse;
  const nativeDispatch = EventTarget.prototype.dispatchEvent;
  const signal = element => {
    nativeSet.call(element, 'data-yamato-sensitive', 'true');
    nativeDispatch.call(element, new Event('yamato-sensitive', { bubbles: true }));
  };
  document.addEventListener('yamato-site-config', () => {
    site = sites.forDocument(document, location.hostname);
    enabled = !!site && document.documentElement?.getAttribute('data-yamato-site-enabled') === site.id;
    if (!enabled) blockedURLs.clear();
  });
  nativeDispatch.call(document, new Event('yamato-site-ready'));

  // Suppress errors while source checks are pending.
  document.addEventListener('error', event => {
    const element = event.target;
    if (element.hasAttribute?.('data-yamato-held-src') &&
        element.matches?.(mediaSelector) && !element.hasAttribute('data-yamato-approved') &&
        !element.hasAttribute('data-yamato-replacement')) event.stopImmediatePropagation();
  }, true);

  function inspect(data) {
    if (!enabled || !data || typeof data !== 'object') return data;
    const seen = new WeakSet();
    // Flags apply to descendants, never sibling posts.
    function visit(value, flagged = false, media = false, depth = 0) {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 40) return;
      seen.add(value);
      flagged ||= site.flagged(value);
      for (const key of Object.keys(value)) {
        const child = value[key];
        const isMedia = media || /^(media|media_attachments|extended_entities|entities|preview|images|image|video|videos|variants|thumbnail|thumbnails|streamingData|formats|adaptiveFormats|attachments|photos|contentRating|videoDetails)$/i.test(key);
        if (flagged && typeof child === 'string' &&
          (isMedia && /^(url|src|source|srcset|.*_url|.*Url)$/i.test(key) || /^(media_url_https|media_url|thumbnail_src|display_url|url_overridden_by_dest)$/i.test(key)) && /^https?:\/\//i.test(child)) {
          blockedURLs.add(child);
          if (blockedURLs.size > 5000) blockedURLs.delete(blockedURLs.values().next().value);
          value[key] = empty;
          nativeDispatch.call(document, new Event('yamato-sensitive-data'));
        } else if (child && typeof child === 'object') visit(child, flagged, isMedia, depth + 1);
      }

    }
    visit(data);
    return data;
  }
  JSON.parse = function (...args) { return inspect(Reflect.apply(nativeParse, this, args)); };
  const responseJSON = Response.prototype.json;
  Response.prototype.json = async function (...args) { return inspect(await Reflect.apply(responseJSON, this, args)); };
  // XHR responseType=json bypasses JSON.parse in many clients.
  const xhrResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
  if (xhrResponse?.get && xhrResponse.configurable) {
    Object.defineProperty(XMLHttpRequest.prototype, 'response', { ...xhrResponse, get() {
      const value = xhrResponse.get.call(this);
      return this.responseType === 'json' ? inspect(value) : value;
    } });
  }
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (...args) {
    const root = Reflect.apply(attachShadow, this, args);
    if (root.mode === 'open') nativeDispatch.call(this, new Event('yamato-shadow', { bubbles: true, composed: true }));
    return root;
  };
  function shouldBlock(element, value) {
    if (!enabled || busy || !element.matches(mediaSelector)) return false;
    if (element.hasAttribute('data-yamato-sensitive')) return true;
    const item = sites.closestItem(element, site);
    return blockedURLs.has(String(value)) || !!item && sites.sensitive(item, site);
  }
  function guard(element, value, name) {
    // Keep replacements when frameworks restore original sources.
    if (enabled && element.hasAttribute('data-yamato-replacement') && element.hasAttribute('data-yamato-sensitive')) {
      return element.getAttribute(name) || '';
    }
    // Hold sources until their result container is checked.
    if (enabled && !busy && site.search && element.matches(mediaSelector) &&
        !element.hasAttribute('data-yamato-replacement')) {
      // Frameworks often assign the same source again. Keep checked media in
      // place instead of navigating it through a placeholder and back.
      const held = element.getAttribute('data-yamato-held-' + name);
      if (held === String(value)) return element.getAttribute(name) || '';
      if (held === null && element.hasAttribute('data-yamato-checked') &&
          element.getAttribute(name) === String(value) && !shouldBlock(element, value)) return value;
      // Checked media keeps showing its approved source until the new one
      // passes; a placeholder would blank it and refetch from scratch.
      const shown = element.hasAttribute('data-yamato-checked') ? element.getAttribute(name) : null;
      element.removeAttribute('data-yamato-approved');
      if (shown === null) element.removeAttribute('data-yamato-checked');
      nativeSet.call(element, 'data-yamato-held-' + name, String(value));
      nativeDispatch.call(element, new Event('yamato-search-media', { bubbles: true, composed: true }));
      return shown ?? blank + '#yamato-pending';
    }
    if (!shouldBlock(element, value)) return value;
    busy = true;
    try { signal(element); } finally { busy = false; }
    return empty;
  }
  Element.prototype.setAttribute = function (name, value) {
    if (/^(src|srcset|poster|data)$/i.test(name)) value = guard(this, value, name.toLowerCase());
    return nativeSet.call(this, name, value);
  };
  for (const [proto, names] of [
    [HTMLImageElement.prototype, ['src', 'srcset']], [HTMLMediaElement.prototype, ['src']],
    [HTMLVideoElement.prototype, ['poster']], [HTMLSourceElement.prototype, ['src', 'srcset']],
    [HTMLIFrameElement.prototype, ['src']], [HTMLEmbedElement.prototype, ['src']], [HTMLObjectElement.prototype, ['data']],
  ]) {
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor?.set || !descriptor.configurable) continue;
      Object.defineProperty(proto, name, { ...descriptor, set(value) { descriptor.set.call(this, guard(this, value, name)); } });
    }
  }
})();
