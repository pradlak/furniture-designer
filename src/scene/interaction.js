import * as THREE from 'three';
import { MM } from './units.js';
import { snapPosition } from '../model/placement.js';
import { cabinetPanels, legHeight, shelfKey, setShelfY } from '../model/furniture.js';
import { createContextMenu } from '../ui/contextMenu.js';
import { selectedCabinetIds, toggleCabinet } from '../state/selection.js';

const CLICK_TOLERANCE_PX = 4;

// Obsługa myszy w widoku 3D:
//  - klik w korpus zaznacza go, klik w puste miejsce odznacza,
//  - przeciąganie korpusu przesuwa go po podłodze (X/Z),
//    z Shift — w pionie (Y), z Alt — bez przyciągania do ścian i innych mebli,
//  - przeciąganie półki w górę / w dół zmienia jej wysokość w korpusie,
//  - przeciągnięcie frontu otwiera go albo zamyka (płynnie); klik w front — zaznacza sam front,
//    Ctrl + klik — zaznaczanie kilku frontów, prawy klik w front — menu akcji dla zaznaczonych
//    (otwórz / zamknij, ukryj),
//    a korpus z frontem przesuwa się z Shift (w pionie) albo chwytając za inną płytę,
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
      while (o && !o.userData.cabinetId && !o.userData.trimId) {
        panelKey ??= o.userData.panelKey ?? null;
        o = o.parent;
      }
      if (o?.userData.trimId) return { trimId: o.userData.trimId, point: hit.point }; // blenda wspólna / blat
      if (o) return { id: o.userData.cabinetId, panelKey, point: hit.point };
    }
    return null;
  }

  const isShelf = (hit) => hit?.panelKey?.startsWith('shelf-');
  const isFront = (hit) => hit?.panelKey?.startsWith('front-');
  // Zaznaczany element (poza frontami): blenda boczna (płyta korpusu z grupy „blend”: „idKorpusu:klucz”),
  // nóżki korpusu („idKorpusu:legs” — wszystkie naraz) albo blenda wspólna / blat („trim:id”).
  const blendIdOf = (hit) => {
    if (hit?.trimId) return `trim:${hit.trimId}`;
    if (!hit?.panelKey) return null;
    if (hit.panelKey.startsWith('leg-')) return `${hit.id}:legs`; // wszystkie nóżki korpusu naraz
    const cabinet = store.get().furniture.find((c) => c.id === hit.id);
    const panel = cabinet && cabinetPanels(cabinet, store.get()).find((p) => p.key === hit.panelKey);
    return panel?.group === 'blend' ? `${hit.id}:${hit.panelKey}` : null;
  };
  const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

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
    if (openCount < ids.length) items.push({ icon: '⇤', label: `${drawers ? 'Wysuń' : 'Otwórz'}${all}`, run: () => setFrontsOpen(ids, true) });
    if (openCount > 0) items.push({ icon: '⇥', label: `${drawers ? 'Wsuń' : 'Zamknij'}${all}`, run: () => setFrontsOpen(ids, false) });
    items.push({
      icon: '👁',
      label: `Ukryj${all}`,
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
    const title = many ? `Zaznaczone fronty: ${fronts.length}` : fronts[0].panel.name;
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
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const moved = rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > CLICK_TOLERANCE_PX;
    rightDown = null;
    if (moved) return;
    setRay(e);
    const hit = pickCabinet();
    if (!isFront(hit)) return;
    // Prawy klik na jednym z zaznaczonych frontów — menu dla wszystkich zaznaczonych;
    // na innym froncie — zaznaczamy tylko ten.
    const frontId = `${hit.id}:${hit.panelKey}`;
    let selected = ui.get().selectedFronts ?? [];
    if (!selected.includes(frontId)) {
      selected = [frontId];
      ui.set({ ...ui.get(), selectedId: hit.id, selectedFronts: selected }, { reveal: true });
    }
    showFrontMenu(selected, e.clientX, e.clientY);
  });

  // Faza przechwytywania: działa przed OrbitControls, więc możemy je wyłączyć,
  // zanim zaczną obracać widok.
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      setRay(e);
      const hit = pickCabinet();
      if (!hit) return;

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
      if (hit.trimId) {
        // Blenda wspólna (dolna, górna) albo blat: klik zaznacza ją (z Ctrl — dodaje / usuwa z zaznaczenia).
        const state = ui.get();
        const blends = e.ctrlKey || e.metaKey ? toggleIn(state.selectedBlends ?? [], blendId) : [blendId];
        const keepCabinets = e.ctrlKey || e.metaKey ? {} : { selectedId: null, selectedIds: [], selectedFronts: [] };
        ui.set({ ...state, ...keepCabinets, selectedBlends: blends });
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
      ui.set(
        { ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: frontId ? [frontId] : [], selectedBlends: blendId ? [blendId] : [] },
        { reveal: true },
      );
      const project = store.get();
      const cabinet = project.furniture.find((c) => c.id === hit.id);
      const shelfHit = isShelf(hit);
      const plane = dragPlane(hit.point, e.shiftKey || shelfHit);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!cabinet || !start) return;

      if (frontId && !e.shiftKey) {
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
      el.style.cursor = isShelf(hover) ? 'ns-resize' : isFront(hover) || hover?.trimId ? 'pointer' : hover ? 'grab' : '';
      return;
    }
    if (drag.select) return; // Ctrl + klik na froncie — tylko zaznaczanie
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
      el.style.cursor = drag.shelfId ? 'ns-resize' : drag.frontId ? 'pointer' : 'grab';
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
    } else if (down && !moved && e.button === 0) {
      ui.set({ ...ui.get(), selectedId: null, selectedFronts: [], selectedBlends: [] }); // klik w puste miejsce
    }
    down = null;
  });
}
