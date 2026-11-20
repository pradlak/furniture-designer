import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { createDimension } from './dimensions.js';
import { buildWallDecor } from './wallDecor.js';
import { formatLength, getSettings } from '../state/settings.js';
import { boxPolyhedron, clipPolyhedron, facesToPositions, facesToEdgePositions, prismPolyhedron, clipPolygon, orientedFace } from './polyhedron.js';
import { isObstacleOutside, isWallObstacle, slopePlanes, wallSegments } from '../model/space.js';
import { spaceOutline, outlineEdges, edgeLength, edgeOutward } from '../model/outline.js';

// Materiały przeszkód są stałe i współdzielone między przebudowami sceny.
const obstacleMaterials = {
  ok: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }),
  bad: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }),
  edges: new THREE.LineBasicMaterial({ color: 0x78350f }),
};
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb });
const wallEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8 });

// Buduje grupę Three.js odwzorowującą przestrzeń: ściany, skosy, obrys, wymiary, przeszkody.
// selectedObstacle — id zaznaczonego występu ściany (krawędzie w kolorze zaznaczenia).
// wallHandles — uchwyty do kształtowania ścian myszką (punkty obrysu podłogi i środki ścian; scene/interaction.js).
export function buildSpace(space, view = { showWalls: true }, { selectedObstacle = null, wallHandles = false } = {}) {
  const group = new THREE.Group();
  group.userData.disposables = [];
  const w = space.width * MM;
  const h = space.height * MM;
  const d = space.depth * MM;

  // Bryła pomieszczenia (w mm) przycięta skosami; przy własnym kształcie podłogi — z obrysu (patrz outlineFaces).
  let faces;
  let edgeFaces; // ściany, których krawędzie rysujemy jako obrys przestrzeni
  if (space.outline) {
    faces = outlineFaces(space);
    edgeFaces = faces.filter((f) => f.tag !== 'floor' && f.tag !== 'ceiling' && f.tag !== 'slope');
  } else {
    faces = boxPolyhedron(space.width, space.height, space.depth);
    for (const plane of slopePlanes(space)) {
      faces = clipPolyhedron(faces, new THREE.Vector3(...plane.normal), plane.offset, 'slope');
    }
    edgeFaces = faces;
  }
  const transform = (p) => new THREE.Vector3(...toScene(p.x, p.y, p.z, space));

  if (view.showWalls) {
    // Każda ściana osobno (userData.wall = znacznik: floor, left, back, slope, edge:<i>…) — prawy klik w ścianę
    // pokazuje menu kształtu ścian (scene/interaction.js).
    const isVisible = (tag) => tag === 'slope' || tag.startsWith('edge:') || (tag !== 'front' && space.walls[tag]);
    const floorMat = surfaceMaterial(group, space.colors.floor);
    const wallMat = surfaceMaterial(group, space.colors.walls);
    for (const tag of new Set(faces.map((f) => f.tag))) {
      if (!isVisible(tag)) continue;
      addSurface(group, faces.filter((f) => f.tag === tag), transform, tag === 'floor' ? floorMat : wallMat, tag);
    }
  }
  if (wallHandles) addWallHandles(group, space);

  // Obrys przestrzeni użytkowej (krawędzie bryły).
  const outlineGeom = new THREE.BufferGeometry();
  outlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(facesToEdgePositions(edgeFaces, transform), 3));
  group.add(new THREE.LineSegments(outlineGeom, outlineMaterial));

  // Przeszkody. Występ ściany (kominek, filar) — w kolorze ścian, z szarymi krawędziami.
  let wallMaterial = null;
  for (const o of space.obstacles) {
    const [x, y, z] = toScene(o.x + o.width / 2, o.y + o.height / 2, o.z + o.depth / 2, space);
    const outside = isObstacleOutside(o, space);
    let mat = outside ? obstacleMaterials.bad : obstacleMaterials.ok;
    if (isWallObstacle(o) && !outside) {
      if (!wallMaterial) {
        wallMaterial = new THREE.MeshLambertMaterial({ color: space.colors.walls, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        group.userData.disposables.push(wallMaterial);
      }
      mat = wallMaterial;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.width * MM, o.height * MM, o.depth * MM), mat);
    mesh.position.set(x, y, z);
    let edges = isWallObstacle(o) ? wallEdgeMaterial : obstacleMaterials.edges;
    if (isWallObstacle(o)) {
      mesh.userData.obstacleId = o.id; // występ ściany — do zaznaczania, przeciągania i menu (scene/interaction.js)
      if (o.id === selectedObstacle) {
        edges = new THREE.LineBasicMaterial({ color: getSettings().highlight });
        group.userData.disposables.push(edges);
      }
    }
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edges));
    group.add(mesh);
    // kominek / wkład / telewizor na przedniej ścianie występu (tylko wygląd)
    if (isWallObstacle(o)) {
      const decor = buildWallDecor(o, space);
      if (decor) group.add(decor);
    }
  }

  // Wymiary.
  const gap = Math.max(0.12, Math.max(w, h, d) * 0.06);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  group.add(createDimension(v(0, 0, 0), v(w, 0, 0), v(0, 0, gap), formatLength(space.width)));
  // Przy występach ścian (np. kominku) — także szerokości poszczególnych wnęk i występów, bliżej przestrzeni.
  const segments = wallSegments(space);
  if (segments.length > 1 || (segments.length === 1 && (segments[0][0] > 0 || segments[0][1] < space.width))) {
    const points = [...new Set([0, space.width, ...segments.flat()])].sort((a, b) => a - b);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (b - a < 1) continue;
      group.add(createDimension(v(a * MM, 0, 0), v(b * MM, 0, 0), v(0, 0, gap * 0.5), formatLength(b - a)));
    }
  }
  // Przy własnym kształcie podłogi — długości ścian (na podłodze, odsunięte na zewnątrz); ściany prostokąta
  // na całą szerokość / głębokość mają już swoje wymiary.
  if (space.outline) {
    const pts = spaceOutline(space);
    for (const e of outlineEdges(space)) {
      const len = edgeLength(e);
      if (e.open || len < 1) continue;
      if ((e.tag === 'back' && Math.abs(len - space.width) < 1) || ((e.tag === 'left' || e.tag === 'right') && Math.abs(len - space.depth) < 1)) continue;
      const out = outwardOf(e, pts);
      const [ax, ay, az] = toScene(e.a[0], 0, e.a[1], space);
      const [bx, by, bz] = toScene(e.b[0], 0, e.b[1], space);
      group.add(createDimension(v(ax, ay, az), v(bx, by, bz), v(out[0], 0, out[1]).multiplyScalar(gap * 0.35), formatLength(Math.round(len))));
    }
  }
  group.add(createDimension(v(0, 0, 0), v(0, h, 0), v(-gap, 0, 0), formatLength(space.height)));
  group.add(createDimension(v(w, 0, 0), v(w, 0, -d), v(gap, 0, 0), formatLength(space.depth)));

  return group;
}

// Powierzchnie rysujemy tylko od wewnątrz (BackSide): ściana między kamerą a wnętrzem
// jest niewidoczna, więc nic nie zasłania widoku, a ściany mogą być nieprzezroczyste.
function surfaceMaterial(group, color) {
  const material = new THREE.MeshLambertMaterial({
    color,
    side: THREE.BackSide,
    polygonOffset: true, // odsuwa powierzchnię, żeby linie obrysu nie migotały
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  group.userData.disposables.push(material);
  return material;
}

function addSurface(group, faces, transform, material, tag) {
  if (!faces.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(facesToPositions(faces, transform), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.wall = tag;
  group.add(mesh);
}

const outwardOf = edgeOutward;

// Bryła pomieszczenia z dowolnym obrysem podłogi (także wklęsłym): podłoga i sufit / skosy z graniastosłupów nad
// trójkątami podłogi (każdy przycięty skosami — jest wypukły), ściany — pionowe czworokąty nad krawędziami obrysu
// przycięte skosami. Krawędź na przodzie dostaje znacznik 'front' (otwarty przód — nie rysujemy go).
function outlineFaces(space) {
  const pts = spaceOutline(space);
  const H = space.height;
  const planes = slopePlanes(space).map((pl) => [new THREE.Vector3(...pl.normal), pl.offset]);
  const faces = [];
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [i, j, k] of tris) {
    let prism = prismPolyhedron([pts[i], pts[j], pts[k]], H);
    for (const [n, off] of planes) prism = clipPolyhedron(prism, n, off, 'slope');
    faces.push(...prism.filter((f) => f.tag !== 'inner'));
  }
  for (const e of outlineEdges(space)) {
    const [a, b] = [e.a, e.b];
    let quad = [new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1]), new THREE.Vector3(b[0], H, b[1]), new THREE.Vector3(a[0], H, a[1])];
    for (const [n, off] of planes) quad = clipPolygon(quad, n, off);
    if (quad.length < 3) continue;
    const [ox, oz] = outwardOf(e, pts);
    faces.push(orientedFace(e.tag, quad, new THREE.Vector3(ox, 0, oz)));
  }
  return faces;
}

// Uchwyty kształtu ścian (kulki na podłodze, rysowane na wierzchu; scene/interaction.js):
//  - punkty obrysu (niebieskie) — przeciąganie zmienia kształt ścian; punkty na przodzie przesuwają się wzdłuż przodu,
//  - środki ścian (zielone, mniejsze) — przeciągnięcie wstawia tam nowy punkt.
// userData.wallHandle: { type: 'point', index } albo { type: 'mid', edge }.
const handleMaterials = {
  point: new THREE.MeshBasicMaterial({ color: 0x2563eb, depthTest: false, transparent: true, opacity: 0.9 }),
  mid: new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false, transparent: true, opacity: 0.8 }),
  wall: new THREE.MeshBasicMaterial({ color: 0x7c3aed, depthTest: false, transparent: true, opacity: 0.85 }),
};
function addWallHandles(group, space) {
  const r = Math.min(60, Math.max(25, Math.max(space.width, space.depth) * 0.012)) * MM;
  const big = new THREE.SphereGeometry(r, 16, 12);
  const small = new THREE.SphereGeometry(r * 0.7, 12, 10);
  const add = (x, z, data, geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...toScene(x, 0, z, space));
    mesh.renderOrder = 10;
    mesh.userData.wallHandle = data;
    group.add(mesh);
  };
  spaceOutline(space).forEach(([x, z], index) => add(x, z, { type: 'point', index }, big, handleMaterials.point));
  for (const e of outlineEdges(space)) {
    if (e.open || edgeLength(e) < 60) continue;
    add((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, { type: 'mid', edge: e.i }, small, handleMaterials.mid);
  }

  // Uchwyty przesuwania całych ścian (fioletowe krążki w połowie wysokości ściany, sufitu — na środku):
  // userData.wallHandle = { type: 'wall', wall: 'left' | 'right' | 'back' | 'ceiling' | 'edge:<i>', normal: [x, z] }.
  const disc = new THREE.CylinderGeometry(r * 2, r * 2, r * 0.6, 24);
  const pts = spaceOutline(space);
  const y = Math.min(space.height * 0.45, 1300);
  const addDisc = (x, yy, z, data, axis) => {
    const mesh = new THREE.Mesh(disc, handleMaterials.wall);
    mesh.position.set(...toScene(x, yy, z, space));
    // oś krążka wzdłuż kierunku przesuwania
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis).normalize());
    mesh.renderOrder = 10;
    mesh.userData.wallHandle = data;
    group.add(mesh);
  };
  // ściany prostokąta: na najdłuższym odcinku z danym znacznikiem; ściany z kształtu — na środku każdej
  const best = {};
  for (const e of outlineEdges(space)) {
    if (e.open) continue;
    const key = e.tag;
    if (!best[key] || edgeLength(e) > edgeLength(best[key])) best[key] = e;
  }
  for (const [wall, e] of Object.entries(best)) {
    const [nx, nz] = edgeOutward(e, pts);
    addDisc((e.a[0] + e.b[0]) / 2, y, (e.a[1] + e.b[1]) / 2, { type: 'wall', wall, normal: [nx, nz] }, [nx, 0, nz]);
  }
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  const cz = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  addDisc(cx, space.height, cz, { type: 'wall', wall: 'ceiling', normal: null }, [0, 1, 0]);
}

// Zwalnia zasoby usuniętej grupy. Etykiety wymiarów (CSS2DObject) to elementy HTML — Three.js usuwa je
// ze strony tylko przy odpięciu samej etykiety, a nie całej grupy, w której siedzą, więc usuwamy je tu.
// Bez tego stare etykiety zostawały na ekranie i przy obracaniu widoku wyglądały jak duplikaty.
export function disposeGroup(group) {
  group.traverse((obj) => {
    if (!obj.userData.noDispose) obj.geometry?.dispose(); // (współdzielone bryły, np. uchwyt półki — zostają)
    obj.userData.disposables?.forEach((m) => m.dispose());
    if (obj.isCSS2DObject) obj.element?.remove();
  });
}
