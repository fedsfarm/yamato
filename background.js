if (typeof browser === 'undefined') {
  var browser = chrome;
}

if (typeof importScripts === 'function') importScripts('site-modules.js');

// Shared by Firefox's background page and Chrome's service worker.
globalThis.createListLock = function (storage, now = Date.now) {
  const durations = [1 / 24, 1, 3, 7, 14, 30];
  const mutations = new Set([
    'addCustomBlock', 'removeCustomBlock', 'addException', 'removeException',
    'editCustomBlock', 'editException', 'importLists',
    'setEnableCustomBlocks', 'setEnableCustomExceptions',
  ]);
  const actions = new Set(['getListLock', 'prepareListLock', 'confirmListLock', 'cancelListLock']);
  let queue = Promise.resolve();

  return function route(msg, sendResponse, next) {
    if (!msg || msg.target === 'offscreen') return false;
    if (!mutations.has(msg.action) && !actions.has(msg.action)) return false;
    // Finish earlier list writes before locking; later writes must see the lock.
    queue = queue.then(async () => {
      const state = await storage.get(['listLockedUntil', 'listLockPending']);
      const lockedUntil = Number(state.listLockedUntil) || 0;
      if (msg.action === 'getListLock') return { success: true, lockedUntil };
      if (lockedUntil > now()) {
        return { success: false, lockedUntil, error: 'Custom / Exceptions are locked until ' + new Date(lockedUntil).toLocaleString() + '.' };
      }
      if (msg.action === 'prepareListLock') {
        const days = msg.days ?? 7;
        let duration;
        if (msg.durationMinutes !== undefined) {
          if (!Number.isSafeInteger(msg.durationMinutes) || msg.durationMinutes < 1 || msg.durationMinutes > 525600) {
            return { success: false, error: 'Choose a duration from 1 minute to 365 days, in whole minutes.' };
          }
          duration = msg.durationMinutes * 60000;
        } else {
          if (!durations.includes(days)) return { success: false, error: 'Choose a valid lock duration.' };
          duration = days * 86400000;
        }
        const pending = { readyAt: now() + 10000, duration, token: crypto.randomUUID() };
        await storage.set({ listLockPending: pending });
        return { success: true, ...pending };
      }
      if (msg.action === 'cancelListLock') {
        if (state.listLockPending?.token === msg.token) await storage.remove('listLockPending');
        return { success: true };
      }
      if (msg.action === 'confirmListLock') {
        const pending = state.listLockPending;
        if (!pending || pending.token !== msg.token || now() < pending.readyAt || now() > pending.readyAt + 600000) {
          return { success: false, error: 'Open the warning again and wait ten seconds before confirming.' };
        }
        const until = now() + pending.duration;
        await storage.set({ listLockedUntil: until });
        await storage.remove('listLockPending');
        return { success: true, lockedUntil: until };
      }
      return await new Promise(resolve => next(msg, resolve));
    }).then(sendResponse).catch(error => {
      console.error('List lock request failed:', error);
      sendResponse({ success: false, error: 'Could not save settings. Please try again.' });
    });
    return true;
  };
};

// Static domain rules and saved overrides.
globalThis.mediaBlocking = (() => {
  const api = typeof browser === 'undefined' ? chrome : browser;
  const resourceTypes = ['image', 'media', 'sub_frame', 'object'];
  let baseDomains = new Set();
  let customRules = [];
  let pageOnlyRules = [];
  let queue = Promise.resolve();

  function conditionFor(entry) {
    entry = normalizeDomain(entry);
    if (entry.startsWith('~')) {
      // Convert host/path regexes to full URL patterns.
      let regexFilter = '';
      let inClass = false;
      const pattern = entry.slice(1);
      for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '\\') { regexFilter += char + (pattern[++i] || ''); continue; }
        if (char === '[') inClass = true;
        if (char === ']') inClass = false;
        regexFilter += !inClass && char === '^' ? '^https?://'
          : !inClass && char === '$' ? '(?:[?#].*)?$' : char;
      }
      return { resourceTypes, regexFilter, isUrlFilterCaseSensitive: false };
    }
    const slash = entry.indexOf('/');
    const domain = slash < 0 ? entry : entry.slice(0, slash);
    const hostname = new URL('https://' + domain).hostname;
    if (slash < 0) return { resourceTypes, requestDomains: [hostname] };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      resourceTypes,
      requestDomains: [hostname],
      regexFilter: '^https?://[^/]+/' + escape(entry.slice(slash + 1)),
      isUrlFilterCaseSensitive: false,
    };
  }

  function sync(changes) {
    const update = queue.catch(() => {}).then(async () => {
      const stored = await api.storage.local.get([
        'customBlocks', 'customExceptions', 'enableCustomBlocks', 'enableCustomExceptions',
      ]);
      const next = { ...stored, ...changes };
      const rules = [];
      const pageOnly = [];
      for (const [key, enabled, priority, action] of [
        ['customBlocks', next.enableCustomBlocks !== false, 2,
          { type: 'redirect', redirect: { extensionPath: '/public/assets/jc.webm' } }],
        ['customExceptions', next.enableCustomExceptions !== false, 3, { type: 'allow' }],
      ]) {
        for (const entry of next[key] || []) {
          // Legacy JS regexes still work for navigation, even when DNR cannot use them.
          if (entry.startsWith('~')) {
            try { new RegExp(entry.slice(1)); }
            catch { throw new Error('Invalid regular expression: ' + entry); }
          }
          const condition = conditionFor(entry);
          if (condition.regexFilter) {
            const result = await api.declarativeNetRequest.isRegexSupported({
              regex: condition.regexFilter, isCaseSensitive: false,
            });
            if (!result.isSupported) {
              if (!(stored[key] || []).includes(entry)) throw new Error('This pattern is not supported for media blocking. Use a simpler regex.');
              pageOnly.push(entry);
              continue;
            }
          }
          if (!enabled) continue;
          if (action.type === 'redirect') rules.push(...yamatoJC.rules(condition, priority, rules.length + 1));
          else rules.push({ id: rules.length + 1, priority, action, condition });
        }
      }
      const previous = await api.declarativeNetRequest.getDynamicRules();
      await api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: previous.map(rule => rule.id), addRules: rules,
      });
      if (changes) {
        try { await api.storage.local.set(changes); }
        catch (error) {
          await api.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: rules.map(rule => rule.id), addRules: previous,
          });
          throw error;
        }
      }
      customRules = rules.sort((a, b) => b.priority - a.priority).map(rule => ({
        ...rule, regex: rule.condition.regexFilter ? new RegExp(rule.condition.regexFilter, 'i') : null,
      }));
      pageOnlyRules = pageOnly;
      if (changes) {
        api.tabs.query({}).then(tabs => {
          for (const tab of tabs) {
            api.tabs.sendMessage(tab.id, { action: 'mediaRulesChanged' }).catch(() => {});
          }
        }).catch(() => {});
      }
    });
    queue = update;
    return update;
  }

  const ready = (async () => {
    // Read exactly the canonical domains used by the browser's static rules.
    const resources = api.runtime.getManifest().declarative_net_request.rule_resources;
    const groups = await Promise.all(resources.filter(resource => resource.id.startsWith('blocked_media')).map(async resource => {
      const response = await fetch(api.runtime.getURL(resource.path));
      if (!response.ok) throw new Error('Failed to load media rules');
      return response.json();
    }));
    baseDomains = new Set(groups.flat().flatMap(rule => rule.condition.requestDomains));
    await sync().catch(error => console.error('Failed to synchronize custom media rules:', error));
  })();
  ready.catch(error => console.error('Media blocking initialization failed:', error));

  function blocked(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    for (const rule of customRules) {
      const { requestDomains } = rule.condition;
      if (requestDomains && !requestDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) continue;
      if (rule.regex && !rule.regex.test(url.href)) continue;
      return rule.action.type === 'redirect';
    }
    let host = url.hostname.replace(/^www\./, '');
    let bundled = false;
    while (host) {
      if (baseDomains.has(host)) { bundled = true; break; }
      const dot = host.indexOf('.');
      if (dot < 0) break;
      host = host.slice(dot + 1);
    }
    return bundled;
  }

  let settingsQueue = Promise.resolve();
  function syncSetting(moduleId, mode) {
    const update = settingsQueue.catch(() => {}).then(async () => {
      const { siteModules = {}, enableSiteModules } = await api.storage.local.get(['siteModules', 'enableSiteModules']);
      const updated = enableSiteModules === false
        ? Object.fromEntries(yamatoSites.definitions.map(site => [site.id, 'off']))
        : { ...siteModules };
      updated[moduleId] = mode;
      await api.storage.local.set({ siteModules: updated, enableSiteModules: true });
    });
    settingsQueue = update;
    return update;
  }
  function syncAllSettings(mode) {
    const update = settingsQueue.catch(() => {}).then(async () => {
      const { siteModules = {} } = await api.storage.local.get('siteModules');
      const updated = { ...siteModules };
      for (const site of yamatoSites.definitions) updated[site.id] = mode;
      await api.storage.local.set({ siteModules: updated, enableSiteModules: true });
    });
    settingsQueue = update;
    return update;
  }
  return { ready, sync, blocked, syncSetting, syncAllSettings,
    bundled: domain => baseDomains.has(domain),
    get pageOnlyRules() { return pageOnlyRules; },
  };
})();

// Redirect flagged search media per tab.
globalThis.searchMedia = (() => {
  const api = typeof browser === 'undefined' ? chrome : browser;
  const firstId = 100000;
  let queue = Promise.resolve();
  const serialize = operation => {
    const result = queue.catch(() => {}).then(operation);
    queue = result;
    return result;
  };
  const sessionRules = async () => (await api.declarativeNetRequest.getSessionRules()).filter(rule => rule.id >= firstId);
  function sync() {
    return serialize(async () => {
      const settings = yamatoSites.settings(await api.storage.local.get(['siteModules', 'enableSiteModules']));
      const rules = await sessionRules();
      await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.filter(rule => {
        const site = yamatoSites.forHost(rule.condition.initiatorDomains?.[0] || '');
        return rule.action.type !== 'redirect' || !settings.enableSiteModules || !site || settings.siteModules[site.id] === 'off';
      }).map(rule => rule.id) });
    });
  }
  function clear(tabId) {
    return serialize(async () => {
      const rules = await sessionRules();
      await api.declarativeNetRequest.updateSessionRules({
        removeRuleIds: rules.filter(rule => tabId === undefined || rule.condition.tabIds.includes(tabId)).map(rule => rule.id),
      });
    });
  }
  function block(sender, urls) {
    return serialize(async () => {
      const site = yamatoSites.forHost(new URL(sender.url).hostname);
      if (!site?.search || !(sender.tab?.id >= 0)) throw new Error('Not a search document');
      const settings = yamatoSites.settings(await api.storage.local.get(['siteModules', 'enableSiteModules']));
      if (!settings.enableSiteModules || settings.siteModules[site.id] === 'off') return;
      const rules = await sessionRules();
      const existing = new Set(rules.filter(rule => rule.condition.tabIds.includes(sender.tab.id))
        .map(rule => rule.condition.urlFilter));
      let id = Math.max(firstId - 1, ...rules.map(rule => rule.id));
      const addRules = [];
      for (const raw of new Set(urls)) {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || /[|*^]/.test(url.href)) continue;
        const urlFilter = '|' + url.href + '|';
        if (existing.has(urlFilter)) continue;
        existing.add(urlFilter);
        const added = yamatoJC.rules({urlFilter, isUrlFilterCaseSensitive: true,
          tabIds: [sender.tab.id], initiatorDomains: site.hosts,
          resourceTypes: ['image', 'media', 'sub_frame', 'object'],
        }, 10, id + 1);
        id += added.length;
        addRules.push(...added);
      }
      if (rules.length + addRules.length > 4500) throw new Error('Media redirect limit reached');
      if (addRules.length) await api.declarativeNetRequest.updateSessionRules({ addRules });
    });
  }
  api.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0) clear(details.tabId).catch(console.error);
  });
  api.tabs.onRemoved.addListener(tabId => clear(tabId).catch(console.error));
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.siteModules || changes.enableSiteModules) sync().catch(console.error);
    if (changes.customBlocks || changes.customExceptions || changes.enableCustomBlocks || changes.enableCustomExceptions) clear().catch(console.error);
  });
  sync().catch(console.error);
  return { block, sync };
})();

const modes = {
  vergil: { name: 'Vergil', backgroundImage: 'vergil.png', video: 'vergil.webm', sound: 'vergil.mp3', jceSound: 'vergil_jce.mp3', cursorImage: 'vergil.png', primaryColor: '#DDA0DD', secondaryColor: '#87CEEB', glowColor: 'rgba(221, 160, 221, 0.6)', index: 0 },
  dante: { name: 'Dante', backgroundImage: 'dante.jpg', video: 'dante.webm', sound: 'dante.mp3', jceSound: 'dante_jce.mp3', cursorImage: 'dante.jpg', primaryColor: '#FF0000', secondaryColor: '#FFA500', glowColor: 'rgba(255, 0, 0, 0.6)', index: 1 },
  nero: { name: 'Nero', backgroundImage: 'nero.jpg', video: 'nero.webm', sound: 'nero.mp3', jceSound: 'nero_jce.mp3', cursorImage: 'nero.jpg', primaryColor: '#2E8B57', secondaryColor: '#FFD700', glowColor: 'rgba(46, 139, 87, 0.6)', index: 2 },
  dante_retro: { name: 'Dante Retro', backgroundImage: 'dante_retro.jpg', video: 'dante_retro.webm', sound: 'dante_retro.mp3', jceSound: 'dante_retro_jce.mp3', cursorImage: 'dante_retro.jpg', primaryColor: '#FFD700', secondaryColor: '#FFA500', glowColor: 'rgba(255, 215, 0, 0.7)', index: 0 }
};

// Streak rank definitions
const RANKS = [
  { id: 'D',   label: 'D',   name: 'Dismal',             minDays: 0  },
  { id: 'C',   label: 'C',   name: 'Crazy',              minDays: 1  },
  { id: 'B',   label: 'B',   name: 'Badass',             minDays: 3  },
  { id: 'A',   label: 'A',   name: 'Apocalyptic',        minDays: 5  },
  { id: 'S',   label: 'S',   name: 'Savage',             minDays: 7  },
  { id: 'SS',  label: 'SS',  name: 'Sick Skills',        minDays: 14 },
  { id: 'SSS', label: 'SSS', name: 'Smoking Sexy Style', minDays: 21 },
];

function getRankForDays(days) {
  let rank = RANKS[0];
  for (const r of RANKS) { if (days >= r.minDays) rank = r; }
  return rank;
}

function getEffectiveMode(modeKey, danteRetro) {
  return (modeKey === 'dante' && danteRetro) ? 'dante_retro' : modeKey;
}

function normalizeDomain(input) {
  input = input.trim();
  // regex entries (prefixed with ~) are stored as-is, lowercased only
  if (input.startsWith('~')) return input.toLowerCase();
  input = input.toLowerCase();
  input = input.replace(/^https?:\/\//, '');
  const parts = input.split('/');
  const domain = parts[0];
  const path = parts.length > 1 ? '/' + parts.slice(1).join('/') : '';
  const normalizedDomain = domain.startsWith('www.') ? domain.substring(4) : domain;
  return normalizedDomain + path;
}

// Mirror a saved custom list into the navigation sets.
function applyList(key, previous, updated, enabled) {
  const active = key === 'customExceptions' ? exceptions : domains;
  for (const entry of previous) {
    if (active === exceptions || !mediaBlocking.bundled(entry)) active.delete(entry);
  }
  if (enabled) updated.forEach(entry => active.add(entry));
}

function isBlocked(hostname, pathname, blocks, exceptions) {
  hostname = hostname.toLowerCase();
  pathname = pathname.toLowerCase();
  // strip www. from incoming hostname so it matches stored normalized entries
  const hostNoWww = hostname.startsWith('www.') ? hostname.substring(4) : hostname;

  // Helper: does a stored entry (domain only, or domain+path) match this request?
  function entryMatches(entry, matchHost, matchPath) {
    if (entry.includes('/')) {
      const slash = entry.indexOf('/');
      const d = entry.substring(0, slash);
      const p = entry.substring(slash); // already starts with /
      // Also support regex entries (prefix ~)
      if (d === matchHost || matchHost.endsWith('.' + d)) {
        return matchPath.startsWith(p);
      }
      return false;
    } else {
      return matchHost === entry || matchHost.endsWith('.' + entry);
    }
  }

  for (const exc of exceptions) {
    if (exc.startsWith('~')) {
      // regex exception
      try { if (new RegExp(exc.substring(1)).test(hostname + pathname)) return false; } catch (_) {}
    } else if (entryMatches(exc, hostNoWww, pathname)) return false;
  }
  for (const blk of blocks) {
    if (blk.startsWith('~')) {
      // regex block
      try { if (new RegExp(blk.substring(1)).test(hostname + pathname)) return true; } catch (_) {}
    } else if (entryMatches(blk, hostNoWww, pathname)) return true;
  }
  return false;
}

let danteRetro = false;
let domains = new Set();
let exceptions = new Set();
let currentMode = 'vergil';

// JCE flood guard — true while JCE sounds are playing, blocks re-entry
let jcePlaying = false;
let creatingAudioDocument;

// Allow one sound per injected effect.
const pendingJceTabs = new Set();

// Inject once per navigation; clear after completion.
const activeBlockedTabs = new Set();

// Close tabs that navigate during an effect.
const playingTabs = new Set();

// Do not revive tabs already closing.
const closingTabs = new Set();

(async () => {
  try {
    const response = await fetch(browser.runtime.getURL('public/misc/block.txt'));
    const text = await response.text();
    const lines = text.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .map(normalizeDomain);
    domains = new Set(lines);
  } catch (err) { console.error('Failed to load block.txt:', err); }

  try {
    const result = await browser.storage.local.get(['customBlocks', 'customExceptions', 'enableCustomBlocks', 'enableCustomExceptions', 'mode', 'danteRetro']);
    const enableCustom = result.enableCustomBlocks !== false;
    const enableExc   = result.enableCustomExceptions !== false;

    (result.customBlocks || []).forEach(d => { if (enableCustom) domains.add(d.toLowerCase()); });
    (result.customExceptions || []).forEach(d => { if (enableExc) exceptions.add(d.toLowerCase()); });

    currentMode = result.mode || 'vergil';
    danteRetro  = result.danteRetro || false;

    const tabs = await browser.tabs.query({ url: '<all_urls>' });
    for (const tab of tabs) {
      if (tab.url?.startsWith('http')) {
        try {
          const url = new URL(tab.url);
          const hostname = url.hostname.toLowerCase();
          const pathname = url.pathname.toLowerCase();
          const blocked = isBlocked(hostname, pathname, domains, exceptions);
          if (blocked) browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['run.js'] }).catch(e => {
            const m = (e && e.message) || String(e);
            if (/Missing host permission|Cannot access a chrome:\/\/|Receiving end does not exist/i.test(m)) { playSound('error.mp3'); browser.runtime.sendMessage({ action: 'protectedTab' }).catch(() => {}); }
            else console.error(e);
          });
        } catch (err) { console.error(err); }
      }
    }
  } catch (err) { console.error('Startup storage error:', err); }

  if (chrome.offscreen) {
    try {
      await ensureAudioDocument();
    } catch (e) { console.error('Failed to initialize offscreen document:', e); }
  }
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const now = Date.now();
    await browser.storage.local.set({ streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false }); // Play D on first open.
    browser.tabs.create({ url: browser.runtime.getURL('pages/install.html') });
  } else if (details.reason === 'update') {
    const res = await browser.storage.local.get(['streakInstallTime']);
    if (!res.streakInstallTime) {
      await browser.storage.local.set({ streakInstallTime: Date.now(), streakSeenRank: '', streakUnlockAll: false });
    }
    browser.tabs.create({ url: browser.runtime.getURL('pages/update.html') });
  }
});

browser.runtime.setUninstallURL("https://feds.farm/bye.html");

// Share creation when several visible replacements request sound together.
async function ensureAudioDocument() {
  if (!creatingAudioDocument) {
    creatingAudioDocument = (async () => {
      if (!await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play blocking effect sounds',
        });
      }
    })().finally(() => { creatingAudioDocument = undefined; });
  }
  await creatingAudioDocument;
}

// Helper: play sound via offscreen or the Firefox background document.
async function playSound(soundFile, assetPath = 'public/sounds/' + soundFile, volume) {
  if (chrome.offscreen) {
    await ensureAudioDocument();
    return chrome.runtime.sendMessage({ action: 'playSound', target: 'offscreen', assetPath, volume });
  } else {
    if (assetPath === yamatoJC.sound.slice(1)) return yamatoJCAudio.play(browser.runtime.getURL(assetPath), volume);
    const audio = new Audio(browser.runtime.getURL(assetPath));
    await audio.play();
    return { started: true };
  }
}

// All automatic full-page effects target the reporting tab, never the active tab.
const mediaPageTabs = new Set();
async function blockMediaPage(tabId) {
  if (mediaPageTabs.has(tabId) || playingTabs.has(tabId) || closingTabs.has(tabId)) return;
  mediaPageTabs.add(tabId);
  pendingJceTabs.add(tabId);
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['run.js'] });
    const result = await browser.tabs.sendMessage(tabId, { action: 'forceBlock' }, { frameId: 0 });
    if (!result?.success) throw new Error(result?.error || 'Slice overlay did not start');
    const mode = modes[getEffectiveMode(currentMode, danteRetro)];
    playSound(mode.jceSound || mode.sound);
    playSound(mode.sound);
  } catch (error) {
    mediaPageTabs.delete(tabId);
    pendingJceTabs.delete(tabId);
    throw error;
  }
}

const routeListLock = createListLock(browser.storage.local);
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (routeListLock(msg, sendResponse, (request, respond) => handleMessage(request, sender, respond))) return true;
  return handleMessage(msg, sender, sendResponse);
});

function handleMessage(msg, sender, sendResponse) {
  if (msg?.target === 'offscreen') return;
  if (!msg?.action) { sendResponse({}); return; }

  if (msg.action === 'playJCSound') {
    if (!sender.tab) { sendResponse({ started: false }); return; }
    browser.storage.local.get('jcVolume')
      .then(({ jcVolume = 65 }) => jcVolume > 0 ? playSound(null, yamatoJC.sound.slice(1), jcVolume / 100) : { started: true })
      .then(sendResponse)
      .catch(error => {
        console.warn('JC sound failed:', error);
        sendResponse({ started: false });
      });
    return true;
  }

  if (msg.action === 'getBlockingSettings') {
    browser.storage.local.get(['siteModules', 'mediaBlockMode', 'enableSiteModules', 'jcVolume'])
      .then(value => sendResponse({ success: true, ...yamatoSites.settings(value), jcVolume: value.jcVolume ?? 65 }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (msg.action === 'setJCVolume') {
    if (!Number.isInteger(msg.volume) || msg.volume < 0 || msg.volume > 100) { sendResponse({ success: false, error: 'Invalid volume' }); return; }
    browser.storage.local.set({ jcVolume: msg.volume })
      .then(() => sendResponse({ success: true }), () => sendResponse({ success: false, error: 'Save failed' }));
    return true;
  }
  if (msg.action === 'importLists') {
    (async () => {
      try {
        const keys = ['customBlocks', 'customExceptions'];
        const valid = list => list === undefined || Array.isArray(list) && list.length <= 10000 &&
          list.every(entry => typeof entry === 'string' && entry.length <= 2048);
        if (!keys.some(key => Array.isArray(msg[key])) || !keys.every(key => valid(msg[key]))) throw new Error('This is not a Yamato lists file.');
        await mediaBlocking.ready;
        const stored = await browser.storage.local.get([...keys, 'enableCustomBlocks', 'enableCustomExceptions']);
        // Merge: imports add entries and never remove existing ones.
        const changes = {};
        let added = 0;
        for (const key of keys) {
          const updated = new Set(stored[key] || []);
          const before = updated.size;
          for (const entry of (msg[key] || []).map(normalizeDomain)) if (entry) updated.add(entry);
          added += updated.size - before;
          changes[key] = [...updated];
        }
        if (added) {
          await mediaBlocking.sync(changes);
          applyList('customBlocks', stored.customBlocks || [], changes.customBlocks, stored.enableCustomBlocks !== false);
          applyList('customExceptions', stored.customExceptions || [], changes.customExceptions, stored.enableCustomExceptions !== false);
        }
        sendResponse({ success: true, added });
      } catch (error) { sendResponse({ success: false, error: error.message || 'Could not import the lists.' }); }
    })();
    return true;
  }
  if (msg.action === 'setBlockingSetting') {
    (async () => {
      try {
        if (msg.moduleId) {
          if (!yamatoSites.definitions.some(site => site.id === msg.moduleId) || !['off', 'jc', 'jce'].includes(msg.mode)) throw new Error('Invalid site setting');
          // Serialize updates so two quick setting changes cannot overwrite one another.
          await mediaBlocking.syncSetting(msg.moduleId, msg.mode);
          await searchMedia.sync();
        } else {
          if (!['jc', 'jce'].includes(msg.mode)) throw new Error('Invalid media mode');
          await browser.storage.local.set({ mediaBlockMode: msg.mode });
        }
        sendResponse({ success: true });
      } catch (error) { sendResponse({ success: false, error: error.message }); }
    })();
    return true;
  }
  if (msg.action === 'setAllSiteModules') {
    (async () => {
      try {
        if (!['off', 'jc', 'jce'].includes(msg.mode)) throw new Error('Invalid site setting');
        await mediaBlocking.syncAllSettings(msg.mode);
        await searchMedia.sync();
        sendResponse({ success: true });
      } catch (error) { sendResponse({ success: false, error: error.message }); }
    })();
    return true;
  }
  if (msg.action === 'mediaFullPage' && sender.tab?.id >= 0) {
    (async () => {
      try {
        const settings = yamatoSites.settings(await browser.storage.local.get(['siteModules', 'mediaBlockMode', 'enableSiteModules']));
        if (msg.moduleId) {
          const site = yamatoSites.definitions.find(site => site.id === msg.moduleId);
          const host = new URL(sender.url).hostname;
          if (!settings.enableSiteModules || !site || settings.siteModules[site.id] !== 'jce' ||
              (!site.detect && yamatoSites.forHost(host)?.id !== site.id)) throw new Error('Module disabled or wrong site');
        } else {
          await mediaBlocking.ready;
          if (settings.mediaBlockMode !== 'jce' || !Array.isArray(msg.urls) ||
              !msg.urls.slice(0, 256).some(url => typeof url === 'string' && mediaBlocking.blocked(url))) throw new Error('Media not blocked');
        }
        await blockMediaPage(sender.tab.id);
        sendResponse({ success: true });
      } catch (error) { sendResponse({ success: false, error: error.message }); }
    })();
    return true;
  }

  if (msg.action === 'checkMediaURLs' && Array.isArray(msg.urls)) {
    mediaBlocking.ready.then(() => {
      sendResponse({ blocked: msg.urls.slice(0, 256).filter(url => typeof url === 'string' && mediaBlocking.blocked(url)) });
    }).catch(() => sendResponse({ error: 'Media policy unavailable' }));
    return true;
  }

  if (msg.action === 'blockSearchMedia' && Array.isArray(msg.urls) && msg.urls.length <= 256) {
    searchMedia.block(sender, msg.urls)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === 'isBlocked' && msg.hostname && msg.pathname) {
    const blocked = isBlocked(msg.hostname.toLowerCase(), msg.pathname.toLowerCase(), domains, exceptions);
    sendResponse({ isBlocked: blocked });
    return true;
  }

  if (msg.action === 'videoStarted' && sender?.tab?.id) {
    const tabId = sender.tab.id;
    if (closingTabs.has(tabId)) {
      // Ignore late messages from closing tabs.
      sendResponse({ success: false });
      return true;
    }
    playingTabs.add(tabId);
    sendResponse({ success: true });
    return true;
  }

  if (msg.action === 'close-this-tab' && sender?.tab?.id) {
    playingTabs.delete(sender.tab.id);
    browser.tabs.remove(sender.tab.id).catch(console.error);
    sendResponse({});
    return;
  }

  if (msg.action === 'getLists') {
    (async () => {
      try {
        await mediaBlocking.ready;
        const result = await browser.storage.local.get(['customBlocks', 'customExceptions', 'totalBlockCount']);
        sendResponse({ 
          customBlocks: result.customBlocks || [], 
          customExceptions: result.customExceptions || [],
          pageOnlyRules: mediaBlocking.pageOnlyRules,
          totalBlockCount: result.totalBlockCount || 0
        });
      } catch (e) { sendResponse({}); }
    })();
    return true;
  }

  const listOperation = {
    addCustomBlock: 'add', removeCustomBlock: 'remove', editCustomBlock: 'edit',
    addException: 'add', removeException: 'remove', editException: 'edit',
  }[msg.action];
  if (listOperation) {
    (async () => {
      try {
        await mediaBlocking.ready;
        if (typeof msg.domain !== 'string') throw new Error('Enter a domain or regex.');
        const domain = normalizeDomain(msg.domain);
        if (!domain) throw new Error('Enter a domain or regex.');
        const isException = msg.action.endsWith('Exception');
        const key = isException ? 'customExceptions' : 'customBlocks';
        const enabledKey = isException ? 'enableCustomExceptions' : 'enableCustomBlocks';
        const stored = await browser.storage.local.get([key, enabledKey]);
        const previous = stored[key] || [];
        const updated = [...previous];
        const index = updated.indexOf(domain);
        if (listOperation === 'edit') {
          if (index < 0) throw new Error('This entry changed. Reopen the list and try again.');
          if (typeof msg.newDomain !== 'string') throw new Error('Enter a replacement domain or regex.');
          const replacement = normalizeDomain(msg.newDomain);
          if (!replacement) throw new Error('Enter a replacement domain or regex.');
          if (replacement !== domain && updated.includes(replacement)) throw new Error('That entry already exists.');
          updated[index] = replacement;
        } else if (listOperation === 'add' && index < 0) updated.push(domain);
        else if (listOperation === 'remove' && index >= 0) updated.splice(index, 1);

        // Validate and commit the complete list before changing navigation state.
        // sync restores the previous network rules if saving storage fails.
        await mediaBlocking.sync({ [key]: updated });
        applyList(key, previous, updated, stored[enabledKey] !== false);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Could not save the list. Please try again.' });
      }
    })();
    return true;
  }

  if (msg.action === 'executeRun') {
    (async () => {
      let success = false;
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          const tab = tabs[0];
          if (msg.fromPopup) pendingJceTabs.add(tab.id);
          await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['run.js'] });
          if (msg.force) {
            // The injected script may not be listening yet.
            await browser.tabs.sendMessage(tab.id, { action: 'forceBlock' }).catch(() => {});
          }
          // Play both sounds once per popup JCE.
          if (msg.fromPopup && !jcePlaying) {
            jcePlaying = true;
            const effectiveMode = getEffectiveMode(currentMode, danteRetro);
            const m = modes[effectiveMode];
            playSound(m.jceSound || m.sound);
            playSound(m.sound);
            // Reset flag after a safe window (longest jce sound is ~4s)
            setTimeout(() => { jcePlaying = false; }, 4000);
          }
          success = true;
        }
      } catch (e) {
        // Protected tabs get an error sound.
        const msg = (e && e.message) || String(e);
        const isPermission = /Missing host permission|Cannot access a chrome:\/\/|Could not establish connection|Receiving end does not exist/i.test(msg);
        if (isPermission) {
          console.warn('Tab is protected, playing error sound:', msg);
          playSound('error.mp3');
          browser.runtime.sendMessage({ action: 'protectedTab' }).catch(() => {});
        } else {
          console.error('Execute run error:', e);
        }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'getMode') {
    sendResponse({ mode: currentMode, danteRetro });
    return true;
  }

  if (msg.action === 'getModes') {
    sendResponse({ modes });
    return true;
  }

  if (msg.action === 'setMode' && msg.mode) {
    currentMode = msg.mode;
    (async () => {
      try { await browser.storage.local.set({ mode: currentMode }); sendResponse({ success: true }); }
      catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  if (msg.action === 'setDanteRetro' && typeof msg.danteRetro === 'boolean') {
    danteRetro = msg.danteRetro;
    (async () => {
      try { await browser.storage.local.set({ danteRetro }); sendResponse({ success: true }); }
      catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  if (msg.action === 'getEnableStates') {
    (async () => {
      try {
        const result = await browser.storage.local.get(['enableCustomBlocks', 'enableCustomExceptions']);
        sendResponse({ enableCustomBlocks: result.enableCustomBlocks !== false, enableCustomExceptions: result.enableCustomExceptions !== false });
      } catch (e) { sendResponse({ enableCustomBlocks: true, enableCustomExceptions: true }); }
    })();
    return true;
  }

  if (msg.action === 'setEnableCustomBlocks' && typeof msg.enabled === 'boolean') {
    (async () => {
      try {
        await mediaBlocking.sync({ enableCustomBlocks: msg.enabled });
        const { customBlocks = [] } = await browser.storage.local.get(['customBlocks']);
        if (msg.enabled) {
          customBlocks.forEach(d => domains.add(d.toLowerCase()));
          const tabs = await browser.tabs.query({ url: '<all_urls>' });
          for (const tab of tabs) {
            if (tab.url?.startsWith('http')) {
              try {
                const hostname = new URL(tab.url).hostname.toLowerCase();
                const isExc = Array.from(exceptions).some(e => hostname === e || hostname.endsWith('.' + e));
                const isBlocked = !isExc && Array.from(domains).some(d => hostname === d || hostname.endsWith('.' + d));
                if (isBlocked) browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['run.js'] }).catch(console.error);
              } catch (err) {}
            }
          }
        } else {
          customBlocks.forEach(d => domains.delete(d.toLowerCase()));
        }
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  if (msg.action === 'setEnableCustomExceptions' && typeof msg.enabled === 'boolean') {
    (async () => {
      try {
        await mediaBlocking.sync({ enableCustomExceptions: msg.enabled });
        const { customExceptions = [] } = await browser.storage.local.get(['customExceptions']);
        if (msg.enabled) { customExceptions.forEach(d => exceptions.add(d.toLowerCase())); }
        else { customExceptions.forEach(d => exceptions.delete(d.toLowerCase())); }
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  // Streak

  if (msg.action === 'getStreak') {
    (async () => {
      try {
        let res = await browser.storage.local.get(['streakInstallTime', 'streakSeenRank', 'streakUnlockAll', 'streakLongestStreak', 'streakUnlockedModes']);
        if (!res.streakInstallTime) {
          const now = Date.now();
          await browser.storage.local.set({ streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false, streakLongestStreak: 0 });
          res = { streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false, streakLongestStreak: 0 };
        }
        const days = Math.floor((Date.now() - res.streakInstallTime) / 86400000);
        const currentRank = getRankForDays(days);
        const seenRank = res.streakSeenRank ?? '';
        const unlockAll = res.streakUnlockAll || false;
        const longestStreak = Math.max(days, res.streakLongestStreak || 0);
        const isNewRank = currentRank.id !== seenRank;
        const unlockedModes = res.streakUnlockedModes || [];
        sendResponse({ days, currentRank, seenRank, isNewRank, unlockAll, longestStreak, ranks: RANKS, unlockedModes });
      } catch (e) {
        sendResponse({ days: 0, currentRank: RANKS[0], seenRank: '', isNewRank: true, unlockAll: false, longestStreak: 0, ranks: RANKS });
      }
    })();
    return true;
  }

  if (msg.action === 'markStreakSeen') {
    (async () => {
      try {
        const { streakInstallTime } = await browser.storage.local.get(['streakInstallTime']);
        const days = Math.floor((Date.now() - (streakInstallTime || Date.now())) / 86400000);
        const currentRank = getRankForDays(days);
        await browser.storage.local.set({ streakSeenRank: currentRank.id });
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  if (msg.action === 'setUnlockAll') {
    (async () => {
      try { await browser.storage.local.set({ streakUnlockAll: true }); sendResponse({ success: true }); }
      catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  if (msg.action === 'resetStreak') {
    (async () => {
      try {
        const res = await browser.storage.local.get(['streakInstallTime', 'streakLongestStreak', 'streakUnlockAll', 'streakUnlockedModes']);
        const currentDays = Math.floor((Date.now() - (res.streakInstallTime || Date.now())) / 86400000);
        const longest = Math.max(currentDays, res.streakLongestStreak || 0);

        // Ratchet — collect all modes unlocked before the reset and preserve them.
        const RATCHET_RANK_ORDER = ['D','C','B','A','S','SS','SSS'];
        const RATCHET_MODE_UNLOCK = { vergil: null, dante: 'S', nero: 'SS', dante_retro: 'SSS' };
        const ratchetRankIdx = id => RATCHET_RANK_ORDER.indexOf(id);
        const prevRank = getRankForDays(currentDays);
        const prevUnlocked = new Set(res.streakUnlockedModes || []);
        if (res.streakUnlockAll) {
          Object.keys(RATCHET_MODE_UNLOCK).forEach(k => prevUnlocked.add(k));
        } else {
          Object.entries(RATCHET_MODE_UNLOCK).forEach(([k, req]) => {
            if (!req || ratchetRankIdx(prevRank.id) >= ratchetRankIdx(req)) prevUnlocked.add(k);
          });
        }

        await browser.storage.local.set({
          streakInstallTime: Date.now(),
          streakSeenRank: '', // Replay D after reset.
          streakUnlockAll: res.streakUnlockAll || false,
          streakLastReset: Date.now(),
          streakLongestStreak: longest,
          streakUnlockedModes: Array.from(prevUnlocked),
        });
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  // Audio

  if (msg.action === 'playSoundInBackground') {
    (async () => {
      const tabId = sender?.tab?.id;
      if (tabId && pendingJceTabs.has(tabId)) {
        pendingJceTabs.delete(tabId);
        sendResponse({ success: true, skipped: true });
        return;
      }

      try {
        const effectiveMode = getEffectiveMode(currentMode, danteRetro);
        const soundFile = modes[effectiveMode].sound;
        const result = await playSound(soundFile);
        sendResponse({ success: !!result?.started });
      } catch (e) {
        console.error('Sound play error:', e);
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  if (msg.action === 'soundEnded') {
    sendResponse({});
    return true;
  }

  sendResponse({});
}

browser.commands.onCommand.addListener((command) => {
  if (command === 'execute-run') {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['run.js'] })
          .then(() => browser.tabs.sendMessage(tabs[0].id, { action: 'forceBlock' }).catch(() => {}))
          .catch(console.error);
      }
    }).catch(console.error);
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Keep the injection guard through redirects.
  if (changeInfo.status === 'loading') {
    // The navigation listener handles playing tabs.
    if (playingTabs.has(tabId)) return;
    if (closingTabs.has(tabId)) return;
    if (activeBlockedTabs.has(tabId)) return;

    const rawUrl = changeInfo.url || tab?.url;
    if (!rawUrl?.startsWith('http')) return;

    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.toLowerCase();
      const pathname = url.pathname.toLowerCase();
      const blocked = isBlocked(hostname, pathname, domains, exceptions);
      if (blocked) {
        activeBlockedTabs.add(tabId);
        // Count once per blocked navigation.
        browser.storage.local.get(['totalBlockCount']).then(result => {
          const count = (result.totalBlockCount || 0) + 1;
          browser.storage.local.set({ totalBlockCount: count }).then(() => {
            browser.runtime.sendMessage({ action: 'blockCountUpdated' }).catch(() => {});
          });
        });
        browser.scripting.executeScript({ target: { tabId }, files: ['run.js'] }).catch(e => {
          const m = (e && e.message) || String(e);
          if (/Missing host permission|Cannot access a chrome:\/\/|Receiving end does not exist/i.test(m)) { playSound('error.mp3'); browser.runtime.sendMessage({ action: 'protectedTab' }).catch(() => {}); }
          else console.error(e);
        });
      }
    } catch (err) { console.error(err); }
  }

  // Allow the next navigation after completion.
  if (changeInfo.status === 'complete') {
    activeBlockedTabs.delete(tabId);
  }
});

// Also clear if the tab is closed, to avoid a stale entry in the set.
browser.tabs.onRemoved.addListener((tabId) => {
  activeBlockedTabs.delete(tabId);
  mediaPageTabs.delete(tabId);
  pendingJceTabs.delete(tabId);
  playingTabs.delete(tabId);
  closingTabs.delete(tabId);
});
// Firefox cancels navigation; Chrome closes the tab.

const isFirefox = typeof browser !== 'undefined' &&
  browser.runtime.getURL('').startsWith('moz-extension://');

if (isFirefox && browser.webRequest?.onBeforeRequest) {
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.type !== 'main_frame' || details.tabId < 0) return;
      if (playingTabs.has(details.tabId)) {
        return { cancel: true };
      }
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['blocking']
  );
} else if (browser.webNavigation?.onBeforeNavigate) {
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0 || details.tabId < 0) return;
    if (playingTabs.has(details.tabId)) {
      playingTabs.delete(details.tabId);
      closingTabs.add(details.tabId);
      browser.tabs.remove(details.tabId).catch(() => {});
    }
  });
}

// Network rules still stop the original request in either effect mode.
browser.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  mediaBlocking.ready.then(async () => {
    if (!mediaBlocking.blocked(details.url)) return;
    const { mediaBlockMode } = await browser.storage.local.get('mediaBlockMode');
    if (mediaBlockMode === 'jce') await blockMediaPage(details.tabId);
  }).catch(error => console.warn('Yamato media page block failed:', error));
}, { urls: ['http://*/*', 'https://*/*'], types: ['image', 'media', 'sub_frame', 'object'] });
