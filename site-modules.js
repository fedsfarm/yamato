// Site adapters; see CONTRIBUTING.md.
globalThis.yamatoSites = (() => {
  const definitions = [
    ...[
      ['google', 'Google', ['google.com', 'google.co.uk', 'google.de', 'google.fr', 'google.se', 'google.ca', 'google.com.au', 'google.co.in', 'google.co.jp'], '[data-docid], [data-lpage], .isv-r, .g, [data-ved][data-hveid]:has([role="link"]), a:has(img)'],
      ['bing', 'Bing', ['bing.com'], '.iusc, .b_algo, .imgpt, a:has(img)'],
      ['duckduckgo', 'DuckDuckGo', ['duckduckgo.com'], '.tile--img, .result, [data-testid="result"], [data-testid="image-result"], [data-testid="zci-images"] figure, .XkLPXSx75VKPFICzKfew, .ARegRZbMqxI9JfJA__kH, a:has(img)'],
      ['brave', 'Brave', ['search.brave.com'], '.snippet, .image-result, [data-type="image"], a:has(img)'],
      ['yahoo', 'Yahoo', ['search.yahoo.com'], '.res, .ld, .imgres, a:has(img)'],
      ['yandex', 'Yandex', ['yandex.com', 'yandex.ru'], '.SerpItem, .serp-item, .Organic, a:has(img)'],
    ].map(([id, name, hosts, items]) => ({
      id, name, hosts, items, search: true,
      markers: '[data-explicit="true"], [data-sensitive="true"], [aria-label="Explicit content" i]',
      warning: /^(explicit content|adult content|sensitive content)$/i,
      flagged: d => d.is_explicit === true || d.is_sensitive === true,
    })),
    { id: 'twitter', name: 'Twitter / X', hosts: ['x.com', 'twitter.com'],
      items: 'article[data-testid="tweet"], article[role="article"]',
      markers: '[data-possibly-sensitive="true"], [aria-label="Content warning" i], [data-testid="sensitiveMediaWarning"]',
      warning: /^(sensitive content|content warning|the following media includes potentially sensitive content)/i,
      flagged: d => d.possibly_sensitive === true },
    { id: 'reddit', name: 'Reddit', hosts: ['reddit.com'],
      items: 'shreddit-post, [data-testid="post-container"], .thing.link',
      markers: '[nsfw]:not([nsfw="false"]), [data-nsfw="true"], [data-over18="true"], .over18, .nsfw-stamp, [data-testid="nsfw-tag"]',
      warning: /^(nsfw|mature content)$/i,
      flagged: d => d.over_18 === true || d.over18 === true },
    { id: 'tumblr', name: 'Tumblr', hosts: ['tumblr.com'], items: 'article, [data-post-id]',
      markers: '[data-is-nsfw="true"], .post_hidden_as_adult, .content-warning',
      warning: /^(this post has been hidden|hidden from dashboard|adult content|hidden for adult content)/i,
      flagged: d => d.is_nsfw === true },
    { id: 'mastodon', name: 'Mastodon', hosts: [], items: '.status, .status__wrapper',
      detect: doc => /mastodon/i.test(doc.querySelector('meta[name="generator"]')?.content || '') ||
        !!(doc.querySelector('#mastodon, #initial-state') && doc.querySelector('.status, .app-holder')),
      markers: '.media-spoiler, .media-gallery__item--hidden, .media-scrim, .status__content__spoiler, [data-sensitive="true"]',
      warning: /^(sensitive content|sensitive media|content warning)$/i,
      flagged: d => d.sensitive === true || typeof d.spoiler_text === 'string' && d.spoiler_text.trim() !== '' },
    { id: 'discord', name: 'Discord', hosts: ['discord.com'], items: '[id^="chat-messages-"], [data-list-item-id^="chat-messages"]',
      sensitive: item => query(item, 'img, video, [class*="attachment"], [class*="spoiler"]').some(node =>
        /blur\(/.test(node.style.filter || '') || node.isConnected && /blur\(/.test(getComputedStyle(node).filter)),
      markers: '[class*="hiddenExplicit"], [class*="explicitContentWarning"], [class*="spoilerContent"][class*="hidden"]',
      warning: /^(sensitive content|explicit content|spoiler)$/i, flagged: () => false },
    { id: 'instagram', name: 'Instagram', hosts: ['instagram.com'], items: 'article, [role="dialog"]',
      markers: '[aria-label="Sensitive content" i]', warning: /^sensitive content$/i, flagged: () => false },
    { id: 'facebook', name: 'Facebook', hosts: ['facebook.com'], items: '[role="article"], [data-pagelet^="FeedUnit"]',
      markers: '[aria-label="Graphic content" i], [aria-label="Sensitive content" i]',
      warning: /^(graphic content|sensitive content|violent or graphic content)$/i,
      flagged: d => typeof d.contentWarningText === 'string' && d.contentWarningText.trim() !== '' },
    { id: 'imgur', name: 'Imgur', hosts: ['imgur.com'], items: '.post, .Gallery-Content, .image, [data-post-id]',
      markers: '[data-has-mature="true"], .mature-content', warning: /^mature content$/i,
      flagged: d => d.has_mature === true },
  ];
  function forHost(hostname) {
    return definitions.find(site => site.hosts.some(host => hostname === host || hostname.endsWith('.' + host)));
  }
  function forDocument(doc, hostname) {
    return forHost(hostname) || definitions.find(site => site.detect?.(doc)) || null;
  }
  function searchURLs(item, ownOnly = false) {
    const urls = new Set();
    function add(raw, depth = 0) {
      if (!raw || depth > 3) return;
      try {
        const url = new URL(raw, item.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        urls.add(url.href);
        for (const key of ['imgurl', 'img_url', 'imgrefurl', 'mediaurl', 'url', 'q', 'u', 'uddg']) {
          const nested = url.searchParams.get(key);
          if (nested && /^https?:\/\//i.test(nested)) add(nested, depth + 1);
        }
        const yahoo = url.pathname.match(/\/RU=([^/]+)/);
        if (yahoo) add(decodeURIComponent(yahoo[1]), depth + 1);
      } catch { /* Invalid result metadata. */ }
    }
    function metadata(value, depth = 0) {
      if (!value || typeof value !== 'object' || depth > 8) return;
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'string' && /^(murl|purl|img_href|url|image|source|original|.*_url)$/i.test(key)) add(child);
        else if (child && typeof child === 'object') metadata(child, depth + 1);
      }
    }
    for (const node of [item, ...(ownOnly ? [] : item.querySelectorAll('a[href], img, video, source, [data-lpage], [data-ou], [data-iurl], [data-bem], [m], [data-yamato-background]'))]) {
      for (const raw of backgroundURLs(node.getAttribute('data-yamato-background'))) add(raw);
      for (const name of ['href', 'src', 'poster', 'data-yamato-held-src', 'data-yamato-held-poster', 'data-lpage', 'data-ou', 'data-iurl']) add(node.getAttribute(name));
      for (const name of ['m', 'data-bem']) {
        const raw = node.getAttribute(name);
        if (raw && raw.length < 100000) try { metadata(JSON.parse(raw)); } catch { /* Not JSON. */ }
      }
    }
    return [...urls];
  }
  function backgroundURLs(value = '') {
    return [...(value || '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)]
      .map(match => match[1] ?? match[2] ?? match[3].trim());
  }
  function query(root, selector) {
    const result = [...root.querySelectorAll(selector)];
    const hosts = [root, ...(selector === '*' ? result : root.querySelectorAll('*'))];
    for (const host of hosts) if (host.shadowRoot) result.push(...query(host.shadowRoot, selector));
    return result;
  }
  function closestItem(node, site) {
    while (node) {
      const item = (site.search && node.closest?.(site.items.replace(', a:has(img)', ''))) || node.closest?.(site.items);
      if (item) return item;
      node = node.getRootNode?.().host;
    }
    return null;
  }
  function sensitive(item, site) {
    if (item.matches(site.markers) || query(item, site.markers).length) return true;
    // Restrict text matching to warning controls, never the body of a post.
    for (const node of query(item, 'button, [role="button"], [role="alert"], h1, h2, h3, [class*="warning" i]')) {
      if (site.warning.test(node.textContent.trim())) return true;
    }
    return !!site.sensitive?.(item);
  }
  function settings(value = {}) {
    const siteModules = {};
    for (const site of definitions) {
      siteModules[site.id] = value.enableSiteModules === false ? 'off' :
        ['jc', 'jce'].includes(value.siteModules?.[site.id]) ? value.siteModules[site.id] : value.siteModules?.[site.id] === 'off' ? 'off' : 'jc';
    }
    return { enableSiteModules: value.enableSiteModules !== false, mediaBlockMode: value.mediaBlockMode === 'jce' ? 'jce' : 'jc', siteModules };
  }
  return { definitions, forHost, forDocument, sensitive, settings, query, closestItem, searchURLs, backgroundURLs };
})();

// Network and DOM replacements share formats the receiving element can decode.
globalThis.yamatoJC = {
  sound: '/public/sounds/jc.ogg',
  image: '/public/assets/jc.png',
  video: '/public/assets/jc.webm',
  rules(condition, priority, firstId) {
    return [
      { types: ['image', 'sub_frame', 'object'], path: this.image },
      { types: ['media'], path: this.video },
    ].map(({ types, path }, index) => ({
      id: firstId + index, priority,
      action: { type: 'redirect', redirect: { extensionPath: path } },
      condition: { ...condition, resourceTypes: types.filter(type => condition.resourceTypes.includes(type)) },
    })).filter(rule => rule.condition.resourceTypes.length);
  },
};
