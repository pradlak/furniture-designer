import { outlineEdges, edgeLength } from './outline.js';
import { t } from '../i18n.js';

// Wykończenie pojedynczych ścian (tylko wygląd w 3D i orientacyjna liczba płytek):
// space.wallFinish = { [znacznik ściany]: { color: '#rrggbb' | null, tiles: null | {...} } }
// Znacznik — jak w outlineEdges: 'left', 'back', 'right' albo 'edge:<i>' (ściana z kształtu podłogi).
// color — własny kolor ściany (null — jak pozostałe ściany, space.colors.walls).
// tiles — płytki w pasie od wysokości `from` do `to` (mm od podłogi) na całej długości ściany:
//   width × height — wymiar płytki (mm), grout — szerokość fugi (mm), layout — 'grid' (prosto) albo 'brick'
//   (cegiełka, co drugi rząd przesunięty o pół płytki), color / groutColor — kolory płytki i fugi.

export const TILE_LIMITS = { sizeMin: 20, sizeMax: 3000, groutMax: 20 };
export const TILE_LAYOUTS = [
  { key: 'grid', label: t('Prosto (siatka)') },
  { key: 'brick', label: t('Cegiełka (co pół płytki)') },
];
// pas nad blatem kuchennym (typowo 90–150 cm), płytka 30 × 10 cm, biała, cegiełka
export const TILE_DEFAULTS = { from: 900, to: 1500, width: 300, height: 100, grout: 3, layout: 'brick', color: '#ffffff', groutColor: '#dedede' };

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function normalizeTiles(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = TILE_DEFAULTS;
  const L = TILE_LIMITS;
  const from = num(raw.from, d.from, 0, 20000);
  return {
    from,
    to: Math.max(from + 10, num(raw.to, d.to, 0, 20000)),
    width: num(raw.width, d.width, L.sizeMin, L.sizeMax),
    height: num(raw.height, d.height, L.sizeMin, L.sizeMax),
    grout: num(raw.grout, d.grout, 0, L.groutMax),
    layout: TILE_LAYOUTS.some((l) => l.key === raw.layout) ? raw.layout : d.layout,
    color: isHex(raw.color) ? raw.color : d.color,
    groutColor: isHex(raw.groutColor) ? raw.groutColor : d.groutColor,
  };
}

export function normalizeWallFinish(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [tag, f] of Object.entries(raw)) {
    if (!/^(left|right|back|edge:\d+)$/.test(tag) || !f) continue;
    const entry = { color: isHex(f.color) ? f.color : null, tiles: normalizeTiles(f.tiles) };
    if (entry.color || entry.tiles) out[tag] = entry;
  }
  return out;
}

export const wallFinishOf = (space, tag) => space.wallFinish?.[tag] ?? { color: null, tiles: null };

// Nowa przestrzeń ze zmienionym wykończeniem ściany (patch: { color } i/lub { tiles }); puste wpisy znikają.
export function setWallFinish(space, tag, patch) {
  const cur = wallFinishOf(space, tag);
  const next = { ...cur, ...patch };
  if (patch.tiles) next.tiles = normalizeTiles({ ...(cur.tiles ?? TILE_DEFAULTS), ...patch.tiles });
  const all = { ...(space.wallFinish ?? {}) };
  if (next.color || next.tiles) all[tag] = next;
  else delete all[tag];
  return { ...space, wallFinish: all };
}

// Ściany do wykończenia (zamknięte, widoczne): [{ tag, label, length }] — długość łączna odcinków ze znacznikiem.
const NAMES = { left: t('Ściana lewa'), back: t('Ściana tylna'), right: t('Ściana prawa') };
export function wallList(space) {
  const map = new Map();
  let n = 0;
  for (const e of outlineEdges(space)) {
    if (e.open) continue;
    if (NAMES[e.tag] && space.walls?.[e.tag] === false) continue;
    const w = map.get(e.tag) ?? { tag: e.tag, label: NAMES[e.tag] ?? t('Ściana skośna {n}', { n: ++n }), length: 0 };
    w.length += edgeLength(e);
    map.set(e.tag, w);
  }
  return [...map.values()];
}
export const wallLabel = (space, tag) => wallList(space).find((w) => w.tag === tag)?.label ?? t('Ściana');

// Orientacyjna ilość płytek na ścianie: powierzchnia pasa (m²) i liczba płytek z 10% zapasu na docinki.
export function tilesEstimate(space, tag) {
  const t = wallFinishOf(space, tag).tiles;
  const w = wallList(space).find((x) => x.tag === tag);
  if (!t || !w) return null;
  const h = Math.max(0, Math.min(space.height, t.to) - t.from);
  const area = (w.length * h) / 1e6;
  const per = ((t.width + t.grout) * (t.height + t.grout)) / 1e6;
  return { area, count: per > 0 ? Math.ceil((area / per) * 1.1) : 0 };
}
