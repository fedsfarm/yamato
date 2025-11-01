if (typeof browser === 'undefined') {
  var browser = chrome;
}

let domains = new Set();
let exceptions = new Set();
let audioContext;

(async () => {
  try {
    const response = await fetch(browser.runtime.getURL('public/block.txt'));
    const text = await response.text();
    const lines = text.trim().split('\n').filter(line => line.trim()).map(line => line.toLowerCase());
    domains = new Set(lines);
    console.log(`Loaded ${domains.size} domains from file`);
  } catch (err) {
    console.error('Failed to load block.txt:', err);
  }

  try {
    const result = await browser.storage.local.get(['customBlocks', 'customExceptions']);
    const custom = result.customBlocks || [];
    custom.forEach(domain => domains.add(domain.toLowerCase()));
    console.log(`Merged ${custom.length} custom domains`);

    const exc = result.customExceptions || [];
    exc.forEach(domain => exceptions.add(domain.toLowerCase()));
    console.log(`Merged ${exc.length} custom exceptions`);


    const tabs = await browser.tabs.query({url: '<all_urls>'});
    for (const tab of tabs) {
      if (tab.url && tab.url.startsWith('http')) {
        try {
          const urlObj = new URL(tab.url);
          const hostname = urlObj.hostname.toLowerCase();
          let isException = Array.from(exceptions).some(e => hostname === e || hostname.endsWith('.' + e));
          let isBlocked = !isException && Array.from(domains).some(d => hostname === d || hostname.endsWith('.' + d));
          if (isBlocked) {
            browser.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['run.js']
            }).catch(console.error);
          }
        } catch (err) {
          console.error('Error checking existing tab URL:', err);
        }
      }
    }
  } catch (err) {
    console.error('Startup storage error:', err);
  }

  if (chrome.offscreen) {
    try {
      const hasDoc = await chrome.offscreen.hasDocument();
      if (!hasDoc) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play Vergil motivation sound in background'
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('Offscreen document created and ready');
      } else {
        console.log('Offscreen document already exists');
      }
    } catch (e) {
      console.error('Failed to initialize offscreen document:', e);
    }
  } else {
    console.log('Offscreen API not supported (Firefox), audio will play directly in background');
  }
})();

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) {
    sendResponse({});
    return;
  }

  if (msg.action === 'isBlocked' && msg.hostname) {
    const hostname = msg.hostname.toLowerCase();
    let isException = Array.from(exceptions).some(e => hostname === e || hostname.endsWith('.' + e));
    let isBlocked = !isException && Array.from(domains).some(d => hostname === d || hostname.endsWith('.' + d));
    sendResponse({ isBlocked });
    return true;
  }

  if (msg.action === 'close-this-tab' && sender?.tab?.id) {
    browser.tabs.remove(sender.tab.id).catch(console.error);
    sendResponse({});
    return;
  }

  if (msg.action === 'getLists') {
    (async () => {
      try {
        const result = await browser.storage.local.get(['customBlocks', 'customExceptions']);
        sendResponse({
          customBlocks: result.customBlocks || [],
          customExceptions: result.customExceptions || []
        });
      } catch (e) {
        console.error('Get lists error:', e);
        sendResponse({});
      }
    })();
    return true;
  }

  if (msg.action === 'addCustomBlock' && msg.domain) {
    (async () => {
      const domain = msg.domain.trim().toLowerCase();
      let success = false;
      if (domain) {
        domains.add(domain);
        try {
          const result = await browser.storage.local.get(['customBlocks']);
          let custom = result.customBlocks || [];
          if (!custom.includes(domain)) {
            custom.push(domain);
            await browser.storage.local.set({ customBlocks: custom });
            console.log(`Added custom block: ${domain}`);
          }
          success = true;
        } catch (e) {
          console.error('Add custom block error:', e);
        }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'addException' && msg.domain) {
    (async () => {
      const domain = msg.domain.trim().toLowerCase();
      let success = false;
      if (domain) {
        exceptions.add(domain);
        try {
          const result = await browser.storage.local.get(['customExceptions']);
          let exc = result.customExceptions || [];
          if (!exc.includes(domain)) {
            exc.push(domain);
            await browser.storage.local.set({ customExceptions: exc });
            console.log(`Added exception: ${domain}`);
          }
          success = true;
        } catch (e) {
          console.error('Add exception error:', e);
        }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'removeCustomBlock' && msg.domain) {
    (async () => {
      const domain = msg.domain.trim().toLowerCase();
      let success = false;
      if (domain && domains.has(domain)) {
        domains.delete(domain);
        try {
          const result = await browser.storage.local.get(['customBlocks']);
          let custom = result.customBlocks || [];
          const index = custom.indexOf(domain);
          if (index > -1) {
            custom.splice(index, 1);
            await browser.storage.local.set({ customBlocks: custom });
            console.log(`Removed custom block: ${domain}`);
          }
          success = true;
        } catch (e) {
          console.error('Remove custom block error:', e);
        }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'removeException' && msg.domain) {
    (async () => {
      const domain = msg.domain.trim().toLowerCase();
      let success = false;
      if (domain && exceptions.has(domain)) {
        exceptions.delete(domain);
        try {
          const result = await browser.storage.local.get(['customExceptions']);
          let exc = result.customExceptions || [];
          const index = exc.indexOf(domain);
          if (index > -1) {
            exc.splice(index, 1);
            await browser.storage.local.set({ customExceptions: exc });
            console.log(`Removed exception: ${domain}`);
          }
          success = true;
        } catch (e) {
          console.error('Remove exception error:', e);
        }
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'executeRun') {
    (async () => {
      let success = false;
      try {
        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        if (tabs.length > 0) {
          const tab = tabs[0];
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['run.js']
          });
          if (msg.force) {
            await browser.tabs.sendMessage(tab.id, {action: 'forceBlock'}).catch(console.error);
          }
          success = true;
        }
      } catch (e) {
        console.error('Execute run error:', e);
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'playSoundInBackground') {
    (async () => {
      let success = false;
      try {
        if (chrome.offscreen) {
          const hasDoc = await chrome.offscreen.hasDocument();
          if (!hasDoc) {
            await chrome.offscreen.createDocument({
              url: 'offscreen.html',
              reasons: ['AUDIO_PLAYBACK'],
              justification: 'Play Vergil motivation sound in background'
            });
            // Wait a bit for the document to load
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          chrome.runtime.sendMessage({action: 'playSound'}, (response) => {
            if (response && response.started) {
              success = true;
            }
          });
        } else {
          // Firefox: Play audio directly in background script
          const audio = new Audio(browser.runtime.getURL('public/vergil.mp3'));
          const onEnded = () => {
            browser.runtime.sendMessage({action: 'soundEnded'});
            audio.removeEventListener('ended', onEnded);
          };
          audio.addEventListener('ended', onEnded);
          audio.play().then(() => {
            success = true;
            sendResponse({ success: true });
          }).catch(e => {
            console.error('Direct audio play failed:', e);
            sendResponse({ success: false });
          });
          return true;
        }
      } catch (e) {
        console.error('Sound play error:', e);
      }
      sendResponse({ success });
    })();
    return true;
  }

  if (msg.action === 'soundEnded') {
    // Optional: handle sound end if needed
    console.log('Background sound ended');
    sendResponse({});
    return true;
  }

  sendResponse({});
});

browser.commands.onCommand.addListener((command) => {
  if (command === 'execute-run') {
    browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
      if (tabs[0]) {
        browser.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['run.js']
        }).catch(console.error);
      }
    }).catch(console.error);
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab?.url?.startsWith('http')) {
    try {
      const urlObj = new URL(tab.url);
      const hostname = urlObj.hostname.toLowerCase();
      let isException = Array.from(exceptions).some(e => hostname === e || hostname.endsWith('.' + e));
      let isBlocked = !isException && Array.from(domains).some(d => hostname === d || hostname.endsWith('.' + d));
      if (isBlocked) {
        browser.scripting.executeScript({
          target: { tabId: tabId },
          files: ['run.js']
        }).catch(console.error);
      }
    } catch (err) {
      console.error('Error checking tab URL:', err);
    }
  }
});

