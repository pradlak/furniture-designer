import { cabinetBounds, cabinetIssues, newId, sideBlendWidth } from './furniture.js';
import { freeWidth, backLimit, straightenSlantedSides } from './outline.js';
import { trimBox } from './trims.js';
import { boardBox } from './boards.js';
import { t } from '../i18n.js';

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

// Przyciąganie przesuwanego korpusu („magnes”) — w podanych osiach do:
//  - ścian (także skośnych i z kształtu podłogi — tam, gdzie korpus dochodzi do nich na swojej głębokości),
//  - sąsiednich mebli i przeszkód: dosunięcie bok w bok (pierwszeństwo) albo wyrównanie krawędzi (np. frontów);
//    pod uwagę bierzemy tylko te, które są blisko w pozostałych osiach (NEAR_MM), a nie wszystkie w pokoju.
// threshold — zasięg przyciągania w mm (zwykle liczony z powiększenia widoku: kilkanaście pikseli na ekranie).
// hold — poprzednie przyciągnięcia { [oś]: { value, edge } }: złapany korpus „trzyma się” celu aż do
// HOLD_FACTOR × threshold — trzeba wyraźnie odciągnąć, żeby się odkleił.
// → { pos, snaps: { [oś]: { value, edge, label } } } — label: do czego przyciągnięto (do podpowiedzi).
const NEAR_MM = 400;
const HOLD_FACTOR = 1.8;
export function snapCabinet(project, cabinetId, pos, axes, { threshold = 30, hold = {} } = {}) {
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet, project);
  const { space } = project;
  // zasięg korpusu: prostopadłościan korpusu razem z wystającymi elementami (skośny bok bywa węższy niż korpus)
  const off = {};
  for (const a of AXES) {
    const lo = Math.min(b[a], cabinet[a]) - cabinet[a];
    off[a] = [lo, Math.max(b[a] + b[DIM[a]], cabinet[a] + cabinet[DIM[a]]) - cabinet[a]];
  }
  const range = (a, p = pos) => [p[a] + off[a][0], p[a] + off[a][1]];
  const others = [
    ...project.furniture.filter((c) => c.id !== cabinetId).map((c) => ({ box: cabinetBounds(c, project), label: t('korpusu „{name}”', { name: c.name }) })),
    ...space.obstacles.map((o) => ({ box: o, label: `„${o.name || t('przeszkody')}”` })),
  ];
  const result = { ...pos };
  const snaps = {};

  for (const axis of axes) {
    const dim = DIM[axis];
    const [lo, hi] = range(axis, result);
    const edges = { lo, hi };
    // cele: { value, edges (które krawędzie korpusu), label, weight (mniejsza — ważniejszy) }
    const targets = [];
    const wall = (value, edge, label) => targets.push({ value, edge, label, weight: 0.8 });
    if (axis === 'x') {
      wall(0, 'lo', t('lewej ściany'));
      wall(space.width, 'hi', t('prawej ściany'));
      if (space.outline) {
        // ściany z kształtu podłogi na głębokości korpusu (skośne boczne — jak proste, bo korpus dostaje skośny bok)
        const shape = cabinet.wallFit?.enabled === false ? space : { ...space, outline: straightenSlantedSides(space) };
        const [z0, z1] = range('z', result);
        const [L, R] = freeWidth(shape, Math.max(0, z0), Math.min(space.depth, z1), 0, space.width);
        if (R > L) {
          wall(L, 'lo', t('ściany'));
          wall(R, 'hi', t('ściany'));
        }
      }
    } else if (axis === 'z') {
      wall(cabinet.backGap ?? 0, 'lo', t('tylnej ściany'));
      wall(space.depth, 'hi', t('przodu przestrzeni'));
      if (space.outline) {
        const [x0, x1] = range('x', result);
        const back = backLimit(space, Math.max(0, x0), Math.min(space.width, x1));
        if (back > 0) wall(back + (cabinet.backGap ?? 0), 'lo', t('tylnej ściany'));
      }
    } else {
      wall(0, 'lo', t('podłogi'));
      wall(space.height, 'hi', t('sufitu')); // szafki wiszące — górą do sufitu
    }
    const perp = AXES.filter((a) => a !== axis);
    for (const { box, label } of others) {
      // tylko sąsiedzi: w pozostałych osiach nachodzą na korpus albo są bliżej niż NEAR_MM
      const near = perp.every((a) => {
        const [p0, p1] = range(a, result);
        return box[a] < p1 + NEAR_MM && box[a] + box[DIM[a]] > p0 - NEAR_MM;
      });
      if (!near) continue;
      const a0 = box[axis];
      const a1 = box[axis] + box[dim];
      targets.push({ value: a1, edge: 'lo', label, weight: 1 }); // dosunięcie: lewy bok do prawego boku sąsiada…
      targets.push({ value: a0, edge: 'hi', label, weight: 1 });
      targets.push({ value: a0, edge: 'lo', label: t('wyrównany z {label}', { label }), weight: 1.6 }); // wyrównanie krawędzi
      targets.push({ value: a1, edge: 'hi', label: t('wyrównany z {label}', { label }), weight: 1.6 });
    }

    // poprzedni cel trzyma, dopóki korpus nie odjedzie dalej niż HOLD_FACTOR × threshold
    let best = null;
    const held = hold[axis];
    if (held) {
      const d = held.value - edges[held.edge];
      const still = targets.find((t) => Math.abs(t.value - held.value) < 0.5 && t.edge === held.edge);
      if (still && Math.abs(d) < threshold * HOLD_FACTOR) best = { ...still, d };
    }
    if (!best) {
      for (const t of targets) {
        const d = t.value - edges[t.edge];
        if (Math.abs(d) >= threshold) continue;
        if (!best || Math.abs(d) * t.weight < Math.abs(best.d) * best.weight) best = { ...t, d };
      }
    }
    if (best) {
      result[axis] = Math.round(result[axis] + best.d);
      snaps[axis] = { value: best.value, edge: best.edge, label: best.label };
    } else result[axis] = Math.round(result[axis]);
    // Ściany są twarde: korpus nie wjeżdża w nie (gdy się mieści) — dochodzi do ściany i staje.
    const walls = targets.filter((t) => t.weight < 1);
    const minLo = Math.max(...walls.filter((t) => t.edge === 'lo').map((t) => t.value));
    // (przód przestrzeni jest otwarty — tam korpus może wystawać)
    const maxHi = axis === 'z' ? Infinity : Math.min(...walls.filter((t) => t.edge === 'hi').map((t) => t.value));
    const [nlo, nhi] = range(axis, result);
    if (maxHi - minLo >= nhi - nlo) {
      const label = (edge) => walls.filter((t) => t.edge === edge).sort((m, k) => (edge === 'lo' ? k.value - m.value : m.value - k.value))[0]?.label;
      if (nlo < minLo) {
        result[axis] = Math.round(result[axis] + (minLo - nlo));
        snaps[axis] = { value: minLo, edge: 'lo', label: label('lo') };
      } else if (nhi > maxHi) {
        result[axis] = Math.round(result[axis] - (nhi - maxHi));
        snaps[axis] = { value: maxHi, edge: 'hi', label: label('hi') };
      }
    }
  }
  return { pos: result, snaps };
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
const WALL_LABELS = { '-x': t('ściany'), '+x': t('ściany'), '-z': t('tylnej ściany'), '+z': t('krawędzi przestrzeni'), '-y': t('podłogi'), '+y': t('sufitu') };
export function slideTarget(project, cabinetIds, direction) {
  const ids = new Set(cabinetIds);
  const group = project.furniture.filter((c) => ids.has(c.id));
  if (!group.length) return null;
  const axis = direction[1];
  const dim = DIM[axis];
  const perp = AXES.filter((a) => a !== axis);
  const eps = 0.01;
  const names = new Map(project.furniture.map((c) => [c.id, t('korpusu „{name}”', { name: c.name })]));
  const others = [
    ...project.furniture.filter((c) => !ids.has(c.id)).map((c) => ({ ...cabinetBounds(c, project), label: names.get(c.id) })),
    ...project.space.obstacles.map((o) => ({ ...o, label: `„${o.name || t('przeszkody')}”` })),
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
    ...project.furniture.map((c) => ({ ...cabinetBounds(c, project), label: t('korpusu „{name}”', { name: c.name }) })),
    ...project.space.obstacles.filter((x) => x.id !== o.id).map((x) => ({ ...x, label: `„${x.name}”` })),
    // samodzielne półki i blaty (np. okap rozszerzony do półki obok)
    ...(project.boards ?? []).filter((b) => !b.hidden).map((b) => ({ ...boardBox(b, project), label: `„${b.name}”` })),
  ].filter(inBand);
  const { walls, width } = project.space;
  if (side === 'left') {
    let best = { x: 0, label: walls.left ? t('ściany') : t('krawędzi przestrzeni') };
    for (const b of boxes) if (b.x + b.width <= o.x + eps && b.x + b.width > best.x) best = { x: b.x + b.width, label: b.label };
    return { ...best, gap: Math.max(0, o.x - best.x) };
  }
  let best = { x: width, label: walls.right ? t('ściany') : t('krawędzi przestrzeni') };
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
  return obstacleEdgeTarget(project, obstacleId, x, threshold)?.v ?? x;
}

// Najbliższy cel przyciągania krawędzi (X) występu / okapu: ściany, boki korpusów, innych przeszkód
// i samodzielnych płyt (półek, blatów — np. półka, do której dosuwa się okap). → { v, label } albo null.
export function obstacleEdgeTarget(project, obstacleId, x, threshold = 30) {
  const targets = [
    { v: 0, label: t('lewej ściany') },
    { v: project.space.width, label: t('prawej ściany') },
    ...project.furniture.flatMap((c) => {
      const b = cabinetBounds(c, project);
      return [{ v: b.x, label: t('korpusu „{name}”', { name: c.name }) }, { v: b.x + b.width, label: t('korpusu „{name}”', { name: c.name }) }];
    }),
    ...project.space.obstacles
      .filter((o) => o.id !== obstacleId)
      .flatMap((o) => [{ v: o.x, label: `„${o.name || t('przeszkody')}”` }, { v: o.x + o.width, label: `„${o.name || t('przeszkody')}”` }]),
    ...(project.boards ?? []).flatMap((b) => [{ v: b.x, label: `„${b.name}”` }, { v: b.x + b.width, label: `„${b.name}”` }]),
  ];
  let best = null;
  for (const t of targets) if (Math.abs(t.v - x) < threshold && (!best || Math.abs(t.v - x) < Math.abs(best.v - x))) best = t;
  return best;
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

// Kopia zaznaczenia: korpusy (cabinetIds) oraz zaznaczone blaty / blendy wspólne („trim:id”) i samodzielne płyty
// („board:id”) — wszystko przesunięte razem o szerokość grupy: w prawo, a gdy tam brak miejsca — w lewo.
// Skopiowany blat / blenda obejmuje kopie zaznaczonych korpusów (te spoza zaznaczenia pomija).
// → { project, cabinetIds (kopie), blendIds (kopie) }
export function duplicateSelection(project, cabinetIds, partIds = []) {
  const cabs = project.furniture.filter((c) => cabinetIds.includes(c.id));
  const trims = (project.trims ?? []).filter((t) => partIds.includes(`trim:${t.id}`));
  const boards = (project.boards ?? []).filter((b) => partIds.includes(`board:${b.id}`));
  if (!cabs.length && !trims.length && !boards.length) return { project, cabinetIds: [], blendIds: [] };
  const boxes = [
    ...cabs.map((c) => cabinetBounds(c, project)),
    ...trims.map((t) => trimBox(t, project)).filter(Boolean),
    ...boards.map((b) => boardBox(b, project)),
  ];
  const x0 = Math.min(...boxes.map((b) => b.x));
  const W = Math.max(...boxes.map((b) => b.x + b.width)) - x0;
  const idMap = new Map(cabs.map((c) => [c.id, newId()]));
  const build = (dx) => {
    const furniture = cabs.map((c) => ({ ...structuredClone(c), id: idMap.get(c.id), name: `${c.name} (kopia)`, x: c.x + dx }));
    const newTrims = trims.map((t) => ({
      ...structuredClone(t),
      id: newId(),
      name: `${t.name} (kopia)`,
      cabinetIds: t.cabinetIds.filter((id) => idMap.has(id)).map((id) => idMap.get(id)),
      ...(t.x != null ? { x: t.x + dx } : {}),
    }));
    const newBoards = boards.map((b) => ({ ...structuredClone(b), id: newId(), name: `${b.name} (kopia)`, x: b.x + dx }));
    return {
      project: { ...project, furniture: [...project.furniture, ...furniture], trims: [...(project.trims ?? []), ...newTrims], boards: [...(project.boards ?? []), ...newBoards] },
      cabinetIds: furniture.map((c) => c.id),
      blendIds: [...newTrims.map((t) => `trim:${t.id}`), ...newBoards.map((b) => `board:${b.id}`)],
      furniture,
    };
  };
  const fits = (r, dx) => x0 + dx >= -0.5 && x0 + dx + W <= project.space.width + 0.5 && r.furniture.every((c) => !cabinetIssues(c, r.project).length);
  for (const dx of [W, -W]) {
    const r = build(dx);
    if (fits(r, dx)) return r;
  }
  return build(W);
}
