import { newId, cabinetBounds } from './furniture.js';
import { t } from '../i18n.js';

// Dekoracje — obiekty tylko do wyglądu w 3D (nie trafiają do formatek, kolizji ani zamówień): lampy, kwiatek,
// okno, obraz, książki, dywan.
//
// JAK DODAĆ NOWĄ DEKORACJĘ (dwa kroki):
//  1. tutaj — wpis w DECOR_TYPES: key (unikalny), label, icon, category (klucz z DECOR_CATEGORIES), size [szer., wys.,
//     gł. w mm], place ('floor' — podłoga, 'top' — na meblu, 'wall' — na ścianie, 'ceiling' — z sufitu), color (domyślny),
//     opcjonalnie keywords (słowa do wyszukiwarki w menu);
//  2. w scene/buildDecorations.js — funkcja rysująca w DECOR_BUILDERS[key] (bez niej — prosty prostopadłościan).
// Menu „Dodaj → Dekoracje”, okienko ustawień, lista obiektów, zapis w projekcie i przeciąganie działają same.
//
// project.decorations = [{ id, type, name, x, y, z, width, height, depth, rotation,
// color }] — x, y, z (mm) to środek podstawy obiektu (dla obiektów na ścianie: środek, przy ścianie), rotation —
// obrót wokół pionu (stopnie), color — kolor główny (abażur, rama, doniczka…) albo null (domyślny).

// kategorie w menu (kolejność wyświetlania)
export const DECOR_CATEGORIES = [
  { key: 'light', label: t('Oświetlenie') },
  { key: 'plants', label: t('Rośliny') },
  { key: 'wall', label: t('Na ścianie') },
  { key: 'kitchen', label: t('Kuchnia') },
  { key: 'accessories', label: t('Akcesoria') },
  { key: 'floor', label: t('Podłoga') },
];

export const DECOR_TYPES = [
  { key: 'lampFloor', label: t('Lampa stojąca'), icon: '🛋️', category: 'light', size: [450, 1600, 450], place: 'floor', color: '#f5efe0', keywords: t('podłogowa') },
  { key: 'lampPendant', label: t('Lampa wisząca'), icon: '💡', category: 'light', size: [400, 700, 400], place: 'ceiling', color: '#1f2937', keywords: t('sufitowa żyrandol') },
  { key: 'lampWallArm', label: t('Kinkiet z ramieniem (abażur z wikliny)'), icon: '🏮', category: 'light', size: [260, 420, 480], place: 'wall', color: '#b08d57', keywords: t('kinkiet ścienna lampka mosiądz rattan wiklina ramię') },
  { key: 'lampTable', label: t('Lampka na meblu'), icon: '🪔', category: 'light', size: [260, 450, 260], place: 'top', color: '#f5efe0', keywords: t('nocna biurkowa') },
  { key: 'plant', label: t('Kwiatek w doniczce'), icon: '🪴', category: 'plants', size: [450, 900, 450], place: 'floor', color: '#e7e1d3', keywords: t('roślina') },
  { key: 'plantSmall', label: t('Mały kwiatek (na meblu)'), icon: '🌱', category: 'plants', size: [180, 300, 180], place: 'top', color: '#c2410c', keywords: t('roślina doniczka') },
  { key: 'window', label: t('Okno'), icon: '🪟', category: 'wall', size: [1200, 1400, 80], place: 'wall', color: '#ffffff', keywords: t('parapet') },
  { key: 'picture', label: t('Obraz'), icon: '🖼️', category: 'wall', size: [700, 500, 30], place: 'wall', color: '#7c5a36', keywords: t('rama plakat') },
  { key: 'potFiller', label: t('Pot filler (składana bateria ścienna)'), icon: '🚰', category: 'kitchen', size: [600, 290, 140], place: 'wall', color: '#c9a54a', keywords: t('bateria kran ścienny składany mosiądz złoty garnek kuchnia') },
  { key: 'kitchenRobot', label: t('Robot kuchenny wielofunkcyjny (z naczyniem do gotowania na parze)'), icon: '🍲', category: 'kitchen', size: [340, 480, 330], place: 'top', color: '#f3f4f6', keywords: t('thermomix termomiks robot blender kuchnia mikser parowar') },
  { key: 'books', label: t('Książki'), icon: '📚', category: 'accessories', size: [300, 240, 200], place: 'top', color: null },
  { key: 'rug', label: t('Dywan'), icon: '🟫', category: 'floor', size: [1600, 10, 2300], place: 'floor', color: '#a8a29e', keywords: t('chodnik') },
];
// dekoracje pogrupowane wg kategorii (puste kategorie pominięte; dekoracja bez kategorii — „Inne”)
export function decorsByCategory() {
  const known = new Set(DECOR_CATEGORIES.map((c) => c.key));
  const groups = DECOR_CATEGORIES.map((c) => ({ ...c, items: DECOR_TYPES.filter((t) => t.category === c.key) }));
  const other = DECOR_TYPES.filter((t) => !known.has(t.category));
  if (other.length) groups.push({ key: 'other', label: t('Inne'), items: other });
  return groups.filter((g) => g.items.length);
}
export const decorType = (key) => DECOR_TYPES.find((t) => t.key === key) ?? DECOR_TYPES[0];

const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function normalizeDecoration(raw = {}) {
  const t = decorType(raw.type);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    type: t.key,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : t.label,
    x: num(raw.x, 500, -20000, 40000),
    y: num(raw.y, 0, -20000, 40000),
    z: num(raw.z, 300, -20000, 40000),
    width: num(raw.width, t.size[0], 5, 10000),
    height: num(raw.height, t.size[1], 2, 10000),
    depth: num(raw.depth, t.size[2], 2, 10000),
    rotation: num(raw.rotation, 0, -360, 360),
    color: isHex(raw.color) ? raw.color : null,
    keepRatio: raw.keepRatio !== false, // zmiana jednego wymiaru skaluje pozostałe (proporcje)
    hidden: raw.hidden === true,
  };
}

// Nowa dekoracja w sensownym miejscu: na podłodze — na środku pokoju (bliżej przodu); na ścianie — na tylnej
// ścianie (okno 85 cm nad podłogą, obraz wyżej); pod sufitem — z sufitu; na meblu — na wierzchu zaznaczonego
// (albo pierwszego) korpusu / samodzielnego blatu; wolne miejsca obok innych dekoracji.
export function createDecoration(project, type, { onCabinetId = null } = {}) {
  const t = decorType(type);
  const { space } = project;
  const [w, h, d] = t.size;
  const count = (project.decorations ?? []).filter((x) => x.type === t.key).length;
  let x = space.width / 2 + count * 150;
  let y = 0;
  let z = space.depth * 0.6;
  if (t.place === 'wall') {
    z = 0;
    y = t.key === 'window' ? 850 : 1400;
  } else if (t.place === 'ceiling') {
    y = space.height - h;
  } else if (t.place === 'top') {
    const cab = project.furniture.find((c) => c.id === onCabinetId) ?? project.furniture[0];
    if (cab) {
      const b = cabinetBounds(cab, project);
      const top = (project.trims ?? []).filter((tr) => tr.type === 'countertop' && tr.cabinetIds.includes(cab.id)).length ? 38 : 0;
      x = b.x + b.width / 2 + count * 80;
      y = b.y + b.height + top;
      z = b.z + Math.min(b.depth / 2, 200);
    } else {
      y = 0;
    }
  }
  return normalizeDecoration({ type: t.key, name: `${t.label}${count ? ` ${count + 1}` : ''}`, x, y, z, width: w, height: h, depth: d, color: null });
}

// --- wyśrodkowanie dekoracji między sąsiadami ---
// Sąsiedzi: ściany, korpusy, przeszkody (okap, kominek), samodzielne płyty, blaty na szafkach i inne dekoracje.
// axis 'h' — poziomo: w połowie między najbliższym sąsiadem z lewej i z prawej (na ścianie bocznej — wzdłuż niej),
// 'v' — pionowo (dekoracje na ścianie / pod sufitem): w połowie między tym, co pod spodem, a tym, co nad nią.
// → { pos: { x | z | y }, label: 'między … a …' } albo null (już na środku / brak miejsca).
export function centerDecoration(project, id, axis, { trimBox, boardBox } = {}) {
  const d = (project.decorations ?? []).find((x) => x.id === id);
  if (!d) return null;
  const { space } = project;
  const rot = ((Math.round(d.rotation ?? 0) % 360) + 360) % 360;
  const side = rot === 90 || rot === 270; // na ścianie bocznej (obrót ±90°) — oś pozioma to z
  const ha = side ? 'z' : 'x';
  const DIM = { x: 'width', y: 'height', z: 'depth' };
  // zasięg dekoracji (prostopadłościan): x, z — środek podstawy, szerokość wzdłuż osi poziomej
  const half = d.width / 2;
  const me = {
    x: side ? d.x - d.depth / 2 : d.x - half,
    width: side ? d.depth : d.width,
    z: side ? d.z - half : d.z,
    depth: side ? d.width : d.depth,
    y: d.y,
    height: d.height,
  };
  if (!side && decorType(d.type).place !== 'wall') me.z = d.z - d.depth / 2;
  const boxes = [
    ...project.furniture.filter((c) => !c.hidden).map((c) => ({ box: cabinetBounds(c, project), label: t('korpusem „{name}”', { name: c.name }) })),
    ...space.obstacles.map((o) => ({ box: o, label: `„${o.name || t('przeszkodą')}”` })),
    ...(boardBox ? (project.boards ?? []).filter((b) => !b.hidden).map((b) => ({ box: boardBox(b, project), label: `„${b.name}”` })) : []),
    ...(trimBox ? (project.trims ?? []).filter((tr) => tr.type === 'countertop' && !tr.hidden).map((tr) => ({ box: trimBox(tr, project), label: t('blatem „{name}”', { name: tr.name }) })).filter((x) => x.box) : []),
    ...(project.decorations ?? [])
      .filter((x) => x.id !== id && !x.hidden && decorType(x.type).key !== 'rug')
      .map((x) => ({ box: { x: x.x - x.width / 2, width: x.width, y: x.y, height: x.height, z: decorType(x.type).place === 'wall' ? x.z : x.z - x.depth / 2, depth: x.depth }, label: `„${x.name}”` })),
  ];
  const overlap = (b, k) => b[k] < me[k] + me[DIM[k]] - 0.5 && b[k] + b[DIM[k]] > me[k] + 0.5;
  if (axis === 'h') {
    const others = ['x', 'y', 'z'].filter((k) => k !== ha);
    const near = boxes.filter(({ box }) => others.every((k) => overlap(box, k) || (k === 'z' && !side && box.z < me.z + me.depth + 400) || (k === 'x' && side && box.x < me.x + me.width + 400)));
    const c0 = me[ha] + me[DIM[ha]] / 2;
    let lo = { v: 0, label: side ? t('tylną ścianą') : t('lewą ścianą') };
    let hi = { v: side ? space.depth : space.width, label: side ? t('przodem') : t('prawą ścianą') };
    for (const { box, label } of near) {
      const a = box[ha];
      const b = box[ha] + box[DIM[ha]];
      if (b <= c0 && b > lo.v) lo = { v: b, label };
      if (a >= c0 && a < hi.v) hi = { v: a, label };
    }
    if (hi.v - lo.v < me[DIM[ha]]) return null;
    const mid = Math.round((lo.v + hi.v) / 2);
    if (Math.abs(mid - c0) < 0.5) return null;
    return { pos: { [ha]: mid }, label: t('między {a} a {b}', { a: lo.label, b: hi.label }) };
  }
  // pionowo — tylko dekoracje na ścianie / pod sufitem
  if (!['wall', 'ceiling'].includes(decorType(d.type).place)) return null;
  const near = boxes.filter(({ box }) => overlap(box, ha) && (side ? box.x < me.x + me.width + 400 : box.z < me.z + me.depth + 400));
  let lo = { v: 0, label: t('podłogą') };
  let hi = { v: space.height, label: t('sufitem') };
  for (const { box, label } of near) {
    const top = box.y + box.height;
    if (top <= me.y + 0.5 && top > lo.v) lo = { v: top, label };
    if (box.y >= me.y + me.height - 0.5 && box.y < hi.v) hi = { v: box.y, label };
  }
  if (hi.v - lo.v < me.height) return null;
  const y = Math.round((lo.v + hi.v) / 2 - me.height / 2);
  if (Math.abs(y - me.y) < 0.5) return null;
  return { pos: { y }, label: t('między {a} a {b}', { a: lo.label, b: hi.label }) };
}
