// Biblioteka materiałów projektu (płyty). Każdy element mebla bierze z materiału grubość, kolor
// i obrzeże (taśma oklejająca krawędzie — ABS/PCV, zwykle 0,8–2 mm): grubość i kolor
// (edgeColor: null = taki sam jak płyta).
// Ten moduł nie importuje modelu mebli (żeby uniknąć zależności cyklicznych).
import { t } from '../i18n.js';

export const MATERIAL_TYPES = [
  { key: 'chipboard', label: t('Płyta meblowa (laminowana)') },
  { key: 'mdf', label: t('MDF lakierowany') },
  { key: 'hdf', label: 'HDF' },
  { key: 'worktop', label: t('Blat') },
  { key: 'other', label: t('Inny') },
];

export const MATERIAL_THICKNESSES = [3, 8, 12, 16, 18, 19, 22, 25, 28, 36, 38, 40];
export const EDGE_BANDING_OPTIONS = [0, 0.4, 0.8, 1, 2];
export const DEFAULT_EDGE_BANDING = 0.8;

// Kolor obrzeża materiału (domyślnie taki sam jak płyta).
export const edgeColorOf = (material) => material.edgeColor ?? material.color;

// Kolor krawędzi BEZ obrzeża: płyta meblowa i HDF mają laminat tylko na licach, a w krawędzi widać
// brązowy rdzeń; MDF lakierowany i blat mają wykończone także krawędzie (kolor płyty).
const CORE_COLORS = { chipboard: '#b48d5e', hdf: '#8b6b47' };
export const coreColorOf = (material) => CORE_COLORS[material.type] ?? material.color;

export function defaultMaterials() {
  return [
    { id: 'mat-white', name: t('Płyta biała 18'), type: 'chipboard', thickness: 18, color: '#f2f2ef', edgeBanding: DEFAULT_EDGE_BANDING, edgeColor: null },
    // cieńsza płyta, np. na półki (korpus 18 mm, półki 16 mm) albo dna i plecy szuflad z systemu
    { id: 'mat-white-16', name: t('Płyta biała 16'), type: 'chipboard', thickness: 16, color: '#f2f2ef', edgeBanding: DEFAULT_EDGE_BANDING, edgeColor: null },
    // kolor MDF wybiera się osobno przy blendach i frontach (np. kaszmirowy) — tu tylko kolor domyślny
    { id: 'mat-mdf-green', name: t('MDF lakierowany 18'), type: 'mdf', thickness: 18, color: '#5f7f5c', edgeBanding: 0 },
    { id: 'mat-hdf', name: t('HDF biały 3'), type: 'hdf', thickness: 3, color: '#ecebe6', edgeBanding: 0 },
    { ...DEFAULT_WORKTOP },
  ];
}

const DEFAULT_WORKTOP = {
  id: 'mat-worktop',
  name: t('Blat laminowany dąb 38'),
  type: 'worktop',
  thickness: 38,
  color: '#b8905e',
  texture: 'wood',
  edgeBanding: 0,
};

export function createMaterial() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `mat-${Date.now()}`,
    name: t('Nowy materiał'),
    type: 'chipboard',
    thickness: 18,
    color: '#d9d4c7',
    edgeBanding: DEFAULT_EDGE_BANDING,
    edgeColor: null,
  };
}

// Gdy projekt nie ma żadnego materiału danego rodzaju (albo nie ma projektu) — wartości zapasowe.
const FALLBACK = {
  chipboard: { id: null, name: t('Płyta 18'), type: 'chipboard', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  mdf: { id: null, name: t('MDF 18'), type: 'mdf', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  hdf: { id: null, name: t('HDF 3'), type: 'hdf', thickness: 3, color: '#e9e4da', edgeBanding: 0 },
  worktop: { id: null, name: t('Blat 38'), type: 'worktop', thickness: 38, color: '#b8905e', texture: 'wood', edgeBanding: 0 },
};

export const materialById = (project, id) => project?.materials?.find((m) => m.id === id) ?? null;
const firstOfType = (project, type) => project?.materials?.find((m) => m.type === type) ?? null;

// Materiał o podanym id, a jeśli go nie ma (np. usunięty) — pierwszy materiał danego rodzaju.
export function resolveMaterial(project, id, type) {
  return materialById(project, id) ?? firstOfType(project, type) ?? FALLBACK[type];
}

// --- Kolor niezależny od materiału ---
// Materiał (rodzaj, grubość, okleina) wybiera się osobno, a kolor osobno — przy każdym użyciu:
// korpus, blendy, fronty (cabinet.colors.body / blend / front), blenda wspólna i blat (trim.color).
// Kolor: { hex, name } albo null — jak w materiale. Nazwa koloru trafia do nazwy materiału na liście
// formatek („MDF lakierowany 18 — kaszmirowy”), więc różne kolory to osobne pozycje (i osobne pliki rozkroju).
export const COLOR_PRESETS = [
  { hex: '#f4f4f1', name: t('biały') },
  { hex: '#efe8d8', name: t('kremowy') },
  { hex: '#d6cbbd', name: t('kaszmirowy') },
  { hex: '#cdb89c', name: t('beżowy') },
  { hex: '#a99582', name: t('cappuccino') },
  { hex: '#c9cbcb', name: t('jasnoszary') },
  { hex: '#8f9396', name: t('szary') },
  { hex: '#3d4247', name: t('antracytowy') },
  { hex: '#1f1f1f', name: t('czarny') },
  { hex: '#9fae98', name: t('szałwiowy') },
  { hex: '#5f7f5c', name: t('zielony') },
  { hex: '#2f4f3e', name: t('butelkowa zieleń') },
  { hex: '#26334d', name: t('granatowy') },
  // dekory z fakturą (texture: wood — słoje, concrete — beton, marble — marmur; patrz scene/textures.js)
  { hex: '#c8a27a', name: t('dąb naturalny'), texture: 'wood' },
  { hex: '#ddc196', name: t('dąb jasny'), texture: 'wood' },
  { hex: '#8a6038', name: t('dąb ciemny'), texture: 'wood' },
  { hex: '#7a5537', name: t('orzech'), texture: 'wood' },
  { hex: '#d9a877', name: t('buk'), texture: 'wood' },
  { hex: '#e2d3b5', name: t('jesion'), texture: 'wood' },
  { hex: '#4a3426', name: t('wenge'), texture: 'wood' },
  { hex: '#9a9893', name: t('beton'), texture: 'concrete' },
  { hex: '#c3c0b9', name: t('beton jasny'), texture: 'concrete' },
  { hex: '#ece9e4', name: t('marmur biały'), texture: 'marble' },
  { hex: '#b9b8b4', name: t('marmur szary'), texture: 'marble' },
];

// Wzory (faktury) materiałów: jednolity kolor albo dekor.
export const TEXTURES = [
  { key: null, label: t('Jednolity kolor') },
  { key: 'wood', label: t('Drewno (słoje)') },
  { key: 'concrete', label: t('Beton') },
  { key: 'marble', label: t('Marmur') },
];
const isTexture = (t) => TEXTURES.some((x) => x.key && x.key === t);

const HEX = /^#[0-9a-f]{6}$/i;
// Kolor z pliku projektu → { hex, name } albo null.
export function normalizeColor(raw) {
  if (!raw || typeof raw !== 'object' || !HEX.test(raw.hex ?? '')) return null;
  const hex = raw.hex.toLowerCase();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : t('własny {hex}', { hex });
  return isTexture(raw.texture) ? { hex, name, texture: raw.texture } : { hex, name };
}

// Materiał w wybranym kolorze: kolor płyty i obrzeża, nazwa z kolorem; bez koloru — materiał bez zmian.
export function withColor(material, color) {
  if (!color) return material;
  // kolor jednolity zdejmuje fakturę materiału, dekor (np. dąb) ją ustawia
  return { ...material, color: color.hex, texture: color.texture ?? null, edgeColor: null, colorName: color.name, name: `${material.name} — ${color.name}` };
}

// Materiały korpusu: body — korpus, shelf — półki (domyślnie jak korpus, np. korpus 18 mm, półki 16 mm),
// blend — blendy boczne, front — fronty (domyślnie jak blendy), hdf — plecy HDF.
// Każdy w kolorze wybranym dla korpusu (cabinet.colors), jeśli jest wybrany; półki — w kolorze korpusu.
export function cabinetMaterials(cabinet, project) {
  const body = resolveMaterial(project, cabinet.materialId, 'chipboard');
  const shelf = materialById(project, cabinet.shelfMaterialId) ?? body;
  const blend = materialById(project, cabinet.blendMaterialId) ?? firstOfType(project, 'mdf') ?? body;
  const front = materialById(project, cabinet.frontMaterialId) ?? blend;
  const colors = cabinet.colors ?? {};
  return {
    body: withColor(body, colors.body),
    shelf: withColor(shelf, colors.body),
    blend: withColor(blend, colors.blend),
    front: withColor(front, colors.front),
    frontBase: front, // materiał frontów bez koloru korpusu — pod kolor pojedynczego frontu
    blendBase: blend, // materiał blend bez koloru korpusu — pod kolor pojedynczej blendy bocznej

    hdf: resolveMaterial(project, null, 'hdf'),
  };
}

// Materiał blendy wspólnej (dolnej / górnej) albo blatu — w kolorze wybranym dla niej (trim.color).
// Blat może mieć własną grubość (trim.thickness; null — z materiału).
export function trimMaterial(trim, project) {
  const m = withColor(resolveMaterial(project, trim.materialId, trim.type === 'countertop' ? 'worktop' : 'mdf'), trim.color);
  const tk = trim.type === 'countertop' ? trim.thickness : null;
  return tk ? { ...m, thickness: tk, name: m.thickness === tk ? m.name : t('{name} (gr. {t} mm)', { name: m.name, t: tk }) } : m;
}

export function normalizeMaterials(raw) {
  if (!Array.isArray(raw) || !raw.length) return defaultMaterials();
  // Starsze projekty nie miały materiału na blat — dokładamy domyślny.
  if (!raw.some((m) => m?.type === 'worktop')) raw = [...raw, { ...DEFAULT_WORKTOP }];
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return raw
    .filter((m) => m && typeof m === 'object')
    .map((m, i) => ({
      id: typeof m.id === 'string' && m.id ? m.id : `mat-${i}-${Date.now()}`,
      name: typeof m.name === 'string' ? m.name : t('Materiał'),
      type: MATERIAL_TYPES.some((t) => t.key === m.type) ? m.type : 'other',
      thickness: num(m.thickness, 18, 1, 100),
      color: typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#d9d4c7',
      edgeBanding: num(m.edgeBanding, 0, 0, 5),
      edgeColor: typeof m.edgeColor === 'string' && /^#[0-9a-f]{6}$/i.test(m.edgeColor) ? m.edgeColor : null,
      ...(isTexture(m.texture) ? { texture: m.texture } : {}),
      // materiał zapisany na koncie (biblioteka) — identyfikator na koncie, do aktualizacji
      ...(typeof m.cloudId === 'string' && /^[\w-]{1,40}$/.test(m.cloudId) ? { cloudId: m.cloudId } : {}),
    }));
}
