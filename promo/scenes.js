/* 宣材用の場面づくり。?shot=1..4 で内容を切り替える。
   出てくる人物・メール・キー・請求番号はすべて架空。 */

const PEOPLE = [
  ['Ava Lindqvist', 'ava.lindqvist@lumen-demo.test', 'Owner', '2 min ago', '#5b8dff', '#9a6cff'],
  ['Marco Bianchi', 'marco.bianchi@lumen-demo.test', 'Admin', '18 min ago', '#ff9a3c', '#ff5f6d'],
  ['Priya Raman', 'priya.raman@lumen-demo.test', 'Developer', '1 hour ago', '#3ccf91', '#2f9fd8'],
  ['Tom Okabe', 'tom.okabe@lumen-demo.test', 'Developer', '3 hours ago', '#f7c948', '#f0813c'],
  ['Sofia Duarte', 'sofia.duarte@lumen-demo.test', 'Billing', 'Yesterday', '#c56cff', '#5b8dff'],
  ['Nils Berg', 'nils.berg@lumen-demo.test', 'Viewer', '2 days ago', '#57708f', '#8fa6c4']
];

const CAPTIONS = {
  1: ['Hide anything before you share a screenshot',
      'Drag over it. Block size adjustable from 3 to 40 px.'],
  2: ['Drag a box over whatever should not be seen',
      'Boxes sit at fixed window coordinates. Scrolling never moves them.'],
  3: ['Put a red box around what you want people to look at',
      'Width, padding, corner radius and colour are all adjustable.'],
  4: ['Switch the style whenever you prefer',
      'Pixelate keeps the shape. Blur and black out are one click away.']
};

const table = document.getElementById('members');
for (const [name, mail, role, seen, c1, c2] of PEOPLE) {
  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td><div class="who"><span class="av" style="background:linear-gradient(135deg,${c1},${c2})"></span>${name}</div></td>` +
    `<td class="mail">${mail}</td><td><span class="tag">${role}</span></td><td>${seen}</td>`;
  table.appendChild(tr);
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot') || '1';
document.getElementById('capTitle').textContent = CAPTIONS[shot][0];
document.getElementById('capSub').textContent = CAPTIONS[shot][1];

const api = window.__ultimateWebRedactor;
const set = (o) => { api.settings = o; };
const base = { mode: 'hide', hideStyle: 'mosaic', mosaicPx: 9, blurPx: 8,
               frameWidth: 5, framePad: 5, frameRadius: 0, frameColor: '#ff2d2d', lock: true };

/** 画面座標で矩形を置く */
const box = (sel, mode, pad = 0) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  api.applyRect({ left: r.left - pad, top: r.top - pad,
                  width: r.width + pad * 2, height: r.height + pad * 2 }, mode);
};

if (shot === '1') {
  set({ ...base, mosaicPx: 8 });
  for (const td of document.querySelectorAll('#members .mail')) api.applyTo(td, { mode: 'hide' });
  for (const el of ['#k1', '#k2']) api.applyTo(document.querySelector(el), { mode: 'hide' });
  set({ ...base, hideStyle: 'solid' });
  api.applyTo(document.getElementById('spend'), { mode: 'hide' });
  const f = document.createElement('iframe');
  f.id = 'popup';
  f.src = '../src/popup.html';
  document.body.appendChild(f);
}

if (shot === '2') {
  set({ ...base, mosaicPx: 10 });
  box('#members tr:nth-child(2)', 'hide');
  box('#members tr:nth-child(3)', 'hide');
  // ドラッグ中の見た目を作る
  api.startRect('hide');
  const host = document.getElementById('uwr-ui');
  const b = host.shadowRoot.querySelector('.box');
  const r = document.querySelector('#members tr:nth-child(4)').getBoundingClientRect();
  b.style.display = 'block';
  b.style.left = `${r.left}px`;
  b.style.top = `${r.top}px`;
  b.style.width = `${r.width}px`;
  b.style.height = `${r.height + 30}px`;
}

if (shot === '3') {
  set({ ...base, mode: 'frame', frameWidth: 4, framePad: 6, frameRadius: 6 });
  box('.keys', 'frame');
  set({ ...base, mode: 'frame', frameWidth: 4, framePad: 4, frameRadius: 6, frameColor: '#ff2d2d' });
  box('.cards .card:nth-child(3)', 'frame');
}

if (shot === '4') {
  const rows = [...document.querySelectorAll('#members tr')].slice(1, 5);
  const modes = ['hide', 'hide', 'hide', 'frame'];
  const styles = ['mosaic', 'blur', 'solid', 'mosaic'];
  const names = ['Pixelate', 'Blur', 'Black out', 'Red box'];
  rows.forEach((tr, i) => {
    const cell = tr.querySelector('.mail');
    set({ ...base, mode: modes[i], hideStyle: styles[i], mosaicPx: 9, blurPx: 7, frameWidth: 3, framePad: 3, frameRadius: 4 });
    api.applyTo(cell, { mode: modes[i] });
    const last = tr.lastElementChild;
    last.innerHTML = `<span style="color:#2f5fbf;font-weight:600">${names[i]}</span>`;
  });
}
