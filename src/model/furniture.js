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

// Sposób łączenia wieńca z bokami.
//  inset   — wieniec między bokami, boki na całą wysokość,
//  overlay — wieniec na całą szerokość korpusu; boki stoją na wieńcu dolnym / wieniec górny leży na bokach.
export const JOINT_TYPES = {
  bottom: [
    { key: 'inset', label: 'Między bokami' },
    { key: 'overlay', label: 'Pod bokami (boki stoją na wieńcu)' },
  ],
  top: [
    { key: 'inset', label: 'Między bokami' },
    { key: 'overlay', label: 'Na bokach (leży na bokach)' },
  ],
};

// Elementy korpusu. `thicknessAxis` — oś, wzdłuż której mierzymy grubość płyty.
export const PANEL_DEFS = [
  { key: 'left', name: 'Bok lewy', thicknessAxis: 'x' },
  { key: 'right', name: 'Bok prawy', thicknessAxis: 'x' },
  { key: 'bottom', name: 'Wieniec dolny', thicknessAxis: 'y' },
  { key: 'top', name: 'Wieniec górny', thicknessAxis: 'y' },
  { key: 'back', name: 'Plecy', thicknessAxis: 'z' },
];

// Ręczne zmiany elementu: wymiary (sx, sy, sz) i przesunięcia (dx, dy, dz) w osiach X/Y/Z.
// Element jest domyślnie powiązany z korpusem: jego wymiary (poza grubością) wynikają z wymiarów
// korpusu, a ich zmiana zmienia korpus (patrz resizePanelLinked). Flaga `free` odłącza element —
// wtedy ręczne wymiary dotyczą tylko jego.
export const OVERRIDE_KEYS = ['sx', 'sy', 'sz', 'dx', 'dy', 'dz'];

const AXIS_PROP = { x: 'width', y: 'height', z: 'depth' };

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
    bottomJoint: 'inset',
    topJoint: 'inset',
    color: DEFAULT_CABINET_COLOR,
    panelOverrides: {},
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
//  - boki i wieńce łączone zgodnie z bottomJoint / topJoint (patrz JOINT_TYPES),
//  - plecy: HDF nakładany z tyłu na cały korpus albo płyta wpuszczona między boki i wieńce.
// Grubość każdego elementu może być zmieniona ręcznie — sąsiednie elementy się do niej dopasowują.
// Pozostałe ręczne zmiany (wymiary, przesunięcia) nakładane są na końcu.
export function cabinetPanels(cabinet) {
  const { width: W, height: H, depth: D, backType } = cabinet;
  const ov = cabinet.panelOverrides ?? {};
  const thick = (key, fallback = cabinet.thickness) => {
    const axis = PANEL_DEFS.find((p) => p.key === key).thicknessAxis;
    return ov[key]?.[`s${axis}`] ?? fallback;
  };

  const tL = thick('left');
  const tR = thick('right');
  const tB = thick('bottom');
  const tT = thick('top');

  // Połączenia wieńców z bokami: zakres boków w pionie i wieńców w poziomie.
  const bottomOverlay = cabinet.bottomJoint === 'overlay';
  const topOverlay = cabinet.topJoint === 'overlay';
  const sideY0 = bottomOverlay ? tB : 0;
  const sideH = (topOverlay ? H - tT : H) - sideY0;
  const span = (overlay) => (overlay ? [0, W] : [tL, W - tL - tR]); // [x, szerokość] wieńca

  // Domyślne bryły: [x, y, z, sx, sy, sz] względem narożnika korpusu.
  // Wieniec górny i dolny różnią się tylko pozycją w pionie i sposobem łączenia.
  const base = {};
  const [bx, bw] = span(bottomOverlay);
  const [tx, tw] = span(topOverlay);
  if (backType === 'board') {
    const tK = thick('back');
    base.left = [0, sideY0, 0, tL, sideH, D];
    base.right = [W - tR, sideY0, 0, tR, sideH, D];
    // Plecy siedzą między wieńcami (w pionie), więc wieńce mają pełną głębokość.
    base.bottom = [bx, 0, 0, bw, tB, D];
    base.top = [tx, H - tT, 0, tw, tT, D];
    base.back = [tL, tB, 0, W - tL - tR, H - tB - tT, tK];
  } else {
    const b = backType === 'hdf' ? thick('back', HDF_THICKNESS) : 0;
    base.left = [0, sideY0, b, tL, sideH, D - b];
    base.right = [W - tR, sideY0, b, tR, sideH, D - b];
    base.bottom = [bx, 0, b, bw, tB, D - b];
    base.top = [tx, H - tT, b, tw, tT, D - b];
    if (b) base.back = [0, 0, 0, W, H, b];
  }

  const panels = [];
  for (const def of PANEL_DEFS) {
    if (!base[def.key]) continue;
    const [x, y, z, sx, sy, sz] = base[def.key];
    const o = ov[def.key] ?? {};
    // Ręczny wymiar obowiązuje zawsze dla grubości; dla pozostałych osi — tylko w elemencie niezależnym.
    const size = (axis, auto) => (axis === def.thicknessAxis || o.free ? (o[`s${axis}`] ?? auto) : auto);
    const overridden = OVERRIDE_KEYS.filter(
      (k) => o[k] != null && (k[0] === 'd' || k[1] === def.thicknessAxis || o.free),
    );
    const panel = {
      key: def.key,
      name: def.name,
      kind: def.key === 'back' && backType === 'hdf' ? 'hdf' : 'board',
      thicknessAxis: def.thicknessAxis,
      x: cabinet.x + x + (o.dx ?? 0),
      y: cabinet.y + y + (o.dy ?? 0),
      z: cabinet.z + z + (o.dz ?? 0),
      width: size('x', sx),
      height: size('y', sy),
      depth: size('z', sz),
      free: !!o.free,
      overridden,
    };
    panel.valid = panel.width > 0 && panel.height > 0 && panel.depth > 0;
    panels.push(panel);
  }
  return panels;
}

// Zmiana wymiaru elementu powiązanego (oś inna niż grubość) przekłada się na wymiar korpusu,
// dzięki czemu wszystkie pozostałe elementy dopasowują się automatycznie.
// Np. szerokość boku (Z) → głębokość korpusu, długość wieńca (X) → szerokość korpusu.
// Zwraca nowy korpus albo null, jeśli korpus wyszedłby poza dozwolony zakres.
export function resizePanelLinked(cabinet, key, axis, value) {
  const prop = AXIS_PROP[axis];
  const panel = cabinetPanels(cabinet).find((p) => p.key === key);
  if (!panel) return null;
  const next = cabinet[prop] + (value - panel[prop]);
  if (next < CABINET_LIMITS.sizeMin || next > CABINET_LIMITS.sizeMax) return null;
  return { ...cabinet, [prop]: next };
}

// Wymiary formatki: długość × szerokość × grubość (dwa większe wymiary + najmniejszy).
export function panelCutSize(panel) {
  const [thickness, width, length] = [panel.width, panel.height, panel.depth].sort((a, b) => a - b);
  return { length, width, thickness };
}

// Prostopadłościan obejmujący wszystkie płyty korpusu (po ręcznych zmianach może wystawać poza korpus).
export function cabinetBounds(cabinet) {
  const panels = cabinetPanels(cabinet).filter((p) => p.valid);
  if (!panels.length) return cabinet;
  const min = (f) => Math.min(...panels.map(f));
  const max = (f) => Math.max(...panels.map(f));
  const x = min((p) => p.x);
  const y = min((p) => p.y);
  const z = min((p) => p.z);
  return {
    x,
    y,
    z,
    width: max((p) => p.x + p.width) - x,
    height: max((p) => p.y + p.height) - y,
    depth: max((p) => p.z + p.depth) - z,
  };
}

// Lista problemów z korpusem (pusta = wszystko w porządku).
export function cabinetIssues(cabinet, project) {
  const { space, furniture } = project;
  const issues = [];
  const panels = cabinetPanels(cabinet);

  const invalid = panels.filter((p) => !p.valid).map((p) => p.name);
  if (invalid.length) issues.push(`Za mały korpus albo za grube płyty: ${invalid.join(', ')}.`);

  const valid = panels.filter((p) => p.valid);
  const overlapping = [];
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++)
      if (boxesOverlap(valid[i], valid[j])) overlapping.push(`${valid[i].name} i ${valid[j].name}`);
  if (overlapping.length) issues.push(`Elementy nachodzą na siebie: ${overlapping.join('; ')}.`);

  const bounds = cabinetBounds(cabinet);
  if (!boxCorners(bounds).every((p) => isPointInside(p, space))) {
    issues.push(
      slopePlanes(space).length
        ? 'Wychodzi poza przestrzeń (sprawdź też skosy).'
        : 'Wychodzi poza przestrzeń.',
    );
  }
  const hitObstacles = space.obstacles.filter((o) => boxesOverlap(bounds, o)).map((o) => o.name || 'przeszkoda');
  if (hitObstacles.length) issues.push(`Koliduje z: ${hitObstacles.join(', ')}.`);

  const hitCabinets = furniture
    .filter((c) => c.id !== cabinet.id && boxesOverlap(bounds, cabinetBounds(c)))
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

  const panelOverrides = {};
  for (const { key } of PANEL_DEFS) {
    const src = raw.panelOverrides?.[key];
    if (!src || typeof src !== 'object') continue;
    const o = {};
    for (const k of OVERRIDE_KEYS) {
      if (src[k] !== null && Number.isFinite(Number(src[k]))) o[k] = num(src[k], 0, -sizeMax, sizeMax);
    }
    if (src.free === true) o.free = true;
    if (Object.keys(o).length) panelOverrides[key] = o;
  }

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
    bottomJoint: raw.bottomJoint === 'overlay' ? 'overlay' : 'inset',
    topJoint: raw.topJoint === 'overlay' ? 'overlay' : 'inset',
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_CABINET_COLOR,
    panelOverrides,
  };
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
