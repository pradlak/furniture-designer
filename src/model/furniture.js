import { LIMITS, isPointInside, slopePlanes } from './space.js';

// Mebel (na razie: prosty korpus) — wymiary w mm, w układzie współrzędnych przestrzeni.
// Pozycja (x, y, z) to narożnik lewy‑dolny‑tylny korpusu (z = odległość pleców od tylnej ściany).

export const BOARD_THICKNESSES = [12, 16, 18, 22, 25, 28, 36];
export const DEFAULT_THICKNESS = 18;
export const HDF_THICKNESS = 3;
export const DEFAULT_CABINET_COLOR = '#d2b48c';

export const BACK_TYPES = [
  { key: 'hdf', label: `HDF ${HDF_THICKNESS} mm (nakładane)` },
  { key: 'board', label: 'Z płyty (wpuszczane)' },
  { key: 'none', label: 'Brak' },
];

export const CABINET_LIMITS = { sizeMin: 50, sizeMax: LIMITS.spaceMax };

export function createCabinet(project, overrides = {}) {
  const { space, furniture } = project;
  const width = Math.min(800, space.width);
  const depth = Math.min(560, space.depth);

  // Stawiamy obok ostatniego mebla, jeśli się zmieści; inaczej w lewym narożniku.
  const rightmost = Math.max(0, ...furniture.map((c) => c.x + c.width));
  const x = rightmost + width <= space.width ? rightmost : 0;
  const height = Math.min(2000, Math.floor(maxHeightAt(space, x, 0, width, depth)));

  return {
    id: newId(),
    name: `Korpus ${furniture.length + 1}`,
    x,
    y: 0,
    z: 0,
    width,
    height: Math.max(CABINET_LIMITS.sizeMin, height),
    depth,
    thickness: DEFAULT_THICKNESS,
    backType: 'hdf',
    color: DEFAULT_CABINET_COLOR,
    ...overrides,
  };
}

// Największa wysokość, jaką może mieć bryła o podstawie (x, z, w, d) stojąca na wysokości y0,
// żeby nie wyjść ponad sufit ani przez skosy.
export function maxHeightAt(space, x, z, w, d, y0 = 0) {
  let top = space.height;
  for (const { normal: [a, b, c], offset } of slopePlanes(space)) {
    for (const px of [x, x + w])
      for (const pz of [z, z + d]) top = Math.min(top, (offset - a * px - c * pz) / b);
  }
  return top - y0;
}

// Wypełnia całą wnękę; wysokość obniżona tak, żeby korpus zmieścił się pod skosami.
export function fitCabinetToSpace(cabinet, space) {
  return {
    ...cabinet,
    x: 0,
    y: 0,
    z: 0,
    width: space.width,
    depth: space.depth,
    height: Math.max(CABINET_LIMITS.sizeMin, Math.floor(maxHeightAt(space, 0, 0, space.width, space.depth))),
  };
}

// Rozkład korpusu na płyty. Każda płyta: prostopadłościan w układzie przestrzeni.
//  - boki na całą wysokość,
//  - wieńce (górny i dolny) między bokami,
//  - plecy: HDF nakładany z tyłu na cały korpus albo płyta wpuszczona między boki i wieńce.
export function cabinetPanels(cabinet) {
  const { width: W, height: H, depth: D, thickness: t, backType } = cabinet;
  const panels = [];
  const add = (name, kind, x, y, z, width, height, depth) => {
    if (width > 0 && height > 0 && depth > 0) {
      panels.push({ name, kind, x: cabinet.x + x, y: cabinet.y + y, z: cabinet.z + z, width, height, depth });
    }
  };

  if (backType === 'board') {
    add('Bok lewy', 'board', 0, 0, 0, t, H, D);
    add('Bok prawy', 'board', W - t, 0, 0, t, H, D);
    add('Wieniec dolny', 'board', t, 0, t, W - 2 * t, t, D - t);
    add('Wieniec górny', 'board', t, H - t, t, W - 2 * t, t, D - t);
    add('Plecy', 'board', t, t, 0, W - 2 * t, H - 2 * t, t);
  } else {
    const b = backType === 'hdf' ? HDF_THICKNESS : 0;
    add('Bok lewy', 'board', 0, 0, b, t, H, D - b);
    add('Bok prawy', 'board', W - t, 0, b, t, H, D - b);
    add('Wieniec dolny', 'board', t, 0, b, W - 2 * t, t, D - b);
    add('Wieniec górny', 'board', t, H - t, b, W - 2 * t, t, D - b);
    if (b) add('Plecy', 'hdf', 0, 0, 0, W, H, b);
  }
  return panels;
}

// Wymiary formatki: długość × szerokość × grubość (dwa większe wymiary + najmniejszy).
export function panelCutSize(panel) {
  const [thickness, width, length] = [panel.width, panel.height, panel.depth].sort((a, b) => a - b);
  return { length, width, thickness };
}

// Lista problemów z korpusem (pusta = wszystko w porządku).
export function cabinetIssues(cabinet, project) {
  const { space, furniture } = project;
  const issues = [];
  const { width: W, height: H, depth: D, thickness: t } = cabinet;
  const back = cabinet.backType === 'hdf' ? HDF_THICKNESS : cabinet.backType === 'board' ? t : 0;

  if (W <= 2 * t || H <= 2 * t || D <= back) {
    issues.push('Korpus jest za mały dla wybranej grubości płyty.');
  }
  if (!boxCorners(cabinet).every((p) => isPointInside(p, space))) {
    issues.push(
      slopePlanes(space).length
        ? 'Wychodzi poza przestrzeń (sprawdź też skosy).'
        : 'Wychodzi poza przestrzeń.',
    );
  }
  const hitObstacles = space.obstacles.filter((o) => boxesOverlap(cabinet, o)).map((o) => o.name || 'przeszkoda');
  if (hitObstacles.length) issues.push(`Koliduje z: ${hitObstacles.join(', ')}.`);

  const hitCabinets = furniture
    .filter((c) => c.id !== cabinet.id && boxesOverlap(cabinet, c))
    .map((c) => c.name || 'mebel');
  if (hitCabinets.length) issues.push(`Nachodzi na: ${hitCabinets.join(', ')}.`);

  return issues;
}

function boxCorners(b) {
  const pts = [];
  for (const x of [b.x, b.x + b.width])
    for (const y of [b.y, b.y + b.height]) for (const z of [b.z, b.z + b.depth]) pts.push([x, y, z]);
  return pts;
}

// Prawdziwe nachodzenie (samo stykanie się ścianami nie jest kolizją).
function boxesOverlap(a, b, eps = 0.01) {
  return (
    a.x < b.x + b.width - eps &&
    b.x < a.x + a.width - eps &&
    a.y < b.y + b.height - eps &&
    b.y < a.y + a.height - eps &&
    a.z < b.z + b.depth - eps &&
    b.z < a.z + a.depth - eps
  );
}

export function normalizeCabinet(raw = {}) {
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const { sizeMin, sizeMax } = CABINET_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name : 'Korpus',
    x: num(raw.x, 0, -sizeMax, sizeMax),
    y: num(raw.y, 0, -sizeMax, sizeMax),
    z: num(raw.z, 0, -sizeMax, sizeMax),
    width: num(raw.width, 800, sizeMin, sizeMax),
    height: num(raw.height, 2000, sizeMin, sizeMax),
    depth: num(raw.depth, 560, sizeMin, sizeMax),
    thickness: num(raw.thickness, DEFAULT_THICKNESS, 1, 100),
    backType: BACK_TYPES.some((b) => b.key === raw.backType) ? raw.backType : 'hdf',
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_CABINET_COLOR,
  };
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
