// Tłumaczenia programu. Kluczem jest polski tekst — wersja polska działa bez słownika (t zwraca klucz),
// angielska (/en/, wejście src/main-en.js) najpierw rejestruje słownik (src/i18n/en/), a dopiero potem wczytuje
// program, więc t() działa także w stałych liczonych przy imporcie modułów.
//
//   t('Nowy projekt')                         → 'New project'
//   t('Szerokość {w} mm', { w: 600 })        → 'Width 600 mm'   ({nazwa} — wartości wstawiane po tłumaczeniu)
//   t('<b>Klik</b> — zaznacz korpus')         → klucze mogą zawierać HTML
//
// Bez DOM — moduł używany także w model/ (lista formatek, nazwy płyt, komunikaty).

let lang = 'pl';
const dict = new Map();

export const getLang = () => lang;
export const isEnglish = () => lang === 'en';

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'pl';
}

export function addTranslations(entries) {
  for (const [pl, en] of Object.entries(entries)) dict.set(pl, en);
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Tekst w bieżącym języku. Brak tłumaczenia — polski oryginał (w trybie deweloperskim ostrzeżenie w konsoli).
export function t(pl, vars) {
  if (lang === 'pl') return fill(pl, vars);
  const en = dict.get(pl);
  if (en === undefined) {
    if (import.meta.env?.DEV && !warned.has(pl)) {
      warned.add(pl);
      console.warn('[i18n] brak tłumaczenia:', pl);
    }
    return fill(pl, vars);
  }
  return fill(en, vars);
}
const warned = new Set();

// Liczba z odmianą: tn(n, 'półka', 'półki', 'półek') — po polsku 1 / 2–4 / 5+, po angielsku 1 / reszta
// (tłumaczenie formy pojedynczej — z klucza 1., mnogiej — z klucza 2.).
export function tn(n, one, few, many) {
  if (lang === 'en') return Math.abs(n) === 1 ? t(one) : t(few);
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (Math.abs(n) === 1) return one;
  return n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? few : many;
}

// Adres strony w bieżącym języku: '/poradniki/szafa-do-wneki' → '/en/guides/…' (mapa adresów — src/i18n/paths.js).
let pathMap = {};
export function setPathMap(map) {
  pathMap = map;
}
export function localPath(plPath) {
  if (lang === 'pl') return plPath;
  const [p, rest = ''] = plPath.split(/(?=[?#])/);
  return (pathMap[p] ?? (p === '/' ? '/en/' : p)) + rest;
}
