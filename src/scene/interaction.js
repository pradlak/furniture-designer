import * as THREE from 'three';
import { MM } from './units.js';
import { snapPosition } from '../model/placement.js';
import { cabinetPanels, legHeight, shelfKey, setShelfY } from '../model/furniture.js';

const CLICK_TOLERANCE_PX = 4;

// Obsługa myszy w widoku 3D:
//  - klik w korpus zaznacza go, klik w puste miejsce odznacza,
//  - przeciąganie korpusu przesuwa go po podłodze (X/Z),
//    z Shift — w pionie (Y), z Alt — bez przyciągania do ścian i innych mebli,
//  - przeciąganie półki w górę / w dół zmienia jej wysokość w korpusie,
//  - przeciąganie poza korpusem obraca widok jak dotąd.
export function attachCabinetInteraction(viewer, store, ui) {
  const el = viewer.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  let down = null;

  function setRay(e) {
    const r = el.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, viewer.camera);
  }

  // Trafiony korpus i płyta (panelKey, np. „shelf-…” — półkę przeciąga się w pionie).
  function pickCabinet() {
    if (!viewer.furnitureGroup) return null;
    const hits = raycaster.intersectObjects(viewer.furnitureGroup.children, true).filter((h) => h.object.isMesh);
    for (const hit of hits) {
      let o = hit.object;
      let panelKey = null;
      while (o && !o.userData.cabinetId) {
        panelKey ??= o.userData.panelKey ?? null;
        o = o.parent;
      }
      if (o) return { id: o.userData.cabinetId, panelKey, point: hit.point };
    }
    return null;
  }

  const isShelf = (hit) => hit?.panelKey?.startsWith('shelf-');

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

  // Faza przechwytywania: działa przed OrbitControls, więc możemy je wyłączyć,
  // zanim zaczną obracać widok.
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      setRay(e);
      const hit = pickCabinet();
      if (!hit) return;

      ui.set({ ...ui.get(), selectedId: hit.id }, { reveal: true });
      const project = store.get();
      const cabinet = project.furniture.find((c) => c.id === hit.id);
      const shelfHit = isShelf(hit);
      const plane = dragPlane(hit.point, e.shiftKey || shelfHit);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!cabinet || !start) return;

      if (shelfHit) {
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
        drag = { id: hit.id, plane, start, from: { x: cabinet.x, y: cabinet.y, z: cabinet.z }, vertical: e.shiftKey };
      }
      viewer.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    },
    true,
  );

  el.addEventListener('pointermove', (e) => {
    setRay(e);
    if (!drag) {
      const hover = pickCabinet();
      el.style.cursor = isShelf(hover) ? 'ns-resize' : hover ? 'grab' : '';
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
    const axes = drag.vertical ? ['y'] : ['x', 'z'];
    let pos = { ...drag.from };
    for (const a of axes) pos[a] = Math.round(drag.from[a] + d[a]);
    if (!e.altKey) pos = snapPosition(project, drag.id, pos, axes);

    store.set((prj) => ({
      ...prj,
      furniture: prj.furniture.map((c) => (c.id === drag.id ? { ...c, ...pos } : c)),
    }));
  });

  el.addEventListener('pointerup', (e) => {
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX;
    if (drag) {
      el.style.cursor = drag.shelfId ? 'ns-resize' : 'grab';
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
    } else if (down && !moved && e.button === 0) {
      ui.set({ ...ui.get(), selectedId: null }); // klik w puste miejsce
    }
    down = null;
  });
}
