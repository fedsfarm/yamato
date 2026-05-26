if (typeof browser === 'undefined') {
  var browser = chrome;
}

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
  // FIX 4: regex entries (prefixed with ~) are stored as-is, lowercased only
  if (input.startsWith('~')) return input.toLowerCase();
  input = input.toLowerCase();
  input = input.replace(/^https?:\/\//, '');
  const parts = input.split('/');
  const domain = parts[0];
  const path = parts.length > 1 ? '/' + parts.slice(1).join('/') : '';
  const normalizedDomain = domain.startsWith('www.') ? domain.substring(4) : domain;
  return normalizedDomain + path;
}

function isBlocked(hostname, pathname, blocks, exceptions) {
  hostname = hostname.toLowerCase();
  pathname = pathname.toLowerCase();
  // FIX 3: strip www. from incoming hostname so it matches stored normalized entries
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
      // FIX 4: regex exception
      try { if (new RegExp(exc.substring(1)).test(hostname + pathname)) return false; } catch (_) {}
    } else if (entryMatches(exc, hostNoWww, pathname)) return false;
  }
  for (const blk of blocks) {
    if (blk.startsWith('~')) {
      // FIX 4: regex block
      try { if (new RegExp(blk.substring(1)).test(hostname + pathname)) return true; } catch (_) {}
    } else if (entryMatches(blk, hostNoWww, pathname)) return true;
  }
  return false;
}

let danteRetro = false;
let domains = new Set();
let exceptions = new Set();
let currentMode = 'vergil';

// FIX 3: JCE flood guard — true while JCE sounds are playing, blocks re-entry
let jcePlaying = false;

// Double-sound guard: tracks tabs where run.js is being injected by us
// so that when run.js calls playSoundInBackground, we let it through once.
// For JCE (fromPopup), we directly play jceSound and tell run.js not to re-play.
const pendingJceTabs = new Set();

// Redirect guard: tracks tabs that have already had run.js injected for the
// current navigation. onUpdated fires 'loading' for every hop in a redirect
// chain, so without this we'd inject (and play sound) once per redirect.
// Cleared when the tab reaches 'complete' or is removed.
const activeBlockedTabs = new Set();

// Tracks tabs where the block overlay/video is currently active.
// Any navigation attempt on these tabs should be cancelled and the tab closed.
const playingTabs = new Set();

// Tracks tabs that have been sentenced to close (Chrome MV3 only).
// Prevents run.js re-injecting on the redirected page from resurrecting the tab.
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
      const hasDoc = await chrome.offscreen.hasDocument();
      if (!hasDoc) {
        await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play Vergil motivation sound in background' });
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { console.error('Failed to initialize offscreen document:', e); }
  }
})();

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const now = Date.now();
    await browser.storage.local.set({ streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false }); // FIX 2: empty sentinel so D.webm plays on first open
    browser.tabs.create({ url: browser.runtime.getURL('pages/install.html') });
  } else if (details.reason === 'update') {
    const res = await browser.storage.local.get(['streakInstallTime']);
    if (!res.streakInstallTime) {
      await browser.storage.local.set({ streakInstallTime: Date.now(), streakSeenRank: '', streakUnlockAll: false }); // FIX 2
    }
    browser.tabs.create({ url: browser.runtime.getURL('pages/update.html') });
  }
});

browser.runtime.setUninstallURL("https://feds.farm/bye.html");

// Helper: play sound via offscreen or direct
async function playSound(soundFile) {
  if (chrome.offscreen) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play sound' });
      await new Promise(r => setTimeout(r, 500));
    }
    chrome.runtime.sendMessage({ action: 'playSound', sound: soundFile });
  } else {
    const audio = new Audio(browser.runtime.getURL('public/sounds/' + soundFile));
    audio.play().catch(console.error);
  }
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.action) { sendResponse({}); return; }

  if (msg.action === 'isBlocked' && msg.hostname && msg.pathname) {
    const blocked = isBlocked(msg.hostname.toLowerCase(), msg.pathname.toLowerCase(), domains, exceptions);
    sendResponse({ isBlocked: blocked });
    return true;
  }

  if (msg.action === 'videoStarted' && sender?.tab?.id) {
    const tabId = sender.tab.id;
    if (closingTabs.has(tabId)) {
      // Chrome MV3: the tab navigated, re-injected, but we already called
      // tabs.remove on it. Don't resurect it in playingTabs.
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
        const result = await browser.storage.local.get(['customBlocks', 'customExceptions', 'totalBlockCount']);
        sendResponse({ 
          customBlocks: result.customBlocks || [], 
          customExceptions: result.customExceptions || [],
          totalBlockCount: result.totalBlockCount || 0
        });
      } catch (e) { sendResponse({}); }
    })();
    return true;
  }

  if (msg.action === 'addCustomBlock' && msg.domain) {
    (async () => {
      const domain = normalizeDomain(msg.domain);
      let success = false;
      if (domain) {
        try {
          const result = await browser.storage.local.get(['customBlocks', 'enableCustomBlocks']);
          const customBlocks = result.customBlocks || [];
          const enableCustomBlocks = result.enableCustomBlocks !== false;
          
          if (!customBlocks.includes(domain)) {
            customBlocks.push(domain);
            await browser.storage.local.set({ customBlocks });
            if (enableCustomBlocks) domains.add(domain);
            success = true;
          } else {
            success = true; // Already exists, still success
          }
        } catch (e) { console.error(e); }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'addException' && msg.domain) {
    (async () => {
      const domain = normalizeDomain(msg.domain);
      let success = false;
      if (domain) {
        try {
          const result = await browser.storage.local.get(['customExceptions', 'enableCustomExceptions']);
          const customExceptions = result.customExceptions || [];
          const enableCustomExceptions = result.enableCustomExceptions !== false;
          
          if (!customExceptions.includes(domain)) {
            customExceptions.push(domain);
            await browser.storage.local.set({ customExceptions });
            if (enableCustomExceptions) exceptions.add(domain);
            success = true;
          } else {
            success = true;
          }
        } catch (e) { console.error(e); }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'removeCustomBlock' && msg.domain) {
    (async () => {
      const domain = normalizeDomain(msg.domain);
      let success = false;
      domains.delete(domain);
      try {
        const result = await browser.storage.local.get(['customBlocks']);
        const customBlocks = result.customBlocks || [];
        const idx = customBlocks.indexOf(domain);
        if (idx > -1) {
          customBlocks.splice(idx, 1);
          await browser.storage.local.set({ customBlocks });
        }
        success = true;
      } catch (e) { console.error(e); }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'removeException' && msg.domain) {
    (async () => {
      const domain = normalizeDomain(msg.domain);
      let success = false;
      exceptions.delete(domain);
      try {
        const result = await browser.storage.local.get(['customExceptions']);
        const customExceptions = result.customExceptions || [];
        const idx = customExceptions.indexOf(domain);
        if (idx > -1) {
          customExceptions.splice(idx, 1);
          await browser.storage.local.set({ customExceptions });
        }
        success = true;
      } catch (e) { console.error(e); }
      sendResponse({ success });
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
            // FIX 3: swallow "Receiving end does not exist" — run.js may not be ready yet;
            // forceBlock is best-effort since run.js also listens for it on its own load.
            await browser.tabs.sendMessage(tab.id, { action: 'forceBlock' }).catch(() => {});
          }
          // FIX 5+3: For JCE from popup — play both jceSound AND the regular sound simultaneously,
          // but only if not already playing (flood guard).
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
        // FIX 6: Protected/privileged tabs (chrome://, about:, extensions, etc.) throw
        // permission errors. Play error.mp3 and swallow the error gracefully.
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
        await browser.storage.local.set({ enableCustomBlocks: msg.enabled });
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
        await browser.storage.local.set({ enableCustomExceptions: msg.enabled });
        const { customExceptions = [] } = await browser.storage.local.get(['customExceptions']);
        if (msg.enabled) { customExceptions.forEach(d => exceptions.add(d.toLowerCase())); }
        else { customExceptions.forEach(d => exceptions.delete(d.toLowerCase())); }
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false }); }
    })();
    return true;
  }

  // ── Streak ────────────────────────────────────────────────────────────────

  if (msg.action === 'getStreak') {
    (async () => {
      try {
        let res = await browser.storage.local.get(['streakInstallTime', 'streakSeenRank', 'streakUnlockAll', 'streakLongestStreak', 'streakUnlockedModes']);
        if (!res.streakInstallTime) {
          const now = Date.now();
          await browser.storage.local.set({ streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false, streakLongestStreak: 0 }); // FIX 2
          res = { streakInstallTime: now, streakSeenRank: '', streakUnlockAll: false, streakLongestStreak: 0 };
        }
        const days = Math.floor((Date.now() - res.streakInstallTime) / 86400000);
        const currentRank = getRankForDays(days);
        const seenRank = res.streakSeenRank ?? ''; // FIX 2: ?? not || so empty string isn't overridden
        const unlockAll = res.streakUnlockAll || false;
        const longestStreak = Math.max(days, res.streakLongestStreak || 0);
        const isNewRank = currentRank.id !== seenRank;
        const unlockedModes = res.streakUnlockedModes || [];
        sendResponse({ days, currentRank, seenRank, isNewRank, unlockAll, longestStreak, ranks: RANKS, unlockedModes });
      } catch (e) {
        sendResponse({ days: 0, currentRank: RANKS[0], seenRank: '', isNewRank: true, unlockAll: false, longestStreak: 0, ranks: RANKS }); // FIX 2
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

        // FIX 2: Ratchet — collect all modes unlocked before the reset and preserve them.
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
          streakSeenRank: '', // FIX 2: empty sentinel so D.webm plays after reset
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

  // ── Audio ─────────────────────────────────────────────────────────────────

  if (msg.action === 'playSoundInBackground') {
    (async () => {
      const tabId = sender?.tab?.id;
      if (tabId && pendingJceTabs.has(tabId)) {
        pendingJceTabs.delete(tabId);
        sendResponse({ success: true, skipped: true });
        return;
      }

      let success = false;
      try {
        const effectiveMode = getEffectiveMode(currentMode, danteRetro);
        const soundFile = modes[effectiveMode].sound;
        if (chrome.offscreen) {
          const hasDoc = await chrome.offscreen.hasDocument();
          if (!hasDoc) {
            await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play motivation sound' });
            await new Promise(r => setTimeout(r, 500));
          }
          chrome.runtime.sendMessage({ action: 'playSound', sound: soundFile }, res => { if (res?.started) success = true; });
        } else {
          const audio = new Audio(browser.runtime.getURL('public/sounds/' + soundFile));
          audio.play().then(() => { success = true; sendResponse({ success: true }); }).catch(e => { sendResponse({ success: false }); });
          return true;
        }
      } catch (e) { console.error('Sound play error:', e); }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'soundEnded') {
    sendResponse({});
    return true;
  }

  sendResponse({});
});

browser.commands.onCommand.addListener((command) => {
  if (command === 'execute-run') {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['run.js'] })
          .then(() => browser.tabs.sendMessage(tabs[0].id, { action: 'forceBlock' }).catch(() => {})) // FIX 3
          .catch(console.error);
      }
    }).catch(console.error);
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only inject once per navigation. We intentionally do NOT reset the guard
  // on changeInfo.url so that redirect chains don't trigger multiple injections
  // (and multiple count increments). The guard is cleared on 'complete' or tab removal.
  if (changeInfo.status === 'loading') {
    // If the video is playing in this tab, the webRequest listener handles it.
    // Don't attempt re-injection; the tab is being closed.
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
        // Single source of truth for the block count — incremented here,
        // removed from run.js, so redirects and double-injection can't stack it.
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

  // Clear the guard once the tab finishes loading (committed to final URL),
  // so the next navigation into this tab starts clean.
  if (changeInfo.status === 'complete') {
    activeBlockedTabs.delete(tabId);
  }
});

// Also clear if the tab is closed, to avoid a stale entry in the set.
browser.tabs.onRemoved.addListener((tabId) => {
  activeBlockedTabs.delete(tabId);
  pendingJceTabs.delete(tabId);
  playingTabs.delete(tabId);
  closingTabs.delete(tabId);
});
// Intercept navigations on tabs where the video overlay is active.
//
// Strategy differs by browser:
//
//   Firefox (MV2) — webRequest with 'blocking' can cancel the navigation
//                   outright, keeping the document alive so the video plays
//                   to completion. The video's own 'ended' handler closes
//                   the tab when done.
//
//   Chrome (MV3)  — webRequestBlocking is not permitted for non-enterprise
//                   extensions. We use webNavigation.onBeforeNavigate which
//                   fires at the earliest possible moment, then close the tab.
//                   The video is cut short but the redirect loop is broken.

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