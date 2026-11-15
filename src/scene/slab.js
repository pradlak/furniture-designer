import * as THREE from 'three';
import { MM } from './units.js';
import { edgeInset, profileBreaks } from '../model/boardFeatures.js';

// Płyta pozioma (blat, półka) z otworami i frezami krawędzi — do widoku 3D.
// Otwory są naprawdę wycięte: kształt płyty (z góry) z dziurami „wyciągnięty” na grubość.
// Frez krawędzi: płyta złożona z cienkich warstw, każda cofnięta przy frezowanej krawędzi o tyle,
// ile wynosi profil na tej wysokości — z daleka wygląda jak zaokrąglenie / fazka.
//
// box — { x, y, z, width, height (grubość), depth } w mm (układ przestrzeni); edges, holes — model/boardFeatures.js.
// Zwraca grupę Three.js; materiał i linie krawędzi podaje wywołujący.
export function buildSlab(box, { edges, holes = [], material, edgeMaterial, space, pickedHole = null, pickedColor = "#ff8c00" }) {
  const group = new THREE.Group();
  const { width: W, depth: D, height: t } = box;
  const breaks = profileBreaks(edges, t);

  for (let i = 0; i < breaks.length - 1; i++) {
    const h0 = breaks[i];
    const h1 = breaks[i + 1];
    if (h1 - h0 < 0.01) continue;
    const hm = (h0 + h1) / 2;
    const inset = (k) => edgeInset(edges?.[k], hm, t);
    // obrys z góry: u — od lewej (0…W), v — od przodu (0…D)
    const u0 = inset('left');
    const u1 = W - inset('right');
    const v0 = inset('front');
    const v1 = D - inset('back');
    if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
    const shape = new THREE.Shape();
    shape.moveTo(u0, v0);
    shape.lineTo(u1, v0);
    shape.lineTo(u1, v1);
    shape.lineTo(u0, v1);
    shape.lineTo(u0, v0);
    for (const hole of holes) shape.holes.push(holePath(hole));

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false, curveSegments: 32 });
    // kształt: X → X sceny, Y (w głąb od przodu) → −Z sceny, wyciągnięcie → +Y sceny
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(MM, MM, MM);
    geometry.translate(box.x * MM, (box.y + h0) * MM, (box.z + D - space.depth) * MM);
    group.add(new THREE.Mesh(geometry, material));
  }
  if (edgeMaterial) group.add(slabEdges(box, edges, holes, edgeMaterial, space));
  if (pickedHole != null && holes[pickedHole]) group.add(holeHighlight(box, holes[pickedHole], pickedColor, space));
  return group;
}

// Zaznaczony otwór: półprzezroczysta „tafla” w otworze tuż pod wierzchem płyty i obrys na wierzchu i spodzie
// w kolorze zaznaczenia — widać, który otwór jest wybrany (płyta zostaje w swoim kolorze).
function holeHighlight(box, hole, color, space) {
  const group = new THREE.Group();
  const { depth: D, height: t } = box;
  const shape = new THREE.Shape(holePath(hole).getPoints(48));
  const fill = new THREE.ShapeGeometry(shape);
  fill.rotateX(-Math.PI / 2);
  fill.scale(MM, MM, MM);
  fill.translate(box.x * MM, (box.y + t - 0.5) * MM, (box.z + D - space.depth) * MM);
  const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  group.add(new THREE.Mesh(fill, fillMat));
  const pts = [];
  const points = holePath(hole).getPoints(48);
  for (const h of [t + 0.3, -0.3]) {
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      for (const r of [p, q]) pts.push((box.x + r.x) * MM, (box.y + h) * MM, (box.z + D - r.y - space.depth) * MM);
    });
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color, depthTest: false })));
  group.renderOrder = 10;
  return group;
}

// Linie krawędzi płyty: obrys wierzchu i spodu (przy frezie — cofnięty o profil), obrysy otworów
// (na wierzchu i spodzie) i pionowe narożniki. Rysowane wprost — bez linii z podziału na warstwy.
function slabEdges(box, edges, holes, edgeMaterial, space) {
  const { width: W, depth: D, height: t } = box;
  const pts = [];
  // punkt (u — od lewej, v — od przodu, h — od spodu) → scena
  const P = (u, v, h) => [(box.x + u) * MM, (box.y + h) * MM, (box.z + D - v - space.depth) * MM];
  const seg = (a, b) => pts.push(...a, ...b);
  const loop = (points, h) =>
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      seg(P(p.x, p.y, h), P(q.x, q.y, h));
    });
  const rectAt = (h) => {
    const k = (e) => edgeInset(edges?.[e], h, t);
    return [
      { x: k('left'), y: k('front') },
      { x: W - k('right'), y: k('front') },
      { x: W - k('right'), y: D - k('back') },
      { x: k('left'), y: D - k('back') },
    ];
  };
  loop(rectAt(t - 0.001), t);
  loop(rectAt(0.001), 0);
  for (const c of rectAt(t / 2)) seg(P(c.x, c.y, 0), P(c.x, c.y, t));
  for (const hole of holes) {
    const points = holePath(hole).getPoints(32);
    loop(points, t);
    loop(points, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geometry, edgeMaterial);
}

// Obrys otworu (kształt w układzie u / v płyty).
function holePath(h) {
  const path = new THREE.Path();
  if (h.shape === 'circle') {
    path.absarc(h.x, h.y, h.d / 2, 0, Math.PI * 2, true);
    return path;
  }
  const x0 = h.x - h.w / 2;
  const x1 = h.x + h.w / 2;
  const y0 = h.y - h.h / 2;
  const y1 = h.y + h.h / 2;
  const r = Math.max(0, Math.min(h.r ?? 0, h.w / 2 - 0.1, h.h / 2 - 0.1));
  // przeciwnie do kierunku obrysu płyty (otwór)
  path.moveTo(x0 + r, y0);
  if (r > 0) path.absarc(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, true);
  path.lineTo(x0, y1 - r);
  if (r > 0) path.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true);
  path.lineTo(x1 - r, y1);
  if (r > 0) path.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true);
  path.lineTo(x1, y0 + r);
  if (r > 0) path.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true);
  path.lineTo(x0 + r, y0);
  return path;
}

// Czy płyta potrzebuje kształtu z otworami / frezami (inaczej wystarczy zwykły prostopadłościan).
export const needsSlab = (edges, holes) => (holes?.length ?? 0) > 0 || Object.values(edges ?? {}).some((e) => e && e.profile !== 'none');
