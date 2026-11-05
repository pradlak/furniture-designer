import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { cabinetPanels, cabinetIssues } from '../model/furniture.js';

const HDF_COLOR = 0xe9e4da;
const EDGE_OK = 0x5b4630;
const EDGE_BAD = 0xdc2626;

// Buduje meble projektu: każda płyta korpusu to osobny prostopadłościan z obrysem krawędzi.
export function buildFurniture(project) {
  const group = new THREE.Group();
  const disposables = [];
  group.userData.disposables = disposables;

  for (const cabinet of project.furniture) {
    const hasIssues = cabinetIssues(cabinet, project).length > 0;
    const boardMat = new THREE.MeshStandardMaterial({ color: cabinet.color, roughness: 0.8 });
    const hdfMat = new THREE.MeshStandardMaterial({ color: HDF_COLOR, roughness: 0.9 });
    const edgeMat = new THREE.LineBasicMaterial({ color: hasIssues ? EDGE_BAD : EDGE_OK });
    disposables.push(boardMat, hdfMat, edgeMat);

    const cabinetGroup = new THREE.Group();
    cabinetGroup.name = cabinet.name;
    for (const p of cabinetPanels(cabinet)) {
      const geometry = new THREE.BoxGeometry(p.width * MM, p.height * MM, p.depth * MM);
      const mesh = new THREE.Mesh(geometry, p.kind === 'hdf' ? hdfMat : boardMat);
      mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
      cabinetGroup.add(mesh);
    }
    group.add(cabinetGroup);
  }
  return group;
}
