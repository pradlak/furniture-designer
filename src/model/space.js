// Model przestrzeni (wnęki / pomieszczenia), w której projektujemy mebel.
// Wszystkie wymiary w milimetrach.
//
// Układ współrzędnych przestrzeni:
//   x — od lewej ściany w prawo (0..width)
//   y — od podłogi w górę     (0..height)
//   z — od tylnej ściany do przodu (0..depth)

import { distanceOutside, normalizeOutline, outlineFromCuts, cutCorner } from './outline.js';
import { normalizeWallFinish } from './wallFinish.js';

export const WALLS = [
  { key: 'floor', label: 'Podłoga' },
  { key: 'back', label: 'Ściana tylna' },
  { key: 'left', label: 'Ściana lewa' },
  { key: 'right', label: 'Ściana prawa' },
  { key: 'ceiling', label: 'Sufit' },
];

// Strona, przy której skos schodzi w dół (tam stoi ścianka kolankowa).
export const SLOPE_SIDES = [
  { key: 'left', label: 'Przy lewej ścianie' },
  { key: 'right', label: 'Przy prawej ścianie' },
  { key: 'back', label: 'Przy tylnej ścianie' },
  { key: 'front', label: 'Z przodu' },
];

export const DEFAULT_COLORS = { walls: '#f4f3ef', floor: '#d9c9ad' };

export const LIMITS = {
  spaceMin: 100,
  spaceMax: 20000,
  obstacleMin: 1,
};

export function createDefaultSpace() {
  return {
    name: 'Wnęka',
    width: 2000,
    height: 2500,
    depth: 600,
    ceilingGap: DEFAULT_CEILING_GAP,
    walls: { floor: true, back: true, left: true, right: true, ceiling: true },
    colors: { ...DEFAULT_COLORS },
    slopes: [],
    outline: null, // kształt podłogi (punkty w rzucie, model/outline.js); null — prostokąt
    obstacles: [],
  };
}

// Rodzaje przeszkód: zwykła (listwa, rura…) albo występ ściany (kominek, filar, wnęka w ścianie) — rysowany
// jak ściana i dzielący przestrzeń na osobne wnęki (patrz wallSegments): np. kominek z zabudową po obu stronach.
export const OBSTACLE_KINDS = [
  { key: 'obstacle', label: 'Przeszkoda' },
  { key: 'wall', label: 'Występ ściany' },
  { key: 'hood', label: 'Wypust od sufitu (okap)' },
];
export const isWallObstacle = (o) => o?.kind === 'wall';
// Wypust od sufitu (okap, obudowa okapu, podciąg): przyczepiony do sufitu, opuszczony do wysokości przestrzeń − height.
// Wygląda jak ściana; dzieli przestrzeń na wnęki tylko dla mebli na jego wysokości (szafki wiszące, półki obok okapu),
// a meble pod nim (szafki dolne) mają wysokość najwyżej do jego dołu.
export const isHoodObstacle = (o) => o?.kind === 'hood';
export const isWallLike = (o) => isWallObstacle(o) || isHoodObstacle(o);
// Wypusty od sufitu zawsze przy suficie (także po zmianie wysokości przestrzeni).
export function anchorHoods(space) {
  if (!space.obstacles.some(isHoodObstacle)) return space;
  return { ...space, obstacles: space.obstacles.map((o) => (isHoodObstacle(o) ? { ...o, y: space.height - o.height } : o)) };
}

// Wygląd występu ściany (tylko widok 3D — nie wpływa na formatki, kolizje ani obrzeże): na przedniej ścianie
// występu rysujemy kominek, wkład kominkowy albo telewizor (scene/wallDecor.js).
export const WALL_DECORS = [
  { key: null, label: 'Sama ściana' },
  { key: 'fireplace', label: 'Kominek klasyczny' },
  { key: 'insert', label: 'Kominek nowoczesny (wkład z szybą)' },
  { key: 'tv', label: 'Telewizor' },
];
// Wygląd okapu (wypustu od sufitu): urządzenie pod zabudową — tylko wygląd w 3D (scene/wallDecor.js).
export const HOOD_DECORS = [
  { key: null, label: 'Sama zabudowa (bez okapu)' },
  { key: 'hoodChimney', label: 'Okap kominowy (stal)' },
  { key: 'hoodBox', label: 'Okap prostokątny (box)' },
  { key: 'hoodGlass', label: 'Okap szklany skośny' },
  { key: 'hoodBuiltIn', label: 'Okap do zabudowy (w pełni schowany — widać tylko od spodu)' },
];
// lista wyglądów dla rodzaju przeszkody (występ ściany — kominek / telewizor, okap — urządzenie)
export const decorsFor = (o) => (o?.kind === 'hood' ? HOOD_DECORS : o?.kind === 'wall' ? WALL_DECORS : []);

export function createObstacle(overrides = {}) {
  return {
    id: newId(),
    kind: 'obstacle',
    decor: null, // tylko występ ściany — patrz WALL_DECORS
    name: 'Przeszkoda',
    x: 0,
    y: 0,
    z: 0,
    width: 100,
    height: 100,
    depth: 100,
    ...overrides,
  };
}

// Gotowe szablony typowych przeszkód, dopasowane do bieżącej przestrzeni.
export const OBSTACLE_PRESETS = [
  {
    key: 'generic',
    label: 'Przeszkoda',
    create: () => createObstacle(),
  },
  {
    key: 'skirting',
    label: 'Listwa przypodłogowa',
    create: (space) =>
      createObstacle({ name: 'Listwa przypodłogowa', x: 0, y: 0, z: 0, width: space.width, height: 80, depth: 15 }),
  },
  {
    key: 'pipe',
    label: 'Rura pionowa',
    create: (space) =>
      createObstacle({ name: 'Rura', x: 50, y: 0, z: 0, width: 40, height: space.height, depth: 40 }),
  },
  {
    // okap (obudowa komina okapu) — od sufitu w dół, na środku tylnej ściany; po bokach półki / szafki wiszące
    key: 'hood',
    label: 'Okap / wypust od sufitu',
    create: (space) => {
      const width = Math.min(600, Math.round(space.width / 3));
      const height = Math.min(800, Math.round(space.height / 3));
      return createObstacle({
        kind: 'hood',
        name: 'Okap',
        x: Math.round((space.width - width) / 2),
        y: space.height - height,
        z: 0,
        width,
        height,
        depth: Math.min(500, space.depth),
      });
    },
  },
  {
    // na środku tylnej ściany, od podłogi do sufitu, wystaje na całą głębokość — po bokach dwie wnęki
    key: 'chimney',
    label: 'Kominek / występ ściany',
    create: (space) => {
      const width = Math.min(1000, Math.round(space.width / 3));
      return createObstacle({
        kind: 'wall',
        decor: 'fireplace',
        name: 'Kominek',
        x: Math.round((space.width - width) / 2),
        y: 0,
        z: 0,
        width,
        height: space.height,
        depth: space.depth,
      });
    },
  },
];

// Wnęki wzdłuż szerokości przestrzeni: odcinki [od, do] (mm, oś X) między ścianami bocznymi
// a występami ścian (np. kominkiem). Bez występów — jedna wnęka na całą szerokość.
// yRange — [od, do] w pionie (mm): wypusty od sufitu (okap) dzielą przestrzeń tylko, gdy na tej wysokości.
export function wallSegments(space, yRange = null) {
  const covered = space.obstacles
    .filter((o) => isWallObstacle(o) || (isHoodObstacle(o) && yRange && o.y < yRange[1] && o.y + o.height > yRange[0]))
    .map((o) => [Math.max(0, o.x), Math.min(space.width, o.x + o.width)])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  const segments = [];
  let cursor = 0;
  for (const [a, b] of covered) {
    if (a > cursor) segments.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < space.width) segments.push([cursor, space.width]);
  return segments;
}

// Wnęka, w której leży punkt x (albo najbliższa, gdy x wypada na występie ściany).
export function segmentAt(space, x, yRange = null) {
  const segments = wallSegments(space, yRange);
  if (!segments.length) return [0, space.width];
  const dist = ([a, b]) => (x < a ? a - x : x > b ? x - b : 0);
  return segments.reduce((best, s) => (dist(s) < dist(best) ? s : best));
}

// --- skosy ---

// Domyślny luz mebli do skosu (mm, prostopadle do skosu) — korpusy ze skośną górą kończą się tyle przed skosem.
export const DEFAULT_SLOPE_GAP = 10;
// Domyślny luz mebli do sufitu (mm) — korpusy dopasowane do sufitu i blendy „do sufitu” kończą się tyle niżej.
export const DEFAULT_CEILING_GAP = 10;

// Nowy skos: pierwsza wolna strona, ścianka kolankowa ~40% wysokości, skos na połowę rozpiętości.
export function createSlope(space, overrides = {}) {
  const used = new Set(space.slopes.map((s) => s.side));
  const side = (SLOPE_SIDES.find((s) => !used.has(s.key)) ?? SLOPE_SIDES[0]).key;
  const span = side === 'left' || side === 'right' ? space.width : space.depth;
  return {
    id: newId(),
    side,
    kneeHeight: roundTo(space.height * 0.4, 10),
    run: roundTo(span / 2, 10),
    gap: DEFAULT_SLOPE_GAP,
    ...overrides,
  };
}

// Kąt nachylenia skosu względem poziomu (stopnie) albo null, gdy skos jest nieaktywny.
export function slopeAngle(slope, space) {
  const rise = space.height - slope.kneeHeight;
  if (rise <= 0 || slope.run <= 0) return null;
  return (Math.atan2(rise, slope.run) * 180) / Math.PI;
}

// Długość skosu w poziomie dla zadanego kąta.
export function runFromAngle(angleDeg, slope, space) {
  const rise = space.height - slope.kneeHeight;
  if (rise <= 0 || angleDeg <= 0 || angleDeg >= 90) return null;
  return Math.round(rise / Math.tan((angleDeg * Math.PI) / 180));
}

// Każdy aktywny skos to półprzestrzeń: normal · p <= offset (p w mm, układ przestrzeni).
// Skos zaczyna się na ściance kolankowej (wysokość kneeHeight przy ścianie)
// i wznosi się do pełnej wysokości w odległości `run` od tej ściany.
export function slopePlanes(space) {
  const planes = [];
  for (const s of space.slopes) {
    const rise = space.height - s.kneeHeight;
    if (rise <= 0 || s.run <= 0) continue;
    const k = rise / s.run;
    const plane = {
      left: { normal: [-k, 1, 0], offset: s.kneeHeight },
      right: { normal: [k, 1, 0], offset: s.kneeHeight + k * space.width },
      back: { normal: [0, 1, -k], offset: s.kneeHeight },
      front: { normal: [0, 1, k], offset: s.kneeHeight + k * space.depth },
    }[s.side];
    if (plane) planes.push({ ...plane, side: s.side, gap: s.gap ?? DEFAULT_SLOPE_GAP });
  }
  return planes;
}

// --- kształt podłogi (obrys w rzucie, model/outline.js) ---
// Ściany nie muszą stać pod kątem prostym: obrys podłogi to wielokąt z punktów, które można dodawać i przesuwać
// (także w widoku 3D). Gotowe kształty: skośna ściana boczna / tylna, ścięty narożnik.
export const OUTLINE_PRESETS = [
  {
    key: 'leftFront',
    label: 'Skośna lewa ściana',
    title: 'Lewa ściana skośna — wnęka węższa z przodu',
    cut: (s) => ['frontLeft', roundTo(Math.min(300, s.width / 4), 10), s.depth],
  },
  {
    key: 'rightFront',
    label: 'Skośna prawa ściana',
    title: 'Prawa ściana skośna — wnęka węższa z przodu',
    cut: (s) => ['frontRight', roundTo(Math.min(300, s.width / 4), 10), s.depth],
  },
  {
    key: 'leftBack',
    label: 'Lewa ściana — węziej z tyłu',
    title: 'Lewa ściana skośna — wnęka węższa z tyłu',
    cut: (s) => ['backLeft', roundTo(Math.min(300, s.width / 4), 10), s.depth],
  },
  {
    key: 'rightBack',
    label: 'Prawa ściana — węziej z tyłu',
    title: 'Prawa ściana skośna — wnęka węższa z tyłu',
    cut: (s) => ['backRight', roundTo(Math.min(300, s.width / 4), 10), s.depth],
  },
  {
    key: 'backLeft',
    label: 'Skośna tylna ściana',
    title: 'Tylna ściana skośna — płycej z lewej',
    cut: (s) => ['backLeft', s.width, roundTo(Math.min(200, s.depth / 3), 10)],
  },
  {
    key: 'backRight',
    label: 'Tylna — płycej z prawej',
    title: 'Tylna ściana skośna — płycej z prawej',
    cut: (s) => ['backRight', s.width, roundTo(Math.min(200, s.depth / 3), 10)],
  },
  {
    key: 'chamferLeft',
    label: 'Ścięty narożnik lewy',
    title: 'Ścięty narożnik — lewy tylny',
    cut: (s) => ['backLeft', roundTo(Math.min(400, s.width / 4, s.depth / 2), 10), roundTo(Math.min(400, s.width / 4, s.depth / 2), 10)],
  },
  {
    key: 'chamferRight',
    label: 'Ścięty narożnik prawy',
    title: 'Ścięty narożnik — prawy tylny',
    cut: (s) => ['backRight', roundTo(Math.min(400, s.width / 4, s.depth / 2), 10), roundTo(Math.min(400, s.width / 4, s.depth / 2), 10)],
  },
];

// Obrys po zastosowaniu gotowego kształtu albo null, gdy się nie da (narożnik był już zmieniony).
export function applyOutlinePreset(space, key) {
  const preset = OUTLINE_PRESETS.find((p) => p.key === key);
  return preset ? cutCorner(space, ...preset.cut(space)) : null;
}

export function isPointInside([x, y, z], space, eps = 0.01) {
  if (x < -eps || y < -eps || z < -eps) return false;
  if (x > space.width + eps || y > space.height + eps || z > space.depth + eps) return false;
  if (space.outline && distanceOutside(x, z, space.outline) > eps) return false;
  return slopePlanes(space).every(({ normal: [a, b, c], offset }) => a * x + b * y + c * z <= offset + eps * Math.hypot(a, b, c));
}

// Opis, którędy i o ile punkty (narożniki elementu, [x, y, z] w mm) wychodzą poza przestrzeń, np.
// „Wychodzi poza przestrzeń: ponad sufit o 18 mm.” — albo null, gdy wszystkie są w środku.
// openFront — przód przestrzeni to pokój (nie ma tam ściany): wystawanie do przodu (np. blat) nie jest błędem.
const SLOPE_NAMES = { left: 'lewy', right: 'prawy', back: 'tylny', front: 'przedni' };
export function describeOutside(points, space, { openFront = false } = {}) {
  const over = { left: 0, right: 0, floor: 0, ceiling: 0, back: 0, front: 0 };
  const slopes = {};
  let outlineOver = 0;
  const planes = slopePlanes(space);
  for (const [x, y, z] of points) {
    // ściany z obrysu (skośne, wklęsłe): odległość w poziomie za ścianą — tylko w obrębie prostokąta przestrzeni
    // (poza nim mówią o tym komunikaty o ścianach prostokąta); przy otwartym przodzie ściany kończą się na przodzie
    const zz = openFront ? Math.min(z, space.depth) : z;
    if (space.outline && x >= 0 && x <= space.width && zz >= 0 && zz <= space.depth) {
      outlineOver = Math.max(outlineOver, distanceOutside(x, zz, space.outline));
    }
    over.left = Math.max(over.left, -x);
    over.right = Math.max(over.right, x - space.width);
    over.floor = Math.max(over.floor, -y);
    over.ceiling = Math.max(over.ceiling, y - space.height);
    over.back = Math.max(over.back, -z);
    if (!openFront) over.front = Math.max(over.front, z - space.depth);
    for (const { normal: [a, b, c], offset, side } of planes) {
      // pionowo: o ile punkt jest nad skosem
      const d = (a * x + b * y + c * z - offset) / b;
      slopes[side] = Math.max(slopes[side] ?? 0, d);
    }
  }
  const mm = (v) => `${Math.round(v)} mm`;
  const labels = {
    left: (v) => `za lewą ścianę o ${mm(v)}`,
    right: (v) => `za prawą ścianę o ${mm(v)}`,
    floor: (v) => `pod podłogę o ${mm(v)}`,
    ceiling: (v) => `ponad sufit o ${mm(v)} (wysokość przestrzeni ${space.height} mm)`,
    back: (v) => `za tylną ścianę o ${mm(v)}`,
    front: (v) => `do przodu poza przestrzeń o ${mm(v)} (głębokość przestrzeni ${space.depth} mm)`,
  };
  const parts = Object.entries(over).filter(([, v]) => v > 0.5).map(([k, v]) => labels[k](v));
  for (const [side, v] of Object.entries(slopes)) if (v > 0.5) parts.push(`nad ${SLOPE_NAMES[side] ?? ''} skos o ${mm(v)}`);
  if (outlineOver > 0.5) parts.push(`za ścianę (kształt pomieszczenia) o ${mm(outlineOver)}`);
  if (!parts.length) return null; // (przekroczenia do 0,5 mm pomijamy)
  return `Wychodzi poza przestrzeń: ${parts.join(', ')}.`;
}

export function isObstacleOutside(o, space) {
  for (const x of [o.x, o.x + o.width])
    for (const y of [o.y, o.y + o.height])
      for (const z of [o.z, o.z + o.depth]) if (!isPointInside([x, y, z], space)) return true;
  return false;
}

// --- normalizacja (wczytywanie z pliku / localStorage) ---

export function normalizeSpace(raw = {}) {
  const def = createDefaultSpace();
  const walls = {};
  for (const { key } of WALLS) {
    walls[key] = typeof raw.walls?.[key] === 'boolean' ? raw.walls[key] : def.walls[key];
  }
  const colors = {};
  for (const key of Object.keys(DEFAULT_COLORS)) {
    colors[key] = isHexColor(raw.colors?.[key]) ? raw.colors[key] : DEFAULT_COLORS[key];
  }
  const space = {
    name: typeof raw.name === 'string' ? raw.name : def.name,
    width: num(raw.width, def.width, LIMITS.spaceMin, LIMITS.spaceMax),
    height: num(raw.height, def.height, LIMITS.spaceMin, LIMITS.spaceMax),
    depth: num(raw.depth, def.depth, LIMITS.spaceMin, LIMITS.spaceMax),
    ceilingGap: num(raw.ceilingGap, DEFAULT_CEILING_GAP, 0, 500),
    walls,
    colors,
    slopes: Array.isArray(raw.slopes) ? raw.slopes.map(normalizeSlope) : [],
    obstacles: Array.isArray(raw.obstacles) ? raw.obstacles.map(normalizeObstacle) : [],
    wallFinish: normalizeWallFinish(raw.wallFinish), // kolor pojedynczych ścian i płytki (model/wallFinish.js)
  };
  // kształt podłogi; starsze zapisy — skośne ściany jako ścięcia narożników
  space.outline = Array.isArray(raw.outline)
    ? normalizeOutline(raw.outline, space)
    : Array.isArray(raw.cuts) && raw.cuts.length
      ? outlineFromCuts(raw.cuts, space)
      : null;
  return anchorHoods(space);
}

function normalizeSlope(raw = {}) {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    side: SLOPE_SIDES.some((s) => s.key === raw.side) ? raw.side : 'left',
    kneeHeight: num(raw.kneeHeight, 1000, 0, LIMITS.spaceMax),
    run: num(raw.run, 1000, 1, LIMITS.spaceMax),
    gap: num(raw.gap, DEFAULT_SLOPE_GAP, 0, 500),
  };
}

function normalizeObstacle(raw = {}) {
  const def = createObstacle();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : def.id,
    kind: raw.kind === 'wall' || raw.kind === 'hood' ? raw.kind : 'obstacle',
    decor: [...WALL_DECORS, ...HOOD_DECORS].some((d) => d.key && d.key === raw.decor) ? raw.decor : null,
    // własny kolor (tylko wygląd w 3D): { hex, name } albo null — występ / okap jak ściany, przeszkoda pomarańczowa
    color: raw.color && isHexColor(raw.color.hex) ? { hex: raw.color.hex, name: typeof raw.color.name === 'string' ? raw.color.name : raw.color.hex } : null,
    name: typeof raw.name === 'string' ? raw.name : def.name,
    x: num(raw.x, 0, -LIMITS.spaceMax, LIMITS.spaceMax),
    y: num(raw.y, 0, -LIMITS.spaceMax, LIMITS.spaceMax),
    z: num(raw.z, 0, -LIMITS.spaceMax, LIMITS.spaceMax),
    width: num(raw.width, def.width, LIMITS.obstacleMin, LIMITS.spaceMax),
    height: num(raw.height, def.height, LIMITS.obstacleMin, LIMITS.spaceMax),
    depth: num(raw.depth, def.depth, LIMITS.obstacleMin, LIMITS.spaceMax),
  };
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
