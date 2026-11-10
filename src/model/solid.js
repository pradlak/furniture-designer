// Bryły wypukłe (płyty docięte skośnie, np. pod skos): lista ścian, każda ściana to wielokąt
// z punktów [x, y, z] (mm, układ przestrzeni). Bez zależności od Three.js — używane w modelu
// (kolizje, wymiary formatek) i w widoku 3D.

const EPS = 1e-6;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Prostopadłościan { x, y, z, width, height, depth } jako bryła.
export function boxSolid(b) {
  const [x0, y0, z0] = [b.x, b.y, b.z];
  const [x1, y1, z1] = [b.x + b.width, b.y + b.height, b.z + b.depth];
  const P = (x, y, z) => [x, y, z];
  return [
    [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], // dół
    [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], // góra
    [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], // lewa
    [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], // prawa
    [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], // tył
    [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], // przód
  ];
}

// Przycina bryłę półprzestrzenią normal · p <= offset (normal — wektor jednostkowy).
// Zwraca nową bryłę (może być pusta: []).
export function clipSolid(faces, normal, offset) {
  const dist = (p) => dot(normal, p) - offset;
  const result = [];
  const capPoints = [];
  for (const f of faces) {
    const kept = [];
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      const q = f[(i + 1) % f.length];
      const dp = dist(p);
      const dq = dist(q);
      if (dp <= EPS) kept.push(p);
      if (Math.abs(dp) <= EPS) capPoints.push(p);
      if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
        const ip = lerp(p, q, dp / (dp - dq));
        kept.push(ip);
        capPoints.push(ip);
      }
    }
    if (kept.length >= 3) result.push(kept);
  }
  const cap = unique(capPoints);
  if (cap.length >= 3 && result.length) {
    // Pokrywka w miejscu cięcia: punkty posortowane wokół środka (wielokąt wypukły).
    const c = cap.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / cap.length);
    const u = normalize(sub(cap[0], c));
    const v = cross(normal, u);
    cap.sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
    result.push(cap);
  }
  return result.length >= 4 ? result : [];
}

// Czy płaszczyzna normal · p = offset przecina bryłę (część bryły leży po stronie > offset).
export function isClippedBy(faces, normal, offset) {
  return vertices(faces).some((p) => dot(normal, p) - offset > 1e-3);
}

export function vertices(faces) {
  return unique(faces.flat());
}

export function solidBounds(faces) {
  const pts = vertices(faces);
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
  return { x: min[0], y: min[1], z: min[2], width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2] };
}

// Rozpiętość bryły wzdłuż kierunku (wektor jednostkowy).
export function extentAlong(faces, dir) {
  const d = vertices(faces).map((p) => dot(p, dir));
  return Math.max(...d) - Math.min(...d);
}

// Prawdziwe nachodzenie dwóch brył wypukłych (twierdzenie o osi rozdzielającej);
// samo stykanie się ścianami nie jest kolizją.
export function solidsOverlap(a, b, eps = 0.01) {
  const axes = [...faceNormals(a), ...faceNormals(b)];
  for (const ea of edgeDirs(a)) for (const eb of edgeDirs(b)) {
    const c = cross(ea, eb);
    if (len(c) > 1e-6) axes.push(normalize(c));
  }
  const va = vertices(a);
  const vb = vertices(b);
  for (const axis of axes) {
    const pa = va.map((p) => dot(p, axis));
    const pb = vb.map((p) => dot(p, axis));
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
  }
  return true;
}

// Zarys bryły rzutowanej na płaszczyznę (u, v) — wielokąt wypukły (otoczka) jako punkty [u, v].
export function outline2d(faces, u, v) {
  const pts = vertices(faces).map((p) => [dot(p, u), dot(p, v)]);
  return convexHull(pts);
}

function faceNormals(faces) {
  const out = [];
  for (const f of faces) {
    const n = newell(f);
    if (len(n) < 1e-9) continue;
    const nn = normalize(n);
    if (!out.some((m) => Math.abs(Math.abs(dot(m, nn)) - 1) < 1e-9)) out.push(nn);
  }
  return out;
}

function edgeDirs(faces) {
  const out = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const d = sub(f[(i + 1) % f.length], f[i]);
      if (len(d) < 1e-6) continue;
      const nd = normalize(d);
      if (!out.some((m) => Math.abs(Math.abs(dot(m, nd)) - 1) < 1e-9)) out.push(nd);
    }
  }
  return out;
}

function newell(points) {
  const n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

function normalize(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function unique(points) {
  const out = [];
  for (const p of points) if (!out.some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-4)) out.push(p);
  return out;
}

// Otoczka wypukła punktów 2D (algorytm monotoniczny), przeciwnie do ruchu wskazówek zegara.
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
