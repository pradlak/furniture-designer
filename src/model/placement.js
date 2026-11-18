import { cabinetBounds, cabinetIssues, newId, sideBlendWidth } from './furniture.js';

// Ustawianie mebli: przyciąganie, dosuwanie, duplikowanie.
// Wszystko liczone na prostopadłościanach obejmujących meble (cabinetBounds) i przeszkody.

const DIM = { x: 'width', y: 'height', z: 'depth' };
const AXES = ['x', 'y', 'z'];

const spaceSize = (space, axis) => space[DIM[axis]];

// Inne meble i przeszkody jako prostopadłościany. cabinetId — jeden korpus albo zbiór (grupa) do pominięcia.
function otherBoxes(project, cabinetId) {
  const skip = cabinetId instanceof Set ? cabinetId : new Set([cabinetId]);
  return [
    ...project.furniture.filter((c) => !skip.has(c.id)).map((c) => cabinetBounds(c, project)),
    ...project.space.obstacles,
  ];
}

// Przyciąga proponowaną pozycję korpusu (pos: {x, y, z}) w podanych osiach do ścian
// i krawędzi innych mebli / przeszkód, jeśli krawędź jest bliżej niż `threshold` mm.
export function snapPosition(project, cabinetId, pos, axes, threshold = 30) {
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet, project);
  const others = otherBoxes(project, cabinetId);
  const result = { ...pos };

  for (const axis of axes) {
    const dim = DIM[axis];
    const offset = b[axis] - cabinet[axis]; // płyty mogą wystawać poza wymiar nominalny
    const lo = pos[axis] + offset;
    const hi = lo + b[dim];
    // Przy tylnej ścianie korpus przyciąga się z zachowaniem odstępu (backGap).
    const wallMin = axis === 'z' ? (cabinet.backGap ?? 0) : 0;
    const targets = [wallMin, spaceSize(project.space, axis), ...others.flatMap((o) => [o[axis], o[axis] + o[dim]])];

    let best = null;
    for (const t of targets) {
      for (const edge of [lo, hi]) {
        const d = t - edge;
        if (Math.abs(d) < threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
    result[axis] = Math.round(pos[axis] + (best ?? 0));
  }
  return result;
}

// Dosuwa korpus w danym kierunku ('-x', '+x', '-y', '+y', '-z', '+z') aż do ściany,
// innego mebla lub przeszkody leżącej na drodze.
export function slideCabinet(project, cabinetId, direction) {
  return slideCabinets(project, [cabinetId], direction).furniture.find((c) => c.id === cabinetId);
}

// Dosuwa razem kilka korpusów (np. cały rząd zaznaczony Ctrl + klik) — wszystkie o tę samą odległość,
// aż pierwszy z nich dojdzie do ściany, innego mebla lub przeszkody. Elementy korpusów (fronty, blendy
// boczne, nóżki) i obejmujące je blaty / blendy przesuwają się razem z nimi. Zwraca nowy projekt.
export function slideCabinets(project, cabinetIds, direction) {
  const ids = new Set(cabinetIds);
  const axis = direction[1];
  // Blendy boczne z automatyczną szerokością (do ściany / sąsiada) przy dosuwaniu w bok dostają swoją
  // obecną szerokość na stałe — jadą razem z korpusem, zamiast rozciągać się do miejsca, z którego odjechał.
  const original = project;
  if (axis === 'x') project = { ...project, furniture: project.furniture.map((c) => (ids.has(c.id) ? freezeSideBlends(c, original) : c)) };
  const target = slideTarget(project, [...ids], direction);
  if (!target || Math.abs(target.delta) < 0.01) return original;
  const { delta } = target;
  return { ...project, furniture: project.furniture.map((c) => (ids.has(c.id) ? { ...c, [axis]: c[axis] + delta } : c)) };
}

// Dokąd dojedzie korpus (albo grupa korpusów) w danym kierunku ('-x', '+x', '-y', '+y', '-z', '+z'):
// → { delta — przesunięcie w mm (ze znakiem), label — co go zatrzyma: „ściany”, „podłogi”, „korpusu „Korpus 2””,
//     „„Kominek”” } albo null (brak korpusów). Dla grupy — najmniejsze z przesunięć jej korpusów.
const WALL_LABELS = { '-x': 'ściany', '+x': 'ściany', '-z': 'tylnej ściany', '+z': 'krawędzi przestrzeni', '-y': 'podłogi', '+y': 'sufitu' };
export function slideTarget(project, cabinetIds, direction) {
  const ids = new Set(cabinetIds);
  const group = project.furniture.filter((c) => ids.has(c.id));
  if (!group.length) return null;
  const axis = direction[1];
  const dim = DIM[axis];
  const perp = AXES.filter((a) => a !== axis);
  const eps = 0.01;
  const names = new Map(project.furniture.map((c) => [c.id, `korpusu „${c.name}”`]));
  const others = [
    ...project.furniture.filter((c) => !ids.has(c.id)).map((c) => ({ ...cabinetBounds(c, project), label: names.get(c.id) })),
    ...project.space.obstacles.map((o) => ({ ...o, label: `„${o.name || 'przeszkody'}”` })),
  ];
  const minus = direction[0] === '-';

  let best = null;
  for (const cabinet of group) {
    const b = cabinetBounds(cabinet, project);
    const onPath = (o) => perp.every((a) => o[a] < b[a] + b[DIM[a]] - eps && b[a] < o[a] + o[DIM[a]] - eps);
    let stop = minus ? (axis === 'z' ? (cabinet.backGap ?? 0) : 0) : spaceSize(project.space, axis); // tył — z odstępem
    let label = WALL_LABELS[direction];
    for (const o of others.filter(onPath)) {
      if (minus && o[axis] + o[dim] <= b[axis] + eps && o[axis] + o[dim] > stop) [stop, label] = [o[axis] + o[dim], o.label];
      if (!minus && o[axis] >= b[axis] + b[dim] - eps && o[axis] < stop) [stop, label] = [o[axis], o.label];
    }
    const delta = minus ? stop - b[axis] : stop - (b[axis] + b[dim]);
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, label };
  }
  return best;
}

// Korpus rozszerzony w lewo / w prawo (side: 'left' | 'right') aż do najbliższego korpusu, przeszkody albo ściany
// (druga strona zostaje na miejscu). Zwraca nowy projekt.
export function extendCabinet(project, cabinetId, side) {
  const t = slideTarget(project, [cabinetId], side === 'left' ? '-x' : '+x');
  const gap = Math.abs(t?.delta ?? 0);
  if (gap < 0.5) return project;
  return {
    ...project,
    furniture: project.furniture.map((c) =>
      c.id !== cabinetId ? c : { ...c, x: side === 'left' ? c.x - gap : c.x, width: Math.round((c.width + gap) * 10) / 10 },
    ),
  };
}

// --- występy ścian (kominek, filar) — przeszkody kind: 'wall' ---

// Najbliższa granica występu w lewo / w prawo (side: 'left' | 'right'): korpus albo inna przeszkoda
// na wysokości i w głębokości występu, a gdy nic nie stoi — ściana (krawędź przestrzeni).
// → { x — współrzędna granicy (mm), gap — odległość od występu, label — „ściany”, „korpusu „Korpus 1”” }
export function obstacleNeighbour(project, obstacleId, side) {
  const o = project.space.obstacles.find((x) => x.id === obstacleId);
  if (!o) return null;
  const eps = 0.01;
  const inBand = (b) => b.y < o.y + o.height - eps && b.y + b.height > o.y + eps && b.z < o.z + o.depth - eps && b.z + b.depth > o.z + eps;
  const boxes = [
    ...project.furniture.map((c) => ({ ...cabinetBounds(c, project), label: `korpusu „${c.name}”` })),
    ...project.space.obstacles.filter((x) => x.id !== o.id).map((x) => ({ ...x, label: `„${x.name}”` })),
  ].filter(inBand);
  const { walls, width } = project.space;
  if (side === 'left') {
    let best = { x: 0, label: walls.left ? 'ściany' : 'krawędzi przestrzeni' };
    for (const b of boxes) if (b.x + b.width <= o.x + eps && b.x + b.width > best.x) best = { x: b.x + b.width, label: b.label };
    return { ...best, gap: Math.max(0, o.x - best.x) };
  }
  let best = { x: width, label: walls.right ? 'ściany' : 'krawędzi przestrzeni' };
  for (const b of boxes) if (b.x >= o.x + o.width - eps && b.x < best.x) best = { x: b.x, label: b.label };
  return { ...best, gap: Math.max(0, best.x - (o.x + o.width)) };
}

const updateObstacle = (project, id, fn) => ({
  ...project,
  space: { ...project.space, obstacles: project.space.obstacles.map((o) => (o.id === id ? fn(o) : o)) },
});

// Występ rozszerzony w daną stronę aż do najbliższego korpusu / ściany (druga krawędź zostaje).
export function extendObstacle(project, obstacleId, side) {
  const n = obstacleNeighbour(project, obstacleId, side);
  if (!n || n.gap < 0.5) return project;
  return updateObstacle(project, obstacleId, (o) =>
    side === 'left' ? { ...o, x: n.x, width: o.width + n.gap } : { ...o, width: o.width + n.gap },
  );
}

// Występ przesunięty w daną stronę aż do najbliższego korpusu / ściany (szerokość bez zmian).
export function slideObstacle(project, obstacleId, side) {
  const n = obstacleNeighbour(project, obstacleId, side);
  if (!n || n.gap < 0.5) return project;
  return updateObstacle(project, obstacleId, (o) => ({ ...o, x: side === 'left' ? n.x : n.x - o.width }));
}

// Występ zmniejszony tak, żeby nie nachodził na korpusy (np. po poszerzeniu go albo przesunięciu korpusu):
// każdy korpus, który na niego zachodzi, „odcina” występ od swojej strony — korpus po lewej od środka występu
// przesuwa jego lewą krawędź, po prawej — prawą. → { project, names — korpusy, z którymi była kolizja,
// removed — o ile mm zwęził się występ } albo null, gdy kolizji nie ma albo występ zniknąłby zupełnie.
export function obstacleWithoutCollisions(project, obstacleId) {
  const o0 = project.space.obstacles.find((x) => x.id === obstacleId);
  if (!o0) return null;
  const eps = 0.5;
  const overlaps = (o, b) => AXES.every((a) => b[a] < o[a] + o[DIM[a]] - eps && o[a] < b[a] + b[DIM[a]] - eps);
  const cabs = project.furniture.map((c) => ({ ...cabinetBounds(c, project), name: c.name }));
  let o = { ...o0 };
  const names = new Set();
  // kilka przebiegów: przycięcie z jednej strony może odsłonić kolizję, której nie było widać wcześniej
  for (let pass = 0; pass < project.furniture.length + 1; pass++) {
    const hit = cabs.find((b) => overlaps(o, b));
    if (!hit) break;
    names.add(hit.name);
    const mid = o.x + o.width / 2;
    if (hit.x + hit.width / 2 < mid) {
      const right = o.x + o.width;
      o = { ...o, x: hit.x + hit.width, width: right - (hit.x + hit.width) };
    } else o = { ...o, width: hit.x - o.x };
    if (o.width < 10) return null; // występ zniknąłby — korpus stoi na całej jego szerokości
  }
  if (!names.size || cabs.some((b) => overlaps(o, b))) return null;
  const round = (v) => Math.round(v * 10) / 10;
  o = { ...o, x: round(o.x), width: round(o.width) };
  return {
    project: { ...project, space: { ...project.space, obstacles: project.space.obstacles.map((x) => (x.id === obstacleId ? o : x)) } },
    names: [...names],
    removed: Math.round(o0.width - o.width),
  };
}

// Przyciąganie krawędzi występu (współrzędna x, mm) do ścian, korpusów i innych przeszkód — przy przeciąganiu myszką.
export function snapObstacleEdge(project, obstacleId, x, threshold = 30) {
  const targets = [
    0,
    project.space.width,
    ...project.furniture.flatMap((c) => {
      const b = cabinetBounds(c, project);
      return [b.x, b.x + b.width];
    }),
    ...project.space.obstacles.filter((o) => o.id !== obstacleId).flatMap((o) => [o.x, o.x + o.width]),
  ];
  let best = null;
  for (const t of targets) if (Math.abs(t - x) < threshold && (best === null || Math.abs(t - x) < Math.abs(best - x))) best = t;
  return best ?? x;
}

function freezeSideBlends(cabinet, project) {
  let next = cabinet;
  for (const side of ['left', 'right']) {
    const sb = cabinet.sideBlends?.[side];
    if (sb?.type !== 'filler' || sb.width != null) continue;
    const width = Math.round(sideBlendWidth(cabinet, side, project));
    next = { ...next, sideBlends: { ...next.sideBlends, [side]: { ...sb, width } } };
  }
  return next;
}

// Kopia korpusu ustawiona obok oryginału: z prawej, a jeśli tam nie ma miejsca — z lewej.
export function duplicateCabinet(project, cabinetId) {
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet, project);
  const copy = { ...structuredClone(cabinet), id: newId(), name: `${cabinet.name} (kopia)` };

  for (const dx of [b.width, -b.width]) {
    const candidate = { ...copy, x: cabinet.x + dx };
    const issues = cabinetIssues(candidate, { ...project, furniture: [...project.furniture, candidate] });
    if (!issues.length) return candidate;
  }
  return { ...copy, x: cabinet.x + b.width };
}
