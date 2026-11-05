import { LIMITS, isPointInside, slopePlanes } from './space.js';
import { cabinetMaterials, trimMaterial } from './materials.js';

// Mebel (na razie: prosty korpus) — wymiary w mm, w układzie współrzędnych przestrzeni.
// Pozycja (x, y, z) to narożnik lewy‑dolny‑tylny całego mebla (z = odległość pleców od tylnej ściany).
// Jeśli mebel ma nóżki, korpus zaczyna się na wysokości y + wysokość nóżek;
// `height` to zawsze wysokość samego korpusu (bez nóżek).

export const BOARD_THICKNESSES = [12, 16, 18, 22, 25, 28, 36];

export const LEG_DIAMETER = 40;
export const LEG_INSET = 50; // odległość osi nóżki od krawędzi korpusu
export const LEG_HEIGHTS = [50, 80, 100, 120, 150];
export const LEG_LIMITS = { min: 10, max: 500 };

export const BACK_TYPES = [
  { key: 'hdf', label: 'HDF (nakładane)' },
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

// Góra korpusu: pełny wieniec albo dwa trawersy (poprzeczki pod blat) o zadanej szerokości.
export const TOP_TYPES = [
  { key: 'full', label: 'Pełny wieniec' },
  { key: 'rails', label: 'Dwa trawersy (pod blat)' },
];
export const DEFAULT_RAIL_WIDTH = 120;

// Poprzeczki usztywniające: pionowe listwy z płyty tuż przed plecami, między bokami.
// Mieszczą się w korpusie — nie zmieniają wymiarów mebla.
export const STIFFENER_POSITIONS = [
  { key: 'backTop', label: 'Tył – pod górą' },
  { key: 'backBottom', label: 'Tył – nad dołem' },
  { key: 'backAt', label: 'Tył – na wysokości…' },
];
export const DEFAULT_STIFFENER_HEIGHT = 100;

export function createStiffener(cabinet) {
  const used = new Set((cabinet.stiffeners ?? []).map((s) => s.position));
  const position = ['backTop', 'backBottom'].find((p) => !used.has(p)) ?? 'backAt';
  return { id: newId(), position, height: DEFAULT_STIFFENER_HEIGHT, y: Math.round(cabinet.height / 2) };
}

export const stiffenerKey = (s) => `stiff-${s.id}`;
const stiffenerName = (s) => `Poprzeczka ${{ backTop: 'tylna górna', backBottom: 'tylna dolna', backAt: 'tylna' }[s.position]}`;

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
  { key: 'railFront', name: 'Trawers przedni', thicknessAxis: 'y' },
  { key: 'railBack', name: 'Trawers tylny', thicknessAxis: 'y' },
  { key: 'back', name: 'Plecy', thicknessAxis: 'z' },
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
    sideBlends: {
      left: { ...defaultSideBlend() },
      right: { ...defaultSideBlend() },
    },
  };
}

// flushFront — panel boczny / listwa wysunięte do linii frontu (o grubość blendy górnej / frontu),
// extend     — ręczne wysunięcie do przodu, gdy flushFront jest wyłączone.
function defaultSideBlend() {
  return { type: 'none', width: 50, wallPanel: false, flushFront: false, extend: 0 };
}

// O ile panel boczny danej strony wystaje przed korpus.
export function sidePanelExtension(cabinet, side, project) {
  const sb = cabinet.sideBlends?.[side];
  if (!sb) return 0;
  return sb.flushFront ? cabinetContext(cabinet, project).frontThickness : sb.extend;
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
    materialId: project.materials?.find((m) => m.type === 'chipboard')?.id ?? null,
    blendMaterialId: project.materials?.find((m) => m.type === 'mdf')?.id ?? null,
    backType: 'hdf',
    bottomJoint: 'inset',
    topJoint: 'inset',
    topType: 'full',
    railWidth: DEFAULT_RAIL_WIDTH,
    stiffeners: [],
    ...defaultAccessories(),
    panelOverrides: {},
    ...overrides,
  };
}

export const legHeight = (cabinet) => (cabinet.legs?.enabled ? cabinet.legs.height : 0);

// --- blendy wspólne (blenda dolna, blenda górna) — patrz model/trims.js ---
// Tu tylko to, czego potrzebuje sam korpus, żeby się do nich dopasować.

export const trimCabinets = (trim, project) =>
  project.furniture.filter((c) => trim.cabinetIds.includes(c.id));

// Linia frontu blendy: najbardziej wysunięty front objętych korpusów.
export const trimFront = (trim, project) =>
  Math.max(...trimCabinets(trim, project).map((c) => c.z + c.depth));

// Wysokość blendy dolnej: ręczna (trim.height) albo automatyczna — nóżki − szczelina,
// a gdy objęte korpusy nie mają nóżek — PLINTH_DEFAULT_HEIGHT.
export const PLINTH_DEFAULT_HEIGHT = 80;
export function plinthHeight(trim, project) {
  if (trim.height != null) return trim.height;
  const cabs = trimCabinets(trim, project);
  const L = cabs.length ? Math.min(...cabs.map(legHeight)) : 0;
  return L > 0 ? L - trim.gap : PLINTH_DEFAULT_HEIGHT;
}

// Szerokość pasów frontu przy bokach korpusu (listwy przy ścianie) — blendy i cokoły je obejmują.
export function frontSpan(cabinet) {
  const w = (side) => (cabinet.sideBlends?.[side]?.type === 'filler' ? cabinet.sideBlends[side].width : 0);
  return [cabinet.x - w('left'), cabinet.x + cabinet.width + w('right')];
}

// Jak blendy wspólne wpływają na korpus:
//  plinthBack   — tylna krawędź blendy dolnej (względem korpusu): do niej sięgają cokoły boczne,
//                 a przednie nóżki stoją za nią,
//  plinthHeight — wysokość blendy dolnej (cokół boczny ma taką samą).
export function cabinetContext(cabinet, project) {
  const trims = project?.trims ?? [];
  const plinth = trims.find((t) => t.type === 'plinth' && t.cabinetIds.includes(cabinet.id));
  const L = legHeight(cabinet);
  // Grubość warstwy frontu: blenda górna, jeśli obejmuje korpus; inaczej zakładamy front z płyty korpusu.
  const topBlend = trims.find((t) => t.type === 'topBlend' && t.cabinetIds.includes(cabinet.id));
  // (gdy nie ma blendy górnej — grubość materiału blend/frontów korpusu)
  const frontThickness = topBlend
    ? trimMaterial(topBlend, project).thickness
    : cabinetMaterials(cabinet, project).blend.thickness;
  const ctx = { plinthBack: null, plinthHeight: null, frontThickness };
  if (plinth && L > 0) {
    ctx.plinthBack = trimFront(plinth, project) - plinth.setback - trimMaterial(plinth, project).thickness - cabinet.z;
    ctx.plinthHeight = plinthHeight(plinth, project);
  }
  return ctx;
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

// Wypełnia całą wnękę razem z blendami bocznymi; wysokość korpusu obniżona o nóżki
// i tak, żeby mebel zmieścił się pod skosami.
export function fitCabinetToSpace(cabinet, project) {
  const { space } = project;
  // Ile elementy (np. panele boczne, listwy) wystają poza korpus z każdej strony.
  const b = cabinetBounds(cabinet, project);
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
//  - blendy boczne (patrz SIDE_BLEND_TYPES), dopasowane do blendy dolnej
//    obejmujących korpus (te są osobnymi elementami projektu — model/trims.js).
// Grubość każdego elementu może być zmieniona ręcznie — sąsiednie elementy się do niej dopasowują.
// Pozostałe ręczne zmiany (wymiary, przesunięcia) nakładane są na końcu.
// `project` jest potrzebny tylko do dopasowania do blend wspólnych (może go nie być).
export function cabinetPanels(cabinet, project) {
  const { width: W, height: H, depth: D, backType } = cabinet;
  const ctx = cabinetContext(cabinet, project);
  const ov = cabinet.panelOverrides ?? {};
  const mats = cabinetMaterials(cabinet, project);
  const thickAt = (key, axis, fallback = mats.body.thickness) => ov[key]?.[`s${axis}`] ?? fallback;
  const thick = (key, fallback) => thickAt(key, PANEL_DEFS.find((p) => p.key === key).thicknessAxis, fallback);

  const L = legHeight(cabinet);
  const tL = thick('left');
  const tR = thick('right');
  const tB = thick('bottom');
  const rails = cabinet.topType === 'rails';
  const tT = thick(rails ? 'railFront' : 'top');

  // Połączenia wieńców z bokami: zakres boków w pionie i wieńców w poziomie.
  const bottomOverlay = cabinet.bottomJoint === 'overlay';
  const topOverlay = cabinet.topJoint === 'overlay';
  const sideY0 = bottomOverlay ? tB : 0;
  const sideH = (topOverlay ? H - tT : H) - sideY0;
  const span = (overlay) => (overlay ? [0, W] : [tL, W - tL - tR]); // [x, szerokość] wieńca

  // Domyślne bryły: [x, y, z, sx, sy, sz] względem narożnika korpusu (y = 0 na spodzie korpusu).
  const base = {};
  let zTop; // zakres głębokości wieńca górnego (do rozmieszczenia trawersów)
  let zInner; // przednia powierzchnia pleców — tu stoją poprzeczki usztywniające
  const [bx, bw] = span(bottomOverlay);
  const [tx, tw] = span(topOverlay);
  if (backType === 'board') {
    const tK = thick('back');
    zInner = tK;
    base.left = [0, sideY0, 0, tL, sideH, D];
    base.right = [W - tR, sideY0, 0, tR, sideH, D];
    // Plecy siedzą między wieńcami (w pionie), więc wieńce mają pełną głębokość.
    base.bottom = [bx, 0, 0, bw, tB, D];
    base.top = [tx, H - tT, 0, tw, tT, D];
    zTop = [0, D];
    base.back = [tL, tB, 0, W - tL - tR, H - tB - tT, tK];
  } else {
    const b = backType === 'hdf' ? thick('back', mats.hdf.thickness) : 0;
    zInner = b;
    base.left = [0, sideY0, b, tL, sideH, D - b];
    base.right = [W - tR, sideY0, b, tR, sideH, D - b];
    base.bottom = [bx, 0, b, bw, tB, D - b];
    base.top = [tx, H - tT, b, tw, tT, D - b];
    zTop = [b, D];
    if (b) base.back = [0, 0, 0, W, H, b];
  }
  // Poprzeczki usztywniające — między bokami, tuż przed plecami (grubość w osi Z).
  const stiffDefs = [];
  for (const st of cabinet.stiffeners ?? []) {
    const key = stiffenerKey(st);
    const t = thickAt(key, 'z');
    const h = st.height;
    const y = { backTop: H - tT - h, backBottom: tB, backAt: st.y }[st.position];
    base[key] = [tL, y, zInner, W - tL - tR, h, t];
    stiffDefs.push({ key, name: stiffenerName(st), thicknessAxis: 'z', stiffener: st });
  }

  // Trawersy zamiast pełnego wieńca: przedni przy froncie, tylny przy plecach.
  if (rails) {
    const [z0, z1] = zTop;
    const w = cabinet.railWidth;
    const tBack = thickAt('railBack', 'y', tT);
    base.railFront = [tx, H - tT, z1 - w, tw, tT, w];
    base.railBack = [tx, H - tBack, z0, tw, tBack, w];
    delete base.top;
  }

  // Korpus stoi na nóżkach.
  for (const k of Object.keys(base)) base[k][1] += L;

  // --- blendy ---
  const blends = cabinet.sideBlends ?? {};
  const blendKey = { left: 'blendLeft', right: 'blendRight' };
  const wallPanelKey = { left: 'wallPanelLeft', right: 'wallPanelRight' };
  const thicknessAxis = {}; // dla elementów, w których oś grubości zależy od wariantu
  const fillerWidth = (side) => (blends[side]?.type === 'filler' ? blends[side].width : 0);
  // Panele boczne sięgają od podłogi do góry korpusu.
  const fullHeight = L + H;

  for (const side of ['left', 'right']) {
    const key = blendKey[side];
    const type = blends[side]?.type;
    if (type === 'plinth' && L > 0) {
      // Cokół boczny: tej samej wysokości co blenda dolna, sięga do jej tylnej krawędzi.
      const t = thickAt(key, 'x', mats.blend.thickness);
      base[key] = [side === 'left' ? 0 : W - t, 0, 0, t, ctx.plinthHeight ?? L, ctx.plinthBack ?? D];
    } else if (type === 'full') {
      const t = thickAt(key, 'x', mats.blend.thickness);
      base[key] = [side === 'left' ? -t : W, 0, 0, t, fullHeight, D + sidePanelExtension(cabinet, side, project)];
    } else if (type === 'filler') {
      // Listwa: przednia krawędź na linii frontu korpusu, albo wysunięta (do linii frontu / ręcznie).
      const t = thickAt(key, 'z', mats.blend.thickness);
      const w = fillerWidth(side);
      const ext = sidePanelExtension(cabinet, side, project);
      thicknessAxis[key] = 'z';
      base[key] = [side === 'left' ? -w : W, L, D + ext - t, w, H, t];

      // Panel przy ścianie — za listwą, od podłogi do góry, na całą głębokość (wysunięty razem z listwą).
      if (blends[side].wallPanel) {
        const pk = wallPanelKey[side];
        const tp = thickAt(pk, 'x', mats.blend.thickness);
        base[pk] = [side === 'left' ? -w - tp : W + w, 0, 0, tp, fullHeight, D + ext];
      }
    }
  }

  const panels = [];
  for (const def of [...PANEL_DEFS, ...stiffDefs]) {
    if (!base[def.key]) continue;
    const axis = thicknessAxis[def.key] ?? def.thicknessAxis;
    const [x, y, z, sx, sy, sz] = base[def.key];
    const o = ov[def.key] ?? {};
    // Ręczny wymiar obowiązuje zawsze dla grubości; dla pozostałych osi — tylko w elemencie niezależnym.
    const size = (a, auto) => (a === axis || o.free ? (o[`s${a}`] ?? auto) : auto);
    const overridden = OVERRIDE_KEYS.filter((k) => o[k] != null && (k[0] === 'd' || k[1] === axis || o.free));
    const side = { blendLeft: 'left', blendRight: 'right' }[def.key] ?? null;
    const group = BLEND_KEYS.includes(def.key) ? 'blend' : def.key === 'back' && backType === 'hdf' ? 'hdf' : 'body';
    const material = mats[group];
    const panel = {
      key: def.key,
      name: def.name,
      kind: group === 'hdf' ? 'hdf' : 'board',
      group,
      material,
      color: material.color,
      edges: o.edges ?? defaultEdges(def.key),
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
      hidden: !!o.hidden, // ukryta tylko w widoku 3D
      overridden,
    };
    panel.valid = panel.width > 0 && panel.height > 0 && panel.depth > 0;
    panels.push(panel);
  }
  return panels;
}

// Nóżki: 4 w narożnikach (oś LEG_INSET mm od krawędzi), przy szerokich korpusach dodatkowa para
// pośrodku. Przednie nóżki stoją za blendą dolną.
export function cabinetLegs(cabinet, project) {
  const L = legHeight(cabinet);
  if (!L) return [];
  const { width: W, depth: D } = cabinet;
  const frontLimit = Math.min(D, cabinetContext(cabinet, project).plinthBack ?? D);

  const xs = W > 1000 ? [LEG_INSET, W / 2, W - LEG_INSET] : [LEG_INSET, W - LEG_INSET];
  const zBack = LEG_INSET;
  const zFront = frontLimit - LEG_INSET;
  const zs = zFront > zBack ? [zBack, zFront] : [frontLimit / 2];

  return xs.flatMap((x) =>
    zs.map((z) => ({ x: cabinet.x + x, y: cabinet.y, z: cabinet.z + z, diameter: LEG_DIAMETER, height: L })),
  );
}

// Ścieżka w obiekcie korpusu, której dotyczy zmiana wymiaru powiązanego elementu w danej osi.
function linkedTarget(panel, axis, cabinet) {
  if (axis === 'y' && panel.key.startsWith('stiff-')) {
    const i = (cabinet.stiffeners ?? []).findIndex((st) => stiffenerKey(st) === panel.key);
    return `stiffeners.${i}.height`;
  }
  if (axis === 'z' && (panel.key === 'railFront' || panel.key === 'railBack')) return 'railWidth';
  if (axis === 'y' && panel.blendType === 'plinth') return 'legs.height';
  if (axis === 'x' && panel.blendType === 'filler') return `sideBlends.${panel.side}.width`;
  return AXIS_PROP[axis];
}

const LINKED_LIMITS = {
  railWidth: [10, CABINET_LIMITS.sizeMax],
  'legs.height': [LEG_LIMITS.min, LEG_LIMITS.max],
  'sideBlends.left.width': [1, CABINET_LIMITS.sizeMax],
  'sideBlends.right.width': [1, CABINET_LIMITS.sizeMax],
};

// Zmiana wymiaru elementu powiązanego (oś inna niż grubość) przekłada się na wymiar korpusu
// (albo wysokość nóżek / szerokość listwy), dzięki czemu pozostałe elementy dopasowują się same.
// Np. szerokość boku (Z) → głębokość korpusu, długość wieńca (X) → szerokość korpusu,
// wysokość cokołu bocznego (Y) → wysokość nóżek.
// Zwraca nowy korpus albo null, jeśli wartość wyszłaby poza dozwolony zakres.
export function resizePanelLinked(cabinet, key, axis, value, project) {
  const panel = cabinetPanels(cabinet, project).find((p) => p.key === key);
  if (!panel) return null;
  const path = linkedTarget(panel, axis, cabinet);
  const next = getPath(cabinet, path) + (value - panel[AXIS_PROP[axis]]);
  const [min, max] = LINKED_LIMITS[path] ?? (path.startsWith('stiffeners.') ? [1, CABINET_LIMITS.sizeMax] : [CABINET_LIMITS.sizeMin, CABINET_LIMITS.sizeMax]);
  if (next < min || next > max) return null;
  return setPath(cabinet, path, next);
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// Niemutująca zmiana zagnieżdżonego pola, np. setPath(c, 'legs.height', 120).
export function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  const next = rest.length ? setPath(obj?.[head] ?? {}, rest.join('.'), value) : value;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...obj, [head]: next };
}

// Elementy z materiału blend (pozostałe — z materiału korpusu, plecy HDF — z HDF).
const BLEND_KEYS = ['blendLeft', 'blendRight', 'wallPanelLeft', 'wallPanelRight'];

// Domyślne obrzeże: ile krawędzi długich (l) i krótkich (w) formatki jest oklejonych.
// Widoczna przednia krawędź konstrukcji — jedna długa; blendy — wszystkie; plecy i poprzeczki — brak.
export function defaultEdges(key) {
  if (['left', 'right', 'bottom', 'top', 'railFront', 'railBack', 'countertop'].includes(key)) return { l: 1, w: 0 };
  if (BLEND_KEYS.includes(key) || key === 'plinth' || key === 'topBlend') return { l: 2, w: 2 };
  return { l: 0, w: 0 };
}

// Wymiary formatki: długość × szerokość × grubość (dwa większe wymiary + najmniejszy)
// oraz wymiar do cięcia — pomniejszony o obrzeże: taśma na długiej krawędzi zmniejsza szerokość,
// na krótkiej — długość. Obrzeże ma tylko materiał z ustawioną grubością obrzeża.
export function panelCutSize(panel) {
  const [thickness, width, length] = [panel.width, panel.height, panel.depth].sort((a, b) => a - b);
  const band = panel.material?.edgeBanding ?? 0;
  const edges = band ? (panel.edges ?? { l: 0, w: 0 }) : { l: 0, w: 0 };
  return {
    length,
    width,
    thickness,
    band,
    edges,
    cutLength: length - edges.w * band,
    cutWidth: width - edges.l * band,
  };
}

// Prostopadłościan obejmujący wszystkie płyty i nóżki mebla.
export function cabinetBounds(cabinet, project) {
  const boxes = [
    ...cabinetPanels(cabinet, project).filter((p) => p.valid),
    ...cabinetLegs(cabinet, project).map((l) => ({
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
  const panels = cabinetPanels(cabinet, project);

  const invalid = panels.filter((p) => !p.valid).map((p) => p.name);
  if (invalid.length) issues.push(`Za mały korpus albo za grube płyty: ${invalid.join(', ')}.`);

  const valid = panels.filter((p) => p.valid);
  const overlapping = [];
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++)
      if (boxesOverlap(valid[i], valid[j])) overlapping.push(`${valid[i].name} i ${valid[j].name}`);
  if (overlapping.length) issues.push(`Elementy nachodzą na siebie: ${overlapping.join('; ')}.`);

  const bounds = cabinetBounds(cabinet, project);
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
    .filter((c) => c.id !== cabinet.id && boxesOverlap(bounds, cabinetBounds(c, project)))
    .map((c) => c.name || 'mebel');
  if (hitCabinets.length) issues.push(`Nachodzi na: ${hitCabinets.join(', ')}.`);

  return issues;
}

export function boxCorners(b) {
  const pts = [];
  for (const x of [b.x, b.x + b.width])
    for (const y of [b.y, b.y + b.height]) for (const z of [b.z, b.z + b.depth]) pts.push([x, y, z]);
  return pts;
}

// Prawdziwe nachodzenie (samo stykanie się ścianami nie jest kolizją).
export function boxesOverlap(a, b, eps = 0.01) {
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

  const stiffeners = (Array.isArray(raw.stiffeners) ? raw.stiffeners : []).map((st) => ({
    id: typeof st?.id === 'string' && st.id ? st.id : newId(),
    position: STIFFENER_POSITIONS.some((p) => p.key === st?.position) ? st.position : 'backTop',
    height: num(st?.height, DEFAULT_STIFFENER_HEIGHT, 1, sizeMax),
    y: num(st?.y, 0, -sizeMax, sizeMax),
  }));

  const panelOverrides = {};
  for (const key of [...PANEL_DEFS.map((d) => d.key), ...stiffeners.map(stiffenerKey)]) {
    const src = raw.panelOverrides?.[key];
    if (!src || typeof src !== 'object') continue;
    const o = {};
    for (const k of OVERRIDE_KEYS) {
      if (src[k] !== null && Number.isFinite(Number(src[k]))) o[k] = num(src[k], 0, -sizeMax, sizeMax);
    }
    if (src.free === true) o.free = true;
    if (src.hidden === true) o.hidden = true;
    if (src.edges && typeof src.edges === 'object') {
      o.edges = { l: num(src.edges.l, 0, 0, 2), w: num(src.edges.w, 0, 0, 2) };
    }
    if (Object.keys(o).length) panelOverrides[key] = o;
  }

  const sideBlend = (src = {}, d) => ({
    type: SIDE_BLEND_TYPES.some((t) => t.key === src.type) ? src.type : d.type,
    width: num(src.width, d.width, 1, sizeMax),
    wallPanel: src.wallPanel === true,
    flushFront: src.flushFront === true,
    extend: num(src.extend, 0, 0, 500),
  });

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name : 'Korpus',
    hidden: raw.hidden === true,
    x: num(raw.x, 0, -sizeMax, sizeMax),
    y: num(raw.y, 0, -sizeMax, sizeMax),
    z: num(raw.z, 0, -sizeMax, sizeMax),
    width: num(raw.width, 800, sizeMin, sizeMax),
    height: num(raw.height, 2000, sizeMin, sizeMax),
    depth: num(raw.depth, 560, sizeMin, sizeMax),
    backType: BACK_TYPES.some((b) => b.key === raw.backType) ? raw.backType : 'hdf',
    bottomJoint: raw.bottomJoint === 'overlay' ? 'overlay' : 'inset',
    topJoint: raw.topJoint === 'overlay' ? 'overlay' : 'inset',
    topType: raw.topType === 'rails' ? 'rails' : 'full',
    railWidth: num(raw.railWidth, DEFAULT_RAIL_WIDTH, 10, sizeMax),
    stiffeners,
    materialId: typeof raw.materialId === 'string' ? raw.materialId : null,
    blendMaterialId: typeof raw.blendMaterialId === 'string' ? raw.blendMaterialId : null,
    legs: {
      enabled: raw.legs?.enabled === true,
      height: num(raw.legs?.height, def.legs.height, LEG_LIMITS.min, LEG_LIMITS.max),
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
