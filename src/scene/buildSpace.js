import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { createDimension } from './dimensions.js';
import { buildWallDecor, buildHoodDecor } from './wallDecor.js';
import { formatLength, getSettings } from '../state/settings.js';
import { t } from '../i18n.js';
import { boxPolyhedron, clipPolyhedron, facesToPositions, facesToEdgePositions, prismPolyhedron, clipPolygon, orientedFace } from './polyhedron.js';
import { isObstacleOutside, isWallObstacle, isWallLike, isHoodObstacle, slopePlanes, wallSegments } from '../model/space.js';
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
    const floorMat = surfaceMaterial(group, space.colors.floor, false);
    floorMat.emissive = new THREE.Color(space.colors.floor);
    floorMat.emissiveIntensity = WALL_GLOW * 0.6;
    const wallMat = surfaceMaterial(group, space.colors.walls);
    for (const tag of new Set(faces.map((f) => f.tag))) {
      if (!isVisible(tag)) continue;
      // ściana we własnym kolorze (space.wallFinish)
      const own = tag !== 'floor' && space.wallFinish?.[tag]?.color;
      addSurface(group, faces.filter((f) => f.tag === tag), transform, tag === 'floor' ? floorMat : own ? surfaceMaterial(group, own) : wallMat, tag);
    }
    addWallTiles(group, space);
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
    if (isWallLike(o) && !outside) {
      if (!wallMaterial) {
        wallMaterial = new THREE.MeshLambertMaterial({ color: space.colors.walls, ...wallGlow(space.colors.walls), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        group.userData.disposables.push(wallMaterial);
      }
      mat = wallMaterial;
    }
    if (o.color && !outside) {
      // własny kolor (np. okap w kolorze frontów)
      mat = new THREE.MeshLambertMaterial({ color: o.color.hex, ...wallGlow(o.color.hex), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      group.userData.disposables.push(mat);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.width * MM, o.height * MM, o.depth * MM), mat);
    mesh.position.set(x, y, z);
    let edges = isWallLike(o) ? wallEdgeMaterial : obstacleMaterials.edges;
    if (isWallLike(o)) {
      mesh.userData.obstacleId = o.id; // występ ściany — do zaznaczania, przeciągania i menu (scene/interaction.js)
      if (o.id === selectedObstacle) {
        edges = new THREE.LineBasicMaterial({ color: getSettings().highlight });
        group.userData.disposables.push(edges);
      }
    }
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edges));
    group.add(mesh);
    // zaznaczony występ ściany / okap — kółka wymiarów: boki (szerokość), przód (głębokość), góra / dół okapu (wysokość)
    if (isWallLike(o) && o.id === selectedObstacle) addObstacleResizeHandles(group, o, space);
    // kominek / wkład / telewizor na przedniej ścianie występu (tylko wygląd)
    if (isWallObstacle(o)) {
      const decor = buildWallDecor(o, space);
      if (decor) group.add(decor);
    } else if (isHoodObstacle(o)) {
      const hood = buildHoodDecor(o, space); // okap (urządzenie) pod zabudową
      if (hood) group.add(hood);
    }
  }

  // Wymiary.
  const gap = Math.max(0.12, Math.max(w, h, d) * 0.06);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  group.add(createDimension(v(0, 0, 0), v(w, 0, 0), v(0, 0, gap), t('przestrzeń {v}', { v: formatLength(space.width) })));
  // Przy występach ścian (np. kominku) — także szerokości poszczególnych wnęk i występów, bliżej przestrzeni.
  const segments = wallSegments(space, [0, space.height]); // (z okapem — jego szerokość i wnęki obok)
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
  group.add(createDimension(v(0, 0, 0), v(0, h, 0), v(-gap, 0, 0), t('przestrzeń {v}', { v: formatLength(space.height) })));
  group.add(createDimension(v(w, 0, 0), v(w, 0, -d), v(gap, 0, 0), t('przestrzeń {v}', { v: formatLength(space.depth) })));

  return group;
}


// --- płytki na ścianach (space.wallFinish; model/wallFinish.js) ---
// Pas płytek: czworokąt nad każdym odcinkiem ściany od `from` do `to` (przycięty skosami), odsunięty 2 mm do środka,
// widoczny tylko od wnętrza; tekstura powtarzana — jedna płytka (cegiełka: dwa rzędy z przesunięciem) z fugą.
const tileTextures = new Map(); // wspólne między przebudowami (klucz — wygląd płytki)
function tileTexture(t) {
  const key = [t.width, t.height, t.grout, t.layout, t.color, t.groutColor].join('|');
  if (tileTextures.has(key)) return tileTextures.get(key);
  const uw = t.width + t.grout;
  const uh = (t.height + t.grout) * (t.layout === 'brick' ? 2 : 1);
  const s = 256 / Math.max(uw, uh); // px na mm
  const cw = Math.max(8, Math.round(uw * s));
  const ch = Math.max(8, Math.round(uh * s));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  g.fillStyle = t.groutColor;
  g.fillRect(0, 0, cw, ch);
  const gx = Math.max(1, t.grout * s);
  const tw = t.width * s;
  const th = t.height * s;
  const tile = (x, y) => {
    g.fillStyle = t.color;
    g.fillRect(x + gx / 2, y + gx / 2, tw, th);
    // bez przyciemniania — biała płytka ma być biała (jak ściana w tym samym kolorze)
  };
  tile(0, 0);
  if (t.layout === 'brick') {
    const rowH = ch / 2;
    tile(-cw / 2, rowH);
    tile(cw / 2, rowH);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const value = { tex, uw, uh };
  tileTextures.set(key, value);
  return value;
}

function addWallTiles(group, space) {
  const finish = space.wallFinish ?? {};
  if (!Object.values(finish).some((f) => f.tiles)) return;
  const pts = spaceOutline(space);
  const planes = slopePlanes(space).map((pl) => [new THREE.Vector3(...pl.normal), pl.offset]);
  for (const e of outlineEdges(space)) {
    const t = finish[e.tag]?.tiles;
    if (!t || e.open || (['left', 'right', 'back'].includes(e.tag) && space.walls[e.tag] === false)) continue;
    const from = Math.max(0, t.from);
    const to = Math.min(space.height, t.to);
    const len = edgeLength(e);
    if (to - from < 1 || len < 1) continue;
    const [ox, oz] = edgeOutward(e, pts);
    const off = 2; // mm do środka pomieszczenia
    const P = (p, y) => new THREE.Vector3(p[0] - ox * off, y, p[1] - oz * off);
    let poly = [P(e.a, from), P(e.b, from), P(e.b, to), P(e.a, to)];
    for (const [n, o] of planes) poly = clipPolygon(poly, n, o);
    if (poly.length < 3) continue;
    const { tex, uw, uh } = tileTexture(t);
    const dir = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len];
    const pos = [];
    const uv = [];
    for (let i = 1; i < poly.length - 1; i++) {
      let tri = [poly[0], poly[i], poly[i + 1]];
      // normalna trójkąta do środka pomieszczenia (widoczny od wewnątrz)
      const nrm = new THREE.Vector3().subVectors(tri[1], tri[0]).cross(new THREE.Vector3().subVectors(tri[2], tri[0]));
      if (nrm.x * -ox + nrm.z * -oz < 0) tri = [tri[0], tri[2], tri[1]];
      for (const p of tri) {
        pos.push(...toScene(p.x, p.y, p.z, space));
        const along = (p.x - e.a[0]) * dir[0] + (p.z - e.a[1]) * dir[1];
        uv.push(along / uw, (p.y - from) / uh);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    // ten sam rodzaj materiału co ściany — kolor płytki wygląda tak samo jak ściana w tym kolorze
    const material = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: WALL_GLOW, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    group.userData.disposables.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.wall = e.tag; // prawy klik — menu tej ściany
    group.add(mesh);
  }
}

// Powierzchnie rysujemy tylko od wewnątrz (BackSide): ściana między kamerą a wnętrzem
// jest niewidoczna, więc nic nie zasłania widoku, a ściany mogą być nieprzezroczyste.
// Ściany jaśniejsze niż sam materiał w świetle sceny: przy tym oświetleniu biały materiał wychodzi szary (ok. 30–45%
// jasności), więc ściany (i występy, okap, płytki) dostają stałą „poświatę” we własnym kolorze — biała ściana jest
// prawie biała, a ściany dalej różnią się lekko odcieniem (światło kierunkowe), więc narożniki są widoczne.
// Meble zostają w zwykłym świetle.
const WALL_GLOW = 0.72; // biała ściana — biała także z boku i na suficie (najsłabiej oświetlone)
const wallGlow = (color) => ({ emissive: new THREE.Color(color), emissiveIntensity: WALL_GLOW });

function surfaceMaterial(group, color, glow = true) {
  const material = new THREE.MeshLambertMaterial({
    color,
    ...(glow ? wallGlow(color) : {}),
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

// Kółka wymiarów występu ściany (kominka) i okapu — jak przy korpusie. userData.obstacleResize = { id, face }.
const OBSTACLE_DISC = new THREE.CylinderGeometry(38 * MM, 38 * MM, 10 * MM, 24);
const obstacleDiscMaterial = new THREE.MeshBasicMaterial({ color: 0x7c3aed, depthTest: false, transparent: true, opacity: 0.85 });
function addObstacleResizeHandles(group, o, space) {
  const midX = o.x + o.width / 2;
  const midY = o.y + o.height / 2;
  const midZ = o.z + o.depth / 2;
  const hood = o.kind === 'hood';
  const faces = [
    ['left', [o.x - 30, midY, midZ], [1, 0, 0]],
    ['right', [o.x + o.width + 30, midY, midZ], [1, 0, 0]],
    ['front', [midX, hood ? o.y + Math.min(150, o.height / 3) : o.y + Math.min(300, o.height / 4), o.z + o.depth + 30], [0, 0, 1]],
    ['back', [midX, hood ? o.y + Math.min(150, o.height / 3) : o.y + Math.min(300, o.height / 4), o.z - 30], [0, 0, 1]], // tył (przód zostaje)
    // okap opuszcza się od sufitu — jego wysokość zmienia dolna krawędź; występ ściany — górna
    hood ? ['bottom', [midX, o.y - 30, midZ], [0, 1, 0]] : ['top', [midX, o.y + o.height + 30, midZ], [0, 1, 0]],
  ];
  for (const [face, [x, y, z], axis] of faces) {
    const mesh = new THREE.Mesh(OBSTACLE_DISC, obstacleDiscMaterial);
    mesh.position.set(...toScene(x, y, z, space));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis));
    mesh.renderOrder = 10;
    mesh.userData.obstacleResize = { id: o.id, face };
    mesh.userData.noDispose = true;
    group.add(mesh);
  }
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
