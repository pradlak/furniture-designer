import { LIMITS } from './space.js';
import { cabinetBounds, legHeight, ceilingGapFor } from './furniture.js';
import { spaceOutline, outlineEdges, edgeOutward, isFrontPoint, selfIntersects, cleanOutline } from './outline.js';
import { updateSpaceRefit, refillRows, refillDepth } from './layout.js';

// Przesuwanie całych ścian (np. przeciąganiem w widoku 3D). Meble, przeszkody i płyty zostają tam, gdzie stoją
// — zmienia się tylko pomieszczenie. Przesunięcie `d` (mm) mierzymy na zewnątrz pomieszczenia: d > 0 — ściana
// odsuwa się (pomieszczenie rośnie), d < 0 — przysuwa.
//  - 'right' — zmienia szerokość, 'ceiling' — wysokość,
//  - 'left' / 'back' — zmienia szerokość / głębokość, a ponieważ współrzędne liczymy od lewej i od tylnej ściany,
//    wszystko inne przesuwa się w modelu o d (w pokoju zostaje na miejscu),
//  - 'edge:<i>' — ściana z kształtu podłogi: oba jej punkty przesuwają się prostopadle do niej (punkty na przodzie
//    zostają na przodzie).
// Zwraca nowy projekt (albo ten sam, gdy przesunięcie jest niemożliwe, np. kształt przeciąłby sam siebie).

// Przesunięcie wszystkiego w modelu o (dx, dz) — gdy przesuwa się początek układu (lewa / tylna ściana).
function shiftContents(project, dx, dz) {
  const move = (o) => ({ ...o, x: o.x + dx, z: o.z + dz });
  return {
    ...project,
    furniture: project.furniture.map(move),
    boards: (project.boards ?? []).map(move),
    // blat z ręcznym położeniem (x od lewej ściany) — razem z resztą
    trims: project.trims.map((t) => (typeof t.x === 'number' ? { ...t, x: t.x + dx } : t)),
    space: { ...project.space, obstacles: project.space.obstacles.map(move) },
  };
}

// Najmniejsze i największe dopuszczalne przesunięcie ściany prostokąta.
export function wallMoveLimits(space, wall) {
  const size = { left: space.width, right: space.width, back: space.depth, ceiling: space.height }[wall];
  return [LIMITS.spaceMin - size, LIMITS.spaceMax - size];
}

export function moveWall(project, wall, d) {
  const { space } = project;
  if (wall.startsWith('edge:')) return moveOutlineEdge(project, Number(wall.slice(5)), d);
  const [lo, hi] = wallMoveLimits(space, wall);
  d = Math.round(Math.min(hi, Math.max(lo, d)));
  if (!d) return project;
  const W = space.width;
  const D = space.depth;
  const outline = space.outline;
  if (wall === 'ceiling') return updateSpaceRefit(project, (s) => ({ ...s, height: s.height + d }));
  // rzędy korpusów od ściany do ściany wypełniają nową szerokość (refillRows)
  if (wall === 'right') {
    const changed = updateSpaceRefit(project, (s) => ({
      ...s,
      width: W + d,
      outline: outline && fitOutline(outline.map(([x, z]) => [Math.abs(x - W) < 0.5 ? W + d : x, z]), { ...s, width: W + d }),
    }));
    return refillRows(project, changed, 0);
  }
  if (wall === 'left') {
    const shifted = shiftContents(project, d, 0);
    const changed = updateSpaceRefit(shifted, (s) => ({
      ...s,
      width: W + d,
      outline: outline && fitOutline(outline.map(([x, z]) => [Math.abs(x) < 0.5 ? 0 : x + d, z]), { ...s, width: W + d }),
    }));
    return refillRows(project, changed, d);
  }
  if (wall === 'back') {
    const shifted = shiftContents(project, 0, d);
    const changed = updateSpaceRefit(shifted, (s) => ({
      ...s,
      depth: D + d,
      outline: outline && fitOutline(outline.map(([x, z]) => [x, Math.abs(z) < 0.5 ? 0 : z + d]), { ...s, depth: D + d }),
    }));
    // korpusy przy tylnej ścianie jadą z nią, dopasowane na całą głębokość — wypełniają nową (refillDepth)
    return refillDepth(project, changed, d);
  }
  return project;
}

// Obrys po zmianie wymiarów: w granicach prostokąta, bez punktów zbędnych (prostokąt — null).
function fitOutline(pts, space) {
  const clamped = pts.map(([x, z]) => [Math.min(space.width, Math.max(0, x)), Math.min(space.depth, Math.max(0, z))]);
  return selfIntersects(clamped) ? clamped : cleanOutline(clamped, space);
}

function moveOutlineEdge(project, i, d) {
  const { space } = project;
  const pts = spaceOutline(space).map((p) => [...p]);
  const e = outlineEdges(space)[i];
  if (!e || e.open) return project;
  const [nx, nz] = edgeOutward(e, pts);
  const n = pts.length;
  const j = (i + 1) % n;
  // Przesunięta ściana: prosta równoległa o d dalej. Jej nowe końce to przecięcia z prostymi sąsiednich ścian —
  // sąsiednie ściany zachowują kierunek (tylko się wydłużają / skracają), punkty na przodzie zostają na przodzie.
  const moved = [pts[i][0] + nx * d, pts[i][1] + nz * d];
  const dir = [pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]];
  const meet = (p, q) => {
    // przecięcie prostej moved + t·dir z prostą p–q
    const r = [q[0] - p[0], q[1] - p[1]];
    const den = dir[0] * r[1] - dir[1] * r[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p[0] - moved[0]) * r[1] - (p[1] - moved[1]) * r[0]) / den;
    return [moved[0] + t * dir[0], moved[1] + t * dir[1]];
  };
  const ends = [
    [i, meet(pts[(i - 1 + n) % n], pts[i])],
    [j, meet(pts[j], pts[(j + 1) % n])],
  ];
  for (const [k, hit] of ends) {
    const front = isFrontPoint(pts[k], space);
    const [px, pz] = hit ?? [pts[k][0] + nx * d, pts[k][1] + nz * d];
    const x = Math.round(Math.min(space.width, Math.max(0, px)));
    const z = front ? space.depth : Math.round(Math.min(space.depth - 1, Math.max(0, pz)));
    pts[k] = [x, z];
  }
  if (selfIntersects(pts)) return project;
  return updateSpaceRefit(project, (s) => ({ ...s, outline: pts }));
}

// Cele przyciągania przesuwanej ściany: przesunięcia d, przy których ściana dotyka korpusu (albo samodzielnej płyty):
//  - lewa / prawa — skrajny bok korpusu, tylna — tył korpusu z jego odstępem od ściany (backGap),
//  - sufit — wierzch korpusu z luzem do sufitu, ściana z punktów — najdalej wysunięty narożnik korpusu w jej stronę
//    (tylko korpusy stojące naprzeciw tej ściany).
// → [{ d, label }]
export function wallSnapTargets(project, wall) {
  const { space } = project;
  const items = [
    ...project.furniture.map((c) => ({ box: cabinetBounds(c, project), label: `korpusu „${c.name}”`, c })),
    ...(project.boards ?? []).map((b) => ({ box: b, label: `„${b.name}”` })),
  ];
  const out = [];
  for (const { box, label, c } of items) {
    const x0 = Math.min(box.x, c?.x ?? box.x);
    const x1 = Math.max(box.x + box.width, c ? c.x + c.width : -Infinity);
    const z0 = Math.min(box.z, c ? c.z - (c.backGap ?? 0) : box.z);
    if (wall === 'right') out.push({ d: x1 - space.width, label });
    else if (wall === 'left') out.push({ d: -x0, label });
    else if (wall === 'back') out.push({ d: -z0, label });
    else if (wall === 'ceiling') {
      const top = c ? c.y + legHeight(c) + c.height + ceilingGapFor(c, project) : box.y + box.height;
      out.push({ d: top - space.height, label });
    } else if (wall.startsWith('edge:')) {
      const e = outlineEdges(space)[Number(wall.slice(5))];
      if (!e) continue;
      const pts = spaceOutline(space);
      const [nx, nz] = edgeOutward(e, pts);
      const [ux, uz] = [-nz, nx]; // kierunek wzdłuż ściany
      const along = (x, z) => ux * x + uz * z;
      const corners = [[x0, z0], [x1, z0], [x0, box.z + box.depth], [x1, box.z + box.depth]];
      // korpus naprzeciw ściany: jego rzut na kierunek ściany nachodzi na nią
      const [s0, s1] = [along(...e.a), along(...e.b)].sort((a, b) => a - b);
      const cs = corners.map(([x, z]) => along(x, z));
      if (Math.max(...cs) < s0 || Math.min(...cs) > s1) continue;
      const base = nx * e.a[0] + nz * e.a[1];
      out.push({ d: Math.max(...corners.map(([x, z]) => nx * x + nz * z)) - base, label });
    }
  }
  return out;
}

// Opis ściany i jej wymiaru (do podpowiedzi przy przeciąganiu).
export function wallMoveLabel(space, wall) {
  if (wall === 'left' || wall === 'right') return `${wall === 'left' ? 'Lewa' : 'Prawa'} ściana · szerokość ${space.width} mm`;
  if (wall === 'back') return `Tylna ściana · głębokość ${space.depth} mm`;
  if (wall === 'ceiling') return `Sufit · wysokość ${space.height} mm`;
  const e = outlineEdges(space)[Number(wall.slice(5))];
  return e ? `Ściana · ${Math.round(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]))} mm` : 'Ściana';
}
