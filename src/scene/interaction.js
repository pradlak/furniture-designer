import * as THREE from 'three';
import { MM } from './units.js';
import { snapPosition } from '../model/placement.js';

const CLICK_TOLERANCE_PX = 4;

// Obsługa myszy w widoku 3D:
//  - klik w korpus zaznacza go, klik w puste miejsce odznacza,
//  - przeciąganie korpusu przesuwa go po podłodze (X/Z),
//    z Shift — w pionie (Y), z Alt — bez przyciągania do ścian i innych mebli,
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

  function pickCabinet() {
    if (!viewer.furnitureGroup) return null;
    const hits = raycaster.intersectObjects(viewer.furnitureGroup.children, true).filter((h) => h.object.isMesh);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.cabinetId) o = o.parent;
      if (o) return { id: o.userData.cabinetId, point: hit.point };
    }
    return null;
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
      const cabinet = store.get().furniture.find((c) => c.id === hit.id);
      const plane = dragPlane(hit.point, e.shiftKey);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!cabinet || !start) return;

      drag = { id: hit.id, plane, start, from: { x: cabinet.x, y: cabinet.y, z: cabinet.z }, vertical: e.shiftKey };
      viewer.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    },
    true,
  );

  el.addEventListener('pointermove', (e) => {
    setRay(e);
    if (!drag) {
      el.style.cursor = pickCabinet() ? 'grab' : '';
      return;
    }
    el.style.cursor = 'grabbing';
    const p = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!p) return;
    const d = p.sub(drag.start).divideScalar(MM);

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
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
    } else if (down && !moved && e.button === 0) {
      ui.set({ ...ui.get(), selectedId: null }); // klik w puste miejsce
    }
    down = null;
  });
}
