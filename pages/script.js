document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('pre').forEach(pre => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-command';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code').textContent);
        button.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre.querySelector('code'));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = 'Press Ctrl/Cmd+C';
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 2500);
    });
    pre.append(button);
  });
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      if (button.textContent === 'Understood') {
        window.close();
      } else if (button.textContent === 'Donate') {
        window.open('https://feds.farm/#donate', '_blank');
      } else if (button.textContent === 'Matrix chat') {
        window.open('https://escape.feds.farm#main:feds.farm', '_blank');
      }
      else if (button.textContent === 'Rate') {
        window.open('https://addons.mozilla.org/en-US/firefox/addon/yamato-blocker/', '_blank');
      }
      else if (button.textContent === 'Source code') {
        window.open('https://github.com/fedsfarm/yamato', '_blank');
      }
      else if (button.textContent === 'Credits') {
        window.open('https://github.com/fedsfarm/yamato#credits', '_blank');
      }
    });
  });
});
