// Obrys podłogi przestrzeni w rzucie (widok z góry): wielokąt [[x, z], …] w mm, x — od lewej ściany,
// z — od tylnej ściany do przodu. Brak obrysu (space.outline = null) — zwykły prostokąt width × depth.
// Obrys mieści się w prostokącie 0..width × 0..depth. Punkty leżące na przodzie (z = depth) tworzą otwarty przód
// przestrzeni (bez ściany); pozostałe krawędzie to ściany — także skośne i wklęsłe (np. wnęka w kształcie litery L).

const EPS = 0.5;

export const rectOutline = (W, D) => [
  [0, 0],
  [W, 0],
  [W, D],
  [0, D],
];
export const spaceOutline = (space) => space.outline ?? rectOutline(space.width, space.depth);
export const isFrontPoint = (p, space) => Math.abs(p[1] - space.depth) < EPS;

// Krawędzie obrysu: { i, a, b, open, tag } — open: przód (bez ściany); tag: 'front', ściana prostokąta
// ('left', 'right', 'back' — można je wyłączyć w panelu) albo `edge:<i>` (ściana wyznaczona punktami).
export function outlineEdges(space) {
  const pts = spaceOutline(space);
  const W = space.width;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const open = isFrontPoint(a, space) && isFrontPoint(b, space);
    const on = (k, v) => Math.abs(a[k] - v) < EPS && Math.abs(b[k] - v) < EPS;
    const tag = open ? 'front' : on(0, 0) ? 'left' : on(0, W) ? 'right' : on(1, 0) ? 'back' : `edge:${i}`;
    return { i, a, b, open, tag };
  });
}

export const edgeLength = ({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Jednostkowy wektor [x, z] prostopadły do krawędzi obrysu, skierowany na zewnątrz (poza podłogę).
export function edgeOutward(e, pts) {
  const dx = e.b[0] - e.a[0];
  const dz = e.b[1] - e.a[1];
  const l = Math.hypot(dx, dz) || 1;
  const n = [dz / l, -dx / l];
  const mx = (e.a[0] + e.b[0]) / 2;
  const mz = (e.a[1] + e.b[1]) / 2;
  return pointInPolygon(mx + n[0] * 2, mz + n[1] * 2, pts) ? [-n[0], -n[1]] : n;
}

export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

// Odległość punktu od obrysu, gdy leży poza nim (0 — w środku albo na krawędzi).
export function distanceOutside(x, z, pts) {
  if (pointInPolygon(x, z, pts)) return 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(x, z, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

// Odcinki wnętrza obrysu na prostej z = c (wzdłuż X) albo x = c (wzdłuż Z): [[od, do], …] posortowane.
function scan(pts, c, axis) {
  const [u, v] = axis === 'x' ? [0, 1] : [1, 0]; // u — współrzędna wzdłuż prostej, v — stała
  const xs = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (p[v] > c !== q[v] > c) xs.push(p[u] + ((c - p[v]) / (q[v] - p[v])) * (q[u] - p[u]));
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

// Wartości, w których sprawdzamy pas [lo, hi]: brzegi pasa i wierzchołki obrysu w środku (tuż po obu stronach).
function samples(pts, lo, hi, k) {
  const s = [lo + EPS, hi - EPS];
  for (const p of pts) if (p[k] > lo && p[k] < hi) s.push(p[k] - EPS, p[k] + EPS);
  return s.filter((v) => v >= lo && v <= hi);
}

// Najszerszy przedział X, w którym bryła o głębokości [z0, z1] mieści się w obrysie — w granicach [x0, x1]
// (np. wnęki przy kominku). Na każdej prostej wybieramy odcinek najbardziej pokrywający się z dotychczasowym.
export function freeWidth(space, z0, z1, x0 = 0, x1 = space.width) {
  const pts = spaceOutline(space);
  let [L, R] = [x0, x1];
  for (const z of samples(pts, z0, z1, 1)) {
    const best = scan(pts, z, 'x')
      .map(([a, b]) => [Math.max(a, L), Math.min(b, R)])
      .reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m), [0, -Infinity]);
    if (best[1] - best[0] <= 0) return [L, L];
    [L, R] = best;
  }
  return [L, R];
}

// Obrys, w którym skośne ściany boczne (pod każdym kątem, poza skośną ścianą tylną) są zastąpione prostymi w ich
// najdalszym miejscu — do dopasowania korpusu, który dostaje skośny bok (furniture.js, wallFitPlanes).
export function straightenSlantedSides(space) {
  const pts = spaceOutline(space);
  const out = [];
  for (const e of outlineEdges(space)) {
    out.push(e.a);
    const [dx, dz] = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    if (e.open || Math.abs(dx) < 1 || Math.abs(dz) < 1) continue;
    const [nx, nz] = edgeOutward(e, pts);
    if (!isSideWallNormal(nx, nz)) continue; // skośna ściana tylna albo prawie równoległa do przodu — zostaje
    // narożnik w najdalszym X (na zewnątrz) na wysokości punktu leżącego bardziej w środku
    const far = nx < 0 ? Math.min(e.a[0], e.b[0]) : Math.max(e.a[0], e.b[0]);
    const inner = Math.abs(e.a[0] - far) < Math.abs(e.b[0] - far) ? e.b : e.a;
    out.push(inner === e.b ? [far, e.b[1]] : [far, e.a[1]]);
  }
  return out;
}

// Czy skośna ściana (normalna na zewnątrz [nx, nz]) jest „boczna” — korpus dostaje przy niej skośny bok:
// nie stoi za korpusem (skośna ściana tylna) ani nie biegnie prawie równolegle do przodu (odchylona od ściany
// bocznej o więcej niż ~70° — wtedy korpus robi się płytszy, zamiast dostać skośny bok przez cały front).
export const SIDE_WALL_MIN_NX = 0.35;
export const isSideWallNormal = (nx, nz) => !(nz < 0 && Math.abs(nz) > Math.abs(nx)) && Math.abs(nx) >= SIDE_WALL_MIN_NX;

// Największe z (od tyłu), do którego pas szerokości [x0, x1] jest w środku obrysu, licząc od z = zFrom
// (np. tyłu korpusu) — gdzie z przodu zaczyna się ściana (np. prawie równoległa do przodu).
export function frontLimit(space, x0, x1, zFrom = 0) {
  const pts = spaceOutline(space);
  let front = space.depth;
  for (const x of samples(pts, x0, x1, 0)) {
    const spans = scan(pts, x, 'z');
    const span = spans.find(([a, b]) => a <= zFrom + 1 && b > zFrom + 1) ?? spans.find(([, b]) => b > zFrom + 1);
    if (span) front = Math.min(front, span[1]);
  }
  return front;
}

// Najmniejsze z (od tyłu), od którego pas szerokości [x0, x1] jest w środku obrysu aż do przodu.
export function backLimit(space, x0, x1) {
  const pts = spaceOutline(space);
  let back = 0;
  for (const x of samples(pts, x0, x1, 0)) {
    const spans = scan(pts, x, 'z');
    const front = spans.find(([, b]) => b >= space.depth - 1) ?? spans.at(-1);
    if (front) back = Math.max(back, front[0]);
  }
  return back;
}

// Czy wielokąt przecina sam siebie (krawędzie niesąsiednie mają punkt wspólny).
export function selfIntersects(pts) {
  const n = pts.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const hit = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (hit(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  return false;
}

// Porządkuje obrys: usuwa punkty pokrywające się z sąsiednim i leżące na prostej między sąsiadami.
// Wraca null, gdy zostaje zwykły prostokąt przestrzeni.
export function cleanOutline(pts, space) {
  let out = pts.map(([x, z]) => [Math.round(x), Math.round(z)]);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const p = out[(i - 1 + out.length) % out.length];
      const v = out[i];
      const q = out[(i + 1) % out.length];
      const dup = Math.hypot(v[0] - q[0], v[1] - q[1]) < 1;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const off = Math.abs((v[0] - p[0]) * (q[1] - p[1]) - (v[1] - p[1]) * (q[0] - p[0])) / len;
      if (dup || off < 1) {
        out.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  return isRect(out, space) ? null : out;
}

function isRect(pts, space) {
  if (pts.length !== 4) return false;
  const rect = rectOutline(space.width, space.depth);
  return rect.every(([x, z]) => pts.some((p) => Math.abs(p[0] - x) < EPS && Math.abs(p[1] - z) < EPS));
}

// Narożniki prostokąta przestrzeni (do gotowych kształtów: skośna ściana, ścięty narożnik).
export const OUTLINE_CORNERS = [
  { key: 'backLeft', label: 'lewy tylny', at: (s) => [0, 0] },
  { key: 'backRight', label: 'prawy tylny', at: (s) => [s.width, 0] },
  { key: 'frontRight', label: 'prawy przedni', at: (s) => [s.width, s.depth] },
  { key: 'frontLeft', label: 'lewy przedni', at: (s) => [0, s.depth] },
];

// Ścina narożnik obrysu: punkt narożnika zastępują dwa punkty — dx od narożnika wzdłuż X i dz wzdłuż Z.
// null, gdy obrys nie ma już tego narożnika (był wcześniej zmieniony).
export function cutCorner(space, cornerKey, dx, dz) {
  const pts = spaceOutline(space).map((p) => [...p]);
  const [cx, cz] = OUTLINE_CORNERS.find((c) => c.key === cornerKey).at(space);
  const i = pts.findIndex((p) => Math.abs(p[0] - cx) < EPS && Math.abs(p[1] - cz) < EPS);
  if (i < 0) return null;
  const toward = (n) => {
    const q = pts[(i + n + pts.length) % pts.length];
    const len = Math.hypot(q[0] - cx, q[1] - cz) || 1;
    const along = Math.abs(q[1] - cz) < EPS ? dx : dz; // krawędź pozioma (wzdłuż X) albo w głąb
    const t = Math.min(1, along / len);
    return [Math.round(cx + (q[0] - cx) * t), Math.round(cz + (q[1] - cz) * t)];
  };
  pts.splice(i, 1, toward(-1), toward(1));
  return cleanOutline(pts, space);
}

// Wstawia punkt na środku krawędzi i (między punktami i oraz i + 1). Zwraca { outline, index } nowego punktu.
export function insertPoint(space, i, at = null) {
  const pts = spaceOutline(space).map((p) => [...p]);
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const p = at ?? [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  pts.splice(i + 1, 0, p);
  return { outline: pts, index: i + 1 };
}

// Czy punkt można usunąć: zostają co najmniej 3 punkty i co najmniej 2 na przodzie (otwarty przód).
export function canRemovePoint(space, i) {
  const pts = spaceOutline(space);
  if (pts.length <= 3) return false;
  const front = pts.filter((p) => isFrontPoint(p, space)).length;
  return !(isFrontPoint(pts[i], space) && front <= 2);
}

// Zmiana szerokości / głębokości przestrzeni: punkty na prawej ścianie i na przodzie idą razem z nimi.
export function resizeOutline(outline, oldW, oldD, W, D) {
  if (!outline) return null;
  return outline.map(([x, z]) => [
    Math.abs(x - oldW) < EPS ? W : Math.min(x, W),
    Math.abs(z - oldD) < EPS ? D : Math.min(z, D),
  ]);
}

// Obrys z pliku: co najmniej 3 punkty w prostokącie przestrzeni, bez przecięć; inaczej null (prostokąt).
export function normalizeOutline(raw, space) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const pts = raw
    .filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map(([x, z]) => [Math.min(space.width, Math.max(0, Number(x))), Math.min(space.depth, Math.max(0, Number(z)))]);
  if (pts.length < 3 || selfIntersects(pts)) return null;
  return cleanOutline(pts, space);
}

// Zgodność wstecz: skośne ściany zapisane jako ścięcia narożników ({ corner, dx, dz }) → obrys.
export function outlineFromCuts(cuts, space) {
  let poly = rectOutline(space.width, space.depth);
  const C = { backLeft: [1, 1], backRight: [-1, 1], frontLeft: [1, -1], frontRight: [-1, -1] };
  for (const cut of cuts) {
    const [sx, sz] = C[cut?.corner] ?? [];
    const dx = Number(cut?.dx);
    const dz = Number(cut?.dz);
    if (!sx || !(dx > 0) || !(dz > 0)) continue;
    const cx = sx > 0 ? 0 : space.width;
    const cz = sz > 0 ? 0 : space.depth;
    // zostaje strona: sx·(x−cx)/dx + sz·(z−cz)/dz ≥ 1
    const d = ([x, z]) => 1 - (sx * (x - cx)) / dx - (sz * (z - cz)) / dz; // > 0 — odcięte
    const out = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      const dp = d(p);
      const dq = d(q);
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    poly = out;
  }
  return poly.length >= 3 ? cleanOutline(poly, space) : null;
}
