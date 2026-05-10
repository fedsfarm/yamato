document.addEventListener('DOMContentLoaded', () => {
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
        window.open('https://github.com/zeroarchroot/yamato', '_blank');
      }
      else if (button.textContent === 'Credits') {
        window.open('https://github.com/zeroarchroot/yamato#credits', '_blank');
      }
    });
  });
});