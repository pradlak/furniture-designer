import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildDecorations } from './buildDecorations.js';
import { MM, toScene } from './units.js';
import { cabinetPanels, cabinetIssues, cabinetLegs, legHeight, HANDLE_GROOVE_SIZE, cabinetBounds, frontParts, frontSlots, doorSpan, INNER_SPACER } from '../model/furniture.js';
import { frontBoundaries, drawerResizeHandle, drawerMoveHandle } from '../model/frontEdit.js';
import { trimSegments, trimIssues, trimAllowance, trimBox } from '../model/trims.js';
import { trimMaterial, edgeColorOf, coreColorOf } from '../model/materials.js';
import { projectSolids, panelEdgeSet, trimEdgeSet, TRIM_THICKNESS_AXIS } from '../model/edges.js';
import { buildCabinetDimensions, buildPartDimensions, buildTotalDimensions, buildClearanceDimensions } from './furnitureDims.js';
import { decorSegments } from '../model/decor.js';
import { buildSlab, needsSlab } from './slab.js';
import { resolveHoles } from '../model/boardFeatures.js';
import { boardBox, boardMaterial as boardPlateMaterial, boardIssues, mountPoints } from '../model/boards.js';
import { getSettings } from '../state/settings.js';
import { cabinetDrawerRails } from '../model/drawerBoxes.js';
import { decorTexture, scaleBoxUVs } from './textures.js';

// Materiały ścian prostopadłościanu płyty (kolejność ścian BoxGeometry: +x, −x, +y, −y, +z, −z):
// lica (ściany prostopadłe do osi grubości) w kolorze płyty, krawędzie — w kolorze rdzenia.
// Oklejone krawędzie przykrywa potem warstwa obrzeża (addEdgeBanding).
function panelFaceMaterials(material, thicknessAxis, materialFor) {
  const face = materialFor(material.color, material.texture);
  // krawędź w kolorze płyty (MDF, blat) — z tą samą fakturą co lico; rdzeń (płyta meblowa) — jednolity
  const core = coreColorOf(material);
  const edge = core === material.color ? face : materialFor(core);
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
// cienkie ciemniejsze rowki na licu (wzory — model/decor.js). Rysowane tuż przed licem frontu.
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
  // Frez dekoracyjny: odcinki wzoru (model/decor.js) jako cienkie rowki na licu, obrócone wzdłuż odcinka.
  const decorMat = materialFor(shade(0.75));
  const opts = { margin: m.decorMargin, spacing: m.decorSpacing, gap: m.decorGap };
  for (const [ax, ay, bx, by] of decorSegments(m.decor, p.width, p.height, opts)) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) continue;
    const geometry = new THREE.BoxGeometry((len + DECOR_LINE) * MM, DECOR_LINE * MM, 0.6 * MM);
    const mesh = new THREE.Mesh(geometry, decorMat);
    mesh.position.set(...toScene(p.x + (ax + bx) / 2, p.y + (ay + by) / 2, p.z + p.depth + 0.3, space));
    mesh.rotation.z = Math.atan2(by - ay, bx - ax);
    mesh.userData.panelKey = p.key;
    group.add(mesh);
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
    // oś obrotu przy licu drzwi (wirtualna oś zawiasu puszkowego) — jak w doorOpenLimit
    const axis = new THREE.Vector3(...toScene(hingeX, 0, p.z + p.depth, space));
    pivot.position.copy(axis);
    inner.position.copy(axis).negate();
  }
  pivot.userData.front = front;
  applyFrontOpening(pivot, open ? 1 : 0);
  pivot.add(inner);
  parent.add(pivot);
  return inner;
}

// Skrzynka szuflady (tylko wygląd — boki, tył i dno za frontem albo czołem; prowadnice po 13 mm z każdej strony):
// w grupie frontu, więc wysuwa się razem z nim. Klik w skrzynkę — jak w front (ten sam panelKey).
const DRAWER_BOX = { slide: 13, side: 16, bottom: 8, top: 25, low: 12 };
let drawerBoxMaterial = null;
function addDrawerBox(target, p, cabinet, panels, space) {
  drawerBoxMaterial ??= new THREE.MeshLambertMaterial({ color: 0xd9d4c9 });
  const left = panels.find((x) => x.key === 'left');
  const right = panels.find((x) => x.key === 'right');
  // szuflada wewnętrzna na dystansach pod prowadnice — węższa
  const sp = p.key.startsWith('idrawer-') && cabinet.fronts?.innerSpacers ? INNER_SPACER : 0;
  const x0 = (left ? left.x + left.width : cabinet.x + 18) + DRAWER_BOX.slide + sp;
  const x1 = (right ? right.x : cabinet.x + cabinet.width - 18) - DRAWER_BOX.slide - sp;
  const back = panels.find((x) => x.key === 'back');
  const zFront = p.key.startsWith('idrawer-') ? p.z : cabinet.z + cabinet.depth; // za frontem / za czołem
  const zBack = Math.max((back ? back.z + back.depth : cabinet.z) + 10, zFront - 550);
  const y0 = p.y + DRAWER_BOX.low;
  const y1 = p.y + p.height - DRAWER_BOX.top;
  if (x1 - x0 < 40 || zFront - zBack < 40 || y1 - y0 < 30) return;
  const t = DRAWER_BOX.side;
  const parts = [
    [x0, y0, zBack, t, y1 - y0, zFront - zBack], // bok lewy
    [x1 - t, y0, zBack, t, y1 - y0, zFront - zBack], // bok prawy
    [x0 + t, y0, zBack, x1 - x0 - 2 * t, y1 - y0, t], // tył
    [x0 + t, y0, zBack + t, x1 - x0 - 2 * t, DRAWER_BOX.bottom, zFront - zBack - t], // dno
  ];
  for (const [x, y, z, w, h, d] of parts) {
    const geometry = new THREE.BoxGeometry(w * MM, h * MM, d * MM);
    const mesh = new THREE.Mesh(geometry, drawerBoxMaterial);
    mesh.position.set(...toScene(x + w / 2, y + h / 2, z + d / 2, space));
    mesh.userData.panelKey = p.key;
    target.add(mesh);
  }
}

// Korpus wiszący (tylko wygląd): stalowa szyna montażowa na ścianie za korpusem (w miejscu z cofnięcia pleców)
// i dwie zawieszki regulowane w górnych narożnikach (od środka, przed plecami) — zahaczone o szynę.
const hangerMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af, emissive: new THREE.Color(0x9ca3af).multiplyScalar(0.2) });
function addHangers(group, cabinet, panels, space) {
  const byKey = (k) => panels.find((p) => p.key === k);
  const left = byKey('left');
  const right = byKey('right');
  const top = byKey('top') ?? byKey('railBack');
  const back = byKey('back');
  if (!left || !right) return;
  const yTop = top ? top.y : left.y + left.height; // spód wieńca górnego
  const zBack = left.z; // tylna krawędź boków (przy ścianie)
  const gap = back ? back.z - zBack : cabinet.backSetback ?? 18; // miejsce za plecami
  const box = (x, y, z, w, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), hangerMat);
    m.position.set(...toScene(x + w / 2, y + h / 2, z + d / 2, space));
    group.add(m);
  };
  // szyna: 60 mm wysokości, w szczelinie za plecami, na całą szerokość korpusu
  const railD = Math.max(3, Math.min(13, gap - 2));
  box(left.x, yTop - 70, zBack, right.x + right.width - left.x, 60, railD);
  // zawieszki: przy bokach, pod wieńcem górnym, przed plecami (haki przechodzą przez plecy do szyny)
  const zFront = back ? back.z + back.depth : zBack + gap;
  for (const x of [left.x + left.width, right.x - 22]) {
    box(x, yTop - 75, zFront, 22, 70, 45);
    box(x + 4, yTop - 60, zBack + railD, 14, 22, zFront - zBack - railD); // hak przez plecy
  }
}

// Linie montażu prowadnic szuflad z systemu (np. ATM Futura) — delikatne przerywane linie na wewnętrznych licach
// lewego i prawego boku korpusu, na wysokości osi otworów prowadnicy, na długość prowadnicy (od przedniej krawędzi);
// kreska — pierwszy otwór (frontHole od krawędzi). Szuflada z okienka (pickedIndex) — wyraźniej, na niebiesko.
const railMat = new THREE.LineDashedMaterial({ color: 0x6b7280, dashSize: 0.012, gapSize: 0.008, depthTest: false, transparent: true, opacity: 0.7 });
const railPickMat = new THREE.LineDashedMaterial({ color: 0x2563eb, dashSize: 0.016, gapSize: 0.008, depthTest: false, transparent: true, opacity: 1 });
function addRailLines(group, cabinet, project, pickedIndex) {
  const space = project.space;
  for (const b of cabinetDrawerRails(cabinet, project)) {
    const r = b.rail;
    if (!r) continue;
    const mat = b.index === pickedIndex ? railPickMat : railMat;
    for (const x of [r.xLeft + 0.5, r.xRight - 0.5]) {
      const pts = [new THREE.Vector3(...toScene(x, r.y, r.zFront, space)), new THREE.Vector3(...toScene(x, r.y, r.zFront - r.length, space))];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.computeLineDistances();
      line.renderOrder = 15;
      group.add(line);
      // pierwszy otwór — krótka pionowa kreska
      const hz = r.zFront - r.frontHole;
      const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...toScene(x, r.y - 8, hz, space)), new THREE.Vector3(...toScene(x, r.y + 8, hz, space))]), mat);
      tick.computeLineDistances();
      tick.renderOrder = 15;
      group.add(tick);
    }
  }
}

// Linia wysokości siedziska (widok → „Linia siedziska”): przerywana pozioma linia na ścianie tylnej i bocznych
// na wysokości project.view.seatHeight od podłogi, z podpisem przy ścianie tylnej.
const seatMat = new THREE.LineDashedMaterial({ color: 0xd97706, dashSize: 0.04, gapSize: 0.025, transparent: true, opacity: 0.95 });
function addSeatLine(group, project) {
  const { space } = project;
  const y = project.view.seatHeight ?? 450;
  const off = 2; // mm od ściany (żeby linia nie zlewała się ze ścianą)
  const segs = [
    [[off, y, off], [space.width - off, y, off]], // tylna
    [[off, y, off], [off, y, space.depth], ], // lewa
    [[space.width - off, y, off], [space.width - off, y, space.depth]], // prawa
  ];
  for (const [a, b] of segs) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...toScene(...a, space)), new THREE.Vector3(...toScene(...b, space))]), seatMat);
    line.computeLineDistances();
    line.renderOrder = 5;
    group.add(line);
  }
  const el = document.createElement('div');
  el.className = 'dim-label seat-label';
  el.textContent = `siedzisko ${Math.round(y)} mm`;
  el.title = 'Wysokość siedziska od podłogi (zmiana: Pokaż → Linia siedziska)';
  const label = new CSS2DObject(el);
  label.position.set(...toScene(Math.min(space.width - 120, 160), y + 25, off, space));
  group.add(label);
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
// Zawiasy puszkowe drzwi (tylko wygląd): puszka Ø35 z noskiem na tylnej stronie drzwi (w grupie drzwi — obraca się
// z nimi), prowadnik na boku korpusu i ramię od prowadnika do puszki (w korpusie). Zawias kolidujący z szufladą wewnętrzną (panel.hingeClash) —
// na czerwono. markers — zaznaczony korpus / drzwi: kółka widoczne przez drzwi (szare, kolizja — czerwone).
const HINGE_OK = 0x9ca3af;
const HINGE_BAD = 0xdc2626;
const hingeMat = new THREE.MeshLambertMaterial({ color: HINGE_OK, emissive: new THREE.Color(HINGE_OK).multiplyScalar(0.3) });
const hingeBadMat = new THREE.MeshLambertMaterial({ color: HINGE_BAD, emissive: new THREE.Color(HINGE_BAD).multiplyScalar(0.4) });
// zawias bez problemu — neutralny szary (pomarańczowy = ostrzeżenie, czerwony = błąd, niebieski = zaznaczony)
const HINGE_MARK = 0x4b5563;
const markOkMat = new THREE.MeshBasicMaterial({ color: HINGE_MARK, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
const markBadMat = new THREE.MeshBasicMaterial({ color: HINGE_BAD, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
const markFillMat = new THREE.MeshBasicMaterial({ color: HINGE_MARK, depthTest: false, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
const markFillBadMat = new THREE.MeshBasicMaterial({ color: HINGE_BAD, depthTest: false, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
// zawias zaznaczony (okienko „Zawias”) — niebieski
const HINGE_PICK = 0x2563eb;
const markPickMat = new THREE.MeshBasicMaterial({ color: HINGE_PICK, depthTest: false, transparent: true, opacity: 1, side: THREE.DoubleSide });
const markFillPickMat = new THREE.MeshBasicMaterial({ color: HINGE_PICK, depthTest: false, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
const CUP_GEOMETRY = new THREE.CylinderGeometry(17.5 * MM, 17.5 * MM, 4 * MM, 24);
const RING_GEOMETRY = new THREE.RingGeometry(17.5 * MM, 24 * MM, 32);
const DISC_GEOMETRY = new THREE.CircleGeometry(17.5 * MM, 32);
// pickedIndex — indeks zaznaczonego zawiasu tego frontu (null — żaden). Kółka i puszki mają userData.hinge
// ({ key, index }) — klik zaznacza zawias, przeciąganie przesuwa go w pionie.
function addHinges(door, body, p, panels, space, markers, pickedIndex = null) {
  const side = p.opening?.hinge;
  if (!side || !p.hinges?.length || p.solid) return;
  const sidePanel = panels.find((x) => x.key === side);
  const innerX = sidePanel ? (side === 'left' ? sidePanel.x + sidePanel.width : sidePanel.x) : side === 'left' ? p.x + 18 : p.x + p.width - 18;
  const sideFront = sidePanel ? sidePanel.z + sidePanel.depth : p.z;
  const clash = new Set(p.hingeClash ?? []);
  const dir = side === 'left' ? 1 : -1; // od boku do wnętrza
  const mk = (geometry, material, x, y, z, rotX, owner, key) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...toScene(x, y, z, space));
    if (rotX) mesh.rotation.x = Math.PI / 2;
    mesh.userData.noDispose = geometry === CUP_GEOMETRY || geometry === RING_GEOMETRY || geometry === DISC_GEOMETRY;
    if (key) mesh.userData.panelKey = key;
    owner.add(mesh);
    return mesh;
  };
  p.hinges.forEach((h, index) => {
    const bad = clash.has(Math.round(h.y - p.y));
    const picked = index === pickedIndex;
    const mat = bad ? hingeBadMat : hingeMat;
    const tag = { key: p.key, index };
    // NA DRZWIACH (obracają się z nimi): kołnierz puszki Ø35 na tylnej stronie drzwi, skrzydełka z wkrętami
    // i „nosek” — miejsce, w którym ramię wchodzi do puszki
    mk(CUP_GEOMETRY, mat, h.x, h.y, p.z - 2, true, door, p.key).userData.hinge = tag;
    mk(new THREE.BoxGeometry(14 * MM, 52 * MM, 3 * MM), mat, h.x - dir * 4, h.y, p.z - 1.5, false, door, p.key).userData.hinge = tag; // skrzydełka
    const noseZ = p.z - 7;
    mk(new THREE.BoxGeometry(16 * MM, 20 * MM, 10 * MM), mat, h.x, h.y, noseZ, false, door, p.key).userData.hinge = tag;
    // NA KORPUSIE: prowadnik na boku (środek 37 mm od przedniej krawędzi boku, wkręty co 32 mm)
    const plateZ = sideFront - 37;
    const PLATE = { t: 10, h: 50, d: 20 };
    mk(new THREE.BoxGeometry(PLATE.t * MM, PLATE.h * MM, PLATE.d * MM), mat, innerX + dir * (PLATE.t / 2), h.y, plateZ, false, body).userData.hinge = tag;
    // ramię: przykręcone na prowadniku (od jego tyłu), biegnie do przodu, do noska puszki na drzwiach —
    // przy zamkniętych drzwiach elementy łączą się w jeden zawias; przy otwieraniu ramię zostaje na korpusie
    const ARM = { t: 10, w: 18 };
    const ax = innerX + dir * (PLATE.t + ARM.t / 2);
    const az = plateZ - PLATE.d / 2;
    const bx = h.x;
    const bz = noseZ - 3;
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 1) {
      const arm = mk(new THREE.BoxGeometry(ARM.t * MM, ARM.w * MM, len * MM), mat, (ax + bx) / 2, h.y, (az + bz) / 2, false, body);
      arm.rotation.y = Math.atan2(bx - ax, bz - az);
      arm.userData.hinge = tag;
    }
    if (markers || picked) {
      // kółko na licu drzwi, widoczne przez wszystko
      const face = p.z + p.depth + 0.5;
      const ring = mk(RING_GEOMETRY, picked ? markPickMat : bad ? markBadMat : markOkMat, h.x, h.y, face, false, door, p.key);
      const disc = mk(DISC_GEOMETRY, picked ? markFillPickMat : bad ? markFillBadMat : markFillMat, h.x, h.y, face, false, door, p.key);
      ring.renderOrder = disc.renderOrder = picked ? 21 : 20;
      ring.userData.hinge = disc.userData.hinge = { key: p.key, index };
      if (picked) ring.scale.setScalar(1.3);
    }
  });
}

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
    mesh.userData.handle = true; // uchwyt można przeciągnąć po licu frontu
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

// texture — dekor z fakturą (wood / concrete / marble, scene/textures.js) albo brak (jednolity kolor).
function boardMaterial(color, texture) {
  const map = texture ? decorTexture(texture, color) : null;
  if (map) {
    // faktura niesie kolor; „samoświecenie” tą samą fakturą — jak przy jednolitych płytach
    return new THREE.MeshLambertMaterial({ map, emissive: new THREE.Color(SELF_LIGHT, SELF_LIGHT, SELF_LIGHT), emissiveMap: map });
  }
  const c = new THREE.Color(color);
  return new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(SELF_LIGHT) });
}

const EDGE_SELECTED = 0x2563eb;
// Kolor zaznaczonych elementów — z ustawień programu (domyślnie zielony; patrz state/settings.js).
const pickedColor = () => getSettings().highlight;
let pickedEdgeCache = { color: null, mat: null };
function pickedEdge() {
  const color = pickedColor();
  if (pickedEdgeCache.color !== color) {
    pickedEdgeCache.mat?.dispose();
    pickedEdgeCache = { color, mat: new THREE.LineBasicMaterial({ color }) };
  }
  return pickedEdgeCache.mat;
}

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

// Zaznaczony element (front, blenda): kolor lekko (25%) przesunięty w stronę koloru zaznaczenia —
// widać zaznaczenie, a wciąż też prawdziwy kolor (np. po jego zmianie z menu).
function pickedMaterial(material) {
  // obrzeże w tym samym kolorze co zaznaczona płyta (edgeColor: null)
  return { ...material, color: `#${new THREE.Color(material.color).lerp(new THREE.Color(pickedColor()), 0.25).getHexString()}`, edgeColor: null };
}

// Zaznaczone elementy („idKorpusu:klucz” — front albo blenda boczna, „trim:id” — blenda wspólna / blat)
// → ich prostopadłościany (w mm, układ przestrzeni) i nazwy — do wymiarów w 3D.
function selectedPartBoxes(project, ids) {
  const parts = [];
  for (const id of ids) {
    if (id.startsWith('trim:')) {
      const trim = project.trims?.find((t) => t.id === id.slice(5));
      const box = trim && !trim.hidden && trimBox(trim, project);
      if (box) parts.push({ box, name: trim.name });
      continue;
    }
    if (id.startsWith('board:')) {
      // samodzielna płyta (półka, blat): szerokość, grubość, głębokość
      const board = project.boards?.find((b) => b.id === id.slice(6));
      if (board && !board.hidden) parts.push({ box: boardBox(board, project), name: board.name, slab: true });
      continue;
    }
    const [cabinetId, key] = id.split(':');
    const cabinet = project.furniture.find((c) => c.id === cabinetId && !c.hidden);
    if (cabinet && key === 'legs') {
      // nóżki korpusu (wszystkie takie same) — wymiary przy przedniej lewej; walec jako prostopadłościan
      // opisany na nim (szerokość = średnica)
      const legs = cabinetLegs(cabinet, project);
      const l = legs.reduce((best, x) => (!best || x.z > best.z + 0.5 || (Math.abs(x.z - best.z) <= 0.5 && x.x < best.x) ? x : best), null);
      if (l) {
        const box = { x: l.x - l.diameter / 2, y: l.y, z: l.z - l.diameter / 2, width: l.diameter, height: l.height, depth: l.diameter };
        parts.push({ box, name: `Nóżki ${cabinet.name} (${legs.length} szt.)`, round: true, owner: cabinet.id });
      }
      continue;
    }
    const panel = cabinet && cabinetPanels(cabinet, project).find((p) => p.key === key && p.valid && !p.hidden);
    if (panel) parts.push({ box: panel, name: panel.name, owner: cabinet.id });
  }
  return parts;
}

// Prostopadłościan korpusu do wymiarów całości: sam korpus razem z nóżkami (bez frontów i blend).
const cabinetBox = (c) => ({ x: c.x, y: c.y, z: c.z, width: c.width, height: legHeight(c) + c.height, depth: c.depth });

// Buduje meble projektu: każda płyta korpusu to osobny prostopadłościan z obrysem krawędzi.
// Zaznaczony korpus jest pomarańczowy (jak zaznaczone fronty i blendy); korpus, którego element jest
// zaznaczony — niebieskie krawędzie; korpus z problemami — czerwone krawędzie.
// selectedFronts — zbiór zaznaczonych frontów („idKorpusu:front-N”, kliknięte w 3D) — wyróżnione na pomarańczowo.
// isFrontOpen(id) — czy front jest otwarty; domyślnie według przełącznika „otwarte”.
// Uchwyt półki zaznaczonego korpusu: fioletowy krążek przy przedniej krawędzi półki (jak uchwyty ścian
// w zakładce „Przestrzeń”), rysowany na wierzchu — widać go i można chwycić także przez zamknięte drzwi.
// Ma panelKey półki, więc przeciąganie działa jak chwycenie samej półki (scene/interaction.js).
const SHELF_HANDLE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x7c3aed, depthTest: false, transparent: true, opacity: 0.85 });
const SHELF_HANDLE_GEOMETRY = new THREE.CylinderGeometry(32 * MM, 32 * MM, 10 * MM, 24).rotateX(Math.PI / 2); // oś do przodu
function addShelfHandle(group, p, space) {
  const mesh = new THREE.Mesh(SHELF_HANDLE_GEOMETRY, SHELF_HANDLE_MATERIAL);
  mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth + 20, space));
  mesh.renderOrder = 10;
  mesh.userData.panelKey = p.key;
  mesh.userData.shelfHandle = true;
  mesh.userData.noDispose = true;
  group.add(mesh);
}

// Uchwyty wymiarów zaznaczonego korpusu (fioletowe krążki, jak przy ścianach przestrzeni): boki — szerokość,
// wierzch — wysokość, przód (przy dole) — głębokość. userData.cabinetResize = { cabinetId, face }.
const RESIZE_GEOMETRY = new THREE.CylinderGeometry(38 * MM, 38 * MM, 10 * MM, 24);
function addResizeHandles(group, cabinet, project) {
  const b = cabinetBounds(cabinet, project);
  const y0 = cabinet.y + legHeight(cabinet);
  const midY = y0 + cabinet.height / 2;
  const midZ = cabinet.z + cabinet.depth / 2;
  const midX = cabinet.x + cabinet.width / 2;
  const faces = [
    ['left', [Math.min(b.x, cabinet.x) - 30, midY, midZ], [1, 0, 0]],
    ['right', [Math.max(b.x + b.width, cabinet.x + cabinet.width) + 30, midY, midZ], [1, 0, 0]],
    ['top', [midX, y0 + cabinet.height + 30, midZ], [0, 1, 0]],
    ['front', [midX, y0 + Math.max(60, cabinet.height * 0.08), Math.max(b.z + b.depth, cabinet.z + cabinet.depth) + 30], [0, 0, 1]],
  ];
  for (const [face, [x, y, z], axis] of faces) {
    const mesh = new THREE.Mesh(RESIZE_GEOMETRY, SHELF_HANDLE_MATERIAL);
    mesh.position.set(...toScene(x, y, z, project.space));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis));
    mesh.renderOrder = 10;
    mesh.userData.cabinetResize = { cabinetId: cabinet.id, face };
    mesh.userData.noDispose = true;
    group.add(mesh);
  }
}

// Uchwyty granic frontów zaznaczonego korpusu (fioletowe krążki na styku szuflad i między sekcjami frontu,
// po prawej stronie frontu): przeciąganie w pionie zmienia wysokości obu sąsiednich części.
// userData.frontBoundary = { cabinetId, kind, index, section }.
// Wygląd: turkusowa pozioma belka ze strzałkami w górę i w dół — inna niż fioletowe kółka korpusu i półek.
const BOUNDARY_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x0d9488, depthTest: false, transparent: true, opacity: 0.95 });
const BOUNDARY_BAR = new THREE.CapsuleGeometry(13 * MM, 110 * MM, 6, 16).rotateZ(Math.PI / 2); // pozioma
const BOUNDARY_ARROW = new THREE.ConeGeometry(15 * MM, 22 * MM, 16);
const MOVE_DISC = new THREE.CylinderGeometry(20 * MM, 20 * MM, 8 * MM, 24).rotateX(Math.PI / 2); // środek uchwytu przesuwania
// selectedKeys — zaznaczone fronty tego korpusu: jedna zaznaczona szuflada — tylko jej uchwyt (zmienia się tylko ona).
// isOpen(idFrontu) — czy front jest otwarty: granice między częściami za zamkniętymi drzwiami nie mają uchwytów
// (szuflad za nimi nie widać) — zostają granice na krawędziach drzwi (zmiana wysokości drzwi).
function addFrontBoundaryHandles(group, cabinet, project, selectedKeys = [], isOpen = () => false) {
  const b = cabinetBounds(cabinet, project);
  const z = Math.max(b.z + b.depth, cabinet.z + cabinet.depth) + 25;
  const x = cabinet.x + cabinet.width * 0.75;
  const one = selectedKeys.length === 1 ? drawerResizeHandle(cabinet, project, selectedKeys[0]) : null;
  // zaznaczona szuflada — także uchwyt przesuwania całej szuflady (środek frontu, kółko ze strzałkami)
  const mover = selectedKeys.length === 1 ? drawerMoveHandle(cabinet, project, selectedKeys[0]) : null;
  if (mover) {
    const data = { cabinetId: cabinet.id, kind: 'drawerMove', index: mover.index };
    const handle = new THREE.Group();
    handle.position.set(...toScene(mover.x, mover.y, z, project.space));
    for (const [geometry, dy, rot] of [[MOVE_DISC, 0, 0], [BOUNDARY_ARROW, 34, 0], [BOUNDARY_ARROW, -34, Math.PI]]) {
      const mesh = new THREE.Mesh(geometry, BOUNDARY_MATERIAL);
      mesh.position.y = dy * MM;
      mesh.rotation.z = rot;
      mesh.renderOrder = 11;
      mesh.userData.frontBoundary = data;
      mesh.userData.noDispose = true;
      handle.add(mesh);
    }
    group.add(handle);
  }
  const st = frontParts(cabinet.fronts);
  const slots = frontSlots(st);
  const hidden = new Set(); // indeksy granic (nad częścią i) ukrytych za zamkniętymi drzwiami
  st.doors.forEach((d, j) => {
    const open = slots.fronts.some((sl, n) => sl.door === j && isOpen(`${cabinet.id}:front-${n}`));
    const span = doorSpan(d, st.parts);
    if (open || !span) return;
    for (let i = span[0]; i < span[1]; i++) hidden.add(i);
  });
  for (const fb of one ? [one] : frontBoundaries(cabinet, project).filter((b) => !hidden.has(b.index))) {
    const data = { cabinetId: cabinet.id, kind: fb.kind, index: fb.index, mode: fb.mode, edge: fb.edge };
    const handle = new THREE.Group();
    handle.position.set(...toScene(x, fb.y, z, project.space));
    const parts = [
      [BOUNDARY_BAR, 0, 0],
      [BOUNDARY_ARROW, 30, 0], // strzałka w górę
      [BOUNDARY_ARROW, -30, Math.PI], // strzałka w dół
    ];
    for (const [geometry, dy, rot] of parts) {
      const mesh = new THREE.Mesh(geometry, BOUNDARY_MATERIAL);
      mesh.position.y = dy * MM;
      mesh.rotation.z = rot;
      mesh.renderOrder = 11;
      mesh.userData.frontBoundary = data; // każda część chwyta tak samo
      mesh.userData.noDispose = true;
      handle.add(mesh);
    }
    group.add(handle);
  }
}

// Mała okrągła ikonka (HTML, zawsze tej samej wielkości) nad zaznaczonym korpusem — otwiera / zamyka wszystkie jego
// fronty — albo nad zaznaczonym frontem — tylko ten front. Klik obsługuje scene/interaction.js
// (data-open-fronts = id korpusu, data-open-front = „idKorpusu:klucz”).
function addOpenFrontsButton(group, cabinet, project, isFrontOpen, frontKey = null) {
  const panels = cabinetPanels(cabinet, project).filter((p) => p.valid && !p.hidden && p.opening);
  const fronts = frontKey ? panels.filter((p) => p.key === frontKey) : panels.filter((p) => p.key.startsWith('front-'));
  if (!fronts.length) return;
  const open = fronts.some((p) => isFrontOpen(`${cabinet.id}:${p.key}`));
  const drawers = fronts.every((p) => p.opening?.drawer);
  const doors = fronts.every((p) => !p.opening?.drawer);
  const what = frontKey ? (drawers ? 'szufladę' : 'drzwi') : drawers ? 'szuflady' : doors ? 'drzwi' : 'fronty';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `open-fronts-btn${open ? ' is-open' : ''}`;
  if (frontKey) el.dataset.openFront = `${cabinet.id}:${frontKey}`;
  else el.dataset.openFronts = cabinet.id;
  el.textContent = open ? '⇥' : '⇤';
  el.title = open ? `Zamknij ${what}` : `${drawers ? 'Wysuń' : 'Otwórz'} ${what}`;
  el.setAttribute('aria-label', el.title);
  const label = new CSS2DObject(el);
  if (frontKey) {
    // nad górną krawędzią frontu, na środku
    const p = fronts[0];
    label.position.set(...toScene(p.x + p.width / 2, p.y + p.height, p.z + p.depth, project.space));
  } else {
    const b = cabinetBounds(cabinet, project);
    label.position.set(...toScene(b.x + b.width / 2, b.y + b.height, b.z + b.depth, project.space));
  }
  label.center.set(0.5, 1.3);
  group.add(label);
}

// Mocowanie samodzielnej płyty do tylnej ściany (model/boards.js — mountPoints): wsporniki kątowe (ramię pod płytą
// i ramię na ścianie), szyny ścienne ze wspornikami, listwa pod tylną krawędzią (w kolorze płyty). Mocowanie
// ukryte — niewidoczne (bolce w płycie).
const MOUNT_METAL = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
function buildBoardMount(board, box, project, boardMat) {
  const pts = mountPoints(board);
  if (!pts.type || pts.type === 'hidden') return null;
  const g = new THREE.Group();
  const { space } = project;
  const add = (w, h, d, x, y, z, material = MOUNT_METAL) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), material);
    mesh.position.set(...toScene(x, y, z, space)); // środek bryły (mm)
    g.add(mesh);
  };
  const wall = box.z; // tył płyty (przy ścianie)
  const under = box.y;
  if (pts.type === 'cleat') {
    const len = Math.max(100, box.width - 20);
    add(len, 40, 20, box.x + box.width / 2, under - 20, wall + 10, boardMat);
    return g;
  }
  const t = 4; // grubość blachy
  const arm = Math.max(60, Math.min(box.depth - 20, pts.type === 'rail' ? box.depth * 0.8 : 200)); // ramię pod płytą
  const leg = Math.min(pts.type === 'rail' ? 0 : 160, under); // ramię na ścianie
  for (const u of pts.xs) {
    const x = box.x + u;
    add(20, t, arm, x, under - t / 2, wall + arm / 2); // pod płytą
    if (pts.type === 'brackets') {
      add(20, leg, t, x, under - leg / 2, wall + t / 2); // na ścianie
      // skos usztywniający
      const diag = new THREE.Mesh(new THREE.BoxGeometry(16 * MM, t * MM, Math.hypot(arm * 0.6, leg * 0.6) * MM), MOUNT_METAL);
      diag.position.set(...toScene(x, under - leg * 0.3, wall + arm * 0.3, space));
      diag.rotation.x = -Math.atan2(leg * 0.6, arm * 0.6);
      g.add(diag);
    } else {
      // szyna ścienna: od 400 mm pod płytą do 60 mm nad nią
      const bottom = Math.max(0, under - 400);
      add(25, under + 60 - bottom, 10, x, (bottom + under + 60) / 2, wall + 5);
    }
  }
  return g;
}

// selectedHinge — zaznaczony zawias { cabinetId, key, index } (okienko „Zawias”)
export function buildFurniture(project, selectedIds = new Set(), selectedFronts = new Set(), isFrontOpen = () => project.view?.openFronts === true, selectedHole = null, selectedObstacle = null, selectedHinge = null) {
  // zaznaczony otwór płyty ({ kind: "trim" | "board", id, index }) — wyróżniony sam otwór
  const holeOf = (kind, id) => (selectedHole?.kind === kind && selectedHole.id === id ? selectedHole.index : null);
  const group = new THREE.Group();
  const disposables = [];
  group.userData.disposables = disposables;

  // Jeden materiał Three.js na kolor płyty (kolory pochodzą z biblioteki materiałów projektu).
  const byColor = new Map();
  const materialFor = (color, texture = null) => {
    const key = texture ? `${color}|${texture}` : color;
    if (!byColor.has(key)) {
      const m = boardMaterial(color, texture);
      byColor.set(key, m);
      disposables.push(m);
    }
    return byColor.get(key);
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
  // Korpusy, których element (front, blenda boczna, nóżki) jest zaznaczony — wyróżniony jest wtedy
  // sam element, a korpus ma tylko niebieskie krawędzie.
  const partOwners = new Set([...selectedFronts].filter((id) => !id.startsWith('trim:')).map((id) => id.split(':')[0]));
  for (const cabinet of project.furniture.filter((c) => !c.hidden)) {
    const hasIssues = cabinetIssues(cabinet, project).length > 0;
    // zaznaczony korpus (sam, bez swojego elementu) — cały na pomarańczowo, jak zaznaczone blendy
    const cabinetPicked = selectedIds.has(cabinet.id) && !partOwners.has(cabinet.id);
    // (blendy boczne, panele boczne i cokoły boczne to osobne elementy — nie świecą razem z korpusem)
    const isPicked = (id, panel) => (cabinetPicked && panel?.group !== 'blend') || selectedFronts.has(id);
    const edgeColor = selectedIds.has(cabinet.id) ? EDGE_SELECTED : hasIssues ? EDGE_BAD : EDGE_OK;
    const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
    disposables.push(edgeMat);

    const cabinetGroup = new THREE.Group();
    cabinetGroup.name = cabinet.name;
    cabinetGroup.userData.cabinetId = cabinet.id; // do wybierania myszką
    solids ??= projectSolids(project);
    const cabPanels = cabinetPanels(cabinet, project);
    for (const p of cabPanels.filter(panelVisible)) {
      if (p.solid) {
        // Płyta docięta pod skos — rysujemy jej bryłę (lica i krawędzie w jednym kolorze płyty).
        const pickedSolid = isPicked(`${cabinet.id}:${p.key}`, p);
        const geometry = solidGeometry(p.solid, project.space);
        const mesh = new THREE.Mesh(geometry, solidMaterialFor((pickedSolid ? pickedMaterial(p.material) : p.material).color));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), pickedSolid ? pickedEdge() : edgeMat));
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
      if (p.material.texture) scaleBoxUVs(geometry, p.width, p.height, p.depth); // faktura w skali płyty
      const picked = isPicked(`${cabinet.id}:${p.key}`, p);
      // zaznaczona płyta: kolor przesunięty w stronę pomarańczowego i pomarańczowe krawędzie
      const material = picked ? pickedMaterial(p.material) : p.material;
      const mesh = new THREE.Mesh(geometry, panelFaceMaterials(material, p.thicknessAxis, materialFor));
      mesh.position.set(...toScene(p.x + p.width / 2, p.y + p.height / 2, p.z + p.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), picked ? pickedEdge() : edgeMat));
      mesh.userData.panelKey = p.key; // np. „shelf-…” — półkę można przeciągać w pionie
      target.add(mesh);
      addMilling(target, p, materialFor, project.space);
      addHandle(target, p, project.space);
      if (p.opening?.drawer) addDrawerBox(target, p, cabinet, cabPanels, project.space);
      if (p.hinges?.length) addHinges(target, cabinetGroup, p, cabPanels, project.space, selectedIds.has(cabinet.id) || selectedFronts.has(`${cabinet.id}:${p.key}`), selectedHinge?.cabinetId === cabinet.id && selectedHinge.key === p.key ? selectedHinge.index : null);
      addAllowance(target, p, p.allowanceMin, p.allowanceMax, project.space);
      if (p.material.edgeBanding) {
        const keys = panelEdgeSet(p, cabinet, project, solids);
        addEdgeBanding(target, p, keys, p.material.edgeBanding, edgeColorOf(material), materialFor, project.space, p.key);
      }
    }

    // zaznaczony korpus — uchwyty półek
    if (selectedIds.has(cabinet.id)) {
      for (const p of cabinetPanels(cabinet, project).filter((x) => x.key.startsWith('shelf-') && panelVisible(x))) addShelfHandle(cabinetGroup, p, project.space);
      // (poza grupą korpusu — nie zaznaczają go jak płyta); zaznaczony sam front / płyta korpusu — bez nich
      if (!partOwners.has(cabinet.id)) addResizeHandles(group, cabinet, project);
      const myFronts = [...selectedFronts].filter((id) => id.startsWith(`${cabinet.id}:front-`) || id.startsWith(`${cabinet.id}:idrawer-`)).map((id) => id.split(':')[1]);
      addFrontBoundaryHandles(group, cabinet, project, myFronts, isFrontOpen);
      // ikonka otwierania: jeden zaznaczony front — nad nim (tylko ten front); jeden zaznaczony korpus — nad korpusem (wszystkie)
      if (myFronts.length === 1) addOpenFrontsButton(group, cabinet, project, isFrontOpen, myFronts[0]);
      // okienko szuflady (zaznaczona jedna szuflada) — linie montażu prowadnic na bokach korpusu
      if (myFronts.length === 1) {
        const picked = cabinetPanels(cabinet, project).find((x) => x.key === myFronts[0]);
        if (picked?.opening?.drawer) addRailLines(group, cabinet, project, picked.part);
      }
      else if (selectedIds.size === 1 && !partOwners.has(cabinet.id)) addOpenFrontsButton(group, cabinet, project, isFrontOpen);
    }

    if (cabinet.mount === 'wall') addHangers(cabinetGroup, cabinet, cabPanels, project.space);
    const legs = cabinetLegs(cabinet, project);
    if (legs.length) {
      const legMat = new THREE.MeshLambertMaterial({ color: LEG_COLOR });
      const pickedLegMat = new THREE.MeshLambertMaterial({ color: pickedColor() }); // zaznaczona nóżka
      disposables.push(legMat, pickedLegMat);
      legs.forEach((l, i) => {
        const r = (l.diameter / 2) * MM;
        const key = `leg-${i}`;
        const picked = isPicked(`${cabinet.id}:legs`); // nóżki zaznaczają się wszystkie naraz
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l.height * MM, 20), picked ? pickedLegMat : legMat);
        mesh.position.set(...toScene(l.x, l.y + l.height / 2, l.z, project.space));
        mesh.userData.panelKey = key; // do zaznaczania nóżki myszką
        cabinetGroup.add(mesh);
      });
    }
    group.add(cabinetGroup);
  }

  // Blendy wspólne (blenda dolna, blenda górna) — w kolorze swojego materiału.
  for (const trim of (project.trims ?? []).filter(trimVisible)) {
    const segments = trimSegments(trim, project);
    if (!segments.length) continue;
    const picked = selectedFronts.has(`trim:${trim.id}`); // zaznaczona (klik w 3D) — na pomarańczowo
    const tm = picked ? pickedMaterial(trimMaterial(trim, project)) : trimMaterial(trim, project);
    const mat = panelFaceMaterials(tm, TRIM_THICKNESS_AXIS[trim.type], materialFor);
    const edgeMat = picked ? pickedEdge() : new THREE.LineBasicMaterial({ color: trimIssues(trim, project).length ? EDGE_BAD : EDGE_OK });
    if (!picked) disposables.push(edgeMat);
    const a = trimAllowance(trim, project);
    if (tm.edgeBanding) solids ??= projectSolids(project);
    const trimGroup = new THREE.Group();
    trimGroup.userData.trimId = trim.id; // do wybierania myszką
    // Blat z otworami albo frezami krawędzi — kształt z wyciętymi otworami (scene/slab.js).
    if (trim.type === 'countertop' && needsSlab(trim.edges, trim.holes) && segments.length === 1 && !segments[0].solid) {
      const slab = buildSlab(segments[0], { edges: trim.edges, holes: resolveHoles(trim.holes, segments[0].width, segments[0].depth), material: materialFor(tm.color, tm.texture), edgeMaterial: edgeMat, space: project.space, pickedHole: holeOf('trim', trim.id), pickedColor: pickedColor() });
      slab.userData.slab = { kind: 'trim', id: trim.id, box: segments[0] }; // do przesuwania otworów myszką
      trimGroup.add(slab);
      group.add(trimGroup);
      continue;
    }
    segments.forEach((box, i) => {
      if (box.solid) {
        // Blenda docięta pod skos (np. blenda górna do skosu).
        const geometry = solidGeometry(box.solid, project.space);
        const mesh = new THREE.Mesh(geometry, solidMaterialFor(tm.color));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edgeMat));
        trimGroup.add(mesh);
        return;
      }
      if (tm.edgeBanding) {
        addEdgeBanding(trimGroup, box, trimEdgeSet(trim, box, i, solids), tm.edgeBanding, edgeColorOf(tm), materialFor, project.space);
      }
      const geometry = new THREE.BoxGeometry(box.width * MM, box.height * MM, box.depth * MM);
      if (tm.texture) scaleBoxUVs(geometry, box.width, box.height, box.depth);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(...toScene(box.x + box.width / 2, box.y + box.height / 2, box.z + box.depth / 2, project.space));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
      trimGroup.add(mesh);
      // zapas: z lewej na pierwszym odcinku, z prawej na ostatnim
      addAllowance(trimGroup, box, i === 0 ? a.min : 0, i === segments.length - 1 ? a.max : 0, project.space);
    });
    group.add(trimGroup);
  }

  // Samodzielne płyty (blaty, półki) — z otworami i frezami krawędzi.
  for (const board of (project.boards ?? []).filter((b) => !b.hidden && (b.kind !== 'worktop' || view.showCountertops !== false))) {
    const box = boardBox(board, project);
    const picked = selectedFronts.has(`board:${board.id}`);
    const bm = picked ? pickedMaterial(boardPlateMaterial(board, project)) : boardPlateMaterial(board, project);
    const edgeMat = picked ? pickedEdge() : new THREE.LineBasicMaterial({ color: boardIssues(board, project).length ? EDGE_BAD : EDGE_OK });
    if (!picked) disposables.push(edgeMat);
    const slab = buildSlab(box, { edges: board.edges, holes: resolveHoles(board.holes, box.width, box.depth), material: materialFor(bm.color, bm.texture), edgeMaterial: edgeMat, space: project.space, pickedHole: holeOf('board', board.id), pickedColor: pickedColor() });
    slab.userData.boardId = board.id; // do wybierania myszką
    slab.userData.slab = { kind: 'board', id: board.id, box }; // do przesuwania otworów myszką
    group.add(slab);
    // mocowanie do ściany (wsporniki, listwa, szyny) — część płyty (klik zaznacza płytę)
    const mount = buildBoardMount(board, box, project, materialFor(bm.color, bm.texture));
    if (mount) {
      mount.userData.boardId = board.id;
      group.add(mount);
    }
    // zaznaczona płyta — uchwyt zmiany wysokości (przeciąganie w górę / w dół)
    if (picked) {
      const handle = new THREE.Group();
      handle.position.set(...toScene(box.x + box.width * 0.75, box.y + box.height / 2, box.z + box.depth + 40, project.space));
      for (const [geometry, dy, rot] of [[BOUNDARY_BAR, 0, 0], [BOUNDARY_ARROW, 30, 0], [BOUNDARY_ARROW, -30, Math.PI]]) {
        const mesh = new THREE.Mesh(geometry, BOUNDARY_MATERIAL);
        mesh.position.y = dy * MM;
        mesh.rotation.z = rot;
        mesh.renderOrder = 11;
        mesh.userData.boardLift = { id: board.id };
        mesh.userData.noDispose = true;
        handle.add(mesh);
      }
      group.add(handle);
    }
  }

  // dekoracje (tylko wygląd) — zaznaczone: „decor:id” w zbiorze zaznaczonych elementów
  group.add(buildDecorations(project, selectedFronts));
  if (project.view?.seatLine) addSeatLine(group, project);

  // Wymiary w 3D:
  //  - zaznaczone elementy (fronty, blendy, nóżki) — wymiary każdego,
  //  - zaznaczone korpusy — wymiary korpusu / grupy korpusów; korpus, którego element jest zaznaczony
  //    (klik we front / blendę boczną / nóżki zaznacza też korpus), liczy się jako ten element,
  //  - kilka różnych obiektów (np. korpus i blenda górna) — dodatkowo wymiary całości („razem”).
  if (view.showDims !== false) {
    const parts = selectedPartBoxes(project, selectedFronts);
    const owners = new Set(parts.map((p) => p.owner).filter(Boolean));
    const cabinets = project.furniture.filter((c) => selectedIds.has(c.id) && !c.hidden && !owners.has(c.id));
    if (parts.length) group.add(buildPartDimensions(parts, project.space));
    // jedna zaznaczona samodzielna płyta — odległości w pionie: od blatu / korpusu pod nią, od podłogi, do sufitu
    // co jest pod / przed prostopadłościanem (nachodzi w X): blaty, inne płyty, korpusy — do odległości w pionie
    const belowOf = (box, skipBoard = null, skipCabinet = null) => {
      const overlapsX = (b) => b.x < box.x + box.width && b.x + b.width > box.x;
      return [
        ...(project.trims ?? []).filter((t) => t.type === 'countertop' && !t.hidden).map((t) => trimBox(t, project)).filter((b) => b && overlapsX(b)).map((b) => ({ top: b.y + b.height, front: b.z + b.depth, label: 'blatu' })),
        ...(project.boards ?? []).filter((b) => b.id !== skipBoard && !b.hidden).map((b) => ({ b, box: boardBox(b, project) })).filter(({ box: b }) => overlapsX(b)).map(({ b, box: bb }) => ({ top: bb.y + bb.height, front: bb.z + bb.depth, label: b.kind === 'worktop' ? 'blatu' : 'półki' })),
        ...project.furniture.filter((c) => !c.hidden && c.id !== skipCabinet).map((c) => cabinetBounds(c, project)).filter(overlapsX).map((b) => ({ top: b.y + b.height, front: b.z + b.depth, label: 'korpusu' })),
      ];
    };
    const boardIds = [...selectedFronts].filter((id) => id.startsWith('board:'));
    if (boardIds.length === 1) {
      const board = project.boards?.find((b) => b.id === boardIds[0].slice(6));
      if (board && !board.hidden) {
        const box = boardBox(board, project);
        group.add(buildClearanceDimensions(box, project.space, belowOf(box, board.id)));
      }
    }
    // zaznaczony okap / występ ściany / przeszkoda — wymiary i odległości w pionie (od blatu, podłogi, do sufitu)
    const obstacle = selectedObstacle && project.space.obstacles.find((o) => o.id === selectedObstacle);
    if (obstacle) {
      const box = { x: obstacle.x, y: obstacle.y, z: obstacle.z, width: obstacle.width, height: obstacle.height, depth: obstacle.depth };
      group.add(buildPartDimensions([{ box, name: obstacle.name }], project.space));
      group.add(buildClearanceDimensions(box, project.space, belowOf(box)));
    }
    if (cabinets.length) group.add(buildCabinetDimensions(cabinets, project.space));
    // jedna zaznaczona szafka wisząca — jak okap: odległości w pionie (od blatu / korpusu pod nią, od podłogi, do sufitu)
    if (cabinets.length === 1 && cabinets[0].mount === 'wall') {
      const box = cabinetBounds(cabinets[0], project);
      group.add(buildClearanceDimensions(box, project.space, belowOf(box, null, cabinets[0].id)));
    }
    if (parts.length && cabinets.length) {
      const boxes = [...parts.map((p) => p.box), ...cabinets.map(cabinetBox)];
      group.add(buildTotalDimensions(boxes, project.space));
    }
  }
  return group;
}
