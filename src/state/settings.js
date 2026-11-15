// Ustawienia programu (koło zębate na pasku albo menu pod awatarem): dotyczą osoby, nie projektu — zapisywane
// w tej przeglądarce (localStorage), a po zalogowaniu także na koncie (main.js), nie w pliku projektu.
// Gdy przeglądarka nie pozwala na zapis, działają do odświeżenia strony.
//
//  highlight — kolor zaznaczonych elementów w 3D (korpus, front, blenda, nóżki),
//  units     — jednostki w wymiarach na widoku 3D (mm / cm / m).

const STORAGE_KEY = 'furnitureDesigner.settings';

export const HIGHLIGHT_PRESETS = [
  { hex: '#22c55e', name: 'zielony' },
  { hex: '#3b82f6', name: 'niebieski' },
  { hex: '#a855f7', name: 'fioletowy' },
  { hex: '#eab308', name: 'żółty' },
  { hex: '#f97316', name: 'pomarańczowy' },
];
export const UNITS = [
  { key: 'mm', label: 'milimetry (mm)' },
  { key: 'cm', label: 'centymetry (cm)' },
  { key: 'm', label: 'metry (m)' },
];
export const DEFAULT_SETTINGS = { highlight: '#22c55e', units: 'mm' };

// Ustawienia z zapisu (przeglądarka, konto) → tylko poprawne wartości, reszta domyślna.
export function normalizeSettings(raw) {
  return {
    highlight: /^#[0-9a-f]{6}$/i.test(raw?.highlight ?? '') ? raw.highlight.toLowerCase() : DEFAULT_SETTINGS.highlight,
    units: UNITS.some((u) => u.key === raw?.units) ? raw.units : DEFAULT_SETTINGS.units,
  };
}

function load() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current = load();
const listeners = new Set();

export const getSettings = () => current;

// meta.fromAccount — ustawienia wczytane z konta (nie trzeba ich odsyłać z powrotem na konto).
export function setSettings(patch, meta = {}) {
  current = normalizeSettings({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* bez zapisu — ustawienia działają do odświeżenia strony */
  }
  listeners.forEach((fn) => fn(current, meta));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Długość (mm) w wybranych jednostkach, np. 1234.5 → „1234,5 mm” / „123,45 cm” / „1,235 m”.
export function formatLength(mm, units = current.units) {
  const [value, digits] = units === 'cm' ? [mm / 10, 2] : units === 'm' ? [mm / 1000, 3] : [mm, 1];
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: digits, useGrouping: false })} ${units}`;
}
