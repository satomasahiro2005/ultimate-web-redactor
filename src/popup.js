/* Ultimate Web Redactor - popup */

const DEFAULTS = {
  mode: 'hide',
  hideStyle: 'mosaic',
  mosaicPx: 9,
  blurPx: 8,
  frameWidth: 5,
  framePad: 5,
  frameRadius: 0,
  frameColor: '#ff2d2d',
  lock: false
};
const COLORS = ['#ff2d2d', '#ff8a00', '#ffd400', '#22c55e', '#2f6fed'];
const SLIDERS = ['mosaicPx', 'blurPx', 'frameWidth', 'framePad', 'frameRadius'];
const SVGNS = 'http://www.w3.org/2000/svg';

const el = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

// 拡張の外（見た目確認用のページ）でも開けるようにしておく
const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;
const store = hasChrome ? chrome.storage.local : { get: (d, cb) => cb(d), set: () => {} };

function localize() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const s = chrome.i18n.getMessage(node.dataset.i18n);
    if (s) node.textContent = s;
  }
}

/** ショートカットはユーザーが変えられるので、実際の割り当てを表示する */
function showShortcuts() {
  if (typeof chrome === 'undefined' || !chrome.commands) return;
  chrome.commands.getAll((cmds) => {
    const map = Object.fromEntries((cmds || []).map((c) => [c.name, c.shortcut]));
    for (const kbd of document.querySelectorAll('kbd[data-cmd]')) {
      const s = map[kbd.dataset.cmd];
      if (s) kbd.textContent = s;
      else kbd.hidden = true;
    }
  });
}

function pixelFilter(block) {
  const id = `px-${block}`;
  if (document.getElementById(id)) return id;
  const half = block / 2;
  const f = document.createElementNS(SVGNS, 'filter');
  f.id = id;
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('x', String(-block * 2));
  f.setAttribute('y', String(-block * 2));
  f.setAttribute('width', '512');
  f.setAttribute('height', '128');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const add = (name, attrs) => {
    const n = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    f.appendChild(n);
  };
  add('feGaussianBlur', { stdDeviation: Math.max(1, block * 0.29), result: 'avg' });
  add('feFlood', { x: Math.floor(half), y: Math.floor(half), width: 1, height: 1 });
  add('feComposite', { x: 0, y: 0, width: block, height: block });
  add('feTile', { result: 'grid' });
  add('feComposite', { in: 'avg', in2: 'grid', operator: 'in' });
  const ct = document.createElementNS(SVGNS, 'feComponentTransfer');
  const fa = document.createElementNS(SVGNS, 'feFuncA');
  fa.setAttribute('type', 'gamma');
  fa.setAttribute('amplitude', '1');
  fa.setAttribute('exponent', '0.45');
  ct.appendChild(fa);
  f.appendChild(ct);
  add('feMorphology', { operator: 'dilate', radius: Math.max(1, half - 0.5) });
  el('defs').appendChild(f);
  return id;
}

function renderPreview() {
  const s = el('sample');
  s.style.cssText = '';
  if (settings.mode === 'frame') {
    s.style.outline = `${settings.frameWidth}px solid ${settings.frameColor}`;
    s.style.outlineOffset = `${settings.framePad}px`;
    s.style.borderRadius = `${settings.frameRadius}px`;
  } else if (settings.hideStyle === 'solid') {
    s.style.filter = 'brightness(0)';
    s.style.backgroundColor = '#7f7f7f';
  } else if (settings.hideStyle === 'blur') {
    s.style.filter = `blur(${settings.blurPx}px)`;
  } else {
    s.style.filter = `url(#${pixelFilter(settings.mosaicPx)})`;
  }
}

function render() {
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
  }
  for (const b of document.querySelectorAll('#styles button')) {
    b.setAttribute('aria-pressed', String(b.dataset.style === settings.hideStyle));
  }
  const hide = settings.mode !== 'frame';
  el('rowHide').hidden = !hide;
  el('rowFrame').hidden = hide;
  el('rowMosaicPx').hidden = !hide || settings.hideStyle !== 'mosaic';
  el('rowBlurPx').hidden = !hide || settings.hideStyle !== 'blur';

  for (const k of SLIDERS) {
    el(k).value = settings[k];
    el(`${k}Out`).textContent = `${settings[k]}px`;
  }
  el('lock').checked = !!settings.lock;
  for (const b of document.querySelectorAll('#swatches button')) {
    b.setAttribute('aria-pressed', String(b.dataset.color === settings.frameColor));
  }
  renderPreview();
}

function save(patch) {
  settings = { ...settings, ...patch };
  store.set(patch);
  render();
}

function relay(payload, close = true) {
  if (!hasChrome) return;
  chrome.runtime.sendMessage({ type: 'relay', payload }, () => void chrome.runtime.lastError);
  if (close) setTimeout(() => window.close(), 60);
}

for (const c of COLORS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.color = c;
  b.style.background = c;
  b.title = c;
  b.addEventListener('click', () => save({ frameColor: c }));
  el('swatches').appendChild(b);
}

el('modes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) save({ mode: b.dataset.mode });
});
el('styles').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-style]');
  if (b) save({ hideStyle: b.dataset.style, mode: 'hide' });
});
for (const k of SLIDERS) {
  el(k).addEventListener('input', (e) => save({ [k]: Number(e.target.value) }));
}
el('lock').addEventListener('change', (e) => save({ lock: e.target.checked }));
el('applyRect').addEventListener('click', () => relay({ type: 'rect', mode: settings.mode }));
el('applySelection').addEventListener('click', () => relay({ type: 'apply-selection', mode: settings.mode }));
el('pickElement').addEventListener('click', () => relay({ type: 'pick', mode: settings.mode }));
el('undo').addEventListener('click', () => relay({ type: 'undo' }));
el('revealAll').addEventListener('click', () => relay({ type: 'reveal-all' }));

/** 1.0.1 以前は mode に mosaic/blur/solid が入っていた */
function migrate(s) {
  if (s.hideMode && !['mosaic', 'blur', 'solid'].includes(s.hideStyle)) s.hideStyle = s.hideMode;
  if (!['hide', 'frame'].includes(s.mode)) {
    if (['mosaic', 'blur', 'solid'].includes(s.mode)) s.hideStyle = s.mode;
    s.mode = 'hide';
  }
  return s;
}

localize();
showShortcuts();
store.get({ ...DEFAULTS, hideMode: '' }, (v) => {
  if (v) settings = migrate({ ...DEFAULTS, ...v });
  delete settings.hideMode;
  store.set({ mode: settings.mode, hideStyle: settings.hideStyle });
  render();
});
