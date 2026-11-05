import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { createDimension } from './dimensions.js';
import { boxPolyhedron, clipPolyhedron, facesToPositions, facesToEdgePositions } from './polyhedron.js';
import { isObstacleOutside, slopePlanes } from '../model/space.js';

// Materiały przeszkód są stałe i współdzielone między przebudowami sceny.
const obstacleMaterials = {
  ok: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }),
  bad: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }),
  edges: new THREE.LineBasicMaterial({ color: 0x78350f }),
};
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb });

// Buduje grupę Three.js odwzorowującą przestrzeń: ściany, skosy, obrys, wymiary, przeszkody.
export function buildSpace(space, view = { showWalls: true }) {
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

  // Przeszkody.
  for (const o of space.obstacles) {
    const [x, y, z] = toScene(o.x + o.width / 2, o.y + o.height / 2, o.z + o.depth / 2, space);
    const mat = isObstacleOutside(o, space) ? obstacleMaterials.bad : obstacleMaterials.ok;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.width * MM, o.height * MM, o.depth * MM), mat);
    mesh.position.set(x, y, z);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), obstacleMaterials.edges));
    group.add(mesh);
  }

  // Wymiary.
  const gap = Math.max(0.12, Math.max(w, h, d) * 0.06);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  group.add(createDimension(v(0, 0, 0), v(w, 0, 0), v(0, 0, gap), `${space.width} mm`));
  group.add(createDimension(v(0, 0, 0), v(0, h, 0), v(-gap, 0, 0), `${space.height} mm`));
  group.add(createDimension(v(w, 0, 0), v(w, 0, -d), v(gap, 0, 0), `${space.depth} mm`));

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

export function disposeGroup(group) {
  group.traverse((obj) => {
    obj.geometry?.dispose();
    obj.userData.disposables?.forEach((m) => m.dispose());
  });
}
