/*
 * Ultimate Web Redactor - content script
 * ページ側で加工を実行する。オンデマンド注入なので二重実行を弾く。
 */
(() => {
  'use strict';
  if (window.__ultimateWebRedactor) return;

  const ATTR_ID = 'data-uwr-id';
  const ATTR_MODE = 'data-uwr-mode';
  const ATTR_WRAP = 'data-uwr-wrap';
  const ATTR_OVERLAY = 'data-uwr-overlay';
  const STYLE_ID = 'uwr-style';
  const DEFS_ID = 'uwr-defs';
  const UI_ID = 'uwr-ui';

  const DEFAULTS = {
    mode: 'hide',          // 'hide' | 'frame'
    hideStyle: 'mosaic',   // 'mosaic' | 'blur' | 'solid'
    mosaicPx: 9,
    blurPx: 8,
    frameWidth: 5,
    framePad: 5,
    frameRadius: 0,
    frameColor: '#ff2d2d',
    lock: false
  };
  let settings = { ...DEFAULTS };

  /** id -> { el, kind, mode, prevStyle, prevTitle, anchor } */
  const records = new Map();
  const order = [];        // 取り消し用の適用順
  let seq = 0;

  // <base href> があると filter:url(#id) が外部参照になり Chrome では効かない
  const hasBase = !!document.querySelector('base[href]');

  /** 拡張の外(テストページ)でも動くよう、取れないときは英語をそのまま使う */
  const t = (key, fallback) => {
    try {
      return (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage(key)) || fallback;
    } catch (_) { return fallback; }
  };

  /* ---------- settings ---------- */

  /** 1.0.1 以前は mode に mosaic/blur/solid が入っていた */
  function migrate(s) {
    if (s.hideMode && !['mosaic', 'blur', 'solid'].includes(s.hideStyle)) s.hideStyle = s.hideMode;
    if (!['hide', 'frame'].includes(s.mode)) {
      if (['mosaic', 'blur', 'solid'].includes(s.mode)) s.hideStyle = s.mode;
      s.mode = 'hide';
    }
    delete s.hideMode;
    return s;
  }

  function loadSettings() {
    chrome.storage.local.get({ ...DEFAULTS, hideMode: '' }, (v) => {
      if (!chrome.runtime.lastError && v) settings = migrate({ ...DEFAULTS, ...v });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [k, c] of Object.entries(changes)) settings[k] = c.newValue;
    });
  }

  /** 'hide' は隠す指示。実際の見た目は hideStyle で決まる */
  function resolveMode(requested) {
    let mode = requested || settings.mode || 'hide';
    if (mode === 'hide') mode = settings.hideStyle || 'mosaic';
    if (mode === 'frame') return 'frame';
    return mode === 'mosaic' && hasBase ? 'blur' : mode;
  }

  /* ---------- style / svg filter ---------- */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
[${ATTR_ID}]:not([${ATTR_OVERLAY}]) { transition: filter 140ms ease; }
[${ATTR_ID}][${ATTR_MODE}="solid"]:not([${ATTR_OVERLAY}]) { color: transparent !important; }
[${ATTR_WRAP}] { display: inline; }
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function defsRoot() {
    let svg = document.getElementById(DEFS_ID);
    if (svg) return svg;
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = DEFS_ID;
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    (document.body || document.documentElement).appendChild(svg);
    return svg;
  }

  const SIZE_STEPS = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  const bucket = (v) => SIZE_STEPS.find((s) => v <= s) || 16384;

  /**
   * ブロック状のモザイク。
   * 先にぼかして各ブロックの平均色を作り、中心の1pxだけ残して dilate で正方形に広げる。
   *
   * filterUnits は objectBoundingBox では駄目。インライン要素には bbox が無く、
   * Chrome ではフィルタ領域が潰れて要素ごと消える。userSpaceOnUse を使うが、
   * このときの原点はインライン要素自身ではなく、それを含むブロック要素の左上。
   */
  function ensurePixelFilter(block, spanW, spanH) {
    const bw = bucket(spanW + block * 4);
    const bh = bucket(spanH + block * 4);
    if (bw > 8192 || bh > 8192) return null;
    const id = `uwr-px-${block}-${bw}x${bh}`;
    if (document.getElementById(id)) return id;

    const svgns = 'http://www.w3.org/2000/svg';
    const half = block / 2;
    const filter = document.createElementNS(svgns, 'filter');
    filter.id = id;
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('x', String(-block * 2));
    filter.setAttribute('y', String(-block * 2));
    filter.setAttribute('width', String(bw));
    filter.setAttribute('height', String(bh));
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const add = (name, attrs) => {
      const n = document.createElementNS(svgns, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      filter.appendChild(n);
    };

    add('feGaussianBlur', { stdDeviation: Math.max(1, block * 0.29), result: 'avg' });
    add('feFlood', { x: Math.floor(half), y: Math.floor(half), width: 1, height: 1 });
    // タイルの原点を 0,0 に固定する。既定だとフィルタ領域の x/y になり、
    // 横長の要素ではサンプル点がタイルの外に出て何も残らない。
    add('feComposite', { x: 0, y: 0, width: block, height: block });
    add('feTile', { result: 'grid' });
    add('feComposite', { in: 'avg', in2: 'grid', operator: 'in' });
    // 透明な下地の文字はサンプルのアルファが低く、そのままだとブロックが出ない
    const ct = document.createElementNS(svgns, 'feComponentTransfer');
    const fa = document.createElementNS(svgns, 'feFuncA');
    fa.setAttribute('type', 'gamma');
    fa.setAttribute('amplitude', '1');
    fa.setAttribute('exponent', '0.45');
    ct.appendChild(fa);
    filter.appendChild(ct);
    add('feMorphology', { operator: 'dilate', radius: Math.max(1, half - 0.5) });

    defsRoot().appendChild(filter);
    return id;
  }

  /** userSpaceOnUse の原点になるブロック要素の矩形 */
  function blockAncestorRect(el) {
    let n = el.parentElement;
    while (n && getComputedStyle(n).display === 'inline') n = n.parentElement;
    return (n || document.body).getBoundingClientRect();
  }

  /* ---------- 記録 ---------- */

  function isOurs(node) {
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!el || !el.closest) return false;
    if (el.id === UI_ID || el.id === DEFS_ID || el.id === STYLE_ID) return true;
    return !!el.closest(`#${UI_ID}, #${DEFS_ID}, [${ATTR_ID}]`);
  }

  function register(el, kind, mode, extra = {}) {
    const id = `uwr${++seq}`;
    records.set(id, {
      el, kind, mode,
      prevStyle: el.getAttribute('style'),
      prevTitle: el.getAttribute('title'),
      ...extra
    });
    order.push(id);
    el.setAttribute(ATTR_ID, id);
    el.setAttribute(ATTR_MODE, mode);
    const title = titleFor(mode);
    if (title) el.setAttribute('title', title);
    el.addEventListener('click', onClick, true);
    return id;
  }

  function titleFor(mode) {
    if (settings.lock) return '';
    return mode === 'frame'
      ? t('titleRemoveBox', 'Click to remove the box')
      : t('titleRemove', 'Click to remove');
  }

  /** クリックしたら消す。一時解除ではなく完全に元へ戻す */
  function onClick(ev) {
    if (settings.lock) return;
    ev.preventDefault();
    ev.stopPropagation();
    releaseOne(ev.currentTarget.getAttribute(ATTR_ID));
  }

  function releaseOne(id) {
    const rec = records.get(id);
    if (!rec) return;
    const { el } = rec;
    el.removeEventListener('click', onClick, true);
    records.delete(id);
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);

    if (rec.kind === 'overlay') { el.remove(); return; }

    el.removeAttribute(ATTR_ID);
    el.removeAttribute(ATTR_MODE);
    if (rec.prevStyle) el.setAttribute('style', rec.prevStyle);
    else el.removeAttribute('style');
    if (rec.prevTitle === null) el.removeAttribute('title');
    else el.setAttribute('title', rec.prevTitle);

    if (rec.kind === 'wrap' && el.parentNode) {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  }

  function releaseAll() {
    const n = records.size;
    for (const id of [...records.keys()]) releaseOne(id);
    order.length = 0;
    return n;
  }

  /** 最後に適用したものを1つ取り消す */
  function undo() {
    while (order.length) {
      const id = order[order.length - 1];
      if (records.has(id)) { releaseOne(id); return true; }
      order.pop();
    }
    return false;
  }

  /* ---------- 隠す（要素へ直接） ---------- */

  function paintHide(el, mode) {
    const imp = 'important';
    if (mode === 'solid') {
      el.style.setProperty('filter', 'brightness(0)', imp);
      el.style.setProperty('background-color', '#7f7f7f', imp);
      el.style.setProperty('border-radius', '2px', imp);
      return;
    }
    if (mode === 'blur') {
      el.style.setProperty('filter', `blur(${settings.blurPx}px)`, imp);
      return;
    }
    const block = settings.mosaicPx;
    const r = el.getBoundingClientRect();
    const base = blockAncestorRect(el);
    const id = ensurePixelFilter(
      block,
      Math.max(0, r.left - base.left) + r.width,
      Math.max(0, r.top - base.top) + r.height
    );
    el.style.setProperty('filter', id ? `url(#${id})` : `blur(${settings.blurPx}px)`, imp);
  }

  function applyTo(el, { mode, wrapped = false } = {}) {
    if (el.hasAttribute(ATTR_ID)) return null;
    ensureStyle();
    const m = resolveMode(mode);
    // 赤枠は要素に outline を引くと親の overflow で切れるので、常に重ねて描く
    if (m === 'frame') return frameRects(el.getBoundingClientRect(), { anchor: el });
    const id = register(el, wrapped ? 'wrap' : 'element', m, { fixed: false });
    paintHide(el, m);
    return id;
  }

  /* ---------- 重ねて描く（矩形・赤枠） ---------- */

  const OVERLAY_BASE =
    'margin:0 !important;padding:0 !important;box-sizing:border-box !important;' +
    'display:block !important;float:none !important;transform:none !important;' +
    'opacity:1 !important;visibility:visible !important;clip-path:none !important;' +
    'mask:none !important;z-index:2147483600 !important;';

  function newOverlay() {
    const el = document.createElement('div');
    el.setAttribute(ATTR_OVERLAY, '');
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  const hitStyle = () => (settings.lock
    ? 'pointer-events:none !important;'
    : 'pointer-events:auto !important;cursor:pointer !important;');

  /** ウィンドウ基準の固定位置。ドラッグで引いた矩形はこちら */
  function applyRect(r, mode) {
    ensureStyle();
    const m = resolveMode(mode);
    if (m === 'frame') return frameRects(r, { fixed: true });

    const el = newOverlay();
    const id = register(el, 'overlay', m, { fixed: true });
    let look;
    if (m === 'solid') {
      look = 'background:#000 !important;border:0 !important;border-radius:2px !important;';
    } else if (m === 'blur') {
      const fn = `blur(${settings.blurPx}px)`;
      look = `backdrop-filter:${fn} !important;-webkit-backdrop-filter:${fn} !important;` +
             'background:transparent !important;border:0 !important;border-radius:2px !important;';
    } else {
      const fid = ensurePixelFilter(settings.mosaicPx, r.width, r.height);
      const fn = fid ? `url(#${fid})` : `blur(${settings.blurPx}px)`;
      look = `backdrop-filter:${fn} !important;-webkit-backdrop-filter:${fn} !important;` +
             'background:transparent !important;border:0 !important;border-radius:2px !important;';
    }
    el.setAttribute('style',
      OVERLAY_BASE + hitStyle() + look + 'position:fixed !important;' +
      `left:${Math.round(r.left)}px !important;top:${Math.round(r.top)}px !important;` +
      `width:${Math.round(r.width)}px !important;height:${Math.round(r.height)}px !important;`);
    return id;
  }

  /**
   * 矩形をひとつの赤枠で囲む。要素や選択範囲に対しても枠は必ずこれで描くので、
   * 親の overflow に切られないし、選択範囲でも枠は1つで済む。
   */
  function frameRects(rectOrRects, { anchor = null, fixed = false } = {}) {
    ensureStyle();
    const box = unionRect(Array.isArray(rectOrRects) ? rectOrRects : [rectOrRects]);
    if (!box) return null;
    const el = newOverlay();
    const id = register(el, 'overlay', 'frame', { anchor, fixed: !!fixed });
    placeFrame(el, box, fixed);
    return id;
  }

  function unionRect(rects) {
    const list = [...rects].filter((r) => r && r.width > 0 && r.height > 0);
    if (!list.length) return null;
    const left = Math.min(...list.map((r) => r.left));
    const top = Math.min(...list.map((r) => r.top));
    const right = Math.max(...list.map((r) => r.right !== undefined ? r.right : r.left + r.width));
    const bottom = Math.max(...list.map((r) => r.bottom !== undefined ? r.bottom : r.top + r.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  /** ビューポート座標の矩形に枠を合わせる。fixed でなければページに追従させる */
  function placeFrame(el, box, fixed) {
    const pad = settings.framePad;
    const w = settings.frameWidth;
    const look =
      `border:${w}px solid ${settings.frameColor} !important;` +
      `border-radius:${settings.frameRadius}px !important;background:transparent !important;`;

    el.setAttribute('style', OVERLAY_BASE + hitStyle() + look +
      `position:${fixed ? 'fixed' : 'absolute'} !important;left:0 !important;top:0 !important;` +
      `width:${Math.round(box.width + pad * 2 + w * 2)}px !important;` +
      `height:${Math.round(box.height + pad * 2 + w * 2)}px !important;`);

    if (fixed) {
      el.style.setProperty('left', `${Math.round(box.left - pad - w)}px`, 'important');
      el.style.setProperty('top', `${Math.round(box.top - pad - w)}px`, 'important');
      return;
    }
    // absolute の基準がどこであっても合うように、実際のズレを測って補正する
    const at0 = el.getBoundingClientRect();
    el.style.setProperty('left', `${Math.round(box.left - pad - w - at0.left)}px`, 'important');
    el.style.setProperty('top', `${Math.round(box.top - pad - w - at0.top)}px`, 'important');
  }

  /* ---------- 再配置 ---------- */

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const rec of records.values()) {
        if (rec.kind === 'overlay' && rec.mode === 'frame' && rec.anchor && rec.anchor.isConnected) {
          placeFrame(rec.el, rec.anchor.getBoundingClientRect(), rec.fixed);
        } else if (rec.kind !== 'overlay' && rec.mode === 'mosaic') {
          paintHide(rec.el, 'mosaic');
        }
      }
    }, 200);
  });

  /* ---------- 選択範囲 ---------- */

  function fullyInside(range, node) {
    const r = document.createRange();
    try { r.selectNode(node); } catch (_) { return false; }
    return range.compareBoundaryPoints(Range.START_TO_START, r) <= 0 &&
           range.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
  }

  /**
   * 境界をまたぐテキストノードを切り、選択部分を丸ごと1ノードにする。
   * 併せて境界点をテキストノードの外側へ動かす。内側のままだと
   * compareBoundaryPoints で「ノードを完全に含む」と判定されない。
   * 先に start を処理しないと、後続の分割で end の位置がずれる。
   */
  function splitBoundaries(range) {
    const sc = range.startContainer;
    if (sc.nodeType === Node.TEXT_NODE) {
      if (range.startOffset <= 0) range.setStartBefore(sc);
      else if (range.startOffset >= sc.data.length) range.setStartAfter(sc);
      else range.setStartBefore(sc.splitText(range.startOffset));
    }
    const ec = range.endContainer;
    if (ec.nodeType === Node.TEXT_NODE) {
      if (range.endOffset <= 0) range.setEndBefore(ec);
      else if (range.endOffset >= ec.data.length) range.setEndAfter(ec);
      else { ec.splitText(range.endOffset); range.setEndAfter(ec); }
    }
  }

  /** range に完全に含まれる、最も外側のノード群 */
  function outermostNodes(range) {
    const anchor = range.commonAncestorContainer;
    const root = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    if (!root) return [];

    const out = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (node !== root && fullyInside(range, node)) { out.push(node); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const kids = node.childNodes;
      for (let i = kids.length - 1; i >= 0; i--) {
        const k = kids[i];
        if (k.nodeType === Node.TEXT_NODE) {
          if (!k.data.trim()) continue;
        } else if (k.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        if (isOurs(k)) continue;
        if (range.intersectsNode(k)) stack.push(k);
      }
    }
    return out;
  }

  function applySelection(mode) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return 0;

    const ranges = [];
    for (let i = 0; i < sel.rangeCount; i++) ranges.push(sel.getRangeAt(i).cloneRange());
    const m = resolveMode(mode);

    let count = 0;
    if (m === 'frame') {
      // 選択範囲は覆う矩形ひとつで囲む
      const rects = [];
      for (const range of ranges) rects.push(...range.getClientRects());
      if (frameRects(rects)) count = 1;
      sel.removeAllRanges();
      return count;
    }

    for (const range of ranges) {
      splitBoundaries(range);
      for (const node of outermostNodes(range)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const span = document.createElement('span');
          span.setAttribute(ATTR_WRAP, '');
          node.parentNode.insertBefore(span, node);
          span.appendChild(node);
          if (applyTo(span, { mode: m, wrapped: true })) count++;
        } else if (applyTo(node, { mode: m })) {
          count++;
        }
      }
    }
    sel.removeAllRanges();
    return count;
  }

  function applyBySrc(srcUrl, mode) {
    for (const el of document.querySelectorAll('img, video, canvas, embed, object')) {
      const src = el.currentSrc || el.src || el.getAttribute('data') || '';
      if (src && src === srcUrl) return applyTo(el, { mode }) ? 1 : 0;
    }
    startPicker(mode);
    return 0;
  }

  /* ---------- 画面上のUI ---------- */

  let overlayUi = null;
  let toggleRect = null;   // 矩形モード中だけ入る

  const modeLabel = (m) => (m === 'frame'
    ? t('modeFrame', 'Red box')
    : t('modeHide', 'Hide'));

  function makeUi(interactive, barHtml) {
    const host = document.createElement('div');
    host.id = UI_ID;
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;' +
      (interactive ? 'cursor:crosshair;' : 'pointer-events:none;');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `
<style>
  .box { position:fixed; display:none; pointer-events:none;
         border:2px solid #4c8dff; background:rgba(76,141,255,.16); border-radius:3px; }
  .mark { position:fixed; pointer-events:none; border-radius:2px; }
  .mark.f { outline:2px dashed #ffb020; background:rgba(255,176,32,.13); }
  .mark.a { outline:2px dashed #35d07f; background:rgba(53,208,127,.13); }
  .legend { display:flex; align-items:center; gap:10px; color:#9fb0c9; }
  .legend i { display:inline-block; width:9px; height:9px; border-radius:2px;
              margin-right:5px; vertical-align:-1px; }
  .legend .f i { background:#ffb020; }
  .legend .a i { background:#35d07f; }
  .bar { position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
         display:flex; align-items:center; gap:8px;
         font:13px/1 system-ui,"Segoe UI","Yu Gothic UI",sans-serif; color:#fff;
         background:#14161c; padding:7px 8px 7px 12px; border-radius:12px;
         border:2px solid #5b8dff;
         box-shadow:0 0 0 2px rgba(0,0,0,.55), 0 0 18px rgba(91,141,255,.55), 0 10px 28px rgba(0,0,0,.5);
         white-space:nowrap; pointer-events:auto; }
  .bar button { font:inherit; color:#cfd8e6; background:transparent; cursor:pointer;
                border:1px solid rgba(255,255,255,.22); border-radius:6px; padding:5px 10px; }
  .bar button:hover { border-color:#8fb8ff; color:#fff; }
  .bar button[aria-pressed="true"] { background:#3b6fe0; border-color:#3b6fe0; color:#fff; }
  .bar .hint { color:#9fb0c9; }
  .bar .x { border:0; font-size:16px; line-height:1; padding:4px 8px; color:#9fb0c9; }
  .bar .x:hover { color:#fff; }
  .bar .sep { width:1px; height:18px; background:rgba(255,255,255,.18); }
</style>
<div class="box"></div>
<div class="bar">${barHtml}</div>`;
    (document.body || document.documentElement).appendChild(host);
    return { host, sr, box: sr.querySelector('.box'), bar: sr.querySelector('.bar') };
  }

  function closeUi() {
    if (!overlayUi) return;
    const done = overlayUi;
    overlayUi = null;
    toggleRect = null;
    done();
  }

  /* ---------- 要素ピッカー ---------- */

  function startPicker(mode) {
    if (overlayUi) return;
    ensureStyle();
    const m = mode || settings.mode;
    const { host, box } = makeUi(false,
      `<b>${modeLabel(m)}</b><span class="sep"></span><span class="hint">${
        t('hintPick', 'click to apply / ↑ parent ↓ child / Esc to cancel')}</span>`);

    let target = null;
    let climbed = [];

    const draw = () => {
      if (!target || !target.isConnected) { box.style.display = 'none'; return; }
      const r = target.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    };
    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el || el === target || isOurs(el)) return;
      target = el;
      climbed = [];
      draw();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeUi(); return; }
      if (ev.key === 'ArrowUp') {
        const parent = target && target.parentElement;
        if (!parent || parent === document.documentElement) return;
        ev.preventDefault();
        climbed.push(target);
        target = parent;
        draw();
      } else if (ev.key === 'ArrowDown' && climbed.length) {
        ev.preventDefault();
        target = climbed.pop();
        draw();
      }
    };
    const onPick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = target;
      closeUi();
      if (el && el.isConnected) applyTo(el, { mode: m });
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onPick, true);
    window.addEventListener('scroll', draw, true);
    window.addEventListener('resize', draw, true);
    overlayUi = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onPick, true);
      window.removeEventListener('scroll', draw, true);
      window.removeEventListener('resize', draw, true);
      host.remove();
    };
  }

  /* ---------- 矩形ドラッグ ---------- */

  function startRect(mode) {
    if (overlayUi) return;
    ensureStyle();
    let current = mode || settings.mode || 'hide';

    const { host, sr, box, bar } = makeUi(true, `
      <button data-m="hide">${t('modeHide', 'Hide')}</button>
      <button data-m="frame">${t('modeFrame', 'Red box')}</button>
      <span class="sep"></span>
      <span class="legend" hidden>
        <span class="f"><i></i>${t('legendWindow', 'window')}</span>
        <span class="a"><i></i>${t('legendElement', 'element')}</span>
      </span>
      <span class="hint">${t('hintRect', 'drag to box it / click to finish')}</span>
      <button class="x" aria-label="close">✕</button>`);

    // すでに適用してあるところを見せる。追従先で色を分ける
    const legend = bar.querySelector('.legend');
    const marks = [];
    const drawMarks = () => {
      for (const m of marks) m.remove();
      marks.length = 0;
      for (const rec of records.values()) {
        if (!rec.el.isConnected) continue;
        const r = rec.el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const m = document.createElement('div');
        m.className = `mark ${rec.fixed ? 'f' : 'a'}`;
        m.style.left = `${r.left}px`;
        m.style.top = `${r.top}px`;
        m.style.width = `${r.width}px`;
        m.style.height = `${r.height}px`;
        sr.appendChild(m);
        marks.push(m);
      }
      legend.hidden = marks.length === 0;
    };
    drawMarks();

    const syncBar = () => {
      for (const b of bar.querySelectorAll('button[data-m]')) {
        b.setAttribute('aria-pressed', String(b.dataset.m === current));
      }
    };
    const setMode = (m) => {
      current = m;
      settings.mode = m;
      try { chrome.storage.local.set({ mode: m }); } catch (_) { /* テスト時 */ }
      syncBar();
    };
    toggleRect = () => setMode(current === 'frame' ? 'hide' : 'frame');
    syncBar();

    bar.addEventListener('mousedown', (e) => e.stopPropagation(), true);
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('x')) { closeUi(); return; }
      setMode(b.dataset.m);
    }, true);

    let start = null;
    let moved = false;
    const rectOf = (ev) => ({
      left: Math.min(start.x, ev.clientX),
      top: Math.min(start.y, ev.clientY),
      width: Math.abs(ev.clientX - start.x),
      height: Math.abs(ev.clientY - start.y)
    });
    const show = (r) => {
      box.style.display = 'block';
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    };

    const onDown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      start = { x: ev.clientX, y: ev.clientY };
      moved = false;
    };
    const onMove = (ev) => {
      if (!start) return;
      const r = rectOf(ev);
      if (r.width > 3 || r.height > 3) { moved = true; show(r); }
    };
    const onUp = (ev) => {
      if (!start) return;
      const r = rectOf(ev);
      start = null;
      box.style.display = 'none';
      // ドラッグしていなければただのクリック。モードを抜ける
      if (!moved || r.width < 6 || r.height < 6) { closeUi(); return; }
      applyRect(r, current);
      drawMarks();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeUi(); return; }
      // モード中は E でモザイクと赤枠を行き来する
      if ((ev.key === 'e' || ev.key === 'E') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleRect();
      }
    };

    host.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', drawMarks, true);
    window.addEventListener('resize', drawMarks, true);
    overlayUi = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', drawMarks, true);
      window.removeEventListener('resize', drawMarks, true);
      host.remove();
    };
  }

  /* ---------- Ctrl+Z ---------- */

  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
    if ((ev.key || '').toLowerCase() !== 'z') return;
    if (!records.size) return;
    const el = ev.target;
    if (el && (el.isContentEditable ||
               /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) return;
    ev.preventDefault();
    ev.stopPropagation();
    undo();
  }, true);

  /* ---------- messaging ---------- */

  function handle(msg) {
    switch (msg && msg.type) {
      case 'apply-selection': return { count: applySelection(msg.mode) };
      case 'apply-src':       return { count: applyBySrc(msg.srcUrl, msg.mode) };
      case 'pick':            startPicker(msg.mode); return { ok: true };
      // 矩形モード中にもう一度呼ばれたら切り替えとして扱う
      case 'rect':
        if (toggleRect) toggleRect(); else startRect(msg.mode);
        return { ok: true };
      case 'undo':            return { ok: undo() };
      case 'reveal-all':      closeUi(); return { count: releaseAll() };
      case 'ping':            return { ok: true, applied: records.size };
      default:                return { ok: false };
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      sendResponse(handle(msg));
      return false;
    });
    loadSettings();
  }

  window.__ultimateWebRedactor = {
    handle, applySelection, applyTo, applyRect, frameRects,
    startPicker, startRect, closeUi: closeUi, releaseAll, undo,
    get records() { return records; },
    get settings() { return settings; },
    set settings(v) { settings = { ...settings, ...v }; }
  };
})();
