// Samodzielne płyty poziome (project.boards): blat (np. biurko, parapet, blat na nogach) albo półka
// (np. wisząca na ścianie) — niezwiązane z korpusami. Każda ma frezy krawędzi i otwory (model/boardFeatures.js).
//
// board: { id, name, kind: 'worktop' | 'shelf', x, y, z (lewy-dolny-tylny narożnik, mm), width (wzdłuż X),
//          depth (wzdłuż Z), materialId, color, edges, holes, hidden }
// Grubość — z materiału, albo własna (board.thickness, np. wpisana w menu „Wymiary” w widoku 3D).

import { resolveMaterial, withColor, normalizeColor } from './materials.js';
import { defaultEdges, normalizeEdges, normalizeHoles, holeFits } from './boardFeatures.js';
import { isPointInside, describeOutside } from './space.js';
import { newId, cabinetBounds } from './furniture.js';

export const BOARD_KINDS = [
  { key: 'worktop', label: 'Blat' },
  { key: 'shelf', label: 'Półka' },
];
export const BOARD_LIMITS = { sizeMin: 50, sizeMax: 6000 };

export function boardMaterial(board, project) {
  const m = withColor(resolveMaterial(project, board.materialId, board.kind === 'worktop' ? 'worktop' : 'chipboard'), board.color);
  // własna grubość płyty — materiał w tej grubości (do rysunku, formatek i zamówień)
  return board.thickness ? { ...m, thickness: board.thickness, name: m.thickness === board.thickness ? m.name : `${m.name} (gr. ${board.thickness} mm)` } : m;
}

// Prostopadłościan płyty (mm, układ przestrzeni).
export function boardBox(board, project) {
  return { x: board.x, y: board.y, z: board.z, width: board.width, height: boardMaterial(board, project).thickness, depth: board.depth };
}

export function createBoard(project, kind = 'worktop', at = null) {
  const { space } = project;
  const count = (project.boards ?? []).filter((b) => b.kind === kind).length;
  const worktop = kind === 'worktop';
  const depth = Math.min(worktop ? 600 : 250, space.depth);
  // wolne miejsce przy tylnej ścianie (nie w okapie, występie, korpusie ani innej płycie)
  const size = { width: Math.min(worktop ? 1600 : 800, space.width), depth, thickness: boardThicknessFor(project, kind) };
  const spot = at
    ? boardSpotAt(project, size, at) // upuszczona w widoku 3D
    : freeBoardSpot(project, { ...size, y: worktop ? Math.min(750, space.height - 50) : Math.min(1500, space.height - 100) });
  return {
    id: newId(),
    name: `${worktop ? 'Blat' : 'Półka'} ${count + 1}`,
    kind,
    x: spot.x,
    y: spot.y,
    width: spot.width,
    z: 0, // przy tylnej ścianie
    depth,
    materialId: project.materials?.find((m) => m.type === (worktop ? 'worktop' : 'chipboard'))?.id ?? null,
    color: null,
    edges: defaultEdges(),
    holes: [],
    mount: { type: kind === 'shelf' ? 'brackets' : null, count: null }, // półka — domyślnie na wspornikach
    hidden: false,
  };
}

export function normalizeBoard(raw = {}) {
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const { sizeMin, sizeMax } = BOARD_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Płyta',
    kind: raw.kind === 'shelf' ? 'shelf' : 'worktop',
    x: num(raw.x, 0, -sizeMax, sizeMax * 4),
    y: num(raw.y, 750, -sizeMax, sizeMax * 4),
    z: num(raw.z, 0, -sizeMax, sizeMax * 4),
    width: num(raw.width, 1600, sizeMin, sizeMax),
    depth: num(raw.depth, 600, sizeMin, sizeMax),
    thickness: raw.thickness == null || raw.thickness === '' ? null : num(raw.thickness, null, 3, 100), // własna grubość (null — z materiału)
    materialId: typeof raw.materialId === 'string' ? raw.materialId : null,
    color: normalizeColor(raw.color),
    edges: normalizeEdges(raw.edges),
    holes: normalizeHoles(raw.holes),
    mount: normalizeMount(raw.mount), // mocowanie do ściany
    // zapas (luz) przy dopasowaniu do wnęki: płyta krótsza o tyle (łącznie, po połowie z każdej strony), żeby weszła
    // mimo niedokładnego pomiaru / krzywych ścian; 0 — dokładnie na wymiar
    clearance: num(raw.clearance, 0, 0, 50),
    hidden: raw.hidden === true,
  };
}

// Problemy płyty (do podświetlenia i listy): poza przestrzenią, otwór nie mieści się w płycie.
export function boardIssues(board, project) {
  const b = boardBox(board, project);
  const corners = [];
  for (const x of [b.x, b.x + b.width]) for (const y of [b.y, b.y + b.height]) for (const z of [b.z, b.z + b.depth]) corners.push([x, y, z]);
  const issues = [];
  const outside = describeOutside(corners, project.space, { openFront: true });
  if (outside) issues.push(outside);
  board.holes.forEach((h, i) => {
    if (!holeFits(h, board.width, board.depth)) issues.push(`Otwór ${i + 1} nie mieści się w płycie (min. 10 mm od krawędzi).`);
  });
  // mocowanie ukryte: pręt / płytka montażowa grubsze niż płyta — nie schowają się
  const work = mountMachining(board);
  if (work?.kind === 'holes' && work.d > b.height - 6) issues.push(`Otwór pod pręt Ø${work.d} jest za duży do płyty grubości ${b.height} mm (zostaje mniej niż 3 mm ścianki) — weź grubszą płytę albo cieńszy pręt.`);
  if (work?.plate && work.plate.h > b.height) issues.push(`Płytka montażowa (wys. ${work.plate.h} mm) jest wyższa niż płyta (${b.height} mm) — nie schowa się w tylnej krawędzi.`);
  return issues;
}

// Miejsce na nową płytę przy tylnej ścianie, niezasłonięte: bez kolizji z przeszkodami (okap, występ ściany),
// korpusami i innymi płytami. Najpierw na zwykłej wysokości (y) jak najbliżej środka; gdy pełna szerokość się nie
// mieści — w największej wolnej luce (co najmniej 300 mm, płyta węższa); potem na innych wysokościach.
// → { x, y, width }
// Wolne przedziały X (od ściany do ściany) dla płyty na wysokości y o grubości t, przy tylnej ścianie (do głębokości
// depth): bez przeszkód (okap, występ), korpusów i innych płyt (skip — id płyty pominiętej). → [[od, do], …]
function freeXGaps(project, y, t, depth, skip = null) {
  const { space } = project;
  const boxes = [
    ...space.obstacles,
    ...project.furniture.map((c) => cabinetBounds(c, project)),
    ...(project.boards ?? []).filter((b) => b.id !== skip).map((b) => boardBox(b, project)),
  ];
  const taken = boxes
    .filter((b) => b.y < y + t && b.y + b.height > y && b.z < depth && b.z + b.depth > 0)
    .map((b) => [b.x, b.x + b.width])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cur = 0;
  for (const [a, b] of taken) {
    if (a > cur) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < space.width) gaps.push([cur, space.width]);
  return gaps;
}

// Płyta upuszczona w widoku 3D (przeciągnięta z przycisku „+ Półka”): w punkcie (x — środek, y — spód), przy tylnej
// ścianie; w wolnej luce, w której jest kursor (albo najbliższej) — gdy luka węższa niż płyta, płyta ma jej szerokość
// (np. od ściany do boku okapu). → { x, y, width }
export function boardSpotAt(project, { width, depth, thickness }, at) {
  const { space } = project;
  const y = Math.round(Math.min(Math.max(at.y, 0), space.height - thickness));
  const gaps = freeXGaps(project, y, thickness, depth).filter(([a, b]) => b - a >= 50);
  if (!gaps.length) return { x: Math.round(Math.min(Math.max(at.x - width / 2, 0), Math.max(0, space.width - width))), y, width };
  const dist = ([a, b]) => (at.x < a ? a - at.x : at.x > b ? at.x - b : 0);
  const [a, b] = gaps.reduce((m, g) => (dist(g) < dist(m) ? g : m));
  const w = Math.min(width, b - a);
  const x = Math.min(Math.max(at.x - w / 2, a), b - w);
  return { x: Math.round(x), y, width: Math.round(w) };
}

export function freeBoardSpot(project, { width, depth, thickness, y }) {
  const { space } = project;
  const GAP = 300;
  const levels = [y, y + 300, y - 300, y + 600, y - 600, y + 900, y - 900].filter((v) => v >= 0 && v + thickness <= space.height);
  for (const yy of levels) {
    const gaps = freeXGaps(project, yy, thickness, depth);
    // pełna szerokość: położenie najbliżej środka przestrzeni
    const mid = (space.width - width) / 2;
    let best = null;
    for (const [a, b] of gaps) {
      if (b - a < width) continue;
      const x = Math.min(Math.max(mid, a), b - width);
      if (!best || Math.abs(x - mid) < Math.abs(best.x - mid)) best = { x, y: yy, width };
    }
    if (best) return { ...best, x: Math.round(best.x) };
    const wide = gaps.filter(([a, b]) => b - a >= GAP).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (wide) return { x: Math.round(wide[0]), y: yy, width: Math.round(wide[1] - wide[0]) };
  }
  return { x: Math.max(0, Math.round((space.width - width) / 2)), y, width };
}

// Grubość nowej płyty danego rodzaju — z domyślnego materiału.
export const boardThicknessFor = (project, kind) => boardMaterial({ kind, materialId: project.materials?.find((m) => m.type === (kind === 'worktop' ? 'worktop' : 'chipboard'))?.id ?? null }, project).thickness;
export const NEW_BOARD_SIZE = (project, kind) => ({
  width: Math.min(kind === 'worktop' ? 1600 : 800, project.space.width),
  depth: Math.min(kind === 'worktop' ? 600 : 250, project.space.depth),
  thickness: boardThicknessFor(project, kind),
});

// --- dosuwanie / rozszerzanie samodzielnej płyty (menu prawego kliku w 3D) ---
// Najbliższa przeszkoda w danym kierunku: side 'left' | 'right' (po X, na wysokości i głębokości płyty),
// 'down' (wierzch czegoś pod płytą albo podłoga), 'up' (spód czegoś nad płytą albo sufit).
// → { gap (mm, ≥ 0), label } albo null (płyta już dotyka).
export function boardNeighbour(project, id, side) {
  const board = project.boards?.find((b) => b.id === id);
  if (!board) return null;
  const { space } = project;
  const me = boardBox(board, project);
  const others = [
    ...space.obstacles.map((o) => ({ box: o, label: `„${o.name || 'przeszkody'}”` })),
    ...project.furniture.map((c) => ({ box: cabinetBounds(c, project), label: `korpusu „${c.name}”` })),
    ...(project.boards ?? []).filter((b) => b.id !== id).map((b) => ({ box: boardBox(b, project), label: `„${b.name}”` })),
  ];
  const overlap = (b, axes) => axes.every((k) => {
    const D = { x: 'width', y: 'height', z: 'depth' }[k];
    return b[k] < me[k] + me[D] - 0.5 && b[k] + b[D] > me[k] + 0.5;
  });
  let best;
  if (side === 'left' || side === 'right') {
    best = side === 'left' ? { gap: me.x, label: 'lewej ściany' } : { gap: space.width - (me.x + me.width), label: 'prawej ściany' };
    for (const { box, label } of others) {
      if (!overlap(box, ['y', 'z'])) continue;
      const gap = side === 'left' ? me.x - (box.x + box.width) : box.x - (me.x + me.width);
      if (gap >= -0.5 && gap < best.gap) best = { gap, label };
    }
  } else {
    best = side === 'down' ? { gap: me.y, label: 'podłogi' } : { gap: space.height - (me.y + me.height), label: 'sufitu' };
    for (const { box, label } of others) {
      if (!overlap(box, ['x', 'z'])) continue;
      const gap = side === 'down' ? me.y - (box.y + box.height) : box.y - (me.y + me.height);
      if (gap >= -0.5 && gap < best.gap) best = { gap, label: side === 'down' ? `wierzchu ${label}` : `spodu ${label}` };
    }
  }
  return best.gap >= 0.5 ? { gap: Math.round(best.gap), label: best.label } : null;
}

// Dosunięcie (move) albo rozszerzenie (extend — tylko lewo / prawo) płyty do najbliższej przeszkody. → nowy projekt.
// Zapas z jednej strony płyty (połowa board.clearance) — przy dosuwaniu / rozszerzaniu w lewo i w prawo.
export const sideClearance = (board) => (Number(board?.clearance) || 0) / 2;

// O ile płyta przesunie się / urośnie w danym kierunku (z zapasem po bokach). → { gap, label } albo null
export function boardStep(project, id, side) {
  const n = boardNeighbour(project, id, side);
  if (!n) return null;
  const board = project.boards.find((b) => b.id === id);
  const gap = side === 'left' || side === 'right' ? n.gap - sideClearance(board) : n.gap;
  return gap >= 0.5 ? { ...n, gap: Math.round(gap * 10) / 10 } : null;
}

export function nudgeBoard(project, id, side, mode = 'move') {
  const n = boardStep(project, id, side);
  if (!n) return project;
  const patch = (b) => {
    if (mode === 'extend') return side === 'left' ? { x: b.x - n.gap, width: b.width + n.gap } : { width: b.width + n.gap };
    return { left: { x: b.x - n.gap }, right: { x: b.x + n.gap }, down: { y: b.y - n.gap }, up: { y: b.y + n.gap } }[side];
  };
  return { ...project, boards: project.boards.map((b) => (b.id === id ? { ...b, ...patch(b) } : b)) };
}

// Dopasowanie szerokości do wnęki: od lewego do prawego sąsiada (ściana, okap, korpus, płyta) minus zapas
// (po połowie z każdej strony) — rozszerza albo zwęża płytę. → nowy projekt (bez zmian, gdy nie da się dopasować)
export function fitBoardWidth(project, id) {
  const board = project.boards.find((b) => b.id === id);
  if (!board) return project;
  const nl = boardNeighbour(project, id, 'left');
  const nr = boardNeighbour(project, id, 'right');
  const left = board.x - (nl?.gap ?? 0); // krawędź wnęki z lewej (gdy płyta dotyka — jej lewa krawędź)
  const right = board.x + board.width + (nr?.gap ?? 0);
  const c = sideClearance(board);
  const width = Math.round((right - left - 2 * c) * 10) / 10;
  if (width < BOARD_LIMITS.sizeMin) return project;
  return { ...project, boards: project.boards.map((b) => (b.id === id ? { ...b, x: Math.round((left + c) * 10) / 10, width } : b)) };
}
// szerokość wnęki (bez zapasu) — do opisu w menu
export function boardNicheWidth(project, id) {
  const board = project.boards.find((b) => b.id === id);
  if (!board) return null;
  const nl = boardNeighbour(project, id, 'left');
  const nr = boardNeighbour(project, id, 'right');
  return Math.round(board.width + (nl?.gap ?? 0) + (nr?.gap ?? 0));
}

// --- mocowanie samodzielnej płyty do ściany (tylnej) ---
// board.mount = { type, count } — type: null (brak — płyta leży na czymś albo mocowanie dobierzesz sam),
// 'brackets' (wsporniki kątowe pod półką), 'hidden' (ukryte bolce / pręty — półka „wisząca”), 'cleat' (listwa pod
// tylną krawędzią), 'rail' (szyny ścienne ze wspornikami); count — liczba wsporników / bolców (null — automatycznie).
export const BOARD_MOUNTS = [
  { key: null, label: 'Brak (leży na czymś / dobiorę sam)' },
  { key: 'brackets', label: 'Wsporniki kątowe (pod półką)', item: 'Wspornik półki kątowy (z kołkami i wkrętami)', spacing: 700 },
  { key: 'hidden', label: 'Ukryte — półka wisząca (bolce / pręty)', item: 'Bolec / pręt mocowania ukrytego półki (z kołkiem)', spacing: 400 },
  { key: 'cleat', label: 'Listwa pod tylną krawędzią', item: 'Listwa montażowa pod półkę (z kołkami i wkrętami)' },
  { key: 'rail', label: 'Szyny ścienne ze wspornikami', item: 'Szyna ścienna + wspornik półki (komplet)', spacing: 700 },
];
export const MOUNT_EDGE = 80; // mm — skrajne wsporniki od końców płyty
export const mountInfo = (type) => BOARD_MOUNTS.find((m) => m.key === (type ?? null)) ?? BOARD_MOUNTS[0];

export function normalizeMount(raw) {
  const type = BOARD_MOUNTS.some((m) => m.key && m.key === raw?.type) ? raw.type : null;
  const count = Number(raw?.count);
  // obróbka pod mocowanie ukryte — domyślnie otwory pod pręty
  const machining = type === 'hidden' ? (raw?.machining === null ? null : raw?.machining === 'slot' ? 'slot' : 'holes') : null;
  // wymiary obróbki (null — typowe z MOUNT_MACHINING): otwory — średnica, głębokość; frez — szerokość, długość, głębokość
  const dim = (v, min, max) => {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  };
  return {
    type,
    count: type && Number.isFinite(count) && count >= 1 ? Math.min(20, Math.round(count)) : null,
    machining,
    holeD: dim(raw?.holeD, 3, 40),
    holeDepth: dim(raw?.holeDepth, 10, 500),
    slotW: dim(raw?.slotW, 5, 100),
    slotLen: dim(raw?.slotLen, 20, 600),
    slotDepth: dim(raw?.slotDepth, 1, 40),
    plate: raw?.plate !== false, // wpust pod płytkę montażową (domyślnie tak)
    // wpust: 'each' — osobno przy każdym pręcie, 'long' — jeden długi (od pierwszej do ostatniej płytki, np. pod listwę)
    plateMode: raw?.plateMode === 'long' ? 'long' : 'each',
    edge: dim(raw?.edge, 0, 1000), // odstęp skrajnego elementu od boku płyty (null — domyślny)
    plateW: dim(raw?.plateW, 10, 400),
    plateH: dim(raw?.plateH, 5, 100),
    plateDepth: dim(raw?.plateDepth, 1, 30),
  };
}

// Liczba wsporników / bolców (listwa — 1 szt.) i ich położenia (od lewej krawędzi płyty, mm).
// Skrajne mocowania: element (płytka montażowa / frez / otwór / wspornik) stoi edge mm od boku płyty — domyślnie
// przy mocowaniu ukrytym 30 mm (płytka jak najbliżej krawędzi), przy wspornikach 70 mm. Elementy nie nachodzą na
// siebie (co najmniej 20 mm odstępu) i nie wychodzą poza płytę — przy szerokiej płytce wypada ich mniej.
// → { type, count, xs (środki, od lewej), elementW (szerokość elementu), edge }
export function mountPoints(board) {
  const m = normalizeMount(board.mount);
  const info = mountInfo(m.type);
  if (!m.type) return { type: null, count: 0, xs: [], elementW: 0, edge: 0 };
  if (m.type === 'cleat') return { type: m.type, count: 1, xs: [], elementW: 0, edge: 0 };
  const work = mountMachining(board);
  const elementW = work?.plate ? work.plate.w : work?.kind === 'slot' ? work.w : work?.kind === 'holes' ? work.d : 20;
  const edge = m.edge ?? (m.type === 'hidden' ? 30 : MOUNT_EDGE - 10);
  const offset = edge + elementW / 2; // środek skrajnego elementu od boku płyty
  const span = board.width - 2 * offset;
  if (span < 0) return { type: m.type, count: 1, xs: [board.width / 2], elementW, edge };
  const maxCount = Math.floor(span / (elementW + 20)) + 1;
  const count = Math.max(1, Math.min(maxCount, m.count ?? Math.max(2, Math.ceil(span / info.spacing) + 1)));
  const xs = count === 1 ? [board.width / 2] : Array.from({ length: count }, (_, i) => offset + (span * i) / (count - 1));
  return { type: m.type, count, xs, elementW, edge };
}

// Obróbka płyty pod mocowanie ukryte (mount.machining): 'holes' — otwory w tylnej krawędzi pod pręty / bolce
// (w osi grubości), 'slot' — frez (wpust) w spodzie od tylnej krawędzi pod płaski wspornik; null — bez obróbki
// (np. mocowanie zaciskowe). Położenia — jak wsporniki (mountPoints).
export const MOUNT_MACHINING = [
  { key: null, label: 'bez obróbki' },
  // plate — wpust w tylnej krawędzi pod płytkę montażową (przykręcaną do ściany): szerokość × wysokość, głębokość
  //   (= grubość płytki) — bez niego półka nie dochodzi do ściany
  { key: 'holes', label: 'otwory w tylnej krawędzi pod pręty (Ø12, gł. 130)', d: 12, depth: 130, plateW: 120, plateH: 16, plateDepth: 5 },
  { key: 'slot', label: 'frez w spodzie od tyłu pod płaskownik (25 × 150, gł. 6)', w: 25, len: 150, depth: 6 },
];
const fmtMm = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
// Wymiary obróbki pod mocowanie ukryte (własne albo typowe). → { kind: 'holes', d, depth } | { kind: 'slot', w, len, depth } | null
export function mountMachining(board) {
  const m = normalizeMount(board.mount);
  if (m.type !== 'hidden' || !m.machining) return null;
  const info = MOUNT_MACHINING.find((x) => x.key === m.machining);
  return m.machining === 'holes'
    ? {
        kind: 'holes',
        d: m.holeD ?? info.d,
        depth: m.holeDepth ?? info.depth,
        plate: m.plate ? { w: m.plateW ?? info.plateW, h: m.plateH ?? info.plateH, depth: m.plateDepth ?? info.plateDepth, long: m.plateMode === 'long' } : null,
      }
    : { kind: 'slot', w: m.slotW ?? info.w, len: m.slotLen ?? info.len, depth: m.slotDepth ?? info.depth };
}
export function describeMountWork(board, thickness) {
  const w = mountMachining(board);
  if (!w) return '';
  const pts = mountPoints(board);
  const at = pts.xs.map(fmtMm).join('; ');
  if (w.kind === 'holes') {
    const span = plateSpans(board)[0];
    const plate = !w.plate
      ? ''
      : w.plate.long
        ? `; jeden wpust pod płytkę montażową w tylnej krawędzi na długości ${fmtMm(span[1] - span[0])} mm (od x ${fmtMm(span[0])} do ${fmtMm(span[1])} mm), wys. ${fmtMm(Math.min(w.plate.h, thickness))} mm w osi grubości, gł. ${fmtMm(w.plate.depth)} mm`
        : `; wpust pod płytkę montażową w tylnej krawędzi: ${fmtMm(w.plate.w)} × ${fmtMm(Math.min(w.plate.h, thickness))} mm (szer. × wys., w osi grubości), gł. ${fmtMm(w.plate.depth)} mm, przy każdym otworze`;
    return `mocowanie ukryte: ${pts.count} otw. Ø${fmtMm(w.d)} gł. ${fmtMm(w.depth)} mm w tylnej krawędzi, w osi grubości (${fmtMm(thickness / 2)} mm od spodu), x od lewej: ${at} mm${plate}`;
  }
  return `mocowanie ukryte: ${pts.count} frezy w spodzie od tylnej krawędzi ${fmtMm(w.w)} × ${fmtMm(w.len)} mm, gł. ${fmtMm(w.depth)} mm, środek x od lewej: ${at} mm`;
}

// Wpusty pod płytki montażowe (tylna krawędź): [[od, do]] w mm od lewej — przy każdym pręcie osobno albo jeden długi.
export function plateSpans(board) {
  const work = mountMachining(board);
  if (!work?.plate) return [];
  const { xs } = mountPoints(board);
  if (!xs.length) return [];
  const half = work.plate.w / 2;
  if (work.plate.long) return [[Math.max(0, xs[0] - half), Math.min(board.width, xs[xs.length - 1] + half)]];
  return xs.map((u) => [u - half, u + half]);
}
