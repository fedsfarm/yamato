// Shared audio player for Chrome offscreen and Firefox background.
globalThis.yamatoJCAudio = (() => {
  const voices = new Set();
  const limit = 8;
  let level = 0.65;
  function balance() {
    // Never raise an existing voice as others end: that creates volume pumping.
    const volume = level / Math.max(1, voices.size);
    for (const voice of voices) voice.audio.volume = Math.min(voice.audio.volume, volume);
  }
  async function play(url, volume = 0.65) {
    level = volume;
    if (voices.size >= limit) voices.values().next().value.stop();
    const audio = new Audio(url);
    const voice = { audio, stop() {
      voices.delete(voice);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } };
    voices.add(voice);
    balance();
    audio.addEventListener('ended', voice.stop, { once: true });
    audio.addEventListener('error', voice.stop, { once: true });
    try {
      await audio.play();
      return { started: true };
    } catch (error) {
      // A newer cut may have retired this voice while play() was pending.
      if (!voices.has(voice)) return { started: true, superseded: true };
      voice.stop();
      throw error;
    }
  }
  return { play };
})();

// Register the message bridge only in the offscreen document.
if (globalThis.location?.pathname === '/offscreen.html') {
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen' && message.action === 'playSound' && !sender.tab) {
    if (message.assetPath === 'public/sounds/jc.ogg') {
      yamatoJCAudio.play(chrome.runtime.getURL(message.assetPath), message.volume).then(sendResponse, () => sendResponse({started: false}));
      return true;
    }
    const audio = new Audio(chrome.runtime.getURL(message.assetPath));
    const onEnded = () => {
      chrome.runtime.sendMessage({action: 'soundEnded'});
      audio.removeEventListener('ended', onEnded);
    };
    audio.addEventListener('ended', onEnded);
    audio.play().then(() => {
      sendResponse({started: true});
    }).catch(e => {
      console.error('Audio play failed:', e);
      sendResponse({started: false});
    });
    return true;
  }
});
}
