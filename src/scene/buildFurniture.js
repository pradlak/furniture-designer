import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { cabinetPanels, cabinetIssues, cabinetLegs } from '../model/furniture.js';
import { trimBox, trimIssues } from '../model/trims.js';
import { trimMaterial } from '../model/materials.js';

const LEG_COLOR = '#3f3f46';

const EDGE_OK = 0x5b4630;
const EDGE_BAD = 0xdc2626;

// Część koloru płyty „świeci” sama z siebie, żeby wybrany kolor (np. biały) był widoczny wiernie,
// a światło sceny dodawało tylko lekkie cieniowanie potrzebne do odczytania kształtu.
const SELF_LIGHT = 0.3;

function boardMaterial(color) {
  const c = new THREE.Color(color);
  return new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(SELF_LIGHT) });
}

const EDGE_SELECTED = 0x2563eb;

// Buduje meble projektu: każda płyta korpusu to osobny prostopadłościan z obrysem krawędzi.
// Zaznaczony korpus ma niebieskie krawędzie, korpus z problemami — czerwone.
export function buildFurniture(project, selectedId = null) {
  const group = new THREE.Group();
  const disposables = [];
  group.userData.disposables = disposables;

  // Jeden materiał Three.js na kolor płyty (kolory pochodzą z biblioteki materiałów projektu).
  const byColor = new Map();
  const materialFor = (color) => {
    if (!byColor.has(color)) {
      const m = boardMaterial(color);
      byColor.set(color, m);
      disposables.push(m);
    }
    return byColor.get(color);
  };

  const view = project.view ?? {};
  const panelVisible = (p) =>
    p.valid && !p.hidden && (view.showBlends !== false || p.group !== 'blend');
  const trimVisible = (t) =>
    !t.hidden && (t.type === 'countertop' ? view.showCountertops !== false : view.showBlends !== false);

  for (const cabinet of project.furniture.filter((c) => !c.hidden)) {
    const hasIssues = cabinetIssues(cabinet, project).length > 0;
    const edgeColor = cabinet.id === selectedId ? EDGE_SELECTED : hasIssues ? EDGE_BAD : EDGE_OK;
    const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
    disposables.push(edgeMat);

    const cabinetGroup = new THREE.Group();
    cabinetGroup.name = cabinet.name;
    cabinetGroup.userData.cabinetId = cabinet.id; // do wybierania myszką
    for (const p of cabinetPanels(cabinet, project).filter(panelVisible)) {
      const geometry = new THREE.BoxGeometry(p.width * MM, p.height * MM, p.depth * MM);
      const mesh = new THREE.Mesh(geometry, materialFor(p.color));
      mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
      cabinetGroup.add(mesh);
    }

    const legs = cabinetLegs(cabinet, project);
    if (legs.length) {
      const legMat = new THREE.MeshLambertMaterial({ color: LEG_COLOR });
      disposables.push(legMat);
      for (const l of legs) {
        const r = (l.diameter / 2) * MM;
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l.height * MM, 20), legMat);
        mesh.position.set(...toScene(l.x, l.y + l.height / 2, l.z, project.space));
        cabinetGroup.add(mesh);
      }
    }
    group.add(cabinetGroup);
  }

  // Blendy wspólne (blenda dolna, blenda górna) — w kolorze swojego materiału.
  for (const trim of (project.trims ?? []).filter(trimVisible)) {
    const box = trimBox(trim, project);
    if (!box || box.height <= 0) continue;
    const mat = materialFor(trimMaterial(trim, project).color);
    const edgeMat = new THREE.LineBasicMaterial({ color: trimIssues(trim, project).length ? EDGE_BAD : EDGE_OK });
    disposables.push(edgeMat);
    const geometry = new THREE.BoxGeometry(box.width * MM, box.height * MM, box.depth * MM);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...toScene(box.x + box.width / 2, box.y + box.height / 2, box.z + box.depth / 2, project.space));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
    group.add(mesh);
  }
  return group;
}
