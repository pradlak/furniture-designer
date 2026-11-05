import { cabinetBounds, cabinetIssues, newId } from './furniture.js';

// Ustawianie mebli: przyciąganie, dosuwanie, duplikowanie.
// Wszystko liczone na prostopadłościanach obejmujących meble (cabinetBounds) i przeszkody.

const DIM = { x: 'width', y: 'height', z: 'depth' };
const AXES = ['x', 'y', 'z'];

const spaceSize = (space, axis) => space[DIM[axis]];

// Inne meble i przeszkody jako prostopadłościany.
function otherBoxes(project, cabinetId) {
  return [
    ...project.furniture.filter((c) => c.id !== cabinetId).map(cabinetBounds),
    ...project.space.obstacles,
  ];
}

// Przyciąga proponowaną pozycję korpusu (pos: {x, y, z}) w podanych osiach do ścian
// i krawędzi innych mebli / przeszkód, jeśli krawędź jest bliżej niż `threshold` mm.
export function snapPosition(project, cabinetId, pos, axes, threshold = 30) {
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet);
  const others = otherBoxes(project, cabinetId);
  const result = { ...pos };

  for (const axis of axes) {
    const dim = DIM[axis];
    const offset = b[axis] - cabinet[axis]; // płyty mogą wystawać poza wymiar nominalny
    const lo = pos[axis] + offset;
    const hi = lo + b[dim];
    const targets = [0, spaceSize(project.space, axis), ...others.flatMap((o) => [o[axis], o[axis] + o[dim]])];

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
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet);
  const axis = direction[1];
  const dim = DIM[axis];
  const perp = AXES.filter((a) => a !== axis);
  const eps = 0.01;
  const onPath = (o) => perp.every((a) => o[a] < b[a] + b[DIM[a]] - eps && b[a] < o[a] + o[DIM[a]] - eps);
  const others = otherBoxes(project, cabinetId).filter(onPath);

  let delta;
  if (direction[0] === '-') {
    let stop = 0;
    for (const o of others) if (o[axis] + o[dim] <= b[axis] + eps) stop = Math.max(stop, o[axis] + o[dim]);
    delta = stop - b[axis];
  } else {
    let stop = spaceSize(project.space, axis);
    for (const o of others) if (o[axis] >= b[axis] + b[dim] - eps) stop = Math.min(stop, o[axis]);
    delta = stop - (b[axis] + b[dim]);
  }
  return { ...cabinet, [axis]: cabinet[axis] + delta };
}

// Kopia korpusu ustawiona obok oryginału: z prawej, a jeśli tam nie ma miejsca — z lewej.
export function duplicateCabinet(project, cabinetId) {
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const b = cabinetBounds(cabinet);
  const copy = { ...structuredClone(cabinet), id: newId(), name: `${cabinet.name} (kopia)` };

  for (const dx of [b.width, -b.width]) {
    const candidate = { ...copy, x: cabinet.x + dx };
    const issues = cabinetIssues(candidate, { ...project, furniture: [...project.furniture, candidate] });
    if (!issues.length) return candidate;
  }
  return { ...copy, x: cabinet.x + b.width };
}
