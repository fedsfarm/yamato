const api = typeof browser === 'undefined' ? chrome : browser;
const status = document.getElementById('status');
const allSites = document.getElementById('allSites');
const mediaMode = document.getElementById('mediaMode');
const volume = document.getElementById('volume');
const volumeValue = document.getElementById('volumeValue');
const importFile = document.getElementById('importFile');

async function send(message) {
  const result = await api.runtime.sendMessage(message);
  if (!result?.success) throw new Error(result?.error || 'Save failed');
  return result;
}

function fill(select, values) {
  for (const value of values) select.add(new Option(value === 'off' ? 'Off' : value.toUpperCase(), value));
}

// Saves on change and restores the last saved value if saving fails.
function bind(control, value, save) {
  let saved = String(value);
  control.value = saved;
  control.disabled = false;
  control.onchange = async () => {
    control.disabled = true;
    status.textContent = 'Saving…';
    try { await save(control.value); saved = control.value; status.textContent = 'Saved'; }
    catch (error) { control.value = saved; status.textContent = error.message; }
    control.disabled = false;
    control.dispatchEvent(new Event('input'));
  };
}

async function load() {
  const settings = await api.runtime.sendMessage({ action: 'getBlockingSettings' }).catch(() => null);
  if (!settings?.success) { status.textContent = 'Could not load settings. Reload the page.'; return; }
  const sites = document.getElementById('sites');
  sites.replaceChildren();
  for (const site of yamatoSites.definitions) {
    const row = document.createElement('label'); row.className = 'setting';
    const name = document.createElement('span'); name.textContent = site.name;
    const select = document.createElement('select'); fill(select, ['off', 'jc', 'jce']);
    bind(select, settings.siteModules[site.id], mode => send({ action: 'setBlockingSetting', moduleId: site.id, mode }));
    row.append(name, select); sites.append(row);
  }
  const all = settings.enableSiteModules ? settings.siteModules[yamatoSites.definitions[0].id] : 'off';
  bind(allSites, all, async mode => { await send({ action: 'setAllSiteModules', mode }); load(); });
  bind(mediaMode, settings.mediaBlockMode, mode => send({ action: 'setBlockingSetting', moduleId: null, mode }));
  bind(volume, settings.jcVolume, async value => {
    await send({ action: 'setJCVolume', volume: Number(value) });
    if (value !== '0') api.runtime.sendMessage({ action: 'playJCSound' }).catch(() => {});
  });
  volume.dispatchEvent(new Event('input'));
}

volume.addEventListener('input', () => {
  volumeValue.textContent = volume.value === '0' ? 'Muted' : volume.value + '%';
});

document.getElementById('exportLists').addEventListener('click', async () => {
  const lists = await api.runtime.sendMessage({ action: 'getLists' }).catch(() => null);
  if (!Array.isArray(lists?.customBlocks)) { status.textContent = 'Could not read the lists.'; return; }
  const file = { yamato: 'lists', version: 1, customBlocks: lists.customBlocks, customExceptions: lists.customExceptions };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
  link.download = 'yamato-lists.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  status.textContent = `Exported ${file.customBlocks.length} blocked, ${file.customExceptions.length} exceptions`;
});

document.getElementById('importLists').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const [file] = importFile.files;
  importFile.value = '';
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('File is too large.');
    const data = JSON.parse(await file.text());
    const result = await send({ action: 'importLists', customBlocks: data?.customBlocks, customExceptions: data?.customExceptions });
    status.textContent = result.added ? `Imported ${result.added} new entries` : 'Nothing new to import';
  } catch (error) { status.textContent = 'Import failed: ' + error.message; }
});

fill(allSites, ['off', 'jc', 'jce']);
fill(mediaMode, ['jc', 'jce']);
load();
