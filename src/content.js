/*
 * Web Mosaic Next - content script
 * ページ側で加工を実行する。オンデマンド注入なので二重実行を弾く。
 */
(() => {
  'use strict';
  if (window.__ultimateWebRedactor) return;

  const ATTR_ID = 'data-uwr-id';
  const ATTR_MODE = 'data-uwr-mode';
  const ATTR_WRAP = 'data-uwr-wrap';
  const ATTR_RECT = 'data-uwr-rect';
  const STYLE_ID = 'uwr-style';
  const DEFS_ID = 'uwr-defs';
  const UI_ID = 'uwr-ui';

  const DEFAULTS = {
    mode: 'mosaic',
    hideMode: 'mosaic',   // 「隠す」で使う方。赤枠を選んでいても影響しない
    mosaicPx: 9,
    blurPx: 8,
    frameWidth: 5,
    framePad: 5,
    frameRadius: 0,
    frameColor: '#ff2d2d',
    lock: false
  };
  let settings = { ...DEFAULTS };

  /** id -> { el, kind, mode, prevStyle, prevTitle } kind: 'wrap' | 'element' | 'rect' */
  const records = new Map();
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

  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (v) => {
      if (!chrome.runtime.lastError && v) settings = { ...DEFAULTS, ...v };
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [k, c] of Object.entries(changes)) settings[k] = c.newValue;
    });
  }

  /** 'hide' は「隠す」の指示。赤枠を選んでいても隠す側のモードに解決する */
  function resolveMode(requested) {
    let mode = requested || settings.mode || 'mosaic';
    if (mode === 'hide') mode = settings.hideMode || 'mosaic';
    if (mode === 'frame') return 'frame';
    return mode === 'mosaic' && hasBase ? 'blur' : mode;
  }

  /* ---------- style / svg filter ---------- */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
[${ATTR_ID}]:not([${ATTR_RECT}]) { transition: filter 140ms ease; }
[${ATTR_ID}][${ATTR_MODE}="solid"]:not([${ATTR_RECT}]) { color: transparent !important; }
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
   * だから領域はブロック内でのオフセットぶんも含めて張る必要がある。
   */
  function ensurePixelFilter(block, spanW, spanH) {
    const bw = bucket(spanW + block * 4);
    const bh = bucket(spanH + block * 4);
    if (bw > 8192 || bh > 8192) return null;   // 大きすぎる。呼び出し側でぼかしに逃がす
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

  /* ---------- 要素への適用 ---------- */

  function isOurs(node) {
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!el || !el.closest) return false;
    if (el.id === UI_ID || el.id === DEFS_ID || el.id === STYLE_ID) return true;
    return !!el.closest(`#${UI_ID}, #${DEFS_ID}, [${ATTR_ID}]`);
  }

  function paint(el, mode) {
    const imp = 'important';
    if (mode === 'frame') {
      el.style.setProperty('outline', `${settings.frameWidth}px solid ${settings.frameColor}`, imp);
      el.style.setProperty('outline-offset', `${settings.framePad}px`, imp);
      el.style.setProperty('border-radius', `${settings.frameRadius}px`, imp);
      return;
    }
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

  function titleFor(mode) {
    if (settings.lock) return '';
    return mode === 'frame'
      ? t('titleRemoveBox', 'Click to remove the box')
      : t('titleRemove', 'Click to remove');
  }

  function register(el, kind, mode) {
    const id = `uwr${++seq}`;
    records.set(id, {
      el,
      kind,
      mode,
      prevStyle: el.getAttribute('style'),
      prevTitle: el.getAttribute('title')
    });
    el.setAttribute(ATTR_ID, id);
    el.setAttribute(ATTR_MODE, mode);
    const t = titleFor(mode);
    if (t) el.setAttribute('title', t);
    el.addEventListener('click', onClick, true);
    return id;
  }

  function applyTo(el, { mode, wrapped = false } = {}) {
    if (el.hasAttribute(ATTR_ID)) return null;
    ensureStyle();
    const m = resolveMode(mode);
    const id = register(el, wrapped ? 'wrap' : 'element', m);
    paint(el, m);
    return id;
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

    if (rec.kind === 'rect') { el.remove(); return; }

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
    return n;
  }

  // 折り返しが変わるとモザイクのフィルタ領域が足りなくなるので張り直す
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const rec of records.values()) {
        if (rec.kind !== 'rect' && rec.mode === 'mosaic') paint(rec.el, 'mosaic');
      }
    }, 200);
  });

  /* ---------- 矩形（ウィンドウ基準の絶対座標） ---------- */

  const RECT_BASE =
    'position:fixed !important;margin:0 !important;padding:0 !important;' +
    'box-sizing:border-box !important;display:block !important;float:none !important;' +
    'transform:none !important;opacity:1 !important;visibility:visible !important;' +
    'clip-path:none !important;mask:none !important;z-index:2147483600 !important;';

  function applyRect(r, mode) {
    ensureStyle();
    const m = resolveMode(mode);
    const el = document.createElement('div');
    el.setAttribute(ATTR_RECT, '');
    document.documentElement.appendChild(el);
    const id = register(el, 'rect', m);
    paintRect(el, m, r);
    return id;
  }

  function paintRect(el, mode, r) {
    const pad = mode === 'frame' ? settings.framePad : 0;
    const left = r.left - pad;
    const top = r.top - pad;
    const width = r.width + pad * 2;
    const height = r.height + pad * 2;

    let look;
    if (mode === 'frame') {
      look = `border:${settings.frameWidth}px solid ${settings.frameColor} !important;` +
             `border-radius:${settings.frameRadius}px !important;background:transparent !important;`;
    } else if (mode === 'solid') {
      look = 'background:#000 !important;border:0 !important;border-radius:2px !important;';
    } else if (mode === 'blur') {
      look = `backdrop-filter:blur(${settings.blurPx}px) !important;` +
             `-webkit-backdrop-filter:blur(${settings.blurPx}px) !important;` +
             'background:transparent !important;border:0 !important;border-radius:2px !important;';
    } else {
      const id = ensurePixelFilter(settings.mosaicPx, width, height);
      const fn = id ? `url(#${id})` : `blur(${settings.blurPx}px)`;
      look = `backdrop-filter:${fn} !important;-webkit-backdrop-filter:${fn} !important;` +
             'background:transparent !important;border:0 !important;border-radius:2px !important;';
    }

    const hit = settings.lock
      ? 'pointer-events:none !important;'
      : 'pointer-events:auto !important;cursor:pointer !important;';

    el.setAttribute('style',
      RECT_BASE + hit + look +
      `left:${Math.round(left)}px !important;top:${Math.round(top)}px !important;` +
      `width:${Math.round(width)}px !important;height:${Math.round(height)}px !important;`);
  }

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

    let count = 0;
    for (const range of ranges) {
      splitBoundaries(range);
      for (const node of outermostNodes(range)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const span = document.createElement('span');
          span.setAttribute(ATTR_WRAP, '');
          node.parentNode.insertBefore(span, node);
          span.appendChild(node);
          if (applyTo(span, { mode, wrapped: true })) count++;
        } else if (applyTo(node, { mode })) {
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
    startPicker(mode);   // srcset や背景画像で特定できなければピッカーに逃がす
    return 0;
  }

  /* ---------- 画面上のUI（ピッカー / 矩形ドラッグ） ---------- */

  let overlay = null;   // 終了処理を入れておく

  function makeOverlay(hint, interactive) {
    const host = document.createElement('div');
    host.id = UI_ID;
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;' +
      (interactive ? 'cursor:crosshair;' : 'pointer-events:none;');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `
<style>
  .box { position:fixed; border:2px solid #4c8dff; background:rgba(76,141,255,.16);
         border-radius:3px; display:none; pointer-events:none; }
  .bar { position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
         font:13px/1.6 system-ui,"Segoe UI","Yu Gothic UI",sans-serif; color:#fff;
         background:rgba(20,22,28,.92); padding:8px 14px; border-radius:8px;
         box-shadow:0 4px 16px rgba(0,0,0,.35); white-space:nowrap; pointer-events:none; }
  .bar b { color:#8fb8ff; font-weight:600; }
</style>
<div class="box"></div><div class="bar">${hint}</div>`;
    (document.body || document.documentElement).appendChild(host);
    return { host, box: sr.querySelector('.box') };
  }

  function closeOverlay() {
    if (!overlay) return;
    const done = overlay;
    overlay = null;
    done();
  }

  const modeLabel = (m) => t({
    mosaic: 'modeMosaic', blur: 'modeBlur', solid: 'modeSolid', frame: 'modeFrame'
  }[m], { mosaic: 'Pixelate', blur: 'Blur', solid: 'Black out', frame: 'Red box' }[m] || m);

  function startPicker(mode) {
    if (overlay) return;
    ensureStyle();
    const m = resolveMode(mode);
    const { host, box } = makeOverlay(
      `<b>${modeLabel(m)}</b> — ${t('hintPick', 'click to apply / ↑ parent ↓ child / Esc to cancel')}`,
      false);

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
      if (ev.key === 'Escape') { ev.preventDefault(); closeOverlay(); return; }
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
      closeOverlay();
      if (el && el.isConnected) applyTo(el, { mode: m });
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onPick, true);
    window.addEventListener('scroll', draw, true);
    window.addEventListener('resize', draw, true);
    overlay = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onPick, true);
      window.removeEventListener('scroll', draw, true);
      window.removeEventListener('resize', draw, true);
      host.remove();
    };
  }

  function startRect(mode) {
    if (overlay) return;
    ensureStyle();
    const m = resolveMode(mode);
    const { host, box } = makeOverlay(
      `<b>${modeLabel(m)}</b> — ${t('hintRect', 'drag to box it / as many as you like / Esc to finish')}`,
      true);

    let start = null;
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
      show({ left: ev.clientX, top: ev.clientY, width: 0, height: 0 });
    };
    const onMove = (ev) => { if (start) show(rectOf(ev)); };
    const onUp = (ev) => {
      if (!start) return;
      const r = rectOf(ev);
      start = null;
      box.style.display = 'none';
      if (r.width >= 6 && r.height >= 6) applyRect(r, m);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeOverlay(); }
    };

    host.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    document.addEventListener('keydown', onKey, true);
    overlay = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('keydown', onKey, true);
      host.remove();
    };
  }

  /* ---------- messaging ---------- */

  function handle(msg) {
    switch (msg && msg.type) {
      case 'apply-selection': return { count: applySelection(msg.mode) };
      case 'apply-src':       return { count: applyBySrc(msg.srcUrl, msg.mode) };
      case 'pick':            startPicker(msg.mode); return { ok: true };
      case 'rect':            startRect(msg.mode); return { ok: true };
      case 'reveal-all':      closeOverlay(); return { count: releaseAll() };
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
    handle, applySelection, applyTo, applyRect, startPicker, startRect, closeOverlay, releaseAll,
    get settings() { return settings; },
    set settings(v) { settings = { ...settings, ...v }; }
  };
})();
