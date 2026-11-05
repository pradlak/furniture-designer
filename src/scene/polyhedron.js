import * as THREE from 'three';

// Wypukła bryła jako lista ścian: { tag, points: Vector3[] }.
// Punkty każdej ściany są ułożone przeciwnie do ruchu wskazówek zegara patrząc z zewnątrz
// (normalna na zewnątrz bryły).

const EPS = 1e-4;

export function boxPolyhedron(w, h, d) {
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const N = P;
  return [
    face('floor', [P(0, 0, 0), P(w, 0, 0), P(w, 0, d), P(0, 0, d)], N(0, -1, 0)),
    face('ceiling', [P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)], N(0, 1, 0)),
    face('left', [P(0, 0, 0), P(0, h, 0), P(0, h, d), P(0, 0, d)], N(-1, 0, 0)),
    face('right', [P(w, 0, 0), P(w, h, 0), P(w, h, d), P(w, 0, d)], N(1, 0, 0)),
    face('back', [P(0, 0, 0), P(w, 0, 0), P(w, h, 0), P(0, h, 0)], N(0, 0, -1)),
    face('front', [P(0, 0, d), P(w, 0, d), P(w, h, d), P(0, h, d)], N(0, 0, 1)),
  ];
}

// Przycina bryłę półprzestrzenią normal · p <= offset. Powstała „pokrywka” dostaje znacznik `tag`.
export function clipPolyhedron(faces, normal, offset, tag) {
  const dist = (p) => normal.dot(p) - offset;
  const result = [];
  const capPoints = [];

  for (const f of faces) {
    const kept = [];
    const n = f.points.length;
    for (let i = 0; i < n; i++) {
      const p = f.points[i];
      const q = f.points[(i + 1) % n];
      const dp = dist(p);
      const dq = dist(q);
      if (dp <= EPS) kept.push(p);
      if (Math.abs(dp) <= EPS) capPoints.push(p);
      if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
        const ip = p.clone().lerp(q, dp / (dp - dq));
        kept.push(ip);
        capPoints.push(ip);
      }
    }
    if (kept.length >= 3) result.push({ tag: f.tag, points: kept });
  }

  const cap = uniquePoints(capPoints);
  if (cap.length >= 3) {
    const center = cap.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(cap.length);
    const u = cap[0].clone().sub(center).normalize();
    const v = normal.clone().normalize().cross(u);
    const angle = (p) => {
      const r = p.clone().sub(center);
      return Math.atan2(r.dot(v), r.dot(u));
    };
    cap.sort((a, b) => angle(a) - angle(b));
    result.push(face(tag, cap, normal));
  }
  return result;
}

function face(tag, points, outward) {
  return { tag, points: polygonNormal(points).dot(outward) < 0 ? points.slice().reverse() : points };
}

// Metoda Newella — normalna wielokąta zgodna z kolejnością punktów.
function polygonNormal(points) {
  const n = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n;
}

function uniquePoints(points) {
  const out = [];
  for (const p of points) if (!out.some((q) => q.distanceTo(p) < 1e-3)) out.push(p);
  return out;
}

// Triangulacja (wachlarz — ściany są wypukłe) do pozycji BufferGeometry.
export function facesToPositions(faces, transform) {
  const positions = [];
  for (const { points } of faces) {
    const pts = points.map(transform);
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) positions.push(p.x, p.y, p.z);
    }
  }
  return positions;
}

export function facesToEdgePositions(faces, transform) {
  const positions = [];
  for (const { points } of faces) {
    const pts = points.map(transform);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return positions;
}
