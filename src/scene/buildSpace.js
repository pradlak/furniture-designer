import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { createDimension } from './dimensions.js';
import { buildWallDecor } from './wallDecor.js';
import { formatLength, getSettings } from '../state/settings.js';
import { boxPolyhedron, clipPolyhedron, facesToPositions, facesToEdgePositions } from './polyhedron.js';
import { isObstacleOutside, isWallObstacle, slopePlanes, wallSegments } from '../model/space.js';

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
export function buildSpace(space, view = { showWalls: true }, { selectedObstacle = null } = {}) {
  const group = new THREE.Group();
  group.userData.disposables = [];
  const w = space.width * MM;
  const h = space.height * MM;
  const d = space.depth * MM;

  // Bryła pomieszczenia (w mm) przycięta skosami.
  let faces = boxPolyhedron(space.width, space.height, space.depth);
  for (const plane of slopePlanes(space)) {
    faces = clipPolyhedron(faces, new THREE.Vector3(...plane.normal), plane.offset, 'slope');
  }
  const transform = (p) => new THREE.Vector3(...toScene(p.x, p.y, p.z, space));

  if (view.showWalls) {
    const isVisible = (tag) => tag === 'slope' || (tag !== 'front' && space.walls[tag]);
    const floorFaces = faces.filter((f) => f.tag === 'floor' && isVisible(f.tag));
    const wallFaces = faces.filter((f) => f.tag !== 'floor' && isVisible(f.tag));
    addSurface(group, floorFaces, transform, space.colors.floor);
    addSurface(group, wallFaces, transform, space.colors.walls);
  }

  // Obrys przestrzeni użytkowej (krawędzie bryły).
  const outlineGeom = new THREE.BufferGeometry();
  outlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(facesToEdgePositions(faces, transform), 3));
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
  group.add(createDimension(v(0, 0, 0), v(0, h, 0), v(-gap, 0, 0), formatLength(space.height)));
  group.add(createDimension(v(w, 0, 0), v(w, 0, -d), v(gap, 0, 0), formatLength(space.depth)));

  return group;
}

// Powierzchnie rysujemy tylko od wewnątrz (BackSide): ściana między kamerą a wnętrzem
// jest niewidoczna, więc nic nie zasłania widoku, a ściany mogą być nieprzezroczyste.
function addSurface(group, faces, transform, color) {
  if (!faces.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(facesToPositions(faces, transform), 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    color,
    side: THREE.BackSide,
    polygonOffset: true, // odsuwa powierzchnię, żeby linie obrysu nie migotały
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  group.userData.disposables.push(material);
  group.add(new THREE.Mesh(geometry, material));
}

// Zwalnia zasoby usuniętej grupy. Etykiety wymiarów (CSS2DObject) to elementy HTML — Three.js usuwa je
// ze strony tylko przy odpięciu samej etykiety, a nie całej grupy, w której siedzą, więc usuwamy je tu.
// Bez tego stare etykiety zostawały na ekranie i przy obracaniu widoku wyglądały jak duplikaty.
export function disposeGroup(group) {
  group.traverse((obj) => {
    obj.geometry?.dispose();
    obj.userData.disposables?.forEach((m) => m.dispose());
    if (obj.isCSS2DObject) obj.element?.remove();
  });
}
