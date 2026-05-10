if (typeof browser === 'undefined') var browser = chrome;

/* ══════════════════════════════════════════════════════════════════════════════
   THEMES
══════════════════════════════════════════════════════════════════════════════ */
const THEMES = {
  vergil: {
    bg: 'vergil.jpg', bgGolden: 'vergil2.jpg', bgOpacity: 0.85, bgOpacityGolden: 0.85, subtitle: 'VERGIL',
    overlay: `
      radial-gradient(ellipse at 30% 0%,   rgba(18,0,75,0.50)  0%, transparent 58%),
      radial-gradient(ellipse at 80% 100%, rgba(8,0,55,0.38)    0%, transparent 52%),
      linear-gradient(180deg, rgba(4,2,18,0.45) 0%, rgba(2,1,10,0.60) 100%)
    `,
    overlayGolden: `
      radial-gradient(ellipse at 30% 0%,   rgba(100,50,0,0.50)  0%, transparent 58%),
      radial-gradient(ellipse at 80% 100%, rgba(50,20,0,0.38)    0%, transparent 52%),
      linear-gradient(180deg, rgba(20,10,0,0.45) 0%, rgba(10,5,0,0.60) 100%)
    `,
    crackColor: [110, 155, 255], crackAlpha: 0.72,
    glowColor:  [70,  110, 255], glowAlpha:  0.32,
    bloomColor: [180, 210, 255],
  },
  dante: {
    bg: 'dante.jpg', bgGolden: 'dante2.jpg', bgOpacity: 0.82, bgOpacityGolden: 0.82, subtitle: 'DANTE',
    overlay: `
      radial-gradient(ellipse at 20% 0%,   rgba(100,0,0,0.42)  0%, transparent 55%),
      radial-gradient(ellipse at 85% 90%,  rgba(160,120,0,0.12) 0%, transparent 50%),
      linear-gradient(180deg, rgba(12,2,2,0.48) 0%, rgba(5,1,1,0.62) 100%)
    `,
    overlayGolden: `
      radial-gradient(ellipse at 20% 0%,   rgba(100,50,0,0.42)  0%, transparent 55%),
      radial-gradient(ellipse at 85% 90%,  rgba(200,150,0,0.18) 0%, transparent 50%),
      linear-gradient(180deg, rgba(20,10,0,0.48) 0%, rgba(10,5,0,0.62) 100%)
    `,
    crackColor: [255, 200, 100], crackAlpha: 0.68,
    glowColor:  [220, 140,  30], glowAlpha:  0.28,
    bloomColor: [255, 230, 180],
  },
  // FIX 2: bg changed from 'dante.jpg' → 'dante_retro.jpg'
  dante_retro: {
    bg: 'dante_retro.jpg', bgGolden: 'dante_retro2.jpg', bgOpacity: 0.80, bgOpacityGolden: 0.80, subtitle: 'DANTE — RETRO',
    overlay: `
      radial-gradient(ellipse at 50% 0%,   rgba(130,0,0,0.45)   0%, transparent 55%),
      radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.28)     0%, transparent 50%),
      linear-gradient(180deg, rgba(10,0,0,0.50) 0%, rgba(2,0,0,0.65) 100%)
    `,
    overlayGolden: `
      radial-gradient(ellipse at 50% 0%,   rgba(100,50,0,0.45)   0%, transparent 55%),
      radial-gradient(ellipse at 50% 100%, rgba(20,10,0,0.28)    0%, transparent 50%),
      linear-gradient(180deg, rgba(20,10,0,0.50) 0%, rgba(10,5,0,0.65) 100%)
    `,
    crackColor: [255, 215, 130], crackAlpha: 0.65,
    glowColor:  [210, 140,  20], glowAlpha:  0.28,
    bloomColor: [255, 230, 160],
  },
  nero: {
    bg: 'nero.jpg', bgGolden: 'nero2.jpg', bgOpacity: 0.85, bgOpacityGolden: 0.85, subtitle: 'NERO',
    overlay: `
      radial-gradient(ellipse at 30% 0%,   rgba(0,18,90,0.45)   0%, transparent 55%),
      radial-gradient(ellipse at 75% 100%, rgba(70,0,0,0.28)   0%, transparent 50%),
      linear-gradient(180deg, rgba(2,4,14,0.48) 0%, rgba(1,2,8,0.62) 100%)
    `,
    overlayGolden: `
      radial-gradient(ellipse at 30% 0%,   rgba(50,30,0,0.45)   0%, transparent 55%),
      radial-gradient(ellipse at 75% 100%, rgba(30,15,0,0.28)   0%, transparent 50%),
      linear-gradient(180deg, rgba(20,10,0,0.48) 0%, rgba(10,5,0,0.62) 100%)
    `,
    crackColor: [ 70, 220, 160], crackAlpha: 0.65,
    glowColor:  [ 30, 190, 120], glowAlpha:  0.28,
    bloomColor: [140, 245, 200],
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   CRACKED GLASS CANVAS
══════════════════════════════════════════════════════════════════════════════ */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }

function drawGlass(canvas, theme) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const rng = mulberry32(0xC0FFEE42);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   '#12152A');
  bg.addColorStop(0.4, '#0C0F20');
  bg.addColorStop(1,   '#06070E');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.6, cy = H * 0.32;
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, 200);
  bloom.addColorStop(0,    rgba(theme.bloomColor, 0.45));
  bloom.addColorStop(0.06, rgba(theme.bloomColor, 0.22));
  bloom.addColorStop(0.18, rgba(theme.bloomColor, 0.08));
  bloom.addColorStop(1,    rgba(theme.bloomColor, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);

  const cc = theme.crackColor, gc = theme.glowColor;

  function crack(x0, y0, angle, len, depth, alpha) {
    if (depth < 0 || len < 6) return;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;

    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = rgba(gc, alpha * theme.glowAlpha * 2.2);
    ctx.lineWidth   = depth * 1.8 + 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();

    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = rgba(cc, alpha * theme.crackAlpha);
    ctx.lineWidth   = Math.max(0.4, depth * 0.65);
    ctx.stroke();

    const branches = depth > 2 ? 2 : (rng() > 0.45 ? 1 : 0);
    for (let b = 0; b < branches; b++) {
      crack(x1, y1, angle + (rng() - 0.5) * 1.3,
            len * (0.38 + rng() * 0.32), depth - 1, alpha * (0.55 + rng() * 0.3));
    }
    if (rng() > 0.18)
      crack(x1, y1, angle + (rng() - 0.5) * 0.35,
            len * (0.52 + rng() * 0.28), depth - 1, alpha * 0.82);
  }

  const nPrimary = 8 + Math.floor(rng() * 3);
  for (let i = 0; i < nPrimary; i++) {
    const a = (i / nPrimary) * Math.PI * 2 + (rng() - 0.5) * 0.55;
    crack(cx, cy, a, 65 + rng() * 100, 4, 0.82 + rng() * 0.18);
  }

  const cx2 = cx - 55 + rng() * 35, cy2 = cy + 35 + rng() * 45;
  for (let i = 0; i < 4; i++) {
    crack(cx2, cy2, (i / 4) * Math.PI * 2 + rng() * 0.7,
          28 + rng() * 48, 3, 0.45 + rng() * 0.3);
  }

  for (let r = 0; r < 4; r++) {
    const rad = 28 + r * 24 + rng() * 10;
    const segs = 4 + r * 2;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + rng() * 0.4;
      const a1 = a0 + 0.25 + rng() * 0.45;
      ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a1);
      ctx.strokeStyle = rgba(cc, (0.32 - r * 0.06) * theme.crackAlpha);
      ctx.lineWidth   = 0.55;
      ctx.stroke();
    }
  }

  const vign = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.85);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);
}

function initCanvas(themeKey) {
  const canvas  = document.getElementById('glassCanvas');
  // Use offsetHeight (reliable in Chrome) instead of scrollHeight (can over-report)
  const H       = document.documentElement.offsetHeight || document.body.offsetHeight || 520;
  canvas.width  = 360;
  canvas.height = H;
  canvas.style.height = H + 'px';
  drawGlass(canvas, THEMES[themeKey] || THEMES.vergil);
}

/* ══════════════════════════════════════════════════════════════════════════════
   THEME APPLICATION
══════════════════════════════════════════════════════════════════════════════ */
function applyTheme(modeKey, danteRetro, isGolden) {
  const key = (modeKey === 'dante' && danteRetro) ? 'dante_retro' : modeKey;
  const t   = THEMES[key] || THEMES.vergil;

  const bgChar      = document.getElementById('bgChar');
  const bgOverlay   = document.getElementById('bgOverlay');
  const bgImage     = isGolden && t.bgGolden ? t.bgGolden : t.bg;
  const bgOpacity   = isGolden && t.bgOpacityGolden ? t.bgOpacityGolden : t.bgOpacity;
  const overlayGrad = isGolden && t.overlayGolden ? t.overlayGolden : t.overlay;

  // Snapshot current bgChar as a ghost that fades out, revealing the new bg underneath
  const ghost = bgChar.cloneNode(false);
  ghost.style.cssText    = bgChar.getAttribute('style') || '';
  ghost.style.position   = 'fixed';
  ghost.style.inset      = '0';
  ghost.style.zIndex     = '2';
  ghost.style.transition = 'opacity 0.05s ease';
  bgChar.parentNode.insertBefore(ghost, bgChar.nextSibling);

  // Swap real bgChar immediately (hidden behind ghost)
  bgChar.style.backgroundImage = `url('${browser.runtime.getURL('public/backgrounds/' + bgImage)}')`;
  bgChar.style.opacity = bgOpacity;

  // Swap CSS vars + overlay with transition
  document.body.setAttribute('data-char', modeKey);
  bgOverlay.style.transition = 'background 0.05s ease';
  bgOverlay.style.background = overlayGrad;

  // Trigger ghost fade-out on next paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.style.opacity = '0';
      ghost.addEventListener('transitionend', () => {
        ghost.remove();
        bgOverlay.style.transition = '';
      }, { once: true });
    });
  });

  initCanvas(key);
}

/* ══════════════════════════════════════════════════════════════════════════════
   RANK / UNLOCK HELPERS
══════════════════════════════════════════════════════════════════════════════ */
const RANK_ORDER = ['D','C','B','A','S','SS','SSS'];
const MODE_UNLOCK = { vergil: null, dante: 'S', nero: 'SS', dante_retro: 'SSS' };

function rankIdx(id) { return RANK_ORDER.indexOf(id); }
function isModeUnlocked(key, data) {
  if (!data) return key === 'vergil';
  if (data.unlockAll) return true;
  const req = MODE_UNLOCK[key];
  return !req || rankIdx(data.currentRank.id) >= rankIdx(req);
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  let currentMode = 'vergil';
  let danteRetro  = false;
  let streakData  = null;
  let isRankGolden = false;

  const play        = f  => new Audio(browser.runtime.getURL('public/sounds/' + f)).play().catch(() => {});
  const playClick   = () => play('click.mp3');
  const playRip     = () => play('rip.mp3');
  const playMotivated = () => play('motivated.mp3');
  const playTrash   = () => play('trash.mp3');

  function loadStreak() {
    return new Promise(r => browser.runtime.sendMessage({ action:'getStreak' }, res => { streakData = res; r(res); }));
  }

  function applyGoldenRank(rankId) {
    const S_PLUS = ['S', 'SS', 'SSS'];
    isRankGolden = S_PLUS.includes(rankId);
    if (isRankGolden) {
      document.body.setAttribute('data-rank-s', '');
    } else {
      document.body.removeAttribute('data-rank-s');
    }
    applyTheme(currentMode, danteRetro, isRankGolden);
  }

  function renderBadge(data) {
    const rank = data.currentRank;
    applyGoldenRank(rank.id);
    const daysEl = document.getElementById('streakDays');
    if (daysEl) daysEl.textContent = data.days + (data.days === 1 ? ' day' : ' days');

    const el = document.getElementById('streakBadge');
    if (!el) return;
    
    if (data.isNewRank) {
      el.innerHTML = '';
      const vid = document.createElement('video');
      vid.src = browser.runtime.getURL('public/ranks/' + rank.id + '.webm');
      vid.autoplay = true; vid.muted = false; vid.playsInline = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;cursor:pointer;';
      const done = () => { showImg(rank); browser.runtime.sendMessage({ action:'markStreakSeen' }); };
      vid.addEventListener('ended', done); vid.addEventListener('error', done);
      vid.addEventListener('click', () => { playClick(); openChudPopup(); });
      el.appendChild(vid);
    } else { showImg(rank); }
  }

  function showImg(rank) {
    const el = document.getElementById('streakBadge');
    if (!el) return;
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src   = browser.runtime.getURL('public/ranks/' + rank.id + '.png');
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;cursor:pointer;';
    img.title = 'Manage streak';
    img.addEventListener('click', () => { playClick(); openChudPopup(); });
    el.appendChild(img);
  }

  // SSS quotes per character
  const SSS_QUOTES = {
    vergil:      "This is power",
    dante:       "I'm on fire",
    dante_retro: "Too easy",
    nero:        "Don't fuck with me",
  };

  // Rank colors matching the badge colors (approximate per rank progression)
  const RANK_COLORS = {
    D:   { color: '#8ab4f8', shadow: 'rgba(100,150,255,0.4)' },
    C:   { color: '#a0c8ff', shadow: 'rgba(120,170,255,0.4)' },
    B:   { color: '#66dd88', shadow: 'rgba(80,200,120,0.4)' },
    A:   { color: '#ffcc44', shadow: 'rgba(220,180,40,0.4)' },
    S:   { color: '#ff8844', shadow: 'rgba(240,110,40,0.4)' },
    SS:  { color: '#ff4444', shadow: 'rgba(220,50,50,0.4)' },
    SSS: { color: '#ffd700', shadow: 'rgba(255,200,0,0.55)' },
  };

  function renderStats() {
    // Days since install
    const installEl = document.getElementById('statInstall');
    if (installEl && streakData) {
      installEl.textContent = streakData.days || 0;
    }

    // Longest streak
    if (streakData) {
      const longest = document.getElementById('statLongest');
      if (longest) longest.textContent = (streakData.longestStreak || streakData.days || 0) + 'd';
    }

    // Last stat: days to next rank, or SSS quote
    if (streakData) {
      const labelEl = document.getElementById('statNextRankLabel');
      const valueEl = document.getElementById('statCurrent');
      const ranks   = streakData.ranks || [];
      const days    = streakData.days || 0;
      const currentRankId = streakData.currentRank?.id || 'D';
      const currentIdx = ranks.findIndex(r => r.id === currentRankId);
      const nextRank = ranks[currentIdx + 1];
      const rankColor = RANK_COLORS[currentRankId] || RANK_COLORS['D'];

      if (!nextRank) {
        // SSS — max rank
        const effectiveKey = (currentMode === 'dante' && danteRetro) ? 'dante_retro' : currentMode;
        const quote = SSS_QUOTES[effectiveKey] || SSS_QUOTES.vergil;
        if (labelEl) labelEl.textContent = quote;
        if (valueEl) {
          valueEl.textContent = '';
          valueEl.style.color = '#ffd700';
          valueEl.style.textShadow = '0 0 8px rgba(255,200,0,0.6)';
        }
        if (labelEl) {
          labelEl.style.color = '#ffd700';
          labelEl.style.textShadow = '0 0 8px rgba(255,200,0,0.6)';
          labelEl.style.fontSize = '0.58em';
          labelEl.style.fontWeight = '700';
        }
      } else {
        const daysLeft = Math.max(0, nextRank.minDays - days);
        if (labelEl) {
          labelEl.textContent = 'Days to next rank';
          labelEl.style.color = '';
          labelEl.style.textShadow = '';
          labelEl.style.fontSize = '';
          labelEl.style.fontWeight = '';
        }
        if (valueEl) {
          valueEl.textContent = daysLeft + 'd';
          valueEl.style.color = rankColor.color;
          valueEl.style.textShadow = `0 0 6px ${rankColor.shadow}`;
        }
      }
    }
  }

  function updateTitleLeft() {
    const slot = document.getElementById('titleLeft');
    slot.innerHTML = '';
    if (currentMode === 'dante') {
      const retroLocked = streakData && !isModeUnlocked('dante_retro', streakData);
      if (retroLocked) {
        const wrap = document.createElement('div'); wrap.className = 'toggle-locked-wrap';
        const sl = document.createElement('span'); sl.className = 'slider'; wrap.appendChild(sl);
        const lo = document.createElement('div'); lo.className = 'toggle-lock-overlay';
        const li = document.createElement('img'); li.src = browser.runtime.getURL('public/assets/lock.png');
        lo.appendChild(li); wrap.appendChild(lo); wrap.style.cursor = 'not-allowed';
        wrap.addEventListener('click', () => { playClick(); openMatrixPopup(); });
        slot.appendChild(wrap);
      } else {
        const label = document.createElement('label'); label.className = 'toggle-switch';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = danteRetro;
        const sl  = document.createElement('span');  sl.className = 'slider';
        label.appendChild(inp); label.appendChild(sl);
        inp.addEventListener('change', () => {
          const v = inp.checked;
          play(v ? 'dante_retro_switch.mp3' : 'dante_switch.mp3');
          danteRetro = v;
          applyTheme(currentMode, danteRetro, isRankGolden);
          updateJceButtonText();
          renderStats();
          browser.runtime.sendMessage({ action:'setDanteRetro', danteRetro: v });
        });
        slot.appendChild(label);
      }
    } else {
      const btn = document.createElement('button'); btn.id = 'infoBtn'; btn.textContent = 'ℹ';
      btn.addEventListener('click', () => { playClick(); openInfoPopup(); });
      slot.appendChild(btn);
    }
  }

  function updateLocks(data) {
    document.querySelectorAll('.mode-item').forEach(item => {
      const k = item.dataset.mode;
      const locked = !isModeUnlocked(k, data);
      item.classList.toggle('mode-locked', locked);
      if (locked && !item.querySelector('.lock-overlay')) {
        const lo = document.createElement('div'); lo.className = 'lock-overlay';
        const li = document.createElement('img'); li.src = browser.runtime.getURL('public/assets/lock.png');
        // FIX 3: lock icon fills the button height
        li.style.cssText = 'width:auto;height:100%;max-height:100%;object-fit:contain;display:block;';
        lo.appendChild(li); item.appendChild(lo);
      } else if (!locked) {
        item.querySelector('.lock-overlay')?.remove();
      }
    });
  }

  function setActiveTab(mode) {
    document.querySelectorAll('.mode-item').forEach(i => i.classList.remove('active'));
    const activeItem = document.querySelector(`.mode-item[data-mode="${mode}"]`);
    if (activeItem) activeItem.classList.add('active');
  }

  function loadMode() {
    return new Promise(resolve => {
      browser.runtime.sendMessage({ action:'getMode' }, mRes => {
        currentMode = mRes.mode || 'vergil';
        danteRetro  = mRes.danteRetro || false;
        applyTheme(currentMode, danteRetro, isRankGolden);
        setActiveTab(currentMode);
        updateJceButtonText();
        resolve();
      });
    });
  }

  const JCE_LABELS = {
    vergil: 'Judgement Cut End',
    dante: 'Royal Release',
    dante_retro: 'Real Impact',
    nero: 'Showdown'
  };

  function updateJceButtonText() {
    const execBtn = document.getElementById('executeBtn');
    if (execBtn) {
      const key = (currentMode === 'dante' && danteRetro) ? 'dante_retro' : currentMode;
      const label = JCE_LABELS[key] || 'JCE Current Tab';
      execBtn.textContent = label + '';
    }
  }

  const modeBar = document.querySelector('.mode-bar');
  if (modeBar) {
    modeBar.addEventListener('click', e => {
      const item = e.target.closest('.mode-item');
      if (!item || item.classList.contains('mode-locked')) { 
        if (item) { playClick(); openMatrixPopup(); } 
        return; 
      }
      const mode = item.dataset.mode;
      if (!mode) return;
      if (mode === currentMode) return;
      playClick();
      play((mode === 'dante' && danteRetro) ? 'dante_retro_switch.mp3' : mode + '_switch.mp3');
      browser.runtime.sendMessage({ action:'setMode', mode }, res => {
        if (res?.success) { currentMode = mode; applyTheme(mode, danteRetro, isRankGolden); setActiveTab(mode); updateTitleLeft(); updateJceButtonText(); renderStats(); }
      });
    });
  }

  function buildItem(domain, removeAction) {
    const li = document.createElement('li');
    const sp = document.createElement('span'); sp.textContent = domain;
    const rm = document.createElement('span'); rm.textContent = '✕'; rm.className = 'remove-btn';
    rm.onclick = () => {
      playClick();
      browser.runtime.sendMessage({ action: removeAction, domain }, r => {
        if (r?.success) { loadLists(); renderStats(); }
      });
    };
    li.appendChild(sp); li.appendChild(rm);
    return li;
  }

  function loadLists() {
    browser.runtime.sendMessage({ action:'getLists' }, res => {
      if (!res) return;
      const cl = document.getElementById('customList');
      if (cl) {
        cl.innerHTML = '';
        (res.customBlocks || []).forEach(d => cl.appendChild(buildItem(d, 'removeCustomBlock')));
      }
      const el = document.getElementById('exceptionsList');
      if (el) {
        el.innerHTML = '';
        (res.customExceptions || []).forEach(d => el.appendChild(buildItem(d, 'removeException')));
      }
      const blocked = document.getElementById('statBlocked');
      if (blocked) blocked.textContent = res.totalBlockCount || 0;
    });
  }

  function getDomain(url) { try { return new URL(url).hostname; } catch { return ''; } }

  const mkOverlay = (z=10001) => {
    const o = document.createElement('div'); o.className = 'popup-overlay'; o.style.zIndex = z; return o;
  };
  const mkBox = () => {
    const b = document.createElement('div'); b.className = 'popup-box'; return b;
  };
  const mkBtn = (text, bg = 'rgba(255,255,255,0.05)', border = 'rgba(200,168,75,0.3)', color = 'var(--c-accent)') => {
    const b = document.createElement('button'); b.className = 'dmc-btn'; b.textContent = text;
    b.style.background = bg; b.style.borderColor = border; b.style.color = color;
    return b;
  };

  function openInfoPopup() {
    const ov = mkOverlay(), box = mkBox();
    const t = document.createElement('div'); t.className = 'popup-title'; t.textContent = 'What form of power is this?'; box.appendChild(t);
    const tbl = document.createElement('table'); tbl.className = 'popup-table';
    [['S','7d','Dante'],['SS','14d','Nero'],['SSS','21d','???']].forEach(([rank,days,lbl]) => {
      const tr = document.createElement('tr');
      [['td-rank',rank],['td-days',days],['td-label',lbl]].forEach(([cls,txt]) => {
        const td = document.createElement('td'); td.className = cls; td.textContent = txt; tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    box.appendChild(tbl);
    
    const hotkeyLabel = document.createElement('div'); 
    hotkeyLabel.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.05);font-size:0.64em;color:var(--c-text);line-height:1.65;letter-spacing:0.03em;';
    hotkeyLabel.innerHTML = '<strong>Pro tip:</strong> press Ctrl+Shift+U to kill current tab';
    box.appendChild(hotkeyLabel);
    
    const tag = document.createElement('span'); tag.className = 'popup-tagline'; tag.textContent = "Degeneracy shall not pass"; box.appendChild(tag);
    const row = document.createElement('div'); row.className = 'popup-btn-row';
    const closeBtn = mkBtn('Got it');
    closeBtn.addEventListener('click', () => { playClick(); document.body.removeChild(ov); });
    row.appendChild(closeBtn); box.appendChild(row);
    ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov); });
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function themedConfirm(msg, onYes, sfxYes, sfxNo) {
    const ov = mkOverlay(10002), box = mkBox();
    const p = document.createElement('p'); p.className = 'popup-body'; p.textContent = msg; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'popup-btn-row';
    const yBtn = mkBtn('Yes','rgba(110,5,5,0.9)','rgba(200,60,60,0.4)','#EE8888');
    const nBtn = mkBtn('No');
    yBtn.addEventListener('click', () => { if (sfxYes) sfxYes(); document.body.removeChild(ov); onYes(); });
    nBtn.addEventListener('click', () => { if (sfxNo) sfxNo(); document.body.removeChild(ov); });
    row.appendChild(yBtn); row.appendChild(nBtn); box.appendChild(row);
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openChudPopup() {
    const ov = mkOverlay();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:280px;max-width:90vw;overflow:hidden;border:1px solid rgba(255,255,255,0.1);box-shadow:0 0 30px rgba(0,0,0,0.9);';
    const top = document.createElement('div');
    top.style.cssText = 'background:rgba(5,3,16,0.98);padding:14px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07);';
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.68em;color:rgba(215,208,245,0.8);line-height:1.6;white-space:pre-line;';
    p.textContent = "You can reset your streak if you believe that you should";
    top.appendChild(p);
    const imgWrap = document.createElement('div'); imgWrap.style.position = 'relative';
    const img = document.createElement('img'); img.src = browser.runtime.getURL('public/assets/chud.png'); img.style.cssText='width:100%;display:block;';
    const rBtn = mkBtn('Reset Streak','rgba(110,0,0,0.9)','rgba(180,40,40,0.5)','#EE8888');
    rBtn.style.cssText += ';position:absolute;left:28%;bottom:14px;transform:translateX(-50%);border-radius:20px;padding:5px 12px;font-size:0.65em;white-space:nowrap;';
    const cBtn = mkBtn('Close');
    cBtn.style.cssText += ';position:absolute;left:72%;bottom:14px;transform:translateX(-50%);border-radius:20px;padding:5px 12px;font-size:0.65em;white-space:nowrap;';
    rBtn.addEventListener('click', () => {
      playClick(); document.body.removeChild(ov);
      themedConfirm('Reset streak to zero? This cannot be undone.', () => {
        browser.runtime.sendMessage({ action:'resetStreak' }, async (res) => {
          if (res?.success) {
            streakData = await loadStreak(); 
            renderBadge(streakData); 
            updateLocks(streakData); 
            updateTitleLeft(); 
            renderStats();
          }
        });
      }, playRip, playClick);
    });
    cBtn.addEventListener('click', () => { playClick(); document.body.removeChild(ov); });
    ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov); });
    imgWrap.appendChild(img); imgWrap.appendChild(rBtn); imgWrap.appendChild(cBtn);
    wrap.appendChild(top); wrap.appendChild(imgWrap); ov.appendChild(wrap); document.body.appendChild(ov);
  }

  function openMatrixPopup() {
    const ov = mkOverlay();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:400px;max-width:90vw;overflow:hidden;border:1px solid rgba(0,200,80,0.15);box-shadow:0 0 30px rgba(0,0,0,0.9);';
    const top = document.createElement('div');
    top.style.cssText = 'background:#020a04;padding:14px;text-align:center;border-bottom:1px solid rgba(0,255,80,0.07);';
    const p = document.createElement('p');
    p.style.cssText = 'color:#00ff41;font-family:"Courier New",monospace;font-size:0.68em;line-height:1.6;white-space:pre-line;text-shadow:0 0 5px rgba(0,255,65,0.4);';
    p.textContent = 'How about unlocking everything with your self-control?\nNothing is stopping you from doing it right now,\nbut would you?';
    top.appendChild(p);
    const imgWrap = document.createElement('div'); imgWrap.style.position = 'relative';
    const img = document.createElement('img'); img.src = browser.runtime.getURL('public/assets/matrix.png'); img.style.cssText='width:100%;display:block;';
    const rBtn = mkBtn('Motivation','rgba(130,0,0,0.9)','rgba(180,30,30,0.5)','#FF9999');
    rBtn.style.cssText += ';position:absolute;left:27%;top:46%;transform:translate(-50%,-50%);border-radius:20px;padding:5px 12px;font-size:0.65em;white-space:nowrap;';
    rBtn.addEventListener('click', () => { playMotivated(); document.body.removeChild(ov); });
    const bBtn = mkBtn('Femboy porn','rgba(0,35,130,0.9)','rgba(30,80,200,0.5)','#88CCFF');
    bBtn.style.cssText += ';position:absolute;left:70%;top:55%;transform:translate(-50%,-50%);border-radius:20px;padding:5px 12px;font-size:0.65em;white-space:nowrap;';
    bBtn.addEventListener('click', () => {
      playClick(); document.body.removeChild(ov);
      themedConfirm('Think again', () => {
        browser.runtime.sendMessage({ action:'setUnlockAll' }, () => {
          streakData.unlockAll = true; updateLocks(streakData); updateTitleLeft();
        });
      }, playTrash, playMotivated);
    });
    imgWrap.appendChild(img); imgWrap.appendChild(rBtn); imgWrap.appendChild(bBtn);
    wrap.appendChild(top); wrap.appendChild(imgWrap); ov.appendChild(wrap); document.body.appendChild(ov);
  }

  const addBtn    = document.getElementById('addBtn');
  const customUrl = document.getElementById('customUrl');
  const addExcBtn = document.getElementById('addExcBtn');
  const excUrl    = document.getElementById('exceptionUrl');
  const cbToggle  = document.getElementById('customBlocksToggle');
  const excToggle = document.getElementById('exceptionsToggle');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      playClick();
      const d = (customUrl?.value || '').trim().toLowerCase();
      if (d) browser.runtime.sendMessage({ action:'addCustomBlock', domain:d }, r => {
        if (r?.success) { customUrl.value = ''; loadLists(); renderStats(); }
      });
    });
  }
  
  if (addExcBtn) {
    addExcBtn.addEventListener('click', () => {
      playClick();
      const d = (excUrl?.value || '').trim().toLowerCase();
      if (d) browser.runtime.sendMessage({ action:'addException', domain:d }, r => {
        if (r?.success) { excUrl.value = ''; loadLists(); }
      });
    });
  }
  
  if (customUrl) customUrl.addEventListener('keypress', e => { if (e.key === 'Enter') addBtn?.click(); });
  if (excUrl)    excUrl.addEventListener('keypress',    e => { if (e.key === 'Enter') addExcBtn?.click(); });
  if (cbToggle)  cbToggle.addEventListener('change',  () => { playClick(); browser.runtime.sendMessage({ action:'setEnableCustomBlocks',    enabled: cbToggle.checked }); });
  if (excToggle) excToggle.addEventListener('change', () => { playClick(); browser.runtime.sendMessage({ action:'setEnableCustomExceptions', enabled: excToggle.checked }); });

  const execBtn = document.getElementById('executeBtn');
  if (execBtn) {
    execBtn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action:'executeRun', force:true, fromPopup:true });
    });
  }

  function loadEnableStates() {
    browser.runtime.sendMessage({ action:'getEnableStates' }, res => {
      if (res) { 
        if (cbToggle) cbToggle.checked = res.enableCustomBlocks; 
        if (excToggle) excToggle.checked = res.enableCustomExceptions; 
      }
    });
  }
  function preloadDomain() {
    browser.tabs.query({ active:true, currentWindow:true }, tabs => {
      if (tabs?.[0]) { 
        const d = getDomain(tabs[0].url); 
        if (customUrl) customUrl.value = d; 
        if (excUrl) excUrl.value = d; 
      }
    });
  }

  await loadMode();
  // FIX 4: load streak first, then render stats — streakData is guaranteed set before renderStats()
  streakData = await loadStreak();
  renderBadge(streakData);
  updateLocks(streakData);
  updateTitleLeft();
  renderStats();
  loadLists();
  loadEnableStates();
  preloadDomain();

  // Listen for block count updates from content scripts
  (browser.runtime.onMessage || chrome.runtime.onMessage).addListener((msg) => {
    if (msg?.action === 'blockCountUpdated') {
      loadLists();
    }
  });

  // Defer canvas init so Chrome has finished layout before we measure height
  setTimeout(() => {
    const key = (currentMode === 'dante' && danteRetro) ? 'dante_retro' : currentMode;
    initCanvas(key);
  }, 0);
});