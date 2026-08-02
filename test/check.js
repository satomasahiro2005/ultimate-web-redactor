// 各ファイルの整合を機械的に見る
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const en = JSON.parse(read('_locales/en/messages.json'));
const ja = JSON.parse(read('_locales/ja/messages.json'));
const a = Object.keys(en), b = Object.keys(ja);
const diff = a.filter((k) => !b.includes(k)).concat(b.filter((k) => !a.includes(k)));
console.log(`locale keys: en=${a.length} ja=${b.length} diff=${diff.join(',') || 'none'}`);

const html = read('src/popup.html');
const js = read('src/popup.js');
const content = read('src/content.js');

const usedI18n = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
const contentI18n = [...content.matchAll(/(?<![A-Za-z])t\('([^']+)'/g)].map((m) => m[1]);
const allUsed = [...new Set([...usedI18n, ...contentI18n])];
console.log('i18n missing:', allUsed.filter((k) => !a.includes(k)).join(',') || 'none');

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const needed = [...js.matchAll(/\bel\('([^']+)'\)/g)].map((m) => m[1]);
const sliders = (js.match(/const SLIDERS = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
const dyn = sliders.flatMap((k) => [k, `${k}Out`]);
const missing = [...new Set([...needed, ...dyn])].filter((k) => !ids.includes(k));
console.log('el() missing ids:', missing.join(',') || 'none');

const man = JSON.parse(read('manifest.json'));
console.log('version:', man.version);
for (const [k, v] of Object.entries(man.commands)) {
  console.log('  cmd', k, '->', v.suggested_key ? v.suggested_key.default : '(none)');
}
