// Sprawdza tłumaczenia: każdy napis w t('…') / tn(n, '…', '…', '…') w src/ musi mieć wpis w słowniku angielskim
// (src/i18n/en/*.js). Pokazuje też wpisy słownika, których nikt nie używa.
// Uruchomienie: node scripts/i18n-check.mjs [plik-lub-katalog …]   (bez argumentów — cały src/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictDir = path.join(root, 'src/i18n/en');
const dict = {};
for (const f of fs.readdirSync(dictDir)) {
  if (!/^(ui\d|model|scene|app)\.js$/.test(f)) continue;
  const mod = await import(pathToFileURL(path.join(dictDir, f)).href);
  for (const [k, v] of Object.entries(mod.default)) {
    if (k in dict && dict[k] !== v) console.log(`RÓŻNE TŁUMACZENIA (${f}): ${JSON.stringify(k)}\n   ${JSON.stringify(dict[k])}\n   ${JSON.stringify(v)}`);
    dict[k] = v;
  }
}

const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : p.endsWith('.js') ? [p] : []);
const targets = process.argv.slice(2).length ? process.argv.slice(2).map((p) => path.resolve(p)) : [path.join(root, 'src')];
const files = targets.flatMap(walk).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`) && !f.endsWith(`${path.sep}i18n.js`));

// literał: '…' "…" albo `…` bez ${}
const LIT = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\`(?:[^\`\\$]|\\.|\$(?!\{))*\`)`;
const unquote = (s) => {
  const q = s[0];
  const body = s.slice(1, -1);
  if (q === '`') return body.replace(/\\`/g, '`').replace(/\\\\/g, '\\');
  return JSON.parse(q === '"' ? s : `"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
};
const reT = new RegExp(String.raw`\bt\(\s*` + LIT, 'g');
const reTn = new RegExp(String.raw`\btn\([^,]+,\s*` + LIT + String.raw`\s*,\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g');

const used = new Set();
let missing = 0;
let dynamic = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  const keys = [];
  for (const m of src.matchAll(reT)) keys.push([m[1], m.index]);
  for (const m of src.matchAll(reTn)) keys.push([m[1], m.index], [m[2], m.index], [m[3], m.index]);
  // t( z czymś innym niż literał (zmienna, szablon z ${}) — do ręcznego sprawdzenia
  for (const m of src.matchAll(/\bt\(\s*(?!['"`])([A-Za-z_$][\w.$]*)/g)) dynamic++;
  for (const [lit, idx] of keys) {
    let key;
    try {
      key = unquote(lit);
    } catch {
      continue;
    }
    used.add(key);
    if (!(key in dict)) {
      missing++;
      const line = src.slice(0, idx).split('\n').length;
      console.log(`BRAK  ${rel}:${line}  ${JSON.stringify(key)}`);
    }
  }
}
const unusedCount = Object.keys(dict).filter((k) => !used.has(k)).length;
console.log(`\nKlucze w słowniku: ${Object.keys(dict).length}, użyte w sprawdzonych plikach: ${used.size}, brakujące: ${missing}` +
  (process.argv.slice(2).length ? '' : `, nieużywane: ${unusedCount}`) + `, t(zmienna): ${dynamic}`);
process.exitCode = missing ? 1 : 0;
