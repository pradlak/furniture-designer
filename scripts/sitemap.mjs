// public/sitemap.xml ze wszystkich stron z mapy adresów (src/i18n/paths.js): polskie i angielskie,
// każda z parą hreflang. Polityka prywatności (noindex) — pominięta. Data — dzisiejsza.
// Uruchomienie: node scripts/sitemap.mjs  (generator stron usługowych wywołuje go sam)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from '../src/i18n/paths.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meblesamemu.pl';
const today = new Date().toISOString().slice(0, 10);
const NOINDEX = new Set(['/polityka-prywatnosci']);

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
for (const [pl, en] of Object.entries(PATHS)) {
  if (NOINDEX.has(pl)) continue;
  for (const loc of [pl, en]) {
    xml += `  <url>\n    <loc>${SITE}${loc}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <xhtml:link rel="alternate" hreflang="pl" href="${SITE}${pl}" />\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}" />\n  </url>\n`;
  }
}
fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), `${xml}</urlset>\n`);
console.log(`public/sitemap.xml — ${(Object.keys(PATHS).length - NOINDEX.size) * 2} adresów`);
