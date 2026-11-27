// Polskie strony statyczne (o programie, poradniki, polityka prywatności): znaczniki hreflang (pl / en / x-default)
// i link „English” w nagłówku — na podstawie mapy adresów src/i18n/paths.js. Można uruchamiać wielokrotnie.
// Strony z generatora (scripts/landing-pages.mjs) mają to w szablonie.
// Uruchomienie: node scripts/hreflang.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from '../src/i18n/paths.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meblesamemu.pl';
const GENERATED = new Set(['/projektant-szaf', '/szafa-na-skosy', '/projektant-kuchni', '/lista-formatek']);
const fileOf = (p) => path.join(root, 'public', p.endsWith('/') ? `${p}index.html` : `${p}.html`);

let changed = 0;
for (const [pl, en] of Object.entries(PATHS)) {
  if (pl === '/') continue; // strona programu — index.html (osobno)
  const f = fileOf(pl);
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  if (GENERATED.has(pl)) continue;
  const before = s;
  const tags =
    `<link rel="alternate" hreflang="pl" href="${SITE}${pl}" />\n` +
    `    <link rel="alternate" hreflang="en" href="${SITE}${en}" />\n` +
    `    <link rel="alternate" hreflang="x-default" href="${SITE}${pl}" />`;
  s = s.replace(/\s*<link rel="alternate" hreflang="[^"]+" href="[^"]*" \/>/g, '');
  s = s.replace(/(<link rel="canonical"[^>]*>)/, `$1\n    ${tags}`);
  // przełącznik języka w nagłówku
  s = s.replace(/\s*<a href="[^"]*" lang="en" hreflang="en"[^>]*>English<\/a>/, '');
  s = s.replace(/(<nav class="site-nav"[^>]*>[\s\S]*?)(\n\s*<\/nav>)/, `$1\n          <a href="${en}" lang="en" hreflang="en" class="lang-link">English</a>$2`);
  if (s !== before) {
    fs.writeFileSync(f, s);
    changed++;
  }
}
console.log(`hreflang: zaktualizowano ${changed} stron`);
