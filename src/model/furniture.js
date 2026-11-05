import { LIMITS, isPointInside, slopePlanes } from './space.js';

// Mebel (na razie: prosty korpus) — wymiary w mm, w układzie współrzędnych przestrzeni.
// Pozycja (x, y, z) to narożnik lewy‑dolny‑tylny całego mebla (z = odległość pleców od tylnej ściany).
// Jeśli mebel ma nóżki, korpus zaczyna się na wysokości y + wysokość nóżek;
// `height` to zawsze wysokość samego korpusu (bez nóżek).

export const BOARD_THICKNESSES = [12, 16, 18, 22, 25, 28, 36];
export const DEFAULT_THICKNESS = 18;
export const HDF_THICKNESS = 3;
export const DEFAULT_CABINET_COLOR = '#d2b48c';

export const LEG_DIAMETER = 40;
export const LEG_INSET = 50; // odległość osi nóżki od krawędzi korpusu
export const LEG_HEIGHTS = [50, 80, 100, 120, 150];
export const LEG_LIMITS = { min: 10, max: 500 };

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

// Blendy boczne (osobno dla lewej i prawej strony).
//  plinth — cokół boczny: płyta pod korpusem w płaszczyźnie boku, zasłania nóżki z boku,
//  full   — panel boczny na pełną wysokość (od podłogi do góry korpusu), przy boku korpusu,
//  filler — listwa w płaszczyźnie frontu przy boku (wypełnia szczelinę do ściany);
//           opcjonalnie (wallPanel) z panelem na pełną wysokość po zewnętrznej stronie listwy,
//           przylegającym do ściany: korpus → listwa → panel → ściana.
export const SIDE_BLEND_TYPES = [
  { key: 'none', label: 'Brak' },
  { key: 'plinth', label: 'Cokół boczny (pod korpusem)' },
  { key: 'full', label: 'Panel na pełną wysokość' },
  { key: 'filler', label: 'Listwa z przodu (przy ścianie)' },
];

// Elementy korpusu. `thicknessAxis` — oś, wzdłuż której mierzymy grubość płyty
// (dla listwy przy ścianie grubość jest w osi Z — patrz cabinetPanels).
export const PANEL_DEFS = [
  { key: 'left', name: 'Bok lewy', thicknessAxis: 'x' },
  { key: 'right', name: 'Bok prawy', thicknessAxis: 'x' },
  { key: 'bottom', name: 'Wieniec dolny', thicknessAxis: 'y' },
  { key: 'top', name: 'Wieniec górny', thicknessAxis: 'y' },
  { key: 'back', name: 'Plecy', thicknessAxis: 'z' },
  { key: 'plinth', name: 'Blenda dolna', thicknessAxis: 'z' },
  { key: 'blendLeft', name: 'Blenda lewa', thicknessAxis: 'x' },
  { key: 'blendRight', name: 'Blenda prawa', thicknessAxis: 'x' },
  { key: 'wallPanelLeft', name: 'Panel lewy (przy ścianie)', thicknessAxis: 'x' },
  { key: 'wallPanelRight', name: 'Panel prawy (przy ścianie)', thicknessAxis: 'x' },
];

// Ręczne zmiany elementu: wymiary (sx, sy, sz) i przesunięcia (dx, dy, dz) w osiach X/Y/Z.
// Element jest domyślnie powiązany z korpusem: jego wymiary (poza grubością) wynikają z wymiarów
// korpusu, a ich zmiana zmienia korpus (patrz resizePanelLinked). Flaga `free` odłącza element —
// wtedy ręczne wymiary dotyczą tylko jego.
export const OVERRIDE_KEYS = ['sx', 'sy', 'sz', 'dx', 'dy', 'dz'];

const AXIS_PROP = { x: 'width', y: 'height', z: 'depth' };

export const CABINET_LIMITS = { sizeMin: 50, sizeMax: LIMITS.spaceMax };

export function defaultAccessories() {
  return {
    legs: { enabled: false, height: 100 },
    plinth: { enabled: false, setback: 20 },
    sideBlends: {
      left: { type: 'none', width: 50, wallPanel: false },
      right: { type: 'none', width: 50, wallPanel: false },
    },
  };
}

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
    ...defaultAccessories(),
    panelOverrides: {},
    ...overrides,
  };
}

export const legHeight = (cabinet) => (cabinet.legs?.enabled ? cabinet.legs.height : 0);

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

// Wypełnia całą wnękę razem z blendami bocznymi; wysokość korpusu obniżona o nóżki
// i tak, żeby mebel zmieścił się pod skosami.
export function fitCabinetToSpace(cabinet, space) {
  // Ile elementy (np. panele boczne, listwy) wystają poza korpus z każdej strony.
  const b = cabinetBounds(cabinet);
  const extraL = cabinet.x - b.x;
  const extraR = b.x + b.width - (cabinet.x + cabinet.width);
  const extraBack = cabinet.z - b.z;
  const extraFront = b.z + b.depth - (cabinet.z + cabinet.depth);
  const height = Math.floor(maxHeightAt(space, 0, 0, space.width, space.depth)) - legHeight(cabinet);
  const { sizeMin } = CABINET_LIMITS;
  return {
    ...cabinet,
    x: extraL,
    y: 0,
    z: extraBack,
    width: Math.max(sizeMin, space.width - extraL - extraR),
    depth: Math.max(sizeMin, space.depth - extraBack - extraFront),
    height: Math.max(sizeMin, height),
  };
}

// Rozkład mebla na płyty. Każda płyta: prostopadłościan w układzie przestrzeni.
//  - boki i wieńce łączone zgodnie z bottomJoint / topJoint (patrz JOINT_TYPES),
//  - plecy: HDF nakładany z tyłu na cały korpus albo płyta wpuszczona między boki i wieńce,
//  - blenda dolna (przed nóżkami) i blendy boczne (patrz SIDE_BLEND_TYPES).
// Grubość każdego elementu może być zmieniona ręcznie — sąsiednie elementy się do niej dopasowują.
// Pozostałe ręczne zmiany (wymiary, przesunięcia) nakładane są na końcu.
export function cabinetPanels(cabinet) {
  const { width: W, height: H, depth: D, backType } = cabinet;
  const ov = cabinet.panelOverrides ?? {};
  const thickAt = (key, axis, fallback = cabinet.thickness) => ov[key]?.[`s${axis}`] ?? fallback;
  const thick = (key, fallback) => thickAt(key, PANEL_DEFS.find((p) => p.key === key).thicknessAxis, fallback);

  const L = legHeight(cabinet);
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

  // Domyślne bryły: [x, y, z, sx, sy, sz] względem narożnika korpusu (y = 0 na spodzie korpusu).
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
  // Korpus stoi na nóżkach.
  for (const k of Object.keys(base)) base[k][1] += L;

  // --- blendy ---
  const blends = cabinet.sideBlends ?? {};
  const blendKey = { left: 'blendLeft', right: 'blendRight' };
  const wallPanelKey = { left: 'wallPanelLeft', right: 'wallPanelRight' };
  const thicknessAxis = {}; // dla elementów, w których oś grubości zależy od wariantu
  const fillerWidth = (side) => (blends[side]?.type === 'filler' ? blends[side].width : 0);
  const wL = fillerWidth('left');
  const wR = fillerWidth('right');

  // Blenda dolna — przed nóżkami, na całą szerokość (razem z listwami przy ścianie).
  let plinthBack = D; // tylna krawędź blendy dolnej (do niej sięgają cokoły boczne)
  if (L > 0 && cabinet.plinth?.enabled) {
    const tP = thick('plinth');
    const front = D - cabinet.plinth.setback;
    plinthBack = front - tP;
    base.plinth = [-wL, 0, plinthBack, W + wL + wR, L, tP];
  }

  for (const side of ['left', 'right']) {
    const key = blendKey[side];
    const type = blends[side]?.type;
    if (type === 'plinth' && L > 0) {
      const t = thickAt(key, 'x');
      base[key] = [side === 'left' ? 0 : W - t, 0, 0, t, L, plinthBack];
    } else if (type === 'full') {
      const t = thickAt(key, 'x');
      base[key] = [side === 'left' ? -t : W, 0, 0, t, L + H, D];
    } else if (type === 'filler') {
      const t = thickAt(key, 'z');
      const w = fillerWidth(side);
      thicknessAxis[key] = 'z';
      base[key] = [side === 'left' ? -w : W, L, D - t, w, H, t];

      // Panel przy ścianie — za listwą, od podłogi do góry, na całą głębokość.
      if (blends[side].wallPanel) {
        const pk = wallPanelKey[side];
        const tp = thickAt(pk, 'x');
        base[pk] = [side === 'left' ? -w - tp : W + w, 0, 0, tp, L + H, D];
      }
    }
  }

  const panels = [];
  for (const def of PANEL_DEFS) {
    if (!base[def.key]) continue;
    const axis = thicknessAxis[def.key] ?? def.thicknessAxis;
    const [x, y, z, sx, sy, sz] = base[def.key];
    const o = ov[def.key] ?? {};
    // Ręczny wymiar obowiązuje zawsze dla grubości; dla pozostałych osi — tylko w elemencie niezależnym.
    const size = (a, auto) => (a === axis || o.free ? (o[`s${a}`] ?? auto) : auto);
    const overridden = OVERRIDE_KEYS.filter((k) => o[k] != null && (k[0] === 'd' || k[1] === axis || o.free));
    const side = { blendLeft: 'left', blendRight: 'right' }[def.key] ?? null;
    const panel = {
      key: def.key,
      name: def.name,
      kind: def.key === 'back' && backType === 'hdf' ? 'hdf' : 'board',
      thicknessAxis: axis,
      side,
      blendType: side ? blends[side].type : null,
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

// Nóżki: 4 w narożnikach (oś LEG_INSET mm od krawędzi), przy szerokich korpusach dodatkowa para
// pośrodku. Przednie nóżki stoją za blendą dolną.
export function cabinetLegs(cabinet) {
  const L = legHeight(cabinet);
  if (!L) return [];
  const { width: W, depth: D } = cabinet;
  const plinth = cabinetPanels(cabinet).find((p) => p.key === 'plinth');
  const frontLimit = plinth ? plinth.z - cabinet.z : D;

  const xs = W > 1000 ? [LEG_INSET, W / 2, W - LEG_INSET] : [LEG_INSET, W - LEG_INSET];
  const zBack = LEG_INSET;
  const zFront = frontLimit - LEG_INSET;
  const zs = zFront > zBack ? [zBack, zFront] : [frontLimit / 2];

  return xs.flatMap((x) =>
    zs.map((z) => ({ x: cabinet.x + x, y: cabinet.y, z: cabinet.z + z, diameter: LEG_DIAMETER, height: L })),
  );
}

// Ścieżka w obiekcie korpusu, której dotyczy zmiana wymiaru powiązanego elementu w danej osi.
function linkedTarget(panel, axis) {
  if (axis === 'y' && (panel.key === 'plinth' || panel.blendType === 'plinth')) return 'legs.height';
  if (axis === 'x' && panel.blendType === 'filler') return `sideBlends.${panel.side}.width`;
  return AXIS_PROP[axis];
}

const LINKED_LIMITS = {
  'legs.height': [LEG_LIMITS.min, LEG_LIMITS.max],
  'sideBlends.left.width': [1, CABINET_LIMITS.sizeMax],
  'sideBlends.right.width': [1, CABINET_LIMITS.sizeMax],
};

// Zmiana wymiaru elementu powiązanego (oś inna niż grubość) przekłada się na wymiar korpusu
// (albo wysokość nóżek / szerokość listwy), dzięki czemu pozostałe elementy dopasowują się same.
// Np. szerokość boku (Z) → głębokość korpusu, długość wieńca (X) → szerokość korpusu,
// wysokość blendy dolnej (Y) → wysokość nóżek.
// Zwraca nowy korpus albo null, jeśli wartość wyszłaby poza dozwolony zakres.
export function resizePanelLinked(cabinet, key, axis, value) {
  const panel = cabinetPanels(cabinet).find((p) => p.key === key);
  if (!panel) return null;
  const path = linkedTarget(panel, axis);
  const next = getPath(cabinet, path) + (value - panel[AXIS_PROP[axis]]);
  const [min, max] = LINKED_LIMITS[path] ?? [CABINET_LIMITS.sizeMin, CABINET_LIMITS.sizeMax];
  if (next < min || next > max) return null;
  return setPath(cabinet, path, next);
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// Niemutująca zmiana zagnieżdżonego pola, np. setPath(c, 'legs.height', 120).
export function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  return { ...obj, [head]: rest.length ? setPath(obj[head] ?? {}, rest.join('.'), value) : value };
}

// Wymiary formatki: długość × szerokość × grubość (dwa większe wymiary + najmniejszy).
export function panelCutSize(panel) {
  const [thickness, width, length] = [panel.width, panel.height, panel.depth].sort((a, b) => a - b);
  return { length, width, thickness };
}

// Prostopadłościan obejmujący wszystkie płyty i nóżki mebla.
export function cabinetBounds(cabinet) {
  const boxes = [
    ...cabinetPanels(cabinet).filter((p) => p.valid),
    ...cabinetLegs(cabinet).map((l) => ({
      x: l.x - l.diameter / 2,
      y: l.y,
      z: l.z - l.diameter / 2,
      width: l.diameter,
      height: l.height,
      depth: l.diameter,
    })),
  ];
  if (!boxes.length) return cabinet;
  const min = (f) => Math.min(...boxes.map(f));
  const max = (f) => Math.max(...boxes.map(f));
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
  const def = defaultAccessories();

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

  const sideBlend = (src = {}, d) => ({
    type: SIDE_BLEND_TYPES.some((t) => t.key === src.type) ? src.type : d.type,
    width: num(src.width, d.width, 1, sizeMax),
    wallPanel: src.wallPanel === true,
  });

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
    legs: {
      enabled: raw.legs?.enabled === true,
      height: num(raw.legs?.height, def.legs.height, LEG_LIMITS.min, LEG_LIMITS.max),
    },
    plinth: {
      enabled: raw.plinth?.enabled === true,
      setback: num(raw.plinth?.setback, def.plinth.setback, 0, sizeMax),
    },
    sideBlends: {
      left: sideBlend(raw.sideBlends?.left, def.sideBlends.left),
      right: sideBlend(raw.sideBlends?.right, def.sideBlends.right),
    },
    panelOverrides,
  };
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
