import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { cabinetPanels, cabinetIssues, cabinetLegs } from '../model/furniture.js';
import { trimSegments, trimIssues, trimAllowance } from '../model/trims.js';
import { trimMaterial, edgeColorOf, coreColorOf } from '../model/materials.js';
import { projectSolids, panelEdgeSet, trimEdgeSet, TRIM_THICKNESS_AXIS } from '../model/edges.js';

// Materiały ścian prostopadłościanu płyty (kolejność ścian BoxGeometry: +x, −x, +y, −y, +z, −z):
// lica (ściany prostopadłe do osi grubości) w kolorze płyty, krawędzie — w kolorze rdzenia.
// Oklejone krawędzie przykrywa potem warstwa obrzeża (addEdgeBanding).
function panelFaceMaterials(material, thicknessAxis, materialFor) {
  const face = materialFor(material.color);
  const edge = materialFor(coreColorOf(material));
  return ['x', 'x', 'y', 'y', 'z', 'z'].map((ax) => (ax === thicknessAxis ? face : edge));
}

// Obrzeże w widoku: cienka warstwa na oklejonej krawędzi, w kolorze obrzeża materiału.
// (Prawdziwa grubość 0,8 mm byłaby niewidoczna — rysujemy co najmniej EDGE_VISUAL mm.)
const EDGE_VISUAL = 1.2;
const DIMS = { x: 'width', y: 'height', z: 'depth' };
function addEdgeBanding(group, box, keys, band, color, materialFor, space) {
  if (!band || !keys.length) return;
  const t = Math.max(band, EDGE_VISUAL);
  for (const key of keys) {
    const ax = key[0];
    const strip = { x: box.x, y: box.y, z: box.z, width: box.width, height: box.height, depth: box.depth };
    strip[DIMS[ax]] = t;
    strip[ax] = key.endsWith('Max') ? box[ax] + box[DIMS[ax]] - t * 0.5 : box[ax] - t * 0.5;
    const geometry = new THREE.BoxGeometry(strip.width * MM, strip.height * MM, strip.depth * MM);
    const mesh = new THREE.Mesh(geometry, materialFor(color));
    mesh.position.set(...toScene(strip.x + strip.width / 2, strip.y + strip.height / 2, strip.z + strip.depth / 2, space));
    group.add(mesh);
  }
}

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

// Zapas na docięcie: wyraźnie inny (pomarańczowy, półprzezroczysty), żeby było widać, co jest do docięcia.
const allowanceMat = new THREE.MeshLambertMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, depthWrite: false });
const allowanceEdges = new THREE.LineBasicMaterial({ color: 0xc2410c });

// Dorysowuje zapas wzdłuż osi X po obu stronach bryły (min — po stronie mniejszego X).
function addAllowance(group, box, min, max, space) {
  for (const [x0, len] of [[box.x - min, min], [box.x + box.width, max]]) {
    if (len <= 0) continue;
    const geometry = new THREE.BoxGeometry(len * MM, box.height * MM, box.depth * MM);
    const mesh = new THREE.Mesh(geometry, allowanceMat);
    mesh.position.set(...toScene(x0 + len / 2, box.y + box.height / 2, box.z + box.depth / 2, space));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), allowanceEdges));
    group.add(mesh);
  }
}

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

  let solids = null; // bryły projektu do wyznaczania widocznych krawędzi (liczone raz, gdy potrzebne)
  for (const cabinet of project.furniture.filter((c) => !c.hidden)) {
    const hasIssues = cabinetIssues(cabinet, project).length > 0;
    const edgeColor = cabinet.id === selectedId ? EDGE_SELECTED : hasIssues ? EDGE_BAD : EDGE_OK;
    const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
    disposables.push(edgeMat);

    const cabinetGroup = new THREE.Group();
    cabinetGroup.name = cabinet.name;
    cabinetGroup.userData.cabinetId = cabinet.id; // do wybierania myszką
    solids ??= projectSolids(project);
    for (const p of cabinetPanels(cabinet, project).filter(panelVisible)) {
      const geometry = new THREE.BoxGeometry(p.width * MM, p.height * MM, p.depth * MM);
      const mesh = new THREE.Mesh(geometry, panelFaceMaterials(p.material, p.thicknessAxis, materialFor));
      mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
      cabinetGroup.add(mesh);
      addAllowance(cabinetGroup, p, p.allowanceMin, p.allowanceMax, project.space);
      if (p.material.edgeBanding) {
        const keys = panelEdgeSet(p, cabinet, project, solids);
        addEdgeBanding(cabinetGroup, p, keys, p.material.edgeBanding, edgeColorOf(p.material), materialFor, project.space);
      }
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
    const segments = trimSegments(trim, project);
    if (!segments.length) continue;
    const mat = panelFaceMaterials(trimMaterial(trim, project), TRIM_THICKNESS_AXIS[trim.type], materialFor);
    const edgeMat = new THREE.LineBasicMaterial({ color: trimIssues(trim, project).length ? EDGE_BAD : EDGE_OK });
    disposables.push(edgeMat);
    const a = trimAllowance(trim, project);
    const tm = trimMaterial(trim, project);
    if (tm.edgeBanding) solids ??= projectSolids(project);
    segments.forEach((box, i) => {
      if (tm.edgeBanding) {
        addEdgeBanding(group, box, trimEdgeSet(trim, box, i, solids), tm.edgeBanding, edgeColorOf(tm), materialFor, project.space);
      }
      const geometry = new THREE.BoxGeometry(box.width * MM, box.height * MM, box.depth * MM);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(...toScene(box.x + box.width / 2, box.y + box.height / 2, box.z + box.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
      group.add(mesh);
      // zapas: z lewej na pierwszym odcinku, z prawej na ostatnim
      addAllowance(group, box, i === 0 ? a.min : 0, i === segments.length - 1 ? a.max : 0, project.space);
    });
  }
  return group;
}
