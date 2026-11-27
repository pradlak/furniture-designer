import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { getSettings } from '../state/settings.js';
import {
  snapCabinet,
  obstacleNeighbour,
  extendObstacle,
  slideObstacle,
  snapObstacleEdge,
  obstacleEdgeTarget,
  obstacleWithoutCollisions,
  slideTarget,
  slideCabinets,
  extendCabinet,
  duplicateCabinet,
} from '../model/placement.js';
import { cabinetPanels, legHeight, shelfKey, setShelfY, handleOffsetsFor, fitCabinetToSpace, removeShelves, cabinetBounds, maxCabinetHeight, CABINET_LIMITS, frontParts } from '../model/furniture.js';
import { moveHinge, moveFrontBoundary, movePart, coverWithDoor, uncoverPart, canUncover, setPartKind, fillFreeSpace, freeSpaceOf, fitLabel, canDoorGrow, doorFullHeight } from '../model/frontEdit.js';
import { createContextMenu } from '../ui/contextMenu.js';
import { duplicateSelected } from '../state/duplicate.js';
import { downloadBoardCutList, downloadBoardDrawing, downloadTrimCutList, downloadTrimDrawing } from '../ui/boardExport.js';
import { mergeCandidate, mergeParts, removableCount, removeParts } from '../model/mergeParts.js';
import { selectedCabinetIds, toggleCabinet } from '../state/selection.js';
import { COLOR_PRESETS, cabinetMaterials, trimMaterial } from '../model/materials.js';
import { WALL_DECORS, HOOD_DECORS, OUTLINE_PRESETS, applyOutlinePreset } from '../model/space.js';
import { spaceOutline, outlineEdges, insertPoint, isFrontPoint, cleanOutline, selfIntersects, canRemovePoint, edgeOutward } from '../model/outline.js';
import { updateSpaceRefit, cabinetDropSpot, addCabinetAt } from '../model/layout.js';
import { moveWall, wallMoveLabel, wallSnapTargets } from '../model/walls.js';
import { resolveHoles, HOLE_FILLS } from '../model/boardFeatures.js';
import { boardBox, boardMaterial, BOARD_LIMITS, boardSpotAt, createBoard, NEW_BOARD_SIZE, boardNeighbour, boardStep, nudgeBoard, fitBoardWidth, boardNicheWidth, BOARD_MOUNTS, mountInfo, MOUNT_MACHINING, normalizeMount } from '../model/boards.js';
import { trimBox } from '../model/trims.js';
import { resizeCabinets } from '../model/groupResize.js';
import { decorType, centerDecoration } from '../model/decorations.js';
import { tileTargets } from '../model/tileTargets.js';
import { wallFinishOf, setWallFinish, wallLabel, tilesEstimate, TILE_DEFAULTS, TILE_LAYOUTS, TILE_LIMITS } from '../model/wallFinish.js';
import { FRONT_DECORS, decorPreviewSvg } from '../model/decor.js';
import { panelInfoMenu } from '../ui/panelInfo.js';
import { t, isEnglish } from '../i18n.js';

const CLICK_TOLERANCE_PX = 4;

// Obsługa myszy w widoku 3D:
//  - klik w korpus zaznacza go, klik w puste miejsce odznacza; kolejny klik w zaznaczony korpus zaznacza
//    samą klikniętą płytę (bok, wieniec, półkę…) — z jej wymiarami, a prawy klik pokazuje jej obrzeże;
//    klik w zaznaczoną płytę wraca do całego korpusu,
//  - przeciąganie korpusu przesuwa go po podłodze (X/Z),
//    z Shift — w pionie (Y), z Alt — bez przyciągania do ścian i innych mebli,
//  - przeciąganie półki w górę / w dół zmienia jej wysokość w korpusie,
//  - przeciągnięcie frontu otwiera go albo zamyka (płynnie); klik w front — zaznacza sam front,
//    Ctrl + klik — zaznaczanie kilku frontów, prawy klik w front — menu akcji dla zaznaczonych
//    (otwórz / zamknij, ukryj),
//    a korpus z frontem przesuwa się z Shift (w pionie) albo chwytając za inną płytę,
//  - kształt ścian (zakładka „Przestrzeń”): niebieskie kulki to punkty obrysu podłogi — przeciąganie zmienia kształt
//    ścian (skośne, wklęsłe); zielone kulki na środkach ścian — przeciągnięcie wstawia nowy punkt; prawy klik
//    w punkt — „Usuń punkt”, w ścianę lub podłogę — „Dodaj punkt tutaj” i gotowe kształty,
//  - przeciąganie poza korpusem obraca widok jak dotąd.
// hooks.showSpace() — pokazuje zakładkę „Przestrzeń” (z uchwytami kształtu ścian).
export function attachCabinetInteraction(viewer, store, ui, hooks = {}) {
  const el = viewer.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  let down = null;

  // --- przyciąganie przesuwanego korpusu („magnes”, model/placement.js → snapCabinet) ---
  // Zasięg przyciągania to SNAP_PX pikseli na ekranie przeliczone na mm w miejscu chwytu — przy oddalonym widoku
  // magnes sięga dalej, przy przybliżonym bliżej (zawsze tak samo „czuć” go pod myszką).
  const SNAP_PX = 16;
  const WALL_SNAP_FACTOR = 1.6; // przesuwana ściana — magnes mocniejszy niż przy korpusach
  const WALL_SNAP_HOLD = 1.8;
  function snapThresholdMm(point) {
    const cam = viewer.camera;
    const r = el.getBoundingClientRect();
    const a = point.clone().project(cam);
    const b = new THREE.Vector3(a.x + (2 * SNAP_PX) / r.width, a.y, a.z).unproject(cam);
    const mm = b.distanceTo(point) / MM;
    return Math.min(250, Math.max(20, mm));
  }
  // Podpowiedź przy kursorze: do czego korpus jest przyciągnięty.
  const snapTip = document.createElement('div');
  snapTip.className = 'snap-tip';
  snapTip.hidden = true;
  viewer.container.appendChild(snapTip);
  function showSnapTip(snaps, e) {
    const labels = [...new Set(Object.values(snaps).map((sn) => sn.label))];
    if (!labels.length) {
      snapTip.hidden = true;
      return;
    }
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = '🧲 ' + labels.join(' · ');
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // --- kształt ścian (obrys podłogi, model/outline.js) ---
  const updateSpace = (fn) => store.set((p) => updateSpaceRefit(p, fn));
  const setOutline = (outline) => updateSpace((s) => ({ ...s, outline }));

  // Uchwyt kształtu ściany pod kursorem (rysowane na wierzchu, więc sprawdzane przed wszystkim innym).
  function pickWallHandle() {
    if (!viewer.spaceGroup) return null;
    const handles = [];
    viewer.spaceGroup.traverse((o) => o.userData.wallHandle && handles.push(o));
    const hit = handles.length ? raycaster.intersectObjects(handles, false)[0] : null;
    return hit ? { ...hit.object.userData.wallHandle, point: hit.point.clone() } : null;
  }

  // Ściana / podłoga pod kursorem (pierwsze trafienie — nie zasłonięte meblem):
  // { tag (left, back, floor, edge:<i>…), x, z } — punkt trafienia w mm.
  function pickSurface() {
    if (!viewer.spaceGroup) return null;
    const hit = raycaster.intersectObjects(viewer.spaceGroup.children, true).find((h) => h.object.isMesh && !h.object.userData.wallHandle);
    const tag = hit?.object.userData.wall;
    if (!tag) return null;
    return { tag, x: hit.point.x / MM, z: hit.point.z / MM + store.get().space.depth };
  }

  // Początek przeciągania uchwytu: punkt obrysu albo środek ściany (wstawia tam nowy punkt i przeciąga go).
  function startWallHandle(h) {
    const { space } = store.get();
    const before = space.outline;
    let index = h.index;
    if (h.type === 'mid') {
      const ins = insertPoint(space, h.edge);
      setOutline(ins.outline);
      index = ins.index;
    }
    const p = spaceOutline(store.get().space)[index];
    return { index, before, front: !!p && isFrontPoint(p, store.get().space), moved: h.type === 'mid' };
  }

  // Przeciąganie punktu po podłodze: przyciąganie co 10 mm, do ścian prostokąta i do X / Z sąsiednich punktów
  // (kąty proste); bez przyciągania z Alt. Punkt na przodzie przesuwa się tylko wzdłuż przodu.
  const HANDLE_SNAP_MM = 40;
  function dragOutlinePoint(pt, altKey) {
    const { space } = store.get();
    const pts = spaceOutline(space).map((p) => [...p]);
    const { index: i, front } = drag.wallHandle;
    if (!pts[i]) return;
    const n = pts.length;
    const nb = [pts[(i - 1 + n) % n], pts[(i + 1) % n]];
    let x = pt.x / MM;
    let z = pt.z / MM + space.depth;
    if (!altKey) {
      const snap = (val, targets) =>
        targets.reduce((best, t) => (Math.abs(val - t) < HANDLE_SNAP_MM && Math.abs(val - t) < Math.abs(val - best) ? t : best), Math.round(val / 10) * 10);
      x = snap(x, [0, space.width, ...nb.map((p) => p[0])]);
      z = snap(z, [0, ...nb.map((p) => p[1]).filter((v) => v < space.depth)]);
    }
    x = Math.round(Math.min(space.width, Math.max(0, x)));
    z = front ? space.depth : Math.round(Math.min(space.depth - 1, Math.max(0, z)));
    if (pts[i][0] === x && pts[i][1] === z) return;
    pts[i] = [x, z];
    drag.wallHandle.moved = true;
    setOutline(pts);
  }

  // Koniec przeciągania: kształt przecinający sam siebie wraca do stanu sprzed przeciągania; punkty zbędne
  // (na prostej między sąsiadami, pokrywające się) znikają; prostokąt — bez obrysu.
  function endWallHandle() {
    const { space } = store.get();
    if (!space.outline) return;
    const next = selfIntersects(space.outline) ? drag.wallHandle.before : cleanOutline(space.outline, space);
    if (JSON.stringify(next) !== JSON.stringify(space.outline)) setOutline(next);
  }

  // --- przesuwanie całych ścian (fioletowe krążki; model/walls.js) ---
  // Ściany pionowe przesuwamy po poziomej płaszczyźnie na wysokości krążka, sufit — po pionowej zwróconej do kamery.
  // Przesunięcie liczymy zawsze od stanu z początku przeciągania (bez narastania błędów zaokrągleń).
  // Lewa ściana jest początkiem układu (x = 0) — gdy się przesuwa, cała scena przesuwa się w modelu, więc kamerę
  // przesuwamy razem z nią, żeby pokój i meble stały w miejscu, a ruszała się tylko ściana.
  function startWallMove(h) {
    let plane;
    if (h.wall === 'ceiling') {
      const dir = new THREE.Vector3();
      viewer.camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.normalize(), h.point);
    } else plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h.point.y);
    return { wallMove: { wall: h.wall, normal: h.normal, start: h.point, base: store.get(), shift: 0 }, plane };
  }
  function dragWallMove(pt, e) {
    const m = drag.wallMove;
    let d;
    if (m.wall === 'ceiling') d = (pt.y - m.start.y) / MM;
    else {
      const dx = (pt.x - m.start.x) / MM - m.shift; // bez przesunięcia kamery (lewa ściana)
      const dz = (pt.z - m.start.z) / MM;
      d = dx * m.normal[0] + dz * m.normal[1];
    }
    // Magnes: ściana przyciąga się do korpusów (dotyka ich) — mocniej niż korpus do ściany (WALL_SNAP_FACTOR × zasięg)
    // i trzyma, dopóki nie odciągniesz jej dalej niż HOLD × zasięg. Alt — bez przyciągania.
    let snapLabel = null;
    if (!e.altKey) {
      const reach = snapThresholdMm(m.start) * WALL_SNAP_FACTOR;
      m.targets ??= wallSnapTargets(m.base, m.wall);
      let hit = m.held && Math.abs(d - m.held.d) < reach * WALL_SNAP_HOLD ? m.held : null;
      if (!hit) {
        for (const t of m.targets) if (Math.abs(d - t.d) < reach && (!hit || Math.abs(d - t.d) < Math.abs(d - hit.d))) hit = t;
      }
      m.held = hit;
      if (hit) {
        d = Math.round(hit.d);
        snapLabel = hit.label;
      } else d = Math.round(d / 10) * 10;
    } else m.held = null;
    const next = moveWall(m.base, m.wall, d);
    store.set(() => next);
    if (m.wall === 'left') {
      const applied = next.space.width - m.base.space.width;
      const delta = (applied - m.shift) * MM;
      viewer.camera.position.x += delta;
      viewer.controls.target.x += delta;
      m.shift = applied;
    }
    el.style.cursor = m.wall === 'ceiling' ? 'ns-resize' : 'ew-resize';
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = wallMoveLabel(next.space, m.wall) + (snapLabel ? ` · 🧲 ${t('dosunięta do {what}', { what: snapLabel })}` : '');
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // --- wymiary występu ściany (kominka) i okapu kółkami: boki — szerokość, przód — głębokość, góra / dół — wysokość ---
  function pickObstacleResize() {
    if (!viewer.spaceGroup) return null;
    const handles = [];
    viewer.spaceGroup.traverse((o) => o.userData.obstacleResize && handles.push(o));
    const hit = handles.length ? raycaster.intersectObjects(handles, false)[0] : null;
    return hit ? { ...hit.object.userData.obstacleResize, point: hit.point.clone() } : null;
  }
  function startObstacleResize(h) {
    const o = store.get().space.obstacles.find((x) => x.id === h.id);
    let plane;
    if (h.face === 'top' || h.face === 'bottom') {
      const dir = new THREE.Vector3();
      viewer.camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.normalize(), h.point);
    } else plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h.point.y);
    return { obstacleResize: { ...h, base: { ...o }, start: h.point, held: null }, plane };
  }
  // Krawędź przyciąga się (jak przy korpusie) do ścian, krawędzi mebli i innych przeszkód; Alt — bez przyciągania.
  const OBSTACLE_LABEL = { left: t('Szerokość'), right: t('Szerokość'), front: t('Głębokość'), back: t('Głębokość'), top: t('Wysokość'), bottom: t('Wysokość (od sufitu)') };
  function dragObstacleResize(pt, e) {
    const m = drag.obstacleResize;
    const project = store.get();
    const { space } = project;
    const o0 = m.base;
    const boxes = [
      ...project.furniture.map((c) => ({ box: cabinetBounds(c, project), label: t('korpusu „{name}”', { name: c.name }) })),
      ...space.obstacles.filter((x) => x.id !== o0.id).map((x) => ({ box: x, label: t('„{name}”', { name: x.name || t('przeszkody') }) })),
      ...(project.boards ?? []).map((x) => ({ box: boardBox(x, project), label: t('„{name}”', { name: x.name }) })),
    ];
    let edge;
    let targets;
    if (m.face === 'left' || m.face === 'right') {
      const dx = (pt.x - m.start.x) / MM;
      edge = m.face === 'right' ? o0.x + o0.width + dx : o0.x + dx;
      targets = [
        { v: m.face === 'right' ? space.width : 0, label: m.face === 'right' ? t('prawej ściany') : t('lewej ściany') },
        ...boxes.flatMap(({ box, label }) => [{ v: box.x, label }, { v: box.x + box.width, label }]),
      ];
    } else if (m.face === 'back') {
      edge = o0.z + (pt.z - m.start.z) / MM;
      targets = [{ v: 0, label: t('tylnej ściany') }, ...boxes.map(({ box, label }) => ({ v: box.z + box.depth, label: t('przodu {what}', { what: label }) }))];
    } else if (m.face === 'front') {
      edge = o0.z + o0.depth + (pt.z - m.start.z) / MM;
      targets = [{ v: space.depth, label: t('przodu przestrzeni') }, ...boxes.map(({ box, label }) => ({ v: box.z + box.depth, label: t('wyrównany z {what}', { what: label }) }))];
    } else {
      const dy = (pt.y - m.start.y) / MM;
      edge = m.face === 'top' ? o0.y + o0.height + dy : o0.y + dy;
      targets = m.face === 'top' ? [{ v: space.height, label: t('sufitu') }] : boxes.map(({ box, label }) => ({ v: box.y + box.height, label: t('wierzchu {what}', { what: label }) }));
    }
    let label = null;
    if (!e.altKey) {
      const reach = snapThresholdMm(m.start) * WALL_SNAP_FACTOR;
      let hit = m.held && Math.abs(edge - m.held.v) < reach * WALL_SNAP_HOLD ? m.held : null;
      if (!hit) for (const t of targets) if (Math.abs(edge - t.v) < reach && (!hit || Math.abs(edge - t.v) < Math.abs(edge - hit.v))) hit = t;
      m.held = hit;
      if (hit) {
        edge = hit.v;
        label = hit.label;
      } else edge = Math.round(edge / 10) * 10;
    } else m.held = null;
    edge = Math.round(edge);
    const MIN = 10;
    let patch;
    if (m.face === 'left') {
      const right = o0.x + o0.width;
      const x = Math.min(right - MIN, Math.max(0, edge));
      patch = { x, width: right - x };
    } else if (m.face === 'right') patch = { width: Math.max(MIN, Math.min(space.width, edge) - o0.x) };
    else if (m.face === 'front') patch = { depth: Math.max(MIN, Math.min(space.depth, edge) - o0.z) };
    else if (m.face === 'back') {
      const front = o0.z + o0.depth;
      const z = Math.min(front - MIN, Math.max(0, edge));
      patch = { z, depth: front - z };
    }
    else if (m.face === 'top') patch = { height: Math.max(MIN, Math.min(space.height, edge) - o0.y) };
    else patch = { height: Math.max(MIN, Math.min(space.height - MIN, space.height - Math.max(0, edge))) }; // okap: od sufitu do dolnej krawędzi
    store.set((p) => updateSpaceRefit(p, (s) => ({ ...s, obstacles: s.obstacles.map((x) => (x.id === o0.id ? { ...x, ...patch } : x)) })));
    const now = store.get().space.obstacles.find((x) => x.id === o0.id);
    const value = m.face === 'front' || m.face === 'back' ? now.depth : m.face === 'left' || m.face === 'right' ? now.width : now.height;
    el.style.cursor = m.face === 'top' || m.face === 'bottom' ? 'ns-resize' : 'ew-resize';
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = `${OBSTACLE_LABEL[m.face]} ${value} mm` + (label ? ` · 🧲 ${label}` : '');
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // --- przesuwanie samodzielnej płyty (półki, blatu) w widoku 3D ---
  // Po podłodze (X / Z), z Shift — w pionie (Y). Krawędzie przyciągają się (magnes z trzymaniem) do ścian, sufitu,
  // podłogi oraz krawędzi pobliskich mebli, przeszkód (np. okapu) i innych płyt — np. półka obok okapu dochodzi do
  // jego boku, a na wysokości szafki staje równo z jej wierzchem. Alt — bez przyciągania (co 1 mm).
  function pickBoardLift() {
    if (!viewer.furnitureGroup) return null;
    const handles = [];
    viewer.furnitureGroup.traverse((o) => o.userData.boardLift && handles.push(o));
    const hit = handles.length ? raycaster.intersectObjects(handles, false)[0] : null;
    return hit ? { ...hit.object.userData.boardLift, point: hit.point.clone() } : null;
  }
  // Dekoracja przeciągana nad powierzchnią: na ścianę (kinkiet, okno, obraz) — przyklejona do ściany pod kursorem
  // i obrócona przodem do pokoju (lewa / prawa / tylna / skośna); na podłogę / mebel (lampa, kwiatek, książki, dywan) —
  // na wierzchu powierzchni pod kursorem (podłoga, korpus, blat, półka, przeszkoda); lampa wisząca — pod sufitem.
  // → { pos: { x, y, z, rotation? }, label } albo null (nic pod kursorem)
  function decorSurfaceSnap(id) {
    const project = store.get();
    const d = (project.decorations ?? []).find((x) => x.id === id);
    if (!d) return null;
    const dt = decorType(d.type);
    const { space } = project;
    const own = (o) => {
      for (let p = o; p; p = p.parent) if (p.userData?.decorId === id) return true;
      return false;
    };
    const hits = raycaster
      .intersectObjects([viewer.furnitureGroup, viewer.spaceGroup].filter(Boolean), true)
      .filter((h) => h.object.isMesh && h.object.material?.visible !== false && !h.object.userData.wallHandle && !h.object.userData.obstacleResize && !own(h.object));
    const mm = (v) => Math.round(v);
    const P = (h) => ({ x: h.point.x / MM, y: h.point.y / MM, z: h.point.z / MM + space.depth });
    if (dt.place === 'wall') {
      const h = hits.find((x) => x.object.userData.wall && !['floor', 'ceiling', 'slope'].includes(x.object.userData.wall));
      if (!h) return null;
      const tag = h.object.userData.wall;
      const p = P(h);
      // kierunek do wnętrza (normalna ściany do pokoju) → obrót dekoracji
      let n;
      if (tag === 'back') n = [0, 1];
      else if (tag === 'left') n = [1, 0];
      else if (tag === 'right') n = [-1, 0];
      else {
        const e = outlineEdges(space).find((x) => x.tag === tag);
        const out = e ? edgeOutward(e, spaceOutline(space)) : [0, -1];
        n = [-out[0], -out[1]];
      }
      const rotation = mm((-Math.atan2(n[0], n[1]) * 180) / Math.PI);
      const names = { back: t('tylnej ściany'), left: t('lewej ściany'), right: t('prawej ściany') };
      return { pos: { x: mm(p.x), y: mm(Math.max(0, p.y - d.height / 2)), z: mm(p.z), rotation }, label: t('do {what}', { what: names[tag] ?? t('ściany') }) };
    }
    if (dt.place === 'ceiling') {
      const h = hits[0];
      if (!h) return null;
      const p = P(h);
      return { pos: { x: mm(p.x), y: mm(space.height - d.height), z: mm(Math.min(space.depth, Math.max(0, p.z))) }, label: t('pod sufitem') };
    }
    // podłoga / mebel: pierwsza powierzchnia „od góry” (normalna w górę) albo podłoga
    for (const h of hits) {
      const tag = h.object.userData.wall;
      const up = h.face && new THREE.Vector3().copy(h.face.normal).transformDirection(h.object.matrixWorld).y > 0.7;
      if (tag === 'floor' || (!tag && up)) {
        const p = P(h);
        let label = t('na podłodze');
        if (tag !== 'floor') {
          let o = h.object;
          while (o && !o.userData.cabinetId && !o.userData.trimId && !o.userData.boardId && !o.userData.obstacleId) o = o.parent;
          label = o?.userData.cabinetId ? t('na korpusie') : o?.userData.trimId ? t('na blacie') : o?.userData.boardId ? t('na półce / blacie') : t('na powierzchni');
        }
        return { pos: { x: mm(p.x), y: mm(tag === 'floor' ? 0 : p.y), z: mm(p.z) }, label };
      }
    }
    return null;
  }

  function dragBoard(pt, e) {
    const m = drag.boardMove;
    const project = store.get();
    const { space } = project;
    const b0 = project.boards.find((x) => x.id === m.id);
    if (!b0) return;
    if (!m.lift && e.shiftKey !== m.vertical) {
      // Shift wciśnięty / puszczony w trakcie — ruch od bieżącego położenia w nowej płaszczyźnie
      drag.plane = dragPlane(pt, e.shiftKey);
      m.start = pt.clone();
      m.from = { x: b0.x, y: b0.y, z: b0.z };
      m.vertical = e.shiftKey;
      m.held = {};
    }
    const box = boardBox({ ...b0, ...m.from }, project);
    const d = pt.clone().sub(m.start).divideScalar(MM);
    const axes = m.vertical ? ['y'] : ['x', 'z'];
    const pos = { ...m.from };
    for (const a of axes) pos[a] = m.from[a] + d[a];
    const DIM = { x: 'width', y: 'height', z: 'depth' };
    const others = [
      ...project.furniture.map((c) => ({ box: cabinetBounds(c, project), label: t('korpusu „{name}”', { name: c.name }) })),
      ...space.obstacles.map((o) => ({ box: o, label: t('„{name}”', { name: o.name || t('przeszkody') }) })),
      ...project.boards.filter((x) => x.id !== m.id).map((x) => ({ box: boardBox(x, project), label: t('„{name}”', { name: x.name }) })),
    ];
    const reach = snapThresholdMm(m.start) * WALL_SNAP_FACTOR;
    const labels = [];
    for (const a of axes) {
      const size = box[DIM[a]];
      const walls = { x: [[0, t('lewej ściany')], [space.width, t('prawej ściany')]], y: [[0, t('podłogi')], [space.height, t('sufitu')]], z: [[0, t('tylnej ściany')], [space.depth, t('przodu przestrzeni')]] }[a];
      // cele: { v — położenie krawędzi, edge: 'lo' | 'hi' }
      const targets = [
        ...walls.map(([v, label]) => ({ v, label, edge: v === 0 ? 'lo' : 'hi' })),
        ...others
          .filter(({ box: o }) => ['x', 'y', 'z'].filter((k) => k !== a).every((k) => o[k] < pos[k] + box[DIM[k]] + 400 && o[k] + o[DIM[k]] > pos[k] - 400))
          .flatMap(({ box: o, label }) => [
            { v: o[a] + o[DIM[a]], label, edge: 'lo' }, // dosunięcie / postawienie na wierzchu
            { v: o[a], label, edge: 'hi' },
            { v: o[a], label: t('wyrównana z {what}', { what: label }), edge: 'lo' },
            { v: o[a] + o[DIM[a]], label: t('wyrównana z {what}', { what: label }), edge: 'hi' },
          ]),
      ];
      let v = pos[a];
      if (!e.altKey) {
        const edgeOf = (t, at) => (t.edge === 'lo' ? at : at + size);
        const held = m.held[a];
        let hit = held && Math.abs(edgeOf(held, v) - held.v) < reach * WALL_SNAP_HOLD ? held : null;
        if (!hit) for (const t of targets) if (Math.abs(edgeOf(t, v) - t.v) < reach && (!hit || Math.abs(edgeOf(t, v) - t.v) < Math.abs(edgeOf(hit, v) - hit.v))) hit = t;
        m.held[a] = hit;
        if (hit) {
          v = hit.edge === 'lo' ? hit.v : hit.v - size;
          labels.push(hit.label);
        } else v = Math.round(v / 10) * 10;
      }
      pos[a] = Math.round(v);
    }
    store.set((p) => ({ ...p, boards: p.boards.map((x) => (x.id === m.id ? { ...x, ...pos } : x)) }));
    el.style.cursor = 'grabbing';
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = m.vertical ? t('Od podłogi {v} mm', { v: pos.y }) : t('Od lewej {x} mm · od tyłu {z} mm', { x: pos.x, z: pos.z });
    if (labels.length) snapTip.textContent += ` · 🧲 ${[...new Set(labels)].join(' · ')}`;
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // --- granice frontów: wysokości szuflad i sekcji frontu (model: moveFrontBoundary) ---
  function pickFrontBoundary() {
    if (!viewer.furnitureGroup) return null;
    const handles = [];
    viewer.furnitureGroup.traverse((o) => o.userData.frontBoundary && handles.push(o));
    const hit = handles.length ? raycaster.intersectObjects(handles, false)[0] : null;
    return hit ? { ...hit.object.userData.frontBoundary, point: hit.point.clone() } : null;
  }
  function startFrontBoundary(h) {
    const project = store.get();
    const dir = new THREE.Vector3();
    viewer.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.normalize(), h.point);
    return { boundary: { ...h, project, base: project.furniture.find((c) => c.id === h.cabinetId), start: h.point }, plane };
  }
  // Przeciąganie granicy w pionie — co 10 mm (z Alt co 1 mm); wysokości liczone od stanu z początku przeciągania.
  function dragFrontBoundary(pt, e) {
    const m = drag.boundary;
    let d = (pt.y - m.start.y) / MM;
    d = e.altKey ? Math.round(d) : Math.round(d / 10) * 10;
    const res = moveFrontBoundary(m.base, m.project, m, d);
    if (!res) return;
    store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === m.cabinetId ? res.cabinet : c)) }));
    el.style.cursor = 'ns-resize';
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent =
      m.kind === 'drawerMove' ? `Szuflada od dołu: ${res.a} mm` : m.kind === 'drawerSize' ? `Szuflada ${res.a} mm` : `Niżej ${res.a} mm · wyżej ${res.b} mm`;
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // --- zmiana wymiarów korpusu kółkami (bok — szerokość, wierzch — wysokość, przód — głębokość) ---
  function pickResizeHandle() {
    if (!viewer.furnitureGroup) return null;
    const handles = [];
    viewer.furnitureGroup.traverse((o) => o.userData.cabinetResize && handles.push(o));
    const hit = handles.length ? raycaster.intersectObjects(handles, false)[0] : null;
    return hit ? { ...hit.object.userData.cabinetResize, point: hit.point.clone() } : null;
  }
  const FACE_LABEL = { left: t('Szerokość'), right: t('Szerokość'), top: t('Wysokość'), front: t('Głębokość') };
  function startCabinetResize(h) {
    const cabinet = store.get().furniture.find((c) => c.id === h.cabinetId);
    let plane;
    if (h.face === 'top') {
      const dir = new THREE.Vector3();
      viewer.camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.normalize(), h.point);
    } else plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h.point.y);
    // kilka zaznaczonych korpusów (w tym ten) — ten sam wymiar zmienia się we wszystkich (bez lewej krawędzi —
    // przesuwałaby korpus)
    const ids = selectedCabinetIds(ui.get());
    const group = ids.size > 1 && ids.has(cabinet.id) && h.face !== 'left' ? [...ids] : null;
    return { resize: { ...h, base: { ...cabinet }, start: h.point, held: null, group, baseProject: store.get() }, plane };
  }
  // Krawędź korpusu przyciąga się (mocniej, z trzymaniem — jak ściany) do ścian, krawędzi sąsiednich mebli
  // i przeszkód, a wierzch — do sufitu / skosu i wierzchów sąsiadów. Alt — bez przyciągania (co 1 mm).
  function dragCabinetResize(pt, e) {
    const m = drag.resize;
    const project = m.group ? m.baseProject : store.get(); // (grupa — cele przyciągania ze stanu sprzed przeciągania)
    const c0 = m.base;
    const others = [
      ...project.furniture.filter((c) => c.id !== c0.id && !m.group?.includes(c.id)).map((c) => ({ box: cabinetBounds(c, project), label: t('korpusu „{name}”', { name: c.name }) })),
      ...project.space.obstacles.map((o) => ({ box: o, label: t('„{name}”', { name: o.name || t('przeszkody') }) })),
    ];
    const DIMS = { x: 'width', y: 'height', z: 'depth' };
    const near = (box, axes) =>
      axes.every((a) => {
        const lo = c0[a];
        const hi = lo + (a === 'y' ? legHeight(c0) + c0.height : c0[DIMS[a]]);
        return box[a] < hi + 400 && box[a] + box[DIMS[a]] > lo - 400;
      });
    const L0 = legHeight(c0);
    let edge; // położenie przeciąganej krawędzi (mm)
    let targets = [];
    if (m.face === 'top') {
      edge = c0.y + L0 + c0.height + (pt.y - m.start.y) / MM;
      const ceiling = c0.y + L0 + maxCabinetHeight(c0, project);
      targets = [
        { v: ceiling, label: t('sufitu') },
        ...others.filter((o) => near(o.box, ['x', 'z'])).map((o) => ({ v: o.box.y + o.box.height, label: t('wyrównany z {what}', { what: o.label }) })),
      ];
    } else if (m.face === 'front') {
      edge = c0.z + c0.depth + (pt.z - m.start.z) / MM;
      targets = [
        { v: project.space.depth, label: t('przodu przestrzeni') },
        ...others.filter((o) => near(o.box, ['x', 'y'])).map((o) => ({ v: o.box.z + o.box.depth, label: t('wyrównany z {what}', { what: o.label }) })),
      ];
    } else {
      const dx = (pt.x - m.start.x) / MM;
      edge = m.face === 'right' ? c0.x + c0.width + dx : c0.x + dx;
      const nb = others.filter((o) => near(o.box, ['y', 'z']));
      targets =
        m.face === 'right'
          ? [{ v: project.space.width, label: t('prawej ściany') }, ...nb.map((o) => ({ v: o.box.x, label: o.label }))]
          : [{ v: 0, label: t('lewej ściany') }, ...nb.map((o) => ({ v: o.box.x + o.box.width, label: o.label }))];
    }
    let label = null;
    if (!e.altKey) {
      const reach = snapThresholdMm(m.start) * WALL_SNAP_FACTOR;
      let hit = m.held && Math.abs(edge - m.held.v) < reach * WALL_SNAP_HOLD ? m.held : null;
      if (!hit) for (const t of targets) if (Math.abs(edge - t.v) < reach && (!hit || Math.abs(edge - t.v) < Math.abs(edge - hit.v))) hit = t;
      m.held = hit;
      if (hit) {
        edge = hit.v;
        label = hit.label;
      }
    } else m.held = null;
    edge = Math.round(edge);
    const min = CABINET_LIMITS.sizeMin;
    let patch;
    if (m.face === 'top') {
      const maxH = Math.floor(maxCabinetHeight(c0, project));
      patch = { height: Math.max(min, Math.min(maxH, edge - c0.y - L0)) };
    } else if (m.face === 'front') patch = { depth: Math.max(min, edge - c0.z) };
    else if (m.face === 'right') patch = { width: Math.max(min, edge - c0.x) };
    else {
      const right = c0.x + c0.width;
      const x = Math.min(right - min, edge);
      patch = { x, width: right - x };
    }
    if (m.group) {
      const dim = Object.keys(patch).find((k) => k !== 'x');
      store.set(resizeCabinets(m.baseProject, m.group, dim, patch[dim]));
    } else store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === c0.id ? { ...c, ...patch } : c)) }));
    const cab = store.get().furniture.find((c) => c.id === c0.id);
    const value = m.face === 'top' ? cab.height : m.face === 'front' ? cab.depth : cab.width;
    el.style.cursor = m.face === 'top' ? 'ns-resize' : 'ew-resize';
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = `${FACE_LABEL[m.face]} ${value} mm` + (m.group ? ` · ${t('{n} korpusy', { n: m.group.length })}` : '') + (label ? ` · 🧲 ${label}` : '');
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }

  // Menu punktu obrysu: usuń punkt, prostokąt.
  function showPointMenu(index, clientX, clientY) {
    const { space } = store.get();
    const p = spaceOutline(space)[index];
    if (!p) return;
    const items = [];
    if (canRemovePoint(space, index)) {
      items.push({
        icon: '✕',
        label: t('Usuń punkt'),
        run: () => {
          const pts = spaceOutline(store.get().space).filter((_, j) => j !== index);
          if (!selfIntersects(pts)) setOutline(cleanOutline(pts, store.get().space));
        },
      });
    } else items.push({ icon: '·', label: t('Tego punktu nie można usunąć (przód przestrzeni)'), run: () => {} });
    if (space.outline) items.push({ icon: '▭', label: t('Przywróć prostokąt (usuń kształt)'), run: () => setOutline(null) });
    menu.show(clientX, clientY, t('Punkt {n} · od lewej {x}, od tyłu {z} mm', { n: index + 1, x: p[0], z: p[1] }), items);
  }

  // Najbliższa krawędź obrysu o danym znaczniku (left / right / back / edge:<i>) do punktu (x, z)
  // i rzut punktu na nią.
  function edgeAt(space, tag, x, z) {
    const near = (e) => {
      const [a, b] = [e.a, e.b];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      return { e, d: Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz), p: [Math.round(a[0] + t * dx), Math.round(a[1] + t * dz)] };
    };
    return outlineEdges(space)
      .filter((e) => !e.open && e.tag === tag)
      .map(near)
      .sort((m, k) => m.d - k.d)[0];
  }

  // Menu ściany / podłogi: dodaj punkt tutaj, gotowe kształty (gdy narożnik jest jeszcze prosty), prostokąt.
  const SURFACE_NAMES = { floor: t('Podłoga'), ceiling: t('Sufit'), left: t('Ściana lewa'), right: t('Ściana prawa'), back: t('Ściana tylna'), slope: t('Skos') };
  const PRESETS_FOR = {
    left: ['leftFront', 'leftBack', 'chamferLeft'],
    right: ['rightFront', 'rightBack', 'chamferRight'],
    back: ['backLeft', 'backRight', 'chamferLeft', 'chamferRight'],
  };
  function showSurfaceMenu({ tag, x, z }, clientX, clientY) {
    const { space } = store.get();
    const items = [];
    const near = (tag === 'left' || tag === 'right' || tag === 'back' || tag.startsWith('edge:')) && edgeAt(space, tag, x, z);
    if (near) {
      items.push({
        icon: '+',
        label: t('Dodaj punkt tutaj (do kształtowania ściany)'),
        run: () => {
          setOutline(insertPoint(store.get().space, near.e.i, near.p).outline);
          hooks.showSpace?.();
        },
      });
    }
    if (tag === 'floor' || PRESETS_FOR[tag]) {
      for (const key of PRESETS_FOR[tag] ?? OUTLINE_PRESETS.map((p) => p.key)) {
        if (!applyOutlinePreset(space, key)) continue;
        const preset = OUTLINE_PRESETS.find((p) => p.key === key);
        items.push({
          icon: '◸',
          label: preset.title,
          run: () => {
            setOutline(applyOutlinePreset(store.get().space, key));
            hooks.showSpace?.();
          },
        });
      }
    }
    if (near) {
      const fin = wallFinishOf(space, tag);
      items.push({ icon: '🎨', label: t('Kolor tej ściany…'), submenu: () => wallColorMenu(tag) });
      items.push({ icon: '▦', label: fin.tiles ? t('Płytki na tej ścianie…') : t('Połóż płytki na tej ścianie…'), submenu: () => tilesMenu(tag) });
    }
    if (space.outline) items.push({ icon: '▭', label: t('Przywróć prostokąt (usuń kształt)'), run: () => setOutline(null) });
    items.push({ icon: '✥', label: t('Kształtuj ściany myszką (punkty na podłodze)…'), run: () => hooks.showSpace?.() });
    items.push({ icon: '⚙', label: t('Ustawienia przestrzeni (wymiary, ściany, skosy, kolory)…'), run: () => hooks.showSpace?.() });
    menu.show(clientX, clientY, tag.startsWith('edge:') ? t('Ściana') : (SURFACE_NAMES[tag] ?? t('Ściana')), items);
  }

  // --- wykończenie ściany: kolor i płytki (model/wallFinish.js) ---
  const setFinish = (tag, patch) => store.set((p) => ({ ...p, space: setWallFinish(p.space, tag, patch) }));
  const swatch = (hex) => `<span class="context-menu-swatch" style="background:${hex}"></span>`;
  // lista kolorów: run(hex) — po wyborze menu wraca do back()
  const colorChoices = (pick, back) => [
    { icon: swatch('#ffffff'), label: t('czysta biel'), run: () => (pick('#ffffff'), back()) },
    ...COLOR_PRESETS.filter((c) => !c.texture).map((c) => ({ icon: swatch(c.hex), label: c.name, run: () => (pick(c.hex), back()) })),
    { icon: '…', label: t('własny kolor'), run: () => pickCustomColor((c) => pick(c.hex)) },
  ];
  function wallColorMenu(tag) {
    const space = store.get().space;
    const cur = wallFinishOf(space, tag).color;
    return {
      title: t('Kolor: {what}', { what: wallLabel(space, tag) }),
      items: [
        { icon: '↺', label: `${t('jak pozostałe ściany')}${cur ? '' : ' ✓'}`, run: () => setFinish(tag, { color: null }) },
        ...colorChoices((hex) => setFinish(tag, { color: hex }), () => null),
      ],
    };
  }
  function tilesMenu(tag) {
    const space = store.get().space;
    const tl = wallFinishOf(space, tag).tiles;
    const title = t('Płytki: {what}', { what: wallLabel(space, tag) });
    const back = () => tilesMenu(tag);
    if (!tl) {
      return {
        title,
        items: [
          { icon: '▦', label: t('Pas nad blatem (90–150 cm od podłogi)'), run: () => (setFinish(tag, { tiles: { ...TILE_DEFAULTS } }), back()) },
          { icon: '▦', label: t('Cała ściana (od podłogi do sufitu)'), run: () => (setFinish(tag, { tiles: { ...TILE_DEFAULTS, from: 0, to: space.height, width: 600, height: 300, layout: 'grid' } }), back()) },
        ],
      };
    }
    const set = (patch) => (setFinish(tag, { tiles: patch }), back());
    const est = tilesEstimate(space, tag);
    const field = (label, key, min, max) => ({ input: true, label, unit: 'mm', value: tl[key], min, max, onChange: (v) => (v == null ? back() : set({ [key]: v })) });
    const area = est ? (isEnglish() ? est.area.toFixed(2) : est.area.toFixed(2).replace('.', ',')) : '';
    return {
      title,
      items: [
        field(t('Od wysokości'), 'from', 0, 20000),
        field(t('Do wysokości'), 'to', 0, 20000),
        ...tileTargets(store.get()).map((q) => ({ icon: q.icon, label: q.label, run: () => set(q.patch) })),
        field(t('Płytka — szerokość'), 'width', TILE_LIMITS.sizeMin, TILE_LIMITS.sizeMax),
        field(t('Płytka — wysokość'), 'height', TILE_LIMITS.sizeMin, TILE_LIMITS.sizeMax),
        field(t('Fuga'), 'grout', 0, TILE_LIMITS.groutMax),
        ...TILE_LAYOUTS.map((l) => ({ icon: l.key === tl.layout ? '✓' : '·', label: l.label, run: () => set({ layout: l.key }) })),
        { icon: swatch(tl.color), label: t('Kolor płytek…'), submenu: () => ({ title: t('Kolor płytek'), items: colorChoices((hex) => setFinish(tag, { tiles: { color: hex } }), back) }) },
        { icon: swatch(tl.groutColor), label: t('Kolor fugi…'), submenu: () => ({ title: t('Kolor fugi'), items: colorChoices((hex) => setFinish(tag, { tiles: { groutColor: hex } }), back) }) },
        ...(est ? [{ info: true, icon: 'ℹ', label: t('ok. {area} m² · ok. {n} płytek (z 10% zapasu)', { area, n: est.count }) }] : []),
        { icon: '✕', label: t('Usuń płytki z tej ściany'), run: () => setFinish(tag, { tiles: null }) },
      ],
    };
  }

  function setRay(e) {
    const r = el.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, viewer.camera);
  }

  // Trafiony korpus i płyta (panelKey, np. „shelf-…” — półkę przeciąga się w pionie).
  function pickCabinet() {
    if (!viewer.furnitureGroup) return null;
    let hits = raycaster.intersectObjects(viewer.furnitureGroup.children, true).filter((h) => h.object.isMesh);
    // uchwyt półki (fioletowy krążek) jest rysowany na wierzchu — ma pierwszeństwo, nawet za zamkniętymi drzwiami
    const shelfHandle = hits.find((h) => h.object.userData.shelfHandle);
    if (shelfHandle) hits = [shelfHandle];
    // zawias drzwi (kółko na licu, rysowane na wierzchu, albo puszka) — też ma pierwszeństwo
    // (puszka — tylko gdy nic jej nie zasłania, np. przy otwartych drzwiach; kółka widać zawsze)
    const hingeHit = hits.find((h, i) => h.object.userData.hinge && (h.object.renderOrder >= 20 || i === 0));
    if (hingeHit) hits = [hingeHit];
    for (const hit of hits) {
      let o = hit.object;
      let panelKey = null;
      const hinge = o.userData.hinge ?? null;
      let slab = null; // płyta z otworami (blat, półka) — do przesuwania otworów
      const handle = !!o.userData.handle; // trafiony uchwyt frontu
      while (o && !o.userData.cabinetId && !o.userData.trimId && !o.userData.boardId && !o.userData.decorId) {
        panelKey ??= o.userData.panelKey ?? null;
        slab ??= o.userData.slab ?? null;
        o = o.parent;
      }
      if (o) slab ??= o.userData.slab ?? null;
      if (o?.userData.decorId) return { decorId: o.userData.decorId, point: hit.point }; // dekoracja (tylko wygląd)
      if (o?.userData.boardId) return { boardId: o.userData.boardId, point: hit.point, slab }; // samodzielny blat / półka
      if (o?.userData.trimId) return { trimId: o.userData.trimId, point: hit.point, slab }; // blenda wspólna / blat
      if (o) return { id: o.userData.cabinetId, panelKey, point: hit.point, handle, hinge };
    }
    return null;
  }

  // Występ ściany (kominek) pod kursorem — tylko gdy nic go nie zasłania (pierwsze trafienie w scenie).
  // → { obstacleId, point, normal, mode: 'left' | 'right' (krawędź — zmiana szerokości) | 'move' }
  const WALL_EDGE_MM = 80;
  function pickWall() {
    if (!viewer.spaceGroup) return null;
    const hit = raycaster.intersectObjects(viewer.spaceGroup.children, true).find((h) => h.object.isMesh);
    const id = hit?.object.userData.obstacleId;
    const o = id && store.get().space.obstacles.find((x) => x.id === id);
    if (!o) return null;
    const normal = hit.face?.normal ?? new THREE.Vector3();
    const x = hit.point.x / MM;
    // bok występu albo pas przy krawędzi frontu / wierzchu — zmiana szerokości; środek — przesuwanie
    const zone = Math.min(WALL_EDGE_MM, o.width * 0.25);
    let mode = 'move';
    if (normal.x < -0.5 || (Math.abs(normal.x) <= 0.5 && x - o.x < zone)) mode = 'left';
    else if (normal.x > 0.5 || (Math.abs(normal.x) <= 0.5 && o.x + o.width - x < zone)) mode = 'right';
    return { obstacleId: id, point: hit.point, mode };
  }

  // Menu występu ściany: rozszerz / przesuń w lewo albo w prawo do najbliższego korpusu lub ściany, ustawienia, usuń.
  function showWallMenu(obstacleId, clientX, clientY) {
    const project = store.get();
    const o = project.space.obstacles.find((x) => x.id === obstacleId);
    if (!o) return;
    const items = [];
    const sides = [
      ['left', t('w lewo'), '⇤', '←'],
      ['right', t('w prawo'), '⇥', '→'],
    ];
    for (const [side, dir, extendIcon] of sides) {
      const n = obstacleNeighbour(project, obstacleId, side);
      if (n?.gap >= 0.5) items.push({ icon: extendIcon, label: t('Rozszerz {dir} do {what} (+{d})', { dir, what: n.label, d: `${Math.round(n.gap)} mm` }), run: () => store.set((p) => extendObstacle(p, obstacleId, side)) });
    }
    for (const [side, dir, , moveIcon] of sides) {
      const n = obstacleNeighbour(project, obstacleId, side);
      if (n?.gap >= 0.5) items.push({ icon: moveIcon, label: t('Przesuń {dir} do {what} ({d})', { dir, what: n.label, d: `${Math.round(n.gap)} mm` }), run: () => store.set((p) => slideObstacle(p, obstacleId, side)) });
    }
    // Kolizja z korpusami — zmniejszenie występu (na górze menu, bo to zwykle o to chodzi)
    const fix = obstacleWithoutCollisions(project, obstacleId);
    if (fix) {
      const who = fix.names.length === 1 ? t('korpusem „{name}”', { name: fix.names[0] }) : t('{n} korpusami', { n: fix.names.length });
      items.unshift({ icon: '⚠', label: t('Zmniejsz, żeby nie kolidował z {who} (−{d} mm)', { who, d: fix.removed }), run: () => store.set((p) => obstacleWithoutCollisions(p, obstacleId)?.project ?? p) });
    }
    if (!items.length) items.push({ icon: '·', label: t('Dotyka z obu stron — nie ma dokąd rozszerzyć'), run: () => {} });
    items.push({
      icon: '🔥',
      label: o.kind === 'hood' ? t('Okap (urządzenie pod zabudową)…') : t('Wygląd (kominek, telewizor)…'),
      submenu: () => ({
        title: t('Wygląd: {what}', { what: o.name || (o.kind === 'hood' ? t('okap') : t('występ ściany')) }),
        items: (o.kind === 'hood' ? HOOD_DECORS : WALL_DECORS).map((d) => ({
          icon: d.key === (o.decor ?? null) ? '✓' : '',
          label: d.label,
          run: () =>
            store.set((p) => ({
              ...p,
              space: { ...p.space, obstacles: p.space.obstacles.map((x) => (x.id === obstacleId ? { ...x, decor: d.key } : x)) },
            })),
        })),
      }),
    });
    // kolor występu / okapu (tylko wygląd)
    const setColor = (color) => store.set((p) => ({ ...p, space: { ...p.space, obstacles: p.space.obstacles.map((x) => (x.id === obstacleId ? { ...x, color } : x)) } }));
    items.push({
      icon: '🎨',
      label: t('Zmień kolor…'),
      submenu: () => ({
        title: t('Kolor: {what}', { what: o.name || t('występ') }),
        items: [
          { icon: '↺', label: t('domyślny (jak ściany)'), run: () => setColor(null) },
          ...COLOR_PRESETS.map((c) => ({ icon: `<span class="context-menu-swatch" style="background:${c.hex}"></span>`, label: c.name, run: () => setColor({ hex: c.hex, name: c.name }) })),
          { icon: '…', label: t('własny kolor'), run: () => pickCustomColor((c) => setColor(c)) },
        ],
      }),
    });
    items.push({ icon: '⚙', label: t('Wymiary i położenie…'), run: () => ui.set({ ...ui.get(), selectedObstacle: obstacleId }, { revealObstacle: true }) });
    items.push({
      icon: '✕',
      label: t('Usuń'),
      run: () => {
        ui.set({ ...ui.get(), selectedObstacle: null });
        store.set((p) => ({ ...p, space: { ...p.space, obstacles: p.space.obstacles.filter((x) => x.id !== obstacleId) } }));
      },
    });
    menu.show(clientX, clientY, `${o.name || t('Występ ściany')} · ${o.width} mm`, items);
  }

  // Menu korpusu (albo grupy zaznaczonej Ctrl + klik): dosuń w lewo / w prawo / do tyłu / w dół do najbliższego
  // korpusu, przeszkody albo ściany; rozszerz w lewo / w prawo (jeden korpus); dopasuj do wnęki, duplikuj, usuń.
  // panelKey — kliknięta płyta korpusu (np. „left” — bok lewy): na górze menu „wymiary i obrzeże” tej płyty.
  function showCabinetMenu(cabinetId, clientX, clientY, panelKey = null, frontId = null) {
    const project = store.get();
    const cabinet = project.furniture.find((c) => c.id === cabinetId);
    if (!cabinet) return;
    const selected = selectedCabinetIds(ui.get());
    const ids = selected.has(cabinetId) && selected.size > 1 ? [...selected] : [cabinetId];
    const many = ids.length > 1;
    const items = [];
    // kliknięty front (szuflada / drzwi) — jego menu jednym kliknięciem
    const fp = frontId && frontPanel(frontId, project);
    if (fp) {
      items.push({
        icon: fp.opening?.drawer ? '▤' : '▯',
        label: t('{name}: menu frontu…', { name: fp.name }),
        run: () => {
          ui.set({ ...ui.get(), selectedId: cabinetId, selectedIds: [cabinetId], selectedFronts: [frontId], selectedBlends: [] }, { reveal: true });
          setTimeout(() => showFrontMenu([frontId], clientX, clientY), 0);
        },
      });
    }
    const panelItem = panelInfoItem(cabinetId, panelKey);
    if (panelItem) items.push(panelItem);
    const shelfItem = !many && removeShelfItem(cabinetId, panelKey);
    if (shelfItem) items.push(shelfItem);
    const mm = (v) => `${Math.round(Math.abs(v))} mm`;
    if (!many) {
      for (const [side, dir, icon] of [['left', t('w lewo'), '⇤'], ['right', t('w prawo'), '⇥']]) {
        const st = slideTarget(project, ids, side === 'left' ? '-x' : '+x');
        if (Math.abs(st?.delta ?? 0) >= 0.5)
          items.push({ icon, label: t('Rozszerz {dir} do {what} (+{d})', { dir, what: st.label, d: mm(st.delta) }), run: () => store.set((p) => extendCabinet(p, cabinetId, side)) });
      }
    }
    const moves = [
      ['-x', t('w lewo'), '←'],
      ['+x', t('w prawo'), '→'],
      ['-z', t('do tyłu'), '↑'],
      ['-y', t('w dół'), '⤓'],
    ];
    for (const [direction, dir, icon] of moves) {
      const st = slideTarget(project, ids, direction);
      if (Math.abs(st?.delta ?? 0) >= 0.5) {
        const vars = { dir, what: st.label, d: mm(st.delta) };
        items.push({ icon, label: many ? t('Dosuń wszystkie {dir} do {what} ({d})', vars) : t('Dosuń {dir} do {what} ({d})', vars), run: () => store.set((p) => slideCabinets(p, ids, direction)) });
      }
    }
    if (items.length === (fp ? 1 : 0) + (panelItem ? 1 : 0) + (shelfItem ? 1 : 0)) items.push({ icon: '·', label: t('Dotyka sąsiadów i ścian — nie ma dokąd dosunąć'), run: () => {} });
    if (!many) {
      items.push({ icon: '📐', label: t('Wymiary (szerokość, wysokość, głębokość, grubość)…'), submenu: () => cabinetDimsMenu(cabinetId) });
      items.push({ icon: '⤢', label: t('Dopasuj do wnęki'), run: () => store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cabinetId ? fitCabinetToSpace(c, p) : c)) })) });
    }
    {
      // kopia korpusu (albo zaznaczonych korpusów) razem z zaznaczonymi blatami / blendami / płytami
      const extra = (ui.get().selectedBlends ?? []).filter((id) => id.startsWith('trim:') || id.startsWith('board:')).length;
      items.push({
        icon: '⧉',
        label: many || extra ? `${t('Duplikuj zaznaczone')} (${ids.length} ${ids.length === 1 ? t('korpus') : t('korpusy')}${extra ? ` + ${extra} ${extra === 1 ? t('blat / płyta') : t('blaty / płyty')}` : ''})` : t('Duplikuj'),
        run: () => duplicateSelected(store, ui, cabinetId),
      });
    }
    items.push({
      icon: '✕',
      label: many ? t('Usuń {n} korpusy', { n: ids.length }) : t('Usuń'),
      run: () => {
        if (many && !confirm(t('Usunąć {n} zaznaczone korpusy?', { n: ids.length }))) return;
        ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [] });
        store.set((p) => ({ ...p, furniture: p.furniture.filter((c) => !ids.includes(c.id)) }));
      },
    });
    const title = many ? t('Zaznaczone korpusy: {n}', { n: ids.length }) : `${cabinet.name} · ${cabinet.width} mm`;
    menu.show(clientX, clientY, title, items);
  }

  // Zaznaczenie jednej płyty korpusu (bok, wieniec, półka, front, blenda boczna): wyróżniona w 3D,
  // z wymiarami (jak zaznaczony front) — korpus zostaje wybrany w panelu.
  function selectPanel(cabinetId, panelKey) {
    const id = `${cabinetId}:${panelKey}`;
    const front = panelKey.startsWith('front-');
    ui.set({
      ...ui.get(),
      selectedId: cabinetId,
      selectedIds: [cabinetId],
      selectedFronts: front ? [id] : [],
      selectedBlends: front ? [] : [id],
      selectedHole: null,
      selectedObstacle: null,
    });
  }

  // Pozycja menu: „Bok lewy — wymiary i obrzeże…” — zaznacza płytę i pokazuje jej wymiary i obrzeże.
  function panelInfoItem(cabinetId, panelKey) {
    if (!panelKey || panelKey.startsWith('leg-')) return null;
    const cabinet = store.get().furniture.find((c) => c.id === cabinetId);
    const panel = cabinet && cabinetPanels(cabinet, store.get()).find((p) => p.key === panelKey);
    if (!panel) return null;
    return {
      icon: '📐',
      label: t('{name} — zaznacz, wymiary i obrzeże…', { name: panel.name }),
      run: () => {
        selectPanel(cabinetId, panelKey);
        return panelInfoMenu(store, cabinetId, panelKey);
      },
    };
  }

  function showPanelInfo(cabinetId, panelKey, clientX, clientY) {
    selectPanel(cabinetId, panelKey);
    const m = panelInfoMenu(store, cabinetId, panelKey);
    const shelfItem = removeShelfItem(cabinetId, panelKey);
    if (m) menu.show(clientX, clientY, m.title, shelfItem ? [shelfItem, ...m.items] : m.items);
  }

  // Pozycja menu „🗑 Usuń półkę” (tylko dla półki korpusu).
  function removeShelfItem(cabinetId, panelKey) {
    if (!panelKey?.startsWith('shelf-')) return null;
    return {
      icon: '🗑',
      label: t('Usuń półkę'),
      run: () => {
        store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cabinetId ? removeShelves(c, [panelKey]) : c)) }));
        const id = `${cabinetId}:${panelKey}`;
        ui.set({ ...ui.get(), selectedBlends: (ui.get().selectedBlends ?? []).filter((b) => b !== id) });
      },
    };
  }

  // Zaznaczenie występu ściany (zamiast korpusów, frontów, blend i otworów).
  const selectWall = (obstacleId) =>
    ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: obstacleId });

  // Przeciąganie występu: krawędź (mode 'left' / 'right') zmienia szerokość, środek ('move') przesuwa;
  // krawędzie przyciągają się do ścian i korpusów (bez przyciągania z Alt), najmniej 10 mm szerokości.
  function dragWall(pt, altKey, e) {
    const { obstacleId, mode, from, start } = drag.wall;
    const project = store.get();
    const W = project.space.width;
    const dx = (pt.x - start.x) / MM;
    // przyciąganie krawędzi (magnes jak przy korpusach): ściany, korpusy, przeszkody, półki / blaty
    const reach = snapThresholdMm(start) * WALL_SNAP_FACTOR;
    const labels = [];
    const snap = (x) => {
      if (altKey) return Math.round(x);
      const t = obstacleEdgeTarget(project, obstacleId, x, reach);
      return Math.round(t ? t.v : x);
    };
    const noteSnap = (x) => {
      const t = !altKey && obstacleEdgeTarget(project, obstacleId, x, 0.5);
      if (t) labels.push(t.label);
    };
    let { x, width } = from;
    let z = from.z;
    if (mode === 'move') {
      // przyciąga ta krawędź (lewa / prawa), która jest bliżej celu; magnes trzyma, dopóki nie odciągniesz dalej
      const left = from.x + dx;
      let pick = null;
      if (!altKey) {
        const held = drag.wall.held;
        if (held && Math.abs(left + held.off - held.v) < reach * WALL_SNAP_HOLD) pick = held;
        else {
          for (const off of [0, from.width]) {
            const t = obstacleEdgeTarget(project, obstacleId, left + off, reach);
            if (t && (!pick || Math.abs(left + off - t.v) < Math.abs(left + pick.off - pick.v))) pick = { ...t, off };
          }
        }
        drag.wall.held = pick;
      }
      x = Math.round(pick ? pick.v - pick.off : altKey ? left : Math.round(left / 10) * 10);
      if (pick) labels.push(pick.label);
      x = Math.min(Math.max(x, 0), Math.max(0, W - from.width));
      // do przodu / do tyłu: przyciąganie tyłu do tylnej ściany, przodu do przodu przestrzeni i frontów mebli
      const D = project.space.depth;
      const dz = (pt.z - start.z) / MM;
      let back = from.z + dz;
      if (!altKey) {
        const reach = snapThresholdMm(start);
        const fronts = [D, ...project.furniture.map((c) => { const b = cabinetBounds(c, project); return b.z + b.depth; })];
        const cand = [{ d: -back }, ...fronts.map((f) => ({ d: f - (back + from.depth) }))].filter((c) => Math.abs(c.d) < reach);
        back = cand.length ? back + cand.reduce((m, c) => (Math.abs(c.d) < Math.abs(m.d) ? c : m)).d : Math.round(back / 10) * 10;
      }
      z = Math.round(Math.min(Math.max(back, 0), Math.max(0, D - from.depth)));
    } else if (mode === 'left') {
      const right = from.x + from.width;
      x = Math.min(Math.max(snap(from.x + dx), 0), right - 10);
      width = right - x;
    } else {
      width = Math.min(Math.max(snap(from.x + from.width + dx), from.x + 10), W) - from.x;
    }
    if (mode === 'left') noteSnap(x);
    if (mode === 'right') noteSnap(x + width);
    // podpowiedź przy kursorze: położenie i do czego przyciągnęło
    if (e) {
      const r = viewer.container.getBoundingClientRect();
      snapTip.textContent = mode === 'move' ? t('Od lewej {x} mm · szer. {w} mm', { x, w: width }) : t('Szerokość {w} mm', { w: width });
      if (labels.length) snapTip.textContent += ` · 🧲 ${[...new Set(labels)].join(' · ')}`;
      snapTip.style.left = `${e.clientX - r.left + 14}px`;
      snapTip.style.top = `${e.clientY - r.top + 18}px`;
      snapTip.hidden = false;
    }
    store.set((p) => ({
      ...p,
      space: { ...p.space, obstacles: p.space.obstacles.map((o) => (o.id === obstacleId ? { ...o, x, width, z } : o)) },
    }));
  }

  const isShelf = (hit) => hit?.panelKey?.startsWith('shelf-');
  const isFront = (hit) => hit?.panelKey?.startsWith('front-') || hit?.panelKey?.startsWith('idrawer-'); // (czoło szuflady wewnętrznej — jak front)
  // Zaznaczany element (poza frontami): blenda boczna (płyta korpusu z grupy „blend”: „idKorpusu:klucz”),
  // nóżki korpusu („idKorpusu:legs” — wszystkie naraz) albo blenda wspólna / blat („trim:id”).
  const blendIdOf = (hit) => {
    if (hit?.boardId) return `board:${hit.boardId}`;
    if (hit?.trimId) return `trim:${hit.trimId}`;
    if (!hit?.panelKey) return null;
    if (hit.panelKey.startsWith('leg-')) return `${hit.id}:legs`; // wszystkie nóżki korpusu naraz
    const cabinet = store.get().furniture.find((c) => c.id === hit.id);
    const panel = cabinet && cabinetPanels(cabinet, store.get()).find((p) => p.key === hit.panelKey);
    return panel?.group === 'blend' ? `${hit.id}:${hit.panelKey}` : null;
  };
  const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // Otwór płyty (blatu / półki) przy trafionym punkcie: kursor na płycie tuż przy brzegu otworu
  // (otwór sam jest pusty) — do przesuwania otworu myszką. → { kind, id, index, u, v, hole, box } albo null.
  const HOLE_GRAB_MM = 30;
  function holeAt(hit) {
    const slab = hit?.slab;
    if (!slab) return null;
    const project = store.get();
    const obj = slab.kind === 'trim' ? project.trims.find((t) => t.id === slab.id) : project.boards?.find((b) => b.id === slab.id);
    const { box } = slab;
    const holes = resolveHoles(obj?.holes, box.width, box.depth); // otwory w rogu / przy krawędzi — wyliczony środek
    // punkt na płycie → u (od lewej), v (od przedniej krawędzi), w mm
    const u = hit.point.x / MM - box.x;
    const v = box.z + box.depth - (hit.point.z / MM + project.space.depth);
    let best = null;
    holes.forEach((h, index) => {
      const [hw, hd] = h.shape === 'circle' ? [h.d / 2, h.d / 2] : [h.w / 2, h.h / 2];
      const dist = h.shape === 'circle' ? Math.hypot(u - h.x, v - h.y) - hw : Math.max(Math.abs(u - h.x) - hw, Math.abs(v - h.y) - hd);
      if (dist <= HOLE_GRAB_MM && (!best || dist < best.dist)) best = { dist, index, hole: h };
    });
    return best ? { kind: slab.kind, id: slab.id, index: best.index, hole: best.hole, u, v, box } : null;
  }

  // Przesunięcie otworu (drag.hole) do punktu na płycie — środek otworu w granicach płyty (10 mm od krawędzi).
  function dragHole(pt) {
    const { kind, id, index, grab, box } = drag.hole;
    const project = store.get();
    const u = pt.x / MM - box.x - grab.u;
    const v = box.z + box.depth - (pt.z / MM + project.space.depth) - grab.v;
    const move = (holes) =>
      holes.map((h, i) => {
        if (i !== index) return h;
        const [hw, hd] = h.shape === 'circle' ? [h.d / 2, h.d / 2] : [h.w / 2, h.h / 2];
        const clamp = (x, half, size) => Math.round(Math.min(Math.max(x, half + 10), Math.max(half + 10, size - half - 10)));
        // przeciągnięty otwór ma już własne położenie (x, y) — nie jest przypięty do rogu / krawędzi
        return { ...h, pos: null, x: clamp(u, hw, box.width), y: clamp(v, hd, box.depth) };
      });
    store.set((p) =>
      kind === 'trim'
        ? { ...p, trims: p.trims.map((t) => (t.id === id ? { ...t, holes: move(t.holes) } : t)) }
        : { ...p, boards: p.boards.map((b) => (b.id === id ? { ...b, holes: move(b.holes) } : b)) },
    );
  }

  // Otwarcie frontu („idKorpusu:front-N”): przełączone ręcznie albo według „otwarte” na pasku.
  const isFrontOpen = (frontId) => ui.get().frontOpen?.[frontId] ?? store.get().view?.openFronts === true;
  const setFrontsOpen = (frontIds, open) => {
    const { frontOpen = {} } = ui.get();
    ui.set({ ...ui.get(), frontOpen: { ...frontOpen, ...Object.fromEntries(frontIds.map((f) => [f, open])) } });
  };
  const toggleFront = (frontId) => setFrontsOpen([frontId], !isFrontOpen(frontId));

  // Płyta frontu „idKorpusu:front-N” (albo null, gdy już nie istnieje).
  const frontPanel = (frontId, project) => {
    const [cabinetId, key] = frontId.split(':');
    const cabinet = project.furniture.find((c) => c.id === cabinetId);
    return cabinet ? cabinetPanels(cabinet, project).find((p) => p.key === key) ?? null : null;
  };

  // Kolor wybranych elementów: fronty i blendy boczne („idKorpusu:klucz”) — przy płycie
  // (panelOverrides[klucz].color), blendy wspólne i blaty („trim:id”) — trim.color.
  // null — element wraca do koloru ustawionego w korpusie / materiale.
  function setPartsColor(partIds, color) {
    const trimIds = partIds.filter((id) => id.startsWith('trim:')).map((id) => id.slice(5));
    const frontIds = partIds.filter((id) => !id.startsWith('trim:'));
    store.set((p) => ({
      ...p,
      trims: (p.trims ?? []).map((t) => (trimIds.includes(t.id) ? { ...t, color } : t)),
      furniture: p.furniture.map((c) => {
        const keys = frontIds.filter((id) => id.startsWith(`${c.id}:`)).map((id) => id.split(':')[1]);
        if (!keys.length) return c;
        const overrides = { ...c.panelOverrides };
        for (const k of keys) {
          const { color: _old, ...rest } = overrides[k] ?? {};
          overrides[k] = color ? { ...rest, color } : rest;
          if (!Object.keys(overrides[k]).length) delete overrides[k];
        }
        return { ...c, panelOverrides: overrides };
      }),
    }));
  }

  // Frez dekoracyjny wybranych frontów („idKorpusu:front-N”) — przy płycie frontu (panelOverrides[klucz].decor);
  // null — front wraca do frezu frontów korpusu. Parametry frezu (odległość, rozstaw) — wspólne z korpusem.
  function setFrontsDecor(frontIds, decor) {
    store.set((p) => ({
      ...p,
      furniture: p.furniture.map((c) => {
        const keys = frontIds.filter((id) => id.startsWith(`${c.id}:`)).map((id) => id.split(':')[1]);
        if (!keys.length) return c;
        const overrides = { ...c.panelOverrides };
        for (const k of keys) {
          const { decor: _old, ...rest } = overrides[k] ?? {};
          overrides[k] = decor ? { ...rest, decor } : rest;
          if (!Object.keys(overrides[k]).length) delete overrides[k];
        }
        return { ...c, panelOverrides: overrides };
      }),
    }));
  }

  // Własny kolor — systemowy próbnik kolorów (otwierany kliknięciem z menu).
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'context-color-input';
  colorInput.tabIndex = -1;
  viewer.container.appendChild(colorInput);
  let onCustomColor = null;
  colorInput.addEventListener('change', () => {
    const hex = colorInput.value.toLowerCase();
    const preset = COLOR_PRESETS.find((c) => c.hex === hex);
    onCustomColor?.(preset ? { ...preset } : { hex, name: t('własny {hex}', { hex }) });
    onCustomColor = null;
  });
  function pickCustomColor(done) {
    onCustomColor = done;
    colorInput.click();
  }

// Wszystkie zaznaczone elementy, którym można zmienić kolor: fronty i blendy (bez nóżek).
  const selectedParts = () => [
    ...(ui.get().selectedFronts ?? []),
    ...(ui.get().selectedBlends ?? []).filter((id) => !id.endsWith(':legs')),
  ];
  const partsLabel = (parts) => {
    const fronts = parts.filter((id) => id.includes(':front-')).length;
    const blends = parts.length - fronts;
    return [fronts && `${fronts} ${fronts === 1 ? t('front') : fronts < 5 ? t('fronty') : t('frontów')}`, blends && `${blends} ${blends === 1 ? t('blenda') : blends < 5 ? t('blendy') : t('blend')}`]
      .filter(Boolean)
      .join(' + ');
  };

  // Pozycja menu „Zmień kolor…” z podlistą kolorów dla elementów partIds.
  function colorItem(label, title, resetLabel, partIds) {
    return {
      icon: '🎨',
      label,
      submenu: () => ({
        title,
        items: [
          { icon: '↺', label: resetLabel, run: () => setPartsColor(partIds, null) },
          ...COLOR_PRESETS.map((c) => ({
            icon: `<span class="context-menu-swatch" style="background:${c.hex}"></span>`,
            label: c.name,
            run: () => setPartsColor(partIds, { ...c }),
          })),
          { icon: '…', label: t('własny kolor'), run: () => pickCustomColor((c) => setPartsColor(partIds, c)) },
        ],
      }),
    };
  }

  // Menu dla zaznaczonych blend (boczne „idKorpusu:klucz”, wspólne i blaty „trim:id”): zmiana koloru.
  function showBlendMenu(blendIds, clientX, clientY) {
    const project = store.get();
    const nameOf = (id) => {
      if (id.startsWith('trim:')) return project.trims?.find((t) => t.id === id.slice(5))?.name;
      if (id.startsWith('board:')) return project.boards?.find((b) => b.id === id.slice(6))?.name;
      const [cabId, key] = id.split(':');
      const cab = project.furniture.find((c) => c.id === cabId);
      return cab && cabinetPanels(cab, project).find((p) => p.key === key)?.name;
    };
    const ids = blendIds.filter((id) => !id.endsWith(':legs') && nameOf(id));
    if (!ids.length) return;
    // kolor — dla wszystkich zaznaczonych elementów (blendy i fronty razem)
    const parts = [...new Set([...ids, ...selectedParts()])];
    const multi = parts.length > 1;
    const title = multi ? t('Zaznaczone: {what}', { what: partsLabel(parts) }) : nameOf(ids[0]);
    // jedna blenda boczna (płyta korpusu) — także jej wymiary i obrzeże
    const [cabId, key] = ids[0].split(':');
    const info = !multi && !ids[0].startsWith('trim:') && !ids[0].startsWith('board:') ? panelInfoItem(cabId, key) : null;
    // jedna samodzielna płyta (półka, blat) — wymiary do wpisania
    const countertop = !multi && ids[0].startsWith('trim:') && project.trims?.find((t) => t.id === ids[0].slice(5))?.type === 'countertop';
    const boardDims = !multi && ids[0].startsWith('board:') ? boardDimsItem(ids[0].slice(6)) : countertop ? countertopDimsItem(ids[0].slice(5)) : null;
    // blaty / płyty: połącz zaznaczone w jeden, usuń
    const merge = mergeCandidate(project, ids);
    const removable = removableCount(ids);
    const partActions = [
      ...(merge
        ? [{
            icon: '⇔',
            label: merge.kind === 'trims' ? t('Połącz {n} blaty w jeden (na wszystkie korpusy)', { n: merge.ids.length }) : t('Połącz {n} płyty w jedną', { n: merge.ids.length }),
            run: () => {
              const r = mergeParts(store.get(), ids);
              if (!r) return;
              store.set(r.project);
              ui.set({ ...ui.get(), selectedBlends: [r.partId] });
            },
          }]
        : []),
      ...(removable
        ? [{
            icon: '🗑',
            label: removable > 1 ? t('Usuń zaznaczone ({n})', { n: removable }) : t('Usuń'),
            run: () => {
              ui.set({ ...ui.get(), selectedBlends: (ui.get().selectedBlends ?? []).filter((b) => !ids.includes(b)) });
              store.set((p) => removeParts(p, ids));
            },
          }]
        : []),
    ];
    // jedna samodzielna płyta — dosuń / rozszerz do najbliższej ściany, mebla, przeszkody albo płyty
    const boardMoves = [];
    if (!multi && ids[0].startsWith('board:')) {
      const bid = ids[0].slice(6);
      const run = (side, mode) => () => store.set((p) => nudgeBoard(p, bid, side, mode));
      const bd = project.boards.find((b) => b.id === bid);
      const zap = bd?.clearance ? ` ${t('z zapasem {d} mm', { d: bd.clearance })}` : '';
      // dopasowanie szerokości do wnęki (od sąsiada do sąsiada, minus zapas)
      const niche = boardNicheWidth(project, bid);
      const fitW = niche != null ? Math.round((niche - (bd?.clearance ?? 0)) * 10) / 10 : null;
      if (fitW != null && Math.abs(fitW - bd.width) >= 0.5) boardMoves.push({ icon: '⇔', label: zap ? t('Dopasuj szerokość do wnęki: {w} mm (wnęka {n}, zapas {c})', { w: fitW, n: niche, c: bd.clearance }) : t('Dopasuj szerokość do wnęki: {w} mm (wnęka {n})', { w: fitW, n: niche }), run: () => store.set((p) => fitBoardWidth(p, bid)) });
      for (const [side, dir, icon] of [['left', t('w lewo'), '⇤'], ['right', t('w prawo'), '⇥']]) {
        const n = boardStep(project, bid, side);
        if (n) boardMoves.push({ icon, label: t('Rozszerz {dir} do {what} (+{d})', { dir, what: n.label, d: `${n.gap} mm${zap}` }), run: run(side, 'extend') });
      }
      for (const [side, dir, icon] of [['left', t('w lewo'), '←'], ['right', t('w prawo'), '→'], ['down', t('w dół'), '⤓'], ['up', t('w górę'), '⤒']]) {
        const n = boardStep(project, bid, side);
        if (n) boardMoves.push({ icon, label: t('Dosuń {dir} do {what} ({d})', { dir, what: n.label, d: `${n.gap} mm` }), run: run(side, 'move') });
      }
    }
    // jedna samodzielna płyta — mocowanie do ściany
    if (!multi && ids[0].startsWith('board:')) {
      const bid = ids[0].slice(6);
      const cur = project.boards.find((b) => b.id === bid)?.mount?.type ?? null;
      boardMoves.push({
        icon: '🔩',
        label: t('Mocowanie do ściany: {what}…', { what: mountInfo(cur).label.split(' (')[0].split(' —')[0] }),
        submenu: () => ({
          title: t('Mocowanie do ściany'),
          items: [
            ...BOARD_MOUNTS.map((m) => ({
              icon: (m.key ?? null) === cur ? '✓' : '·',
              label: m.label,
              run: () => store.set((p) => ({ ...p, boards: p.boards.map((b) => (b.id === bid ? { ...b, mount: { type: m.key, count: null } } : b)) })),
            })),
            // mocowanie ukryte — obróbka tylnej krawędzi (otwory / frez), żeby wsporniki schowały się w płycie
            ...(cur === 'hidden'
              ? MOUNT_MACHINING.map((m) => {
                  const now = normalizeMount(project.boards.find((b) => b.id === bid)?.mount).machining;
                  return {
                    icon: (m.key ?? null) === now ? '☑' : '☐',
                    label: t('Obróbka: {what}', { what: m.label }),
                    run: () => store.set((p) => ({ ...p, boards: p.boards.map((b) => (b.id === bid ? { ...b, mount: { ...normalizeMount(b.mount), machining: m.key } } : b)) })),
                  };
                })
              : []),
          ],
        }),
      });
    }
    // jeden blat / blenda wspólna — pobranie formatki i rysunku
    if (!multi && ids[0].startsWith('trim:')) {
      const tid = ids[0].slice(5);
      boardMoves.push({
        icon: '💾',
        label: t('Pobierz formatkę / rysunek…'),
        submenu: () => ({
          title: t('Pobierz'),
          items: [
            { icon: '💾', label: t('Formatka — Excel (.xlsx)'), run: () => downloadTrimCutList(store.get(), tid, 'xlsx') },
            { icon: '💾', label: t('Formatka — CSV (.csv)'), run: () => downloadTrimCutList(store.get(), tid, 'csv') },
            { icon: '💾', label: t('Rysunek z wymiarami — PDF'), run: () => downloadTrimDrawing(store.get(), tid, 'pdf') },
            { icon: '💾', label: t('Rysunek z wymiarami — obraz PNG'), run: () => downloadTrimDrawing(store.get(), tid, 'png') },
          ],
        }),
      });
    }
    // jedna samodzielna płyta — pobranie jej formatki
    if (!multi && ids[0].startsWith('board:')) {
      const bid = ids[0].slice(6);
      boardMoves.push({
        icon: '💾',
        label: t('Pobierz formatkę / rysunek…'),
        submenu: () => ({
          title: t('Pobierz'),
          items: [
            { icon: '💾', label: t('Formatka — Excel (.xlsx)'), run: () => downloadBoardCutList(store.get(), bid, 'xlsx') },
            { icon: '💾', label: t('Formatka — CSV (.csv)'), run: () => downloadBoardCutList(store.get(), bid, 'csv') },
            { icon: '💾', label: t('Rysunek z wymiarami — PDF'), run: () => downloadBoardDrawing(store.get(), bid, 'pdf') },
            { icon: '💾', label: t('Rysunek z wymiarami — obraz PNG'), run: () => downloadBoardDrawing(store.get(), bid, 'png') },
          ],
        }),
      });
    }
    menu.show(clientX, clientY, title, [
      ...(info ? [info] : []),
      ...boardMoves,
      ...(boardDims ? [boardDims] : []),
      ...partActions,
      colorItem(multi ? t('Zmień kolor wszystkich…') : t('Zmień kolor…'), t('Kolor: {what}', { what: multi ? partsLabel(parts) : nameOf(ids[0]) }), t('jak w korpusie / materiale'), parts),
    ]);
  }

  // „Wymiary…” samodzielnej płyty: szerokość, głębokość, grubość (puste — z materiału) i położenie — pola do wpisania.
  function boardDimsMenu(id) {
    const project = store.get();
    const b = project.boards.find((x) => x.id === id);
    if (!b) return null;
    const matThickness = boardMaterial({ ...b, thickness: null }, project).thickness;
    const set = (patch) => {
      store.set((p) => ({ ...p, boards: p.boards.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      return boardDimsMenu(id); // menu zostaje otwarte z nowymi wartościami
    };
    const L = BOARD_LIMITS;
    const clamp = (v, min, max) => Math.round(Math.min(max, Math.max(min, v)));
    return {
      title: t('Wymiary: {name}', { name: b.name }),
      items: [
        { input: true, label: t('Szerokość'), unit: 'mm', value: b.width, min: L.sizeMin, max: L.sizeMax, onChange: (v) => (v == null ? boardDimsMenu(id) : set({ width: clamp(v, L.sizeMin, L.sizeMax) })) },
        { input: true, label: t('Głębokość'), unit: 'mm', value: b.depth, min: L.sizeMin, max: L.sizeMax, onChange: (v) => (v == null ? boardDimsMenu(id) : set({ depth: clamp(v, L.sizeMin, L.sizeMax) })) },
        { input: true, label: t('Grubość'), unit: 'mm', value: b.thickness ?? '', placeholder: t('{v} (z materiału)', { v: matThickness }), min: 3, max: 100, onChange: (v) => set({ thickness: v == null ? null : clamp(v, 3, 100) }) },
        { input: true, label: t('Od podłogi'), unit: 'mm', value: b.y, onChange: (v) => (v == null ? boardDimsMenu(id) : set({ y: Math.round(v) })) },
        { info: true, icon: 'ℹ', label: t('Enter albo Tab — zatwierdź; grubość puste — z materiału.') },
      ],
    };
  }
  // „Wymiary…” korpusu: szerokość, wysokość, głębokość — pola do wpisania; grubość płyty korpusu — wybór
  // materiału (płyta wiórowa) o innej grubości, bo grubość korpusu wynika z materiału.
  function cabinetDimsMenu(id) {
    const project = store.get();
    const c = project.furniture.find((x) => x.id === id);
    if (!c) return null;
    // kilka zaznaczonych korpusów (w tym ten) — wymiary zmieniają się we wszystkich
    const sel = selectedCabinetIds(ui.get());
    const group = sel.size > 1 && sel.has(id) ? [...sel] : null;
    const set = (patch) => {
      const dim = ['width', 'height', 'depth'].find((k) => k in patch);
      if (group && dim) store.set((p) => resizeCabinets(p, group, dim, patch[dim]));
      else store.set((p) => ({ ...p, furniture: p.furniture.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      return cabinetDimsMenu(id); // menu zostaje otwarte z nowymi wartościami
    };
    const { sizeMin, sizeMax } = CABINET_LIMITS;
    const maxH = Math.max(sizeMin, Math.floor(maxCabinetHeight(c, project)));
    const clamp = (v, min, max) => Math.round(Math.min(max, Math.max(min, v)));
    const same = () => cabinetDimsMenu(id);
    const body = cabinetMaterials(c, project).body;
    const boards = (project.materials ?? []).filter((m) => m.type === 'chipboard');
    const thicknessItems = boards.length > 1
      ? boards.map((m) => ({
          icon: m.id === (c.materialId ?? boards[0].id) ? '✓' : '·',
          label: t('Grubość {v} mm — {name}', { v: m.thickness, name: m.name }),
          run: () => set({ materialId: m.id }),
        }))
      : [{ info: true, icon: 'ℹ', label: t('Grubość płyty {v} mm (z materiału) — inną grubość dodasz w „Materiałach”.', { v: body.thickness }) }];
    return {
      title: group ? t('Wymiary: {n} zaznaczone korpusy', { n: group.length }) : t('Wymiary: {name}', { name: c.name }),
      items: [
        { input: true, label: t('Szerokość'), unit: 'mm', value: c.width, min: sizeMin, max: sizeMax, onChange: (v) => (v == null ? same() : set({ width: clamp(v, sizeMin, sizeMax) })) },
        { input: true, label: t('Wysokość'), unit: 'mm', value: c.height, min: sizeMin, max: maxH, onChange: (v) => (v == null ? same() : set({ height: clamp(v, sizeMin, maxH) })) },
        { input: true, label: t('Głębokość'), unit: 'mm', value: c.depth, min: sizeMin, max: sizeMax, onChange: (v) => (v == null ? same() : set({ depth: clamp(v, sizeMin, sizeMax) })) },
        ...thicknessItems,
        { info: true, icon: 'ℹ', label: t('Enter albo Tab — zatwierdź.') },
      ],
    };
  }
  // „Wymiary…” blatu na szafkach: długość, głębokość, grubość — puste pole wraca do wartości automatycznej.
  function countertopDimsMenu(id) {
    const project = store.get();
    const tr = project.trims.find((x) => x.id === id);
    if (!tr) return null;
    const box = trimBox(tr, project);
    const matThickness = trimMaterial({ ...tr, thickness: null }, project).thickness;
    const set = (patch) => {
      store.set((p) => ({ ...p, trims: p.trims.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      return countertopDimsMenu(id);
    };
    const clamp = (v, min, max) => Math.round(Math.min(max, Math.max(min, v)));
    const auto = (v) => (v != null ? '' : ' (auto)');
    return {
      title: t('Wymiary: {name}', { name: tr.name }),
      items: [
        { input: true, label: `${t('Długość')}${auto(tr.length)}`, unit: 'mm', value: tr.length ?? '', placeholder: box ? `${Math.round(box.width)} auto` : 'auto', min: 1, max: 20000, onChange: (v) => set({ length: v == null ? null : clamp(v, 1, 20000) }) },
        { input: true, label: `${t('Głębokość')}${auto(tr.depth)}`, unit: 'mm', value: tr.depth ?? '', placeholder: box ? `${Math.round(box.depth)} auto` : 'auto', min: 1, max: 20000, onChange: (v) => set({ depth: v == null ? null : clamp(v, 1, 20000) }) },
        { input: true, label: t('Grubość'), unit: 'mm', value: tr.thickness ?? '', placeholder: t('{v} (z materiału)', { v: matThickness }), min: 3, max: 100, onChange: (v) => set({ thickness: v == null ? null : clamp(v, 3, 100) }) },
        { info: true, icon: 'ℹ', label: t('Enter albo Tab — zatwierdź; puste pole — automatycznie / z materiału.') },
      ],
    };
  }
  const countertopDimsItem = (id) => ({ icon: '📐', label: t('Wymiary (długość, głębokość, grubość)…'), submenu: () => countertopDimsMenu(id) });
  const boardDimsItem = (id) => ({ icon: '📐', label: t('Wymiary (szerokość, głębokość, grubość)…'), submenu: () => boardDimsMenu(id) });

  // Menu akcji dla zaznaczonych frontów (jednego albo kilku, z Ctrl): otwórz / zamknij (wysuń / wsuń), ukryj.
  // Gdy część jest otwarta, a część zamknięta — obie akcje.
  const menu = createContextMenu(viewer.container);
  function showFrontMenu(frontIds, clientX, clientY) {
    const project = store.get();
    const fronts = frontIds.map((id) => ({ id, panel: frontPanel(id, project) })).filter((f) => f.panel);
    if (!fronts.length) return;
    const ids = fronts.map((f) => f.id);
    const openCount = ids.filter(isFrontOpen).length;
    const drawers = fronts.every((f) => f.panel.opening?.drawer);
    const many = fronts.length > 1;
    const all = many ? ' wszystkie' : '';
    const items = [];
    if (openCount < ids.length) items.push({ icon: '⇤', label: drawers ? (many ? t('Wysuń wszystkie') : t('Wysuń')) : many ? t('Otwórz wszystkie') : t('Otwórz'), run: () => setFrontsOpen(ids, true) });
    // jedna szuflada (front albo czoło wewnętrzne) — przestawienie w wnętrzu, przykrycie drzwiami / własny front
    if (!many && fronts[0].panel.part != null) {
      const cabinetId = fronts[0].id.split(':')[0];
      const cab = project.furniture.find((c) => c.id === cabinetId);
      const st = frontParts(cab?.fronts);
      const n = st.parts.length;
      const i = fronts[0].panel.part;
      const change = (fn) => () => {
        store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cabinetId ? fn(c, p) : c)) }));
        ui.set({ ...ui.get(), selectedFronts: [] }); // klucze frontów po zmianie się zmieniają
      };
      const gain = cab ? freeSpaceOf(cab, i, project) : 0;
      if (gain) items.push({ icon: '⤢', label: fitLabel(gain), run: change((c, p) => fillFreeSpace(c, i, p)) });
      if (i < n - 1) items.push({ icon: '↑', label: t('Przenieś szufladę wyżej'), run: change((c, p) => movePart(c, i, i + 1, p)) });
      if (i > 0) items.push({ icon: '↓', label: t('Przenieś szufladę niżej'), run: change((c, p) => movePart(c, i, i - 1, p)) });
      if (i < n - 2) items.push({ icon: '⤒', label: t('Przenieś szufladę na samą górę'), run: change((c, p) => movePart(c, i, n - 1, p)) });
      if (i > 1) items.push({ icon: '⤓', label: t('Przenieś szufladę na sam dół'), run: change((c, p) => movePart(c, i, 0, p)) });
      const inner = fronts[0].id.split(':')[1].startsWith('idrawer-');
      if (!inner) {
        items.push({ icon: '▢', label: t('Zamień na szufladę wewnętrzną (bez frontu)'), run: change((c, p) => setPartKind(c, i, 'innerDrawer', p)) });
        items.push({ icon: '▣', label: t('Schowaj za drzwiami'), run: change((c, p) => coverWithDoor(c, i, p)) });
      } else {
        items.push({ icon: '▤', label: t('Zamień na szufladę z frontem'), run: change((c, p) => setPartKind(c, i, 'drawer', p)) });
        if (canUncover(st, i)) items.push({ icon: '⇲', label: t('Wyjmij spod drzwi'), run: change((c, p) => uncoverPart(c, i, p)) });
        const dj = st.doors.findIndex((d) => d.covers.includes(st.parts[i]?.id));
        if (dj < 0) items.push({ icon: '▣', label: t('Schowaj za drzwiami'), run: change((c, p) => coverWithDoor(c, i, p)) });
        else if (cab && canDoorGrow(cab, dj)) items.push({ icon: '⇕', label: t('Drzwi na całą wysokość'), run: change((c, p) => doorFullHeight(c, dj, p)) });
      }
    }
    // jedne drzwi — na całą wysokość (przykrywają szuflady wewnętrzne i wolne miejsce pod / nad nimi)
    if (!many && fronts[0].panel.door != null && fronts[0].panel.part == null) {
      const cabinetId = fronts[0].id.split(':')[0];
      const cab = project.furniture.find((c) => c.id === cabinetId);
      const j = fronts[0].panel.door;
      if (cab && canDoorGrow(cab, j))
        items.push({
          icon: '⇕',
          label: t('Drzwi na całą wysokość (przykryj szuflady wewnętrzne)'),
          run: () => {
            store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cabinetId ? doorFullHeight(c, j, p) : c)) }));
            ui.set({ ...ui.get(), selectedFronts: [] });
          },
        });
    }
    if (openCount > 0) items.push({ icon: '⇥', label: drawers ? (many ? t('Wsuń wszystkie') : t('Wsuń')) : many ? t('Zamknij wszystkie') : t('Zamknij'), run: () => setFrontsOpen(ids, false) });
    {
      const cabIds = [...new Set(ids.map((id) => id.split(':')[0]))];
      items.push({
        icon: '▣',
        label: cabIds.length > 1 ? t('Zaznacz całe korpusy ({n})', { n: cabIds.length }) : t('Zaznacz cały korpus'),
        run: () => ui.set({ ...ui.get(), selectedId: cabIds.at(-1), selectedIds: cabIds, selectedFronts: [], selectedBlends: [] }, { reveal: true }),
      });
    }
    items.push({
      icon: '👁',
      label: many ? t('Ukryj wszystkie') : t('Ukryj'),
      run: () =>
        store.set((p) => ({
          ...p,
          furniture: p.furniture.map((c) => {
            const keys = ids.filter((id) => id.startsWith(`${c.id}:`)).map((id) => id.split(':')[1]);
            if (!keys.length) return c;
            const overrides = { ...c.panelOverrides };
            for (const k of keys) overrides[k] = { ...overrides[k], hidden: true };
            return { ...c, panelOverrides: overrides };
          }),
        })),
    });
    // Kolor zaznaczonych frontów (podlista): „jak w korpusie” zdejmuje własny kolor frontu.
    // kolor — dla wszystkich zaznaczonych elementów (fronty i blendy razem)
    const parts = [...new Set([...ids, ...selectedParts()])];
    const multi = parts.length > 1;
    items.push(
      colorItem(
        multi ? t('Zmień kolor ({what})…', { what: partsLabel(parts) }) : t('Zmień kolor…'),
        t('Kolor: {what}', { what: multi ? partsLabel(parts) : fronts[0].panel.name }),
        t('jak w korpusie / materiale'),
        parts,
      ),
    );
    // Frez — tylko gdy zaznaczone są same fronty (bez blend)
    if (selectedParts().every((id) => id.includes(':front-'))) {
      items.push({
        icon: '▦',
        label: many ? t('Zmień frez wszystkie…') : t('Zmień frez…'),
        submenu: () => ({
          title: many ? t('Frez: {n} frontów', { n: fronts.length }) : t('Frez: {what}', { what: fronts[0].panel.name }),
          items: [
            { icon: '↺', label: t('jak w korpusie (frez frontów)'), run: () => setFrontsDecor(ids, null) },
            ...FRONT_DECORS.map((d) => ({
              icon: `<span class="context-menu-decor">${decorPreviewSvg(d.key, 450, 700, {}, 18)}</span>`,
              label: d.label,
              run: () => setFrontsDecor(ids, d.key),
            })),
          ],
        }),
      });
    }
    if (!many) {
      const [cabId, key] = ids[0].split(':');
      const info = panelInfoItem(cabId, key);
      if (info) items.push({ ...info, label: t('Wymiary i obrzeże…') });
    }
    const title = many ? t('Zaznaczone fronty: {n}', { n: fronts.length }) : fronts[0].panel.name;
    menu.show(clientX, clientY, title, items);
  }

  // Przeciąganie półki: nowa wysokość (spód półki od dołu korpusu), w granicach wnętrza korpusu.
  // Pozostałe półki zostają na swoich miejscach (setShelfY „zamraża” równo rozłożone).
  function dragShelf(dy) {
    store.set((prj) => ({
      ...prj,
      furniture: prj.furniture.map((c) => {
        if (c.id !== drag.id) return c;
        const y = Math.round(Math.min(drag.maxY, Math.max(drag.minY, drag.from.y + dy)));
        return setShelfY(c, drag.shelfId, y, prj);
      }),
    }));
  }

  // Płaszczyzna przeciągania: pozioma (przez punkt chwytu) albo pionowa zwrócona do kamery.
  function dragPlane(point, vertical) {
    if (!vertical) return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), point);
    const n = new THREE.Vector3();
    viewer.camera.getWorldDirection(n);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize().negate(), point);
  }

  // Prawy przycisk: krótkie kliknięcie na froncie — menu akcji; przeciągnięcie — przesuwanie widoku
  // (OrbitControls), wtedy menu się nie pokazuje.
  let rightDown = null;
  // --- nowa półka / blat przeciągnięte z panelu („+ Półka”) i upuszczone w widoku 3D ---
  // Podgląd (półprzezroczysta płyta) tam, gdzie wskazuje kursor: na ścianie, występie, korpusie — przy tylnej
  // ścianie, w wolnej luce (gdy węższa — płyta ma jej szerokość, np. od ściany do okapu). Upuszczenie dodaje płytę.
  const BOARD_DND = 'application/x-meble-board-';
  let dropGhost = null;
  const dndKind = (e) => [...(e.dataTransfer?.types ?? [])].find((t) => t.startsWith(BOARD_DND))?.slice(BOARD_DND.length) ?? null;
  function dropSpot(e, kind) {
    setRay(e);
    const project = store.get();
    const size = NEW_BOARD_SIZE(project, kind);
    const groups = [viewer.spaceGroup, viewer.furnitureGroup].filter(Boolean);
    const hit = raycaster.intersectObjects(groups, true).find((h) => h.object.isMesh && h.object.material?.visible !== false && !h.object.userData.wallHandle && !h.object.userData.obstacleResize);
    let p = hit?.point;
    if (!p) {
      // poza ścianami — płaszczyzna tylnej ściany
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), project.space.depth * MM);
      p = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    }
    if (!p) return null;
    const onTop = hit?.face && hit.face.normal && new THREE.Vector3().copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.7;
    const at = { x: p.x / MM, y: onTop ? p.y / MM : p.y / MM - size.thickness / 2 };
    const spot = boardSpotAt(project, size, at);
    return { ...spot, depth: size.depth, thickness: size.thickness };
  }
  function showDropGhost(spot, e, kind) {
    if (!dropGhost) {
      dropGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: getSettings().highlight, transparent: true, opacity: 0.55, depthTest: false }));
      dropGhost.renderOrder = 20;
      viewer.scene.add(dropGhost);
    }
    const { space } = store.get();
    dropGhost.scale.set(spot.width * MM, spot.thickness * MM, spot.depth * MM);
    dropGhost.position.set(...toScene(spot.x + spot.width / 2, spot.y + spot.thickness / 2, spot.depth / 2, space));
    const r = viewer.container.getBoundingClientRect();
    snapTip.textContent = t('{what} {w} mm · od lewej {x} · od podłogi {y} mm', { what: kind === 'worktop' ? t('Blat') : t('Półka'), w: spot.width, x: spot.x, y: spot.y });
    snapTip.style.left = `${e.clientX - r.left + 14}px`;
    snapTip.style.top = `${e.clientY - r.top + 18}px`;
    snapTip.hidden = false;
  }
  function hideDropGhost() {
    if (dropGhost) {
      viewer.scene.remove(dropGhost);
      dropGhost.geometry.dispose();
      dropGhost.material.dispose();
      dropGhost = null;
    }
    snapTip.hidden = true;
  }
  // --- nowy korpus przeciągnięty z „+ Korpus” (menu „Dodaj” / panel) — podgląd i upuszczenie na podłodze ---
  // Korpus staje w wolnym miejscu pod kursorem; inne korpusy nie zmieniają wymiarów (model/layout.js → cabinetDropSpot).
  const CABINET_DND = 'application/x-meble-cabinet';
  const isCabinetDnd = (e) => [...(e.dataTransfer?.types ?? [])].includes(CABINET_DND);
  let cabGhost = null;
  // kursor na ścianie (tylnej / bocznej / z obrysu) — korpus wiszący na wysokości kursora; inaczej — na podłodze
  function cabinetDropAt(e) {
    setRay(e);
    if (viewer.spaceGroup) {
      const hit = raycaster.intersectObjects(viewer.spaceGroup.children, true).find((h) => h.object.isMesh && !h.object.userData.wallHandle && h.object.userData.wall);
      const tag = hit?.object.userData.wall;
      if (tag && tag !== 'floor' && tag !== 'ceiling' && tag !== 'slope') {
        const { space } = store.get();
        return { x: Math.max(0, Math.min(space.width, hit.point.x / MM)), y: hit.point.y / MM, wall: true };
      }
    }
    const p = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); // podłoga
    if (!p) return null;
    return { x: p.x / MM };
  }
  // floating — korpus „w powietrzu” (tryb wstawiania po kliknięciu „+ Korpus”): uniesiony nad podłogą, z obrysem
  const FLOAT_MM = 120;
  function showCabinetGhost(spot, e, floating = false) {
    const { space } = store.get();
    if (!cabGhost) {
      cabGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: getSettings().highlight, transparent: true, opacity: 0.45, depthTest: false }));
      cabGhost.renderOrder = 20;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x15803d, depthTest: false, transparent: true }));
      edges.renderOrder = 21;
      cabGhost.add(edges);
      viewer.scene.add(cabGhost);
    }
    const r = viewer.container.getBoundingClientRect();
    snapTip.style.left = e ? `${e.clientX - r.left + 14}px` : `${r.width / 2 - 120}px`;
    snapTip.style.top = e ? `${e.clientY - r.top + 18}px` : `${r.height - 160}px`;
    snapTip.hidden = false;
    const hint = floating ? t(' — kliknij, żeby postawić (Esc — anuluj)') : '';
    if (!spot) {
      cabGhost.visible = false;
      snapTip.textContent = floating ? t('Brak wolnego miejsca tutaj — przesuń kursor nad wolne miejsce na podłodze (Esc — anuluj)') : t('Brak wolnego miejsca tutaj');
      return;
    }
    const c = spot.cabinet;
    const legs = c.legs?.enabled ? c.legs.height : 0;
    const h = legs + c.height;
    const lift = floating && c.mount !== 'wall' ? FLOAT_MM : 0; // (wiszący — na ścianie, bez unoszenia)
    cabGhost.visible = true;
    cabGhost.scale.set(c.width * MM, h * MM, c.depth * MM);
    cabGhost.position.set(...toScene(c.x + c.width / 2, c.y + h / 2 + lift, c.z + c.depth / 2, space));
    snapTip.textContent = `${c.mount === 'wall' ? t('Korpus wiszący (spód {y} mm nad podłogą)', { y: c.y }) : t('Korpus')} ${c.width} × ${c.height} × ${c.depth} mm · ${t('od lewej {x} mm', { x: c.x })}${hint}`;
  }

  // --- tryb wstawiania (ui.placingCabinet): korpus unosi się nad podłogą i idzie za kursorem; klik stawia ---
  let placing = false;
  function startPlacing() {
    placing = true;
    const p = store.get();
    // na start — obok ostatniego korpusu (albo na środku), żeby od razu było go widać
    const right = p.furniture.length ? Math.max(...p.furniture.map((c) => c.x + c.width)) : p.space.width / 2;
    let spot = cabinetDropSpot(p, { x: Math.min(p.space.width - 100, right + 400) });
    if (!spot) spot = cabinetDropSpot(p, { x: p.space.width / 2 });
    showCabinetGhost(spot, null, true);
    el.style.cursor = 'copy';
  }
  function stopPlacing() {
    placing = false;
    hideCabinetGhost();
    el.style.cursor = '';
  }
  ui.subscribe((st) => {
    if (st.placingCabinet && !placing) startPlacing();
    else if (!st.placingCabinet && placing) stopPlacing();
  });
  const cancelPlacing = () => ui.set({ ...ui.get(), placingCabinet: false });
  document.addEventListener('keydown', (e) => {
    if (placing && e.key === 'Escape') cancelPlacing();
  });
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (!placing) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.button !== 0) return cancelPlacing();
      const at = cabinetDropAt(e);
      const res = at && addCabinetAt(store.get(), at);
      if (!res) return; // brak miejsca pod kursorem — czekamy dalej
      store.set(res.project);
      ui.set({ ...ui.get(), placingCabinet: false, selectedId: res.cabinet.id, selectedIds: [res.cabinet.id], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }, { reveal: true });
    },
    true,
  );
  el.addEventListener(
    'pointermove',
    (e) => {
      if (!placing) return;
      const at = cabinetDropAt(e);
      showCabinetGhost(at ? cabinetDropSpot(store.get(), at) : null, e, true);
    },
    true,
  );
  function hideCabinetGhost() {
    if (cabGhost) {
      viewer.scene.remove(cabGhost);
      cabGhost.geometry.dispose();
      cabGhost.material.dispose();
      cabGhost = null;
    }
    snapTip.hidden = true;
  }
  el.addEventListener('dragover', (e) => {
    if (!isCabinetDnd(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const at = cabinetDropAt(e);
    showCabinetGhost(at ? cabinetDropSpot(store.get(), at) : null, e);
  });
  el.addEventListener('dragleave', hideCabinetGhost);
  el.addEventListener('drop', (e) => {
    if (!isCabinetDnd(e)) return;
    e.preventDefault();
    hideCabinetGhost();
    const at = cabinetDropAt(e);
    const res = at && addCabinetAt(store.get(), at);
    if (!res) return;
    store.set(res.project);
    ui.set({ ...ui.get(), selectedId: res.cabinet.id, selectedIds: [res.cabinet.id], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }, { reveal: true });
  });

  el.addEventListener('dragover', (e) => {
    const kind = dndKind(e);
    if (!kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const spot = dropSpot(e, kind);
    if (spot) showDropGhost(spot, e, kind);
  });
  el.addEventListener('dragleave', hideDropGhost);
  el.addEventListener('drop', (e) => {
    const kind = dndKind(e);
    hideDropGhost();
    if (!kind) return;
    e.preventDefault();
    const project = store.get();
    const spot = dropSpot(e, kind);
    const board = createBoard(project, kind, spot ? { x: spot.x + spot.width / 2, y: spot.y } : null);
    store.set((p) => ({ ...p, boards: [...(p.boards ?? []), board] }));
    ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [`board:${board.id}`], selectedHole: null, selectedObstacle: null });
  });

  // przycisk „Otwórz szuflady” nad zaznaczonym korpusem — wszystkie fronty korpusu naraz
  viewer.container.addEventListener('click', (e) => {
    const one = e.target.closest?.('[data-open-front]');
    if (one) {
      toggleFront(one.dataset.openFront); // zaznaczony pojedynczy front
      return;
    }
    const btn = e.target.closest?.('[data-open-fronts]');
    if (!btn) return;
    const cabinetId = btn.dataset.openFronts;
    const project = store.get();
    const cab = project.furniture.find((c) => c.id === cabinetId);
    if (!cab) return;
    const ids = cabinetPanels(cab, project).filter((p) => p.valid && !p.hidden && p.key.startsWith('front-') && p.opening).map((p) => `${cabinetId}:${p.key}`);
    setFrontsOpen(ids, !ids.some(isFrontOpen));
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const moved = rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > CLICK_TOLERANCE_PX;
    rightDown = null;
    if (moved) return;
    setRay(e);
    // Prawy klik na punkcie obrysu podłogi — usuń punkt.
    const handle = pickWallHandle();
    if (handle?.type === 'point') {
      showPointMenu(handle.index, e.clientX, e.clientY);
      return;
    }
    // Prawy klik na występie ściany (kominku) — zaznaczenie i menu: rozszerz / przesuń do korpusu lub ściany.
    const wall = pickWall();
    if (wall) {
      selectWall(wall.obstacleId);
      showWallMenu(wall.obstacleId, e.clientX, e.clientY);
      return;
    }
    const hit = pickCabinet();
    if (!hit) {
      // Prawy klik w ścianę albo podłogę — skośne ściany (gotowe kształty, wyprostowanie).
      const surface = pickSurface();
      if (surface) showSurfaceMenu(surface, e.clientX, e.clientY);
      return;
    }
    // Prawy klik na dekoracji — menu: duplikuj, usuń
    if (hit.decorId) {
      const id = hit.decorId;
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [`decor:${id}`], selectedHole: null, selectedObstacle: null });
      const d = store.get().decorations.find((x) => x.id === id);
      const centerItems = ['h', 'v']
        .map((axis) => ({ axis, c: centerDecoration(store.get(), id, axis, { trimBox, boardBox }) }))
        .filter((x) => x.c)
        .map(({ axis, c }) => ({ icon: axis === 'h' ? '⇔' : '⇕', label: axis === 'h' ? t('Wyśrodkuj poziomo {what}', { what: c.label }) : t('Wyśrodkuj pionowo {what}', { what: c.label }), run: () => store.set((p) => ({ ...p, decorations: p.decorations.map((x) => (x.id === id ? { ...x, ...c.pos } : x)) })) }));
      menu.show(e.clientX, e.clientY, d?.name ?? t('Dekoracja'), [
        ...centerItems,
        { icon: '⧉', label: t('Duplikuj'), run: () => store.set((p) => ({ ...p, decorations: [...p.decorations, { ...structuredClone(d), id: crypto.randomUUID?.() ?? String(Date.now()), x: d.x + 200 }] })) },
        { icon: '🗑', label: t('Usuń'), run: () => store.set((p) => ({ ...p, decorations: p.decorations.filter((x) => x.id !== id) })) },
      ]);
      return;
    }
    // Prawy klik w otwór blatu / półki (albo płytę grzewczą w nim) — menu otworu: płyta indukcyjna / gazowa, usuń
    const holeHit = (hit.trimId || hit.boardId) && holeAt(hit);
    if (holeHit) {
      const { kind, id, index } = holeHit;
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: { kind, id, index } });
      const list = kind === 'trim' ? 'trims' : 'boards';
      const setHoles = (fn) => store.set((p) => ({ ...p, [list]: p[list].map((o) => (o.id === id ? { ...o, holes: fn(o.holes ?? []) } : o)) }));
      const h = holeHit.hole;
      const items = [];
      if (h.shape === 'rect') {
        for (const f of HOLE_FILLS) {
          items.push({ icon: (h.fill ?? null) === f.key ? '✓' : f.key === 'induction' ? '◉' : f.key === 'gas' ? '🔥' : '▢', label: f.key ? t('Wstaw: {what}', { what: f.label }) : t('Bez płyty (puste wycięcie)'), run: () => setHoles((hs) => hs.map((x, i) => (i === index ? { ...x, fill: f.key } : x))) });
        }
      } else items.push({ info: true, icon: 'ℹ', label: t('Płytę grzewczą można wstawić w otwór prostokątny.') });
      items.push({ icon: '🗑', label: t('Usuń otwór'), run: () => (setHoles((hs) => hs.filter((_, i) => i !== index)), ui.set({ ...ui.get(), selectedHole: null })) });
      menu.show(e.clientX, e.clientY, `${t('Otwór {n}', { n: index + 1 })}${h.label ? ` · ${h.label}` : ''}`, items);
      return;
    }
    // Prawy klik na blendzie (bocznej, wspólnej, blacie): menu dla zaznaczonych blend, a gdy kliknięta
    // nie jest zaznaczona — zaznaczamy tylko ją.
    const blendId = blendIdOf(hit);
    if (blendId && !blendId.endsWith(':legs')) {
      let blends = ui.get().selectedBlends ?? [];
      if (!blends.includes(blendId)) {
        blends = [blendId];
        const cabinetSel = hit.trimId ? { selectedId: null, selectedIds: [] } : { selectedId: hit.id, selectedIds: [hit.id] };
        ui.set({ ...ui.get(), ...cabinetSel, selectedFronts: [], selectedBlends: blends });
      }
      showBlendMenu(blends, e.clientX, e.clientY);
      return;
    }
    if (hit?.id && !isFront(hit)) {
      // Prawy klik na zaznaczonej płycie korpusu (np. boku wybranym z menu) — od razu jej wymiary i obrzeże.
      if (hit.panelKey && (ui.get().selectedBlends ?? []).includes(`${hit.id}:${hit.panelKey}`)) {
        showPanelInfo(hit.id, hit.panelKey, e.clientX, e.clientY);
        return;
      }
      // Prawy klik na korpusie (boku, wieńcu, półce, nóżkach…): menu korpusu — albo całej grupy, gdy kliknięty
      // korpus jest w zaznaczeniu (Ctrl + klik); inny korpus — zaznaczamy tylko jego. Na górze menu —
      // wymiary i obrzeże klikniętej płyty.
      if (!selectedCabinetIds(ui.get()).has(hit.id)) {
        ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: [], selectedBlends: [] }, { reveal: true });
      }
      showCabinetMenu(hit.id, e.clientX, e.clientY, hit.panelKey);
      return;
    }
    if (!isFront(hit)) return;
    const frontId = `${hit.id}:${hit.panelKey}`;
    let selected = ui.get().selectedFronts ?? [];
    // Prawy klik w front korpusu, w którym nie jest zaznaczony żaden front (jak przy lewym kliku: najpierw cały
    // korpus) — menu korpusu; na górze pozycja otwierająca menu klikniętego frontu.
    if (!selected.some((f) => f.startsWith(`${hit.id}:`)) && !(e.ctrlKey || e.metaKey)) {
      if (!selectedCabinetIds(ui.get()).has(hit.id)) {
        ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: [], selectedBlends: [] }, { reveal: true });
      }
      showCabinetMenu(hit.id, e.clientX, e.clientY, null, frontId);
      return;
    }
    // Prawy klik na jednym z zaznaczonych frontów — menu dla wszystkich zaznaczonych;
    // na innym froncie — zaznaczamy tylko ten.
    if (!selected.includes(frontId)) {
      selected = [frontId];
      ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: selected, selectedBlends: [] }, { reveal: true });
    }
    showFrontMenu(selected, e.clientX, e.clientY);
  });

  // Zawias drzwi: klik zaznacza go (okienko „Zawias”; drzwi zostają zaznaczone), przeciąganie przesuwa go w pionie —
  // po pionowej płaszczyźnie zwróconej do kamery przez zawias (działa też przy otwartych drzwiach).
  function startHingeDrag(hit, e) {
    const frontKeyId = `${hit.id}:${hit.hinge.key}`;
    ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: [frontKeyId], selectedBlends: [], selectedHole: null, selectedObstacle: null, selectedHinge: { cabinetId: hit.id, key: hit.hinge.key, index: hit.hinge.index } }, { reveal: true });
    const project = store.get();
    const cabinet = project.furniture.find((c) => c.id === hit.id);
    const panel = cabinet && cabinetPanels(cabinet, project).find((p) => p.key === hit.hinge.key);
    const h = panel?.hinges?.[hit.hinge.index];
    drag = { select: true };
    if (h) {
      const n = new THREE.Vector3();
      viewer.camera.getWorldDirection(n);
      n.y = 0;
      if (n.lengthSq() < 1e-6) n.set(0, 0, -1);
      n.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (start) drag = { hingeOf: { cabinetId: hit.id, key: hit.hinge.key, index: hit.hinge.index, fromY: h.y - panel.y }, plane, startY: start.y };
    }
    viewer.controls.enabled = false;
    el.setPointerCapture(e.pointerId);
  }

  // Faza przechwytywania: działa przed OrbitControls, więc możemy je wyłączyć,
  // zanim zaczną obracać widok.
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      setRay(e);
      // Zawias drzwi (kółko / puszka) — przed innymi uchwytami (granice szuflad, wymiary), żeby dało się go chwycić.
      if (!(e.ctrlKey || e.metaKey)) {
        const hingeHit = pickCabinet();
        if (hingeHit?.hinge) return startHingeDrag(hingeHit, e);
      }
      // Uchwyt kształtu ściany (narożnik podłogi albo koniec skośnej ściany) — przeciąganie po podłodze.
      const wallHandle = pickWallHandle();
      // uchwyt wysokości zaznaczonej płyty — przeciąganie w pionie
      const lift = pickBoardLift();
      if (lift) {
        const board = store.get().boards.find((b) => b.id === lift.id);
        const plane = dragPlane(lift.point, true);
        if (board) {
          drag = { boardMove: { id: board.id, from: { x: board.x, y: board.y, z: board.z }, start: lift.point, vertical: true, lift: true, held: {} }, plane };
          viewer.controls.enabled = false;
          el.setPointerCapture(e.pointerId);
          return;
        }
      }
      // kółko wymiaru zaznaczonego występu ściany / okapu
      const obstacleHandle = pickObstacleResize();
      if (obstacleHandle) {
        drag = startObstacleResize(obstacleHandle);
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      // kółko na granicy frontów (styk szuflad, granica sekcji) — zmiana wysokości sąsiednich części
      const boundary = pickFrontBoundary();
      if (boundary) {
        drag = startFrontBoundary(boundary);
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      // kółko wymiaru zaznaczonego korpusu (bok, wierzch, przód) — zmiana szerokości / wysokości / głębokości
      const resize = pickResizeHandle();
      if (resize) {
        drag = startCabinetResize(resize);
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (wallHandle?.type === 'wall') {
        drag = startWallMove(wallHandle);
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (wallHandle) {
        drag = { wallHandle: startWallHandle(wallHandle), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) };
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      // Występ ściany: klik zaznacza, przeciąganie krawędzi zmienia szerokość, środka — przesuwa.
      const wall = pickWall();
      if (wall) {
        selectWall(wall.obstacleId);
        const o = store.get().space.obstacles.find((x) => x.id === wall.obstacleId);
        drag = {
          wall: { obstacleId: o.id, mode: wall.mode, from: { x: o.x, width: o.width, z: o.z, depth: o.depth }, start: wall.point.clone() },
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), wall.point), // poziomo
        };
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      // (zaznaczony okap / występ znika dopiero przy kliknięciu w coś innego — samo obracanie widoku go nie odznacza;
      //  klik w puste miejsce — po puszczeniu przycisku, bez ruchu)
      let hit = pickCabinet();
      if (!hit) return;
      if (ui.get().selectedObstacle) ui.set({ ...ui.get(), selectedObstacle: null });
      if (hit.hinge && !(e.ctrlKey || e.metaKey)) return startHingeDrag(hit, e);
      // klik w coś innego niż zawias — zawias przestaje być zaznaczony
      if (ui.get().selectedHinge) ui.set({ ...ui.get(), selectedHinge: null });
      // Klik w front (szufladę, drzwi): pierwszy — zaznacza cały korpus (przeciąganie przesuwa korpus), drugi — gdy
      // korpus jest już zaznaczony albo zaznaczony jest jego front — sam front. Alt + klik — zawsze cały korpus.
      if (isFront(hit) && !(e.ctrlKey || e.metaKey)) {
        const st = ui.get();
        const cabinetPicked = selectedCabinetIds(st).has(hit.id);
        const frontPicked = (st.selectedFronts ?? []).some((f) => f.startsWith(`${hit.id}:`));
        if (e.altKey || (!cabinetPicked && !frontPicked)) hit = { ...hit, panelKey: null, handle: false, wholeCabinet: true };
      }
      // klik w coś innego niż płyta z otworami — otwór przestaje być zaznaczony
      if (ui.get().selectedHole && !hit.trimId && !hit.boardId) ui.set({ ...ui.get(), selectedHole: null });

      // Kliknięty front jest zaznaczony osobno (Delete usuwa wtedy tylko fronty); z Ctrl — dodawany do
      // zaznaczenia albo z niego usuwany (bez przeciągania).
      const selectedPart = isFront(hit) ? hit.panelKey : null;
      const frontId = selectedPart ? `${hit.id}:${selectedPart}` : null;
      const blendId = blendIdOf(hit);
      const selectOnly = () => {
        drag = { select: true }; // tylko zaznaczenie — bez obracania widoku i przesuwania
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      };
      if (hit.decorId) {
        // dekoracja: klik zaznacza, przeciąganie przesuwa (po podłodze, z Shift — w pionie; okno / obraz — po ścianie)
        const d = (store.get().decorations ?? []).find((x) => x.id === hit.decorId);
        ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [`decor:${hit.decorId}`], selectedHole: null, selectedObstacle: null });
        if (d) {
          const onWall = decorType(d.type).place === 'wall';
          const plane = onWall ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z) : dragPlane(hit.point, e.shiftKey);
          const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
          if (start) {
            drag = { decorMove: { id: d.id, from: { x: d.x, y: d.y, z: d.z }, start, axes: onWall ? ['x', 'y'] : e.shiftKey ? ['y'] : ['x', 'z'] }, plane };
            viewer.controls.enabled = false;
            el.setPointerCapture(e.pointerId);
          }
        }
        return;
      }
      if (hit.trimId || hit.boardId) {
        // Blenda wspólna (dolna, górna), blat albo samodzielna płyta: klik zaznacza ją (z Ctrl — dodaje / usuwa
        // z zaznaczenia). Chwycenie płyty tuż przy otworze — przesuwanie otworu.
        const state = ui.get();
        const grabbed = !(e.ctrlKey || e.metaKey) && holeAt(hit);
        if (grabbed) {
          // klik / chwycenie przy otworze — zaznaczony jest sam otwór (nie cała płyta)
          const selectedHole = { kind: grabbed.kind, id: grabbed.id, index: grabbed.index };
          ui.set({ ...state, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole });
        } else {
          const blends = e.ctrlKey || e.metaKey ? toggleIn(state.selectedBlends ?? [], blendId) : [blendId];
          const keepCabinets = e.ctrlKey || e.metaKey ? {} : { selectedId: null, selectedIds: [], selectedFronts: [] };
          ui.set({ ...state, ...keepCabinets, selectedBlends: blends, selectedHole: null });
        }
        if (grabbed) {
          drag = {
            hole: { kind: grabbed.kind, id: grabbed.id, index: grabbed.index, box: grabbed.box, grab: { u: grabbed.u - grabbed.hole.x, v: grabbed.v - grabbed.hole.y } },
            plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), // poziomo, na wierzchu płyty
          };
          viewer.controls.enabled = false;
          el.setPointerCapture(e.pointerId);
          return;
        }
        if (hit.boardId && !(e.ctrlKey || e.metaKey)) {
          // samodzielna płyta: przeciąganie przesuwa ją (po podłodze, z Shift — w pionie)
          const board = store.get().boards.find((b) => b.id === hit.boardId);
          const plane = dragPlane(hit.point, e.shiftKey);
          const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
          if (board && start) {
            drag = { boardMove: { id: board.id, from: { x: board.x, y: board.y, z: board.z }, start, vertical: e.shiftKey, held: {} }, plane };
            viewer.controls.enabled = false;
            el.setPointerCapture(e.pointerId);
            return;
          }
        }
        selectOnly();
        return;
      }
      if (blendId && (e.ctrlKey || e.metaKey)) {
        // Ctrl + klik w blendę boczną — dodaje ją do zaznaczenia blend albo z niego usuwa.
        ui.set({ ...ui.get(), selectedBlends: toggleIn(ui.get().selectedBlends ?? [], blendId) });
        selectOnly();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl + klik: korpus dodawany do zaznaczenia albo z niego usuwany (wymiary liczą się dla całej
        // grupy); kliknięty front — tak samo w zaznaczeniu frontów.
        const state = ui.get();
        const current = state.selectedFronts ?? [];
        const fronts = !frontId ? current : current.includes(frontId) ? current.filter((f) => f !== frontId) : [...current, frontId];
        // front zaznaczony / odznaczony razem z korpusem
        const inGroup = selectedCabinetIds(state).has(hit.id);
        const frontAdded = frontId && fronts.includes(frontId);
        const cabinets = inGroup && frontAdded ? { selectedId: hit.id, selectedIds: [...selectedCabinetIds(state)] } : toggleCabinet(state, hit.id);
        ui.set({ ...state, ...cabinets, selectedFronts: fronts }, { reveal: true });
        drag = { select: true }; // tylko zaznaczenie — bez obracania widoku i przesuwania
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      // Klik w płytę już zaznaczonego korpusu (bok, wieniec, półka…) — zaznacza samą tę płytę (po puszczeniu
      // przycisku, bez ruchu); klik w zaznaczoną płytę — z powrotem cały korpus. Przeciąganie dalej przesuwa
      // korpus (półkę), więc zaznaczenia przy wciśnięciu nie zmieniamy.
      const before = ui.get();
      const bodyPanel = !!hit.panelKey && !frontId && !blendId;

      const drill =
        bodyPanel && before.selectedId === hit.id && selectedCabinetIds(before).size === 1
          ? { cabinetId: hit.id, panelKey: hit.panelKey, again: (before.selectedBlends ?? []).includes(`${hit.id}:${hit.panelKey}`) }
          : null;
      if (hit.wholeCabinet && selectedCabinetIds(before).has(hit.id) && !(before.selectedFronts ?? []).length) {
        // (Alt + klik w korpus z zaznaczonej grupy — grupa zostaje)
      } else if (!drill) {
        ui.set(
          { ...before, selectedId: hit.id, selectedIds: [hit.id], selectedFronts: frontId ? [frontId] : [], selectedBlends: blendId ? [blendId] : [] },
          { reveal: true },
        );
      }
      const project = store.get();
      const cabinet = project.furniture.find((c) => c.id === hit.id);
      const shelfHit = isShelf(hit);
      const plane = dragPlane(hit.point, e.shiftKey || shelfHit);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!cabinet || !start) return;

      if (frontId && hit.handle && !e.shiftKey && !isFrontOpen(frontId)) {
        // Uchwyt zamkniętego frontu: przeciąganie przesuwa uchwyt po licu (oba wymiary położenia uchwytu
        // w karcie korpusu); dotyczy wszystkich frontów korpusu, jak ustawienie w panelu.
        const panel = cabinetPanels(cabinet, project).find((p) => p.key === hit.panelKey);
        const faceZ = (panel.z + panel.depth - project.space.depth) * MM;
        const facePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -faceZ);
        const hold = raycaster.ray.intersectPlane(facePlane, new THREE.Vector3());
        if (!hold) return;
        // przesunięcie kursora względem środka uchwytu — uchwyt nie „skacze” do kursora
        const holes = panel.handle?.holes ?? [];
        const mid = holes.reduce((a, h) => ({ x: a.x + h.x / holes.length, y: a.y + h.y / holes.length }), { x: 0, y: 0 });
        drag = { handleOf: { cabinetId: cabinet.id, key: hit.panelKey }, plane: facePlane, grab: { x: hold.x / MM - mid.x, y: hold.y / MM - mid.y } };
      } else if (frontId && !e.shiftKey) {
        // Front: przeciągnięcie otwiera albo zamyka go (zamiast przesuwać korpus); samo kliknięcie — tylko zaznacza.
        drag = { frontId, x: e.clientX, y: e.clientY, toggled: false };
      } else if (shelfHit) {
        // Półka: przeciąganie w górę / w dół zmienia jej wysokość (od tej chwili — ustawioną ręcznie).
        const shelf = cabinet.shelves.find((s) => shelfKey(s) === hit.panelKey);
        const panels = cabinetPanels(cabinet, project);
        const panel = panels.find((p) => p.key === hit.panelKey);
        const base = cabinet.y + legHeight(cabinet);
        const bottom = panels.find((p) => p.key === 'bottom');
        const t = panel.height;
        const y = panel.y - base;
        // Półka porusza się między sąsiednimi półkami (nie przechodzi przez nie), a skrajne — do wieńców.
        const others = panels.filter((p) => p.key.startsWith('shelf-') && p.key !== hit.panelKey).map((p) => [p.y - base, p.y - base + p.height]);
        const below = others.filter(([, top]) => top <= y + 0.5).map(([, top]) => top);
        const above = others.filter(([bot]) => bot >= y + t - 0.5).map(([bot]) => bot);
        drag = {
          id: hit.id,
          shelfId: shelf.id,
          plane,
          start,
          from: { y },
          // od wieńca dolnego do wieńca górnego (górna półka pod skosem jest docinana)
          minY: Math.max(bottom ? bottom.y + bottom.height - base : 0, ...below),
          maxY: Math.min(cabinet.height - 2 * t, ...above.map((b) => b - t)),
        };
      } else {
        // szafka wisząca: przesuwa się po ścianie (lewo-prawo, góra-dół) — płaszczyzna równoległa do tylnej ściany
        // przez punkt chwytu; z Shift — tylko w pionie, jak inne
        const onWall = cabinet.mount === 'wall' && !e.shiftKey;
        const wallPlane = onWall ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z) : null;
        const wallStart = wallPlane ? raycaster.ray.intersectPlane(wallPlane, new THREE.Vector3()) : null;
        drag = onWall && wallStart
          ? { id: hit.id, plane: wallPlane, start: wallStart, from: { x: cabinet.x, y: cabinet.y, z: cabinet.z }, vertical: false, onWall: true }
          : { id: hit.id, plane, start, from: { x: cabinet.x, y: cabinet.y, z: cabinet.z }, vertical: e.shiftKey };
      }
      if (drill) drag.drill = drill;
      viewer.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    },
    true,
  );

  el.addEventListener('pointermove', (e) => {
    setRay(e);
    if (placing) return; // (tryb wstawiania korpusu — wyżej)
    if (!drag) {
      if (pickBoardLift()) {
        el.style.cursor = 'ns-resize';
        return;
      }
      const hoverObstacle = pickObstacleResize();
      if (hoverObstacle) {
        el.style.cursor = hoverObstacle.face === 'top' || hoverObstacle.face === 'bottom' ? 'ns-resize' : 'ew-resize';
        return;
      }
      if (pickFrontBoundary()) {
        el.style.cursor = 'ns-resize';
        return;
      }
      const hoverResize = pickResizeHandle();
      if (hoverResize) {
        el.style.cursor = hoverResize.face === 'top' ? 'ns-resize' : 'ew-resize';
        return;
      }
      const hoverHandle = pickWallHandle();
      if (hoverHandle) {
        el.style.cursor = hoverHandle.type === 'wall' ? (hoverHandle.wall === 'ceiling' ? 'ns-resize' : 'ew-resize') : 'move';
        return;
      }
      const wallHover = pickWall();
      if (wallHover) {
        el.style.cursor = wallHover.mode === 'move' ? 'grab' : 'ew-resize';
        return;
      }
      const hover = pickCabinet();
      el.style.cursor =
        hover?.hinge ? 'ns-resize' : hover?.handle || holeAt(hover) ? 'move' : isShelf(hover) ? 'ns-resize' : isFront(hover) || hover?.trimId ? 'pointer' : hover ? 'grab' : '';
      return;
    }
    if (drag.select) return; // Ctrl + klik na froncie — tylko zaznaczanie
    if (drag.boardMove) {
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragBoard(pt, e);
      return;
    }
    if (drag.decorMove) {
      const m = drag.decorMove;
      // przyciąganie do powierzchni pod kursorem (bez Alt i Shift): ściana / podłoga, mebel, blat / sufit
      if (!e.altKey && !e.shiftKey) {
        const snapped = decorSurfaceSnap(m.id);
        if (snapped) {
          store.set((p) => ({ ...p, decorations: p.decorations.map((x) => (x.id === m.id ? { ...x, ...snapped.pos } : x)) }));
          const r = viewer.container.getBoundingClientRect();
          snapTip.textContent = `🧲 ${snapped.label}`;
          snapTip.style.left = `${e.clientX - r.left + 14}px`;
          snapTip.style.top = `${e.clientY - r.top + 18}px`;
          snapTip.hidden = false;
          el.style.cursor = 'grabbing';
          return;
        }
      }
      snapTip.hidden = true;
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!pt) return;
      const dlt = pt.clone().sub(m.start).divideScalar(MM);
      const pos = { ...m.from };
      for (const a of m.axes) pos[a] = Math.round((m.from[a] + dlt[a]) / (e.altKey ? 1 : 10)) * (e.altKey ? 1 : 10);
      if (m.axes.includes('y')) pos.y = Math.max(0, pos.y);
      store.set((p) => ({ ...p, decorations: p.decorations.map((x) => (x.id === m.id ? { ...x, ...pos } : x)) }));
      el.style.cursor = 'grabbing';
      return;
    }
    if (drag.obstacleResize) {
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragObstacleResize(pt, e);
      return;
    }
    if (drag.boundary) {
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragFrontBoundary(pt, e);
      return;
    }
    if (drag.resize) {
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragCabinetResize(pt, e);
      return;
    }
    if (drag.wallMove) {
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragWallMove(pt, e);
      return;
    }
    if (drag.wallHandle) {
      el.style.cursor = 'move';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragOutlinePoint(pt, e.altKey);
      return;
    }
    if (drag.wall) {
      el.style.cursor = drag.wall.mode === 'move' ? 'grabbing' : 'ew-resize';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragWall(pt, e.altKey, e);
      return;
    }
    if (drag.hole) {
      el.style.cursor = 'move';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragHole(pt);
      return;
    }
    if (drag.hingeOf) {
      el.style.cursor = 'ns-resize';
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK_TOLERANCE_PX) return; // (sam klik — bez przesuwania)
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!pt) return;
      const { cabinetId, key, index, fromY } = drag.hingeOf;
      const y = fromY + (pt.y - drag.startY) / MM;
      store.set((prj) => ({ ...prj, furniture: prj.furniture.map((c) => (c.id === cabinetId ? moveHinge(c, key, index, y, prj) : c)) }));
      return;
    }
    if (drag.handleOf) {
      el.style.cursor = 'move';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!pt) return;
      store.set((prj) => ({
        ...prj,
        furniture: prj.furniture.map((c) => {
          if (c.id !== drag.handleOf.cabinetId) return c;
          const panel = cabinetPanels(c, prj).find((p) => p.key === drag.handleOf.key);
          if (!panel) return c;
          // nowy środek uchwytu (względem lewego dolnego narożnika frontu), w granicach frontu
          const cx = Math.min(panel.width, Math.max(0, pt.x / MM - drag.grab.x - panel.x));
          const cy = Math.min(panel.height, Math.max(0, pt.y / MM - drag.grab.y - panel.y));
          const off = handleOffsetsFor(c.fronts.handle, panel, cx, cy);
          return { ...c, fronts: { ...c.fronts, handle: { ...c.fronts.handle, ...off } } };
        }),
      }));
      return;
    }
    if (drag.frontId) {
      // pierwszy wyraźny ruch przełącza front (raz na jedno przeciągnięcie)
      if (!drag.toggled && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > CLICK_TOLERANCE_PX * 2) {
        drag.toggled = true;
        toggleFront(drag.frontId);
      }
      return;
    }
    el.style.cursor = drag.shelfId ? 'ns-resize' : 'grabbing';
    const p = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!p) return;
    const d = p.sub(drag.start).divideScalar(MM);
    if (drag.shelfId) {
      dragShelf(d.y);
      return;
    }

    const project = store.get();
    const axes = drag.vertical ? ['y'] : drag.onWall ? ['x', 'y'] : ['x', 'z'];
    let pos = { ...drag.from };
    for (const a of axes) pos[a] = Math.round(drag.from[a] + d[a]);
    if (!e.altKey) {
      const snapped = snapCabinet(project, drag.id, pos, axes, { threshold: snapThresholdMm(drag.start), hold: drag.snapHold ?? {} });
      pos = snapped.pos;
      // nowe przyciągnięcie — krótki „klik” wizualny (podpowiedź) i zapamiętanie celu (magnes trzyma)
      drag.snapHold = snapped.snaps;
      showSnapTip(snapped.snaps, e);
    } else {
      drag.snapHold = {};
      snapTip.hidden = true;
    }

    store.set((prj) => ({
      ...prj,
      furniture: prj.furniture.map((c) => (c.id === drag.id ? { ...c, ...pos } : c)),
    }));
  });

  // Podwójny klik: przybliżenie do klikniętego miejsca (mebel, ściana, podłoga) — ono staje się też środkiem
  // obrotu widoku. Kolejny podwójny klik przybliża jeszcze bardziej.
  el.addEventListener('dblclick', (e) => {
    setRay(e);
    const hit = viewer.spaceGroup && raycaster.intersectObjects(viewer.spaceGroup.children, true).find((h) => h.object.isMesh);
    if (hit) viewer.focusAt(hit.point);
  });

  el.addEventListener('pointerup', (e) => {
    snapTip.hidden = true;
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX;
    if (drag?.decorMove) snapTip.hidden = true;
    if (drag?.resize || drag?.boundary || drag?.obstacleResize || drag?.boardMove || drag?.decorMove) {
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
      down = null;
      return;
    }
    if (drag?.wallMove) {
      // ściana z kształtu podłogi — porządek w punktach (np. kształt wrócił do prostokąta)
      const { space } = store.get();
      if (drag.wallMove.wall.startsWith('edge:') && space.outline) {
        const next = cleanOutline(space.outline, space);
        if (JSON.stringify(next) !== JSON.stringify(space.outline)) setOutline(next);
      }
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
      down = null;
      return;
    }
    if (drag?.wallHandle) {
      endWallHandle();
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
      down = null;
      return;
    }
    if (drag) {
      // klik (bez ruchu) w płytę zaznaczonego korpusu — zaznaczenie samej płyty albo z powrotem korpusu
      if (drag.drill && !moved) {
        const { cabinetId, panelKey, again } = drag.drill;
        if (again) ui.set({ ...ui.get(), selectedId: cabinetId, selectedIds: [cabinetId], selectedFronts: [], selectedBlends: [] });
        else selectPanel(cabinetId, panelKey);
      }
      el.style.cursor = drag.shelfId ? 'ns-resize' : drag.frontId ? 'pointer' : 'grab';
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
    } else if (down && !moved && e.button === 0) {
      // klik w ścianę / podłogę (bez przeciągania) — okienko przestrzeni; w tło poza pokojem — tylko odznacza
      setRay(e);
      const surface = pickSurface();
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null, ...(surface ? { spaceOpen: true, panelWin: null } : {}) });
    }
    down = null;
  });
}
