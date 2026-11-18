import * as THREE from 'three';
import { MM } from './units.js';
import {
  snapPosition,
  obstacleNeighbour,
  extendObstacle,
  slideObstacle,
  snapObstacleEdge,
  obstacleWithoutCollisions,
  slideTarget,
  slideCabinets,
  extendCabinet,
  duplicateCabinet,
} from '../model/placement.js';
import { cabinetPanels, legHeight, shelfKey, setShelfY, handleOffsetsFor, fitCabinetToSpace } from '../model/furniture.js';
import { createContextMenu } from '../ui/contextMenu.js';
import { selectedCabinetIds, toggleCabinet } from '../state/selection.js';
import { COLOR_PRESETS } from '../model/materials.js';
import { WALL_DECORS } from '../model/space.js';
import { resolveHoles } from '../model/boardFeatures.js';
import { FRONT_DECORS, decorPreviewSvg } from '../model/decor.js';

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
      let slab = null; // płyta z otworami (blat, półka) — do przesuwania otworów
      const handle = !!o.userData.handle; // trafiony uchwyt frontu
      while (o && !o.userData.cabinetId && !o.userData.trimId && !o.userData.boardId) {
        panelKey ??= o.userData.panelKey ?? null;
        slab ??= o.userData.slab ?? null;
        o = o.parent;
      }
      if (o) slab ??= o.userData.slab ?? null;
      if (o?.userData.boardId) return { boardId: o.userData.boardId, point: hit.point, slab }; // samodzielny blat / półka
      if (o?.userData.trimId) return { trimId: o.userData.trimId, point: hit.point, slab }; // blenda wspólna / blat
      if (o) return { id: o.userData.cabinetId, panelKey, point: hit.point, handle };
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
      ['left', 'w lewo', '⇤', '←'],
      ['right', 'w prawo', '⇥', '→'],
    ];
    for (const [side, dir, extendIcon] of sides) {
      const n = obstacleNeighbour(project, obstacleId, side);
      if (n?.gap >= 0.5) items.push({ icon: extendIcon, label: `Rozszerz ${dir} do ${n.label} (+${Math.round(n.gap)} mm)`, run: () => store.set((p) => extendObstacle(p, obstacleId, side)) });
    }
    for (const [side, dir, , moveIcon] of sides) {
      const n = obstacleNeighbour(project, obstacleId, side);
      if (n?.gap >= 0.5) items.push({ icon: moveIcon, label: `Przesuń ${dir} do ${n.label} (${Math.round(n.gap)} mm)`, run: () => store.set((p) => slideObstacle(p, obstacleId, side)) });
    }
    // Kolizja z korpusami — zmniejszenie występu (na górze menu, bo to zwykle o to chodzi)
    const fix = obstacleWithoutCollisions(project, obstacleId);
    if (fix) {
      const who = fix.names.length === 1 ? `korpusem „${fix.names[0]}”` : `${fix.names.length} korpusami`;
      items.unshift({ icon: '⚠', label: `Zmniejsz, żeby nie kolidował z ${who} (−${fix.removed} mm)`, run: () => store.set((p) => obstacleWithoutCollisions(p, obstacleId)?.project ?? p) });
    }
    if (!items.length) items.push({ icon: '·', label: 'Dotyka z obu stron — nie ma dokąd rozszerzyć', run: () => {} });
    items.push({
      icon: '🔥',
      label: 'Wygląd (kominek, telewizor)…',
      submenu: () => ({
        title: `Wygląd: ${o.name || 'występ ściany'}`,
        items: WALL_DECORS.map((d) => ({
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
    items.push({ icon: '⚙', label: 'Wymiary i położenie…', run: () => ui.set({ ...ui.get(), selectedObstacle: obstacleId }, { revealObstacle: true }) });
    items.push({
      icon: '✕',
      label: 'Usuń',
      run: () => {
        ui.set({ ...ui.get(), selectedObstacle: null });
        store.set((p) => ({ ...p, space: { ...p.space, obstacles: p.space.obstacles.filter((x) => x.id !== obstacleId) } }));
      },
    });
    menu.show(clientX, clientY, `${o.name || 'Występ ściany'} · ${o.width} mm`, items);
  }

  // Menu korpusu (albo grupy zaznaczonej Ctrl + klik): dosuń w lewo / w prawo / do tyłu / w dół do najbliższego
  // korpusu, przeszkody albo ściany; rozszerz w lewo / w prawo (jeden korpus); dopasuj do wnęki, duplikuj, usuń.
  function showCabinetMenu(cabinetId, clientX, clientY) {
    const project = store.get();
    const cabinet = project.furniture.find((c) => c.id === cabinetId);
    if (!cabinet) return;
    const selected = selectedCabinetIds(ui.get());
    const ids = selected.has(cabinetId) && selected.size > 1 ? [...selected] : [cabinetId];
    const many = ids.length > 1;
    const items = [];
    const mm = (v) => `${Math.round(Math.abs(v))} mm`;
    if (!many) {
      for (const [side, dir, icon] of [['left', 'w lewo', '⇤'], ['right', 'w prawo', '⇥']]) {
        const t = slideTarget(project, ids, side === 'left' ? '-x' : '+x');
        if (Math.abs(t?.delta ?? 0) >= 0.5)
          items.push({ icon, label: `Rozszerz ${dir} do ${t.label} (+${mm(t.delta)})`, run: () => store.set((p) => extendCabinet(p, cabinetId, side)) });
      }
    }
    const moves = [
      ['-x', 'w lewo', '←'],
      ['+x', 'w prawo', '→'],
      ['-z', 'do tyłu', '↑'],
      ['-y', 'w dół', '⤓'],
    ];
    for (const [direction, dir, icon] of moves) {
      const t = slideTarget(project, ids, direction);
      if (Math.abs(t?.delta ?? 0) >= 0.5)
        items.push({ icon, label: `${many ? 'Dosuń wszystkie' : 'Dosuń'} ${dir} do ${t.label} (${mm(t.delta)})`, run: () => store.set((p) => slideCabinets(p, ids, direction)) });
    }
    if (!items.length) items.push({ icon: '·', label: 'Dotyka sąsiadów i ścian — nie ma dokąd dosunąć', run: () => {} });
    if (!many) {
      items.push({ icon: '⤢', label: 'Dopasuj do wnęki', run: () => store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cabinetId ? fitCabinetToSpace(c, p) : c)) })) });
      items.push({
        icon: '⧉',
        label: 'Duplikuj',
        run: () => {
          const copy = duplicateCabinet(store.get(), cabinetId);
          store.set((p) => ({ ...p, furniture: [...p.furniture, copy] }));
          ui.set({ ...ui.get(), selectedId: copy.id, selectedIds: [copy.id] }, { reveal: true });
        },
      });
    }
    items.push({
      icon: '✕',
      label: many ? `Usuń ${ids.length} korpusy` : 'Usuń',
      run: () => {
        if (many && !confirm(`Usunąć ${ids.length} zaznaczone korpusy?`)) return;
        ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [] });
        store.set((p) => ({ ...p, furniture: p.furniture.filter((c) => !ids.includes(c.id)) }));
      },
    });
    const title = many ? `Zaznaczone korpusy: ${ids.length}` : `${cabinet.name} · ${cabinet.width} mm`;
    menu.show(clientX, clientY, title, items);
  }

  // Zaznaczenie występu ściany (zamiast korpusów, frontów, blend i otworów).
  const selectWall = (obstacleId) =>
    ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: obstacleId });

  // Przeciąganie występu: krawędź (mode 'left' / 'right') zmienia szerokość, środek ('move') przesuwa;
  // krawędzie przyciągają się do ścian i korpusów (bez przyciągania z Alt), najmniej 10 mm szerokości.
  function dragWall(pt, altKey) {
    const { obstacleId, mode, from, start } = drag.wall;
    const project = store.get();
    const W = project.space.width;
    const dx = (pt.x - start.x) / MM;
    const snap = (x) => (altKey ? Math.round(x) : Math.round(snapObstacleEdge(project, obstacleId, x)));
    let { x, width } = from;
    if (mode === 'move') {
      // przyciąga ta krawędź, która jest bliżej celu
      const left = from.x + dx;
      const sl = snap(left) - left;
      const sr = snap(left + from.width) - (left + from.width);
      x = Math.round(left + (Math.abs(sl) <= Math.abs(sr) ? sl : sr));
      x = Math.min(Math.max(x, 0), Math.max(0, W - from.width));
    } else if (mode === 'left') {
      const right = from.x + from.width;
      x = Math.min(Math.max(snap(from.x + dx), 0), right - 10);
      width = right - x;
    } else {
      width = Math.min(Math.max(snap(from.x + from.width + dx), from.x + 10), W) - from.x;
    }
    store.set((p) => ({
      ...p,
      space: { ...p.space, obstacles: p.space.obstacles.map((o) => (o.id === obstacleId ? { ...o, x, width } : o)) },
    }));
  }

  const isShelf = (hit) => hit?.panelKey?.startsWith('shelf-');
  const isFront = (hit) => hit?.panelKey?.startsWith('front-');
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
    onCustomColor?.(preset ? { ...preset } : { hex, name: `własny ${hex}` });
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
    return [fronts && `${fronts} ${fronts === 1 ? 'front' : fronts < 5 ? 'fronty' : 'frontów'}`, blends && `${blends} ${blends === 1 ? 'blenda' : blends < 5 ? 'blendy' : 'blend'}`]
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
          { icon: '…', label: 'własny kolor', run: () => pickCustomColor((c) => setPartsColor(partIds, c)) },
        ],
      }),
    };
  }

  // Menu dla zaznaczonych blend (boczne „idKorpusu:klucz”, wspólne i blaty „trim:id”): zmiana koloru.
  function showBlendMenu(blendIds, clientX, clientY) {
    const project = store.get();
    const nameOf = (id) => {
      if (id.startsWith('trim:')) return project.trims?.find((t) => t.id === id.slice(5))?.name;
      const [cabId, key] = id.split(':');
      const cab = project.furniture.find((c) => c.id === cabId);
      return cab && cabinetPanels(cab, project).find((p) => p.key === key)?.name;
    };
    const ids = blendIds.filter((id) => !id.endsWith(':legs') && nameOf(id));
    if (!ids.length) return;
    // kolor — dla wszystkich zaznaczonych elementów (blendy i fronty razem)
    const parts = [...new Set([...ids, ...selectedParts()])];
    const multi = parts.length > 1;
    const title = multi ? `Zaznaczone: ${partsLabel(parts)}` : nameOf(ids[0]);
    menu.show(clientX, clientY, title, [
      colorItem(`Zmień kolor${multi ? ' wszystkich' : ''}…`, multi ? `Kolor: ${partsLabel(parts)}` : `Kolor: ${nameOf(ids[0])}`, 'jak w korpusie / materiale', parts),
    ]);
  }

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
    // Kolor zaznaczonych frontów (podlista): „jak w korpusie” zdejmuje własny kolor frontu.
    // kolor — dla wszystkich zaznaczonych elementów (fronty i blendy razem)
    const parts = [...new Set([...ids, ...selectedParts()])];
    const multi = parts.length > 1;
    items.push(
      colorItem(
        `Zmień kolor${multi ? ` (${partsLabel(parts)})` : ''}…`,
        multi ? `Kolor: ${partsLabel(parts)}` : `Kolor: ${fronts[0].panel.name}`,
        'jak w korpusie / materiale',
        parts,
      ),
    );
    // Frez — tylko gdy zaznaczone są same fronty (bez blend)
    if (selectedParts().every((id) => id.includes(':front-'))) {
      items.push({
        icon: '▦',
        label: `Zmień frez${all}…`,
        submenu: () => ({
          title: many ? `Frez: ${fronts.length} frontów` : `Frez: ${fronts[0].panel.name}`,
          items: [
            { icon: '↺', label: 'jak w korpusie (frez frontów)', run: () => setFrontsDecor(ids, null) },
            ...FRONT_DECORS.map((d) => ({
              icon: `<span class="context-menu-decor">${decorPreviewSvg(d.key, 450, 700, {}, 18)}</span>`,
              label: d.label,
              run: () => setFrontsDecor(ids, d.key),
            })),
          ],
        }),
      });
    }
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
    // Prawy klik na występie ściany (kominku) — zaznaczenie i menu: rozszerz / przesuń do korpusu lub ściany.
    const wall = pickWall();
    if (wall) {
      selectWall(wall.obstacleId);
      showWallMenu(wall.obstacleId, e.clientX, e.clientY);
      return;
    }
    const hit = pickCabinet();
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
      // Prawy klik na korpusie (boku, wieńcu, półce, nóżkach…): menu korpusu — albo całej grupy, gdy kliknięty
      // korpus jest w zaznaczeniu (Ctrl + klik); inny korpus — zaznaczamy tylko jego.
      if (!selectedCabinetIds(ui.get()).has(hit.id)) {
        ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: [], selectedBlends: [] }, { reveal: true });
      }
      showCabinetMenu(hit.id, e.clientX, e.clientY);
      return;
    }
    if (!isFront(hit)) return;
    // Prawy klik na jednym z zaznaczonych frontów — menu dla wszystkich zaznaczonych;
    // na innym froncie — zaznaczamy tylko ten.
    const frontId = `${hit.id}:${hit.panelKey}`;
    let selected = ui.get().selectedFronts ?? [];
    if (!selected.includes(frontId)) {
      selected = [frontId];
      ui.set({ ...ui.get(), selectedId: hit.id, selectedIds: [hit.id], selectedFronts: selected, selectedBlends: [] }, { reveal: true });
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
      // Występ ściany: klik zaznacza, przeciąganie krawędzi zmienia szerokość, środka — przesuwa.
      const wall = pickWall();
      if (wall) {
        selectWall(wall.obstacleId);
        const o = store.get().space.obstacles.find((x) => x.id === wall.obstacleId);
        drag = {
          wall: { obstacleId: o.id, mode: wall.mode, from: { x: o.x, width: o.width }, start: wall.point.clone() },
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), wall.point), // poziomo
        };
        viewer.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (ui.get().selectedObstacle) ui.set({ ...ui.get(), selectedObstacle: null });
      const hit = pickCabinet();
      if (!hit) return;
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
      const wallHover = pickWall();
      if (wallHover) {
        el.style.cursor = wallHover.mode === 'move' ? 'grab' : 'ew-resize';
        return;
      }
      const hover = pickCabinet();
      el.style.cursor =
        hover?.handle || holeAt(hover) ? 'move' : isShelf(hover) ? 'ns-resize' : isFront(hover) || hover?.trimId || hover?.boardId ? 'pointer' : hover ? 'grab' : '';
      return;
    }
    if (drag.select) return; // Ctrl + klik na froncie — tylko zaznaczanie
    if (drag.wall) {
      el.style.cursor = drag.wall.mode === 'move' ? 'grabbing' : 'ew-resize';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragWall(pt, e.altKey);
      return;
    }
    if (drag.hole) {
      el.style.cursor = 'move';
      const pt = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (pt) dragHole(pt);
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
    const axes = drag.vertical ? ['y'] : ['x', 'z'];
    let pos = { ...drag.from };
    for (const a of axes) pos[a] = Math.round(drag.from[a] + d[a]);
    if (!e.altKey) pos = snapPosition(project, drag.id, pos, axes);

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
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX;
    if (drag) {
      el.style.cursor = drag.shelfId ? 'ns-resize' : drag.frontId ? 'pointer' : 'grab';
      drag = null;
      viewer.controls.enabled = true;
      el.releasePointerCapture(e.pointerId);
    } else if (down && !moved && e.button === 0) {
      ui.set({ ...ui.get(), selectedId: null, selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }); // klik w puste miejsce
    }
    down = null;
  });
}
