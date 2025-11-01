if (typeof browser === 'undefined') {
  var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
  function playClickSound() {
    const sound = new Audio(browser.runtime.getURL('public/click.mp3'));
    sound.play().catch(e => console.log('Sound play failed:', e));
  }
  const clickSound2 = new Audio(browser.runtime.getURL('public/schum.mp3'));
  const addBtn = document.getElementById('addBtn');
  const customUrl = document.getElementById('customUrl');
  const addExcBtn = document.getElementById('addExcBtn');
  const exceptionUrl = document.getElementById('exceptionUrl');
  const executeBtn = document.getElementById('executeBtn');
  const customList = document.getElementById('customList');
  const exceptionsList = document.getElementById('exceptionsList');

  function loadLists() {
    browser.runtime.sendMessage({ action: 'getLists' }, (response) => {
      if (response) {
        customList.innerHTML = '';
        (response.customBlocks || []).forEach(domain => {
          const li = document.createElement('li');
          const textSpan = document.createElement('span');
          textSpan.textContent = domain;
          const removeBtn = document.createElement('span');
          removeBtn.textContent = 'X';
          removeBtn.className = 'remove-btn';
          removeBtn.onclick = () => {
            playClickSound();
            removeCustomBlock(domain);
          };
          li.appendChild(textSpan);
          li.appendChild(removeBtn);
          customList.appendChild(li);
        });

        exceptionsList.innerHTML = '';
        (response.customExceptions || []).forEach(domain => {
          const li = document.createElement('li');
          const textSpan = document.createElement('span');
          textSpan.textContent = domain;
          const removeBtn = document.createElement('span');
          removeBtn.textContent = 'X';
          removeBtn.className = 'remove-btn';
          removeBtn.onclick = () => {
            playClickSound();
            removeException(domain);
          };
          li.appendChild(textSpan);
          li.appendChild(removeBtn);
          exceptionsList.appendChild(li);
        });
      }
    });
  }

  function removeCustomBlock(domain) {
    browser.runtime.sendMessage({ action: 'removeCustomBlock', domain: domain }, (response) => {
      if (response && response.success) {
        loadLists();
      }
    });
  }

  function removeException(domain) {
    browser.runtime.sendMessage({ action: 'removeException', domain: domain }, (response) => {
      if (response && response.success) {
        loadLists();
      }
    });
  }

  addBtn.addEventListener('click', () => {
    playClickSound();
    const domain = customUrl.value.trim().toLowerCase();
    if (domain) {
      browser.runtime.sendMessage({ action: 'addCustomBlock', domain: domain }, (response) => {
        if (response && response.success) {
          customUrl.value = '';
          loadLists();
        }
      });
    }
  });

  addExcBtn.addEventListener('click', () => {
    playClickSound();
    const domain = exceptionUrl.value.trim().toLowerCase();
    if (domain) {
      browser.runtime.sendMessage({ action: 'addException', domain: domain }, (response) => {
        if (response && response.success) {
          exceptionUrl.value = '';
          loadLists();
        }
      });
    }
  });

  loadLists();

  customUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addBtn.click();
    }
  });

  exceptionUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addExcBtn.click();
    }
  });

  executeBtn.addEventListener('click', () => {
    clickSound2.play().catch(e => console.log('Sound play failed:', e));
    browser.runtime.sendMessage({ action: 'executeRun', force: true }, (response) => {
      if (response && response.success) {
        console.log('Executed run.js on current tab');
      }
    });
  });
});