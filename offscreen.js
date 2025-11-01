chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playSound') {
    const audio = new Audio(chrome.runtime.getURL('public/vergil.mp3'));
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
  return true;
});