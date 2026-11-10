import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { cabinetPanels, cabinetIssues, cabinetLegs, HANDLE_GROOVE_SIZE } from '../model/furniture.js';
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
function addEdgeBanding(group, box, keys, band, color, materialFor, space, panelKey = null) {
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
    mesh.userData.panelKey = panelKey; // obrzeże należy do płyty (do chwytania myszką)
    group.add(mesh);
  }
}

// Bryła wypukła (ściany jako wielokąty w mm, układ przestrzeni) → geometria Three.js w scenie.
function solidGeometry(faces, space) {
  const positions = [];
  for (const face of faces) {
    const pts = face.map(([x, y, z]) => toScene(x, y, z, space));
    for (let i = 1; i < pts.length - 1; i++) positions.push(...pts[0], ...pts[i], ...pts[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Frezy frontu w widoku: frez uchwytowy — ciemny pas wzdłuż krawędzi (wgłębienie), frez dekoracyjny —
// cienkie ciemniejsze rowki na licu (ramka albo poziome linie). Rysowane tuż przed licem frontu.
const DECOR_LINE = 6; // mm — szerokość rowka dekoracyjnego (do widoku)
function addMilling(group, p, materialFor, space) {
  const m = p.milling;
  if (!m || p.solid) return;
  const shade = (k) => `#${new THREE.Color(p.material.color).multiplyScalar(k).getHexString()}`;
  const strip = (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    const geometry = new THREE.BoxGeometry(w * MM, h * MM, 0.6 * MM);
    const mesh = new THREE.Mesh(geometry, materialFor(color));
    mesh.position.set(...toScene(x + w / 2, y + h / 2, p.z + p.depth + 0.3, space));
    mesh.userData.panelKey = p.key;
    group.add(mesh);
  };
  const decor = shade(0.75);
  if (m.decor === 'frame') {
    const k = m.decorMargin;
    const [x0, y0, x1, y1] = [p.x + k, p.y + k, p.x + p.width - k, p.y + p.height - k];
    if (x1 - x0 > 2 * DECOR_LINE && y1 - y0 > 2 * DECOR_LINE) {
      strip(x0, y0, x1 - x0, DECOR_LINE, decor);
      strip(x0, y1 - DECOR_LINE, x1 - x0, DECOR_LINE, decor);
      strip(x0, y0, DECOR_LINE, y1 - y0, decor);
      strip(x1 - DECOR_LINE, y0, DECOR_LINE, y1 - y0, decor);
    }
  } else if (m.decor === 'lines') {
    for (let y = p.y + m.decorSpacing; y < p.y + p.height - DECOR_LINE; y += m.decorSpacing) {
      strip(p.x, y - DECOR_LINE / 2, p.width, DECOR_LINE, decor);
    }
  }
  if (m.groove) {
    const S = Math.min(HANDLE_GROOVE_SIZE, p.width / 2, p.height / 2);
    const groove = shade(0.45);
    if (m.groove === 'yMax') strip(p.x, p.y + p.height - S, p.width, S, groove);
    if (m.groove === 'yMin') strip(p.x, p.y, p.width, S, groove);
    if (m.groove === 'xMin') strip(p.x, p.y, S, p.height, groove);
    if (m.groove === 'xMax') strip(p.x + p.width - S, p.y, S, p.height, groove);
  }
}

// Otwieranie frontów w widoku: drzwi obracają się na zawiasach (oś pionowa przy krawędzi z zawiasami,
// na tylnej powierzchni frontu) o DOOR_OPEN_ANGLE na zewnątrz; szuflady wysuwają się o część głębokości korpusu.
// Każdy front siedzi w osobnej grupie („zawiasie”) — Viewer płynnie zmienia jej stan (patrz applyFrontOpening).
const DOOR_OPEN_ANGLE = 95;
const DRAWER_PULL = 0.6;
function frontPivotGroup(p, cabinet, parent, space, open) {
  const pivot = new THREE.Group();
  const inner = new THREE.Group(); // elementy frontu w zwykłych współrzędnych sceny
  const front = { id: `${cabinet.id}:${p.key}`, hinge: p.opening.hinge ?? null, pull: cabinet.depth * DRAWER_PULL, open };
  if (front.hinge) {
    const hingeX = front.hinge === 'left' ? p.x : p.x + p.width;
    const axis = new THREE.Vector3(...toScene(hingeX, 0, p.z, space));
    pivot.position.copy(axis);
    inner.position.copy(axis).negate();
  }
  pivot.userData.front = front;
  applyFrontOpening(pivot, open ? 1 : 0);
  pivot.add(inner);
  parent.add(pivot);
  return inner;
}

// Stan otwarcia frontu: 0 — zamknięty, 1 — otwarty (z łagodnym rozpędzaniem i hamowaniem).
export function applyFrontOpening(pivot, amount) {
  const f = pivot.userData.front;
  const t = amount * amount * (3 - 2 * amount);
  if (f.hinge) {
    // obrót wokół pionu: zawiasy po lewej — wolna krawędź (w prawo) idzie do przodu, więc kąt ujemny
    pivot.rotation.y = THREE.MathUtils.degToRad((f.hinge === 'left' ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE) * t);
  } else {
    pivot.position.z = f.pull * t * MM;
  }
}

// Uchwyt na froncie: listwa na dwóch wspornikach (w otworach) albo gałka. Odstaje od lica o HANDLE_STANDOFF.
const HANDLE_COLOR = 0x9ca3af;
const HANDLE_STANDOFF = 28; // mm — odstęp listwy od frontu
const handleMat = new THREE.MeshLambertMaterial({ color: HANDLE_COLOR, emissive: new THREE.Color(HANDLE_COLOR).multiplyScalar(0.25) });
function addHandle(group, p, space) {
  const hd = p.handle;
  if (!hd || p.solid) return;
  const face = p.z + p.depth;
  const add = (geometry, x, y, z, rotate) => {
    const mesh = new THREE.Mesh(geometry, handleMat);
    mesh.position.set(...toScene(x, y, z, space));
    if (rotate === 'x') mesh.rotation.x = Math.PI / 2; // oś walca wzdłuż Z (do przodu)
    if (rotate === 'z') mesh.rotation.z = Math.PI / 2; // oś walca wzdłuż X (poziomo)
    mesh.userData.panelKey = p.key; // klik w uchwyt = klik we front
    group.add(mesh);
  };
  if (hd.type === 'knob') {
    const [h] = hd.holes;
    add(new THREE.CylinderGeometry(4 * MM, 4 * MM, 20 * MM, 12), h.x, h.y, face + 10, 'x');
    add(new THREE.CylinderGeometry(14 * MM, 12 * MM, 10 * MM, 20), h.x, h.y, face + 24, 'x');
    return;
  }
  // wsporniki w otworach
  for (const h of hd.holes) add(new THREE.CylinderGeometry(4 * MM, 4 * MM, HANDLE_STANDOFF * MM, 12), h.x, h.y, face + HANDLE_STANDOFF / 2, 'x');
  // listwa: rozstaw + po 20 mm wystającego końca
  const [a, b] = hd.holes;
  const length = hd.spacing + 40;
  const bar = new THREE.CylinderGeometry(6 * MM, 6 * MM, length * MM, 16);
  add(bar, (a.x + b.x) / 2, (a.y + b.y) / 2, face + HANDLE_STANDOFF, hd.vertical ? null : 'z');
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
const PICKED_COLOR = '#f97316'; // zaznaczona płyta (np. front)
const pickedEdgeMat = new THREE.LineBasicMaterial({ color: PICKED_COLOR });

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
// selectedFronts — zbiór zaznaczonych frontów („idKorpusu:front-N”, kliknięte w 3D) — wyróżnione na pomarańczowo.
// isFrontOpen(id) — czy front jest otwarty; domyślnie według przełącznika „otwarte”.
export function buildFurniture(project, selectedId = null, selectedFronts = new Set(), isFrontOpen = () => project.view?.openFronts === true) {
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
  // Płyty docięte pod skos: materiał dwustronny (ściany bryły po przycięciu mają różną orientację).
  const solidByColor = new Map();
  const solidMaterialFor = (color) => {
    if (!solidByColor.has(color)) {
      const m = boardMaterial(color);
      m.side = THREE.DoubleSide;
      solidByColor.set(color, m);
      disposables.push(m);
    }
    return solidByColor.get(color);
  };

  const view = project.view ?? {};
  const panelVisible = (p) =>
    p.valid &&
    !p.hidden &&
    (view.showBlends !== false || p.group !== 'blend') &&
    (view.showFronts !== false || p.group !== 'front');
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
      if (p.solid) {
        // Płyta docięta pod skos — rysujemy jej bryłę (lica i krawędzie w jednym kolorze płyty).
        const geometry = solidGeometry(p.solid, project.space);
        const mesh = new THREE.Mesh(geometry, solidMaterialFor(p.material.color));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edgeMat));
        mesh.userData.panelKey = p.key;
        cabinetGroup.add(mesh);
        continue;
      }
      // Front (z frezami i obrzeżem) w osobnej grupie, którą można obrócić na zawiasach albo wysunąć
      // (szuflada) — otwarty / zamknięty według isFrontOpen. Wymiary w modelu się nie zmieniają.
      const target = p.opening
        ? frontPivotGroup(p, cabinet, cabinetGroup, project.space, isFrontOpen(`${cabinet.id}:${p.key}`))
        : cabinetGroup;
      const geometry = new THREE.BoxGeometry(p.width * MM, p.height * MM, p.depth * MM);
      const picked = selectedFronts.has(`${cabinet.id}:${p.key}`);
      // zaznaczona płyta: kolor przesunięty w stronę pomarańczowego i pomarańczowe krawędzie
      const material = picked
        ? { ...p.material, color: `#${new THREE.Color(p.material.color).lerp(new THREE.Color(PICKED_COLOR), 0.45).getHexString()}` }
        : p.material;
      const mesh = new THREE.Mesh(geometry, panelFaceMaterials(material, p.thicknessAxis, materialFor));
      mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), picked ? pickedEdgeMat : edgeMat));
      mesh.userData.panelKey = p.key; // np. „shelf-…” — półkę można przeciągać w pionie
      target.add(mesh);
      addMilling(target, p, materialFor, project.space);
      addHandle(target, p, project.space);
      addAllowance(target, p, p.allowanceMin, p.allowanceMax, project.space);
      if (p.material.edgeBanding) {
        const keys = panelEdgeSet(p, cabinet, project, solids);
        addEdgeBanding(target, p, keys, p.material.edgeBanding, edgeColorOf(p.material), materialFor, project.space, p.key);
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
      if (box.solid) {
        // Blenda docięta pod skos (np. blenda górna do skosu).
        const geometry = solidGeometry(box.solid, project.space);
        const mesh = new THREE.Mesh(geometry, solidMaterialFor(tm.color));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edgeMat));
        group.add(mesh);
        return;
      }
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
