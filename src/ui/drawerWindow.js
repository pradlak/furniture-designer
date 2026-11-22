import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { escapeHtml, readNumberInput, setIfNotFocused } from './dom.js';
import { cabinetPanels, frontParts, FRONT_PART_MIN } from '../model/furniture.js';
import { setPartKind, setPartField, removePart, movePart, coverWithDoor, uncoverPart, canUncover, canDoorGrow, doorFullHeight, fillFreeSpace, freeSpaceOf, fitLabel, partKindOf } from '../model/frontEdit.js';
import { COLOR_PRESETS } from '../model/materials.js';
import { FRONT_DECORS } from '../model/decor.js';
import { panelSketch, pieceSketch } from './objectSketch.js';
import { panelEdgeSet, projectSolids } from '../model/edges.js';
import { DRAWER_SYSTEMS, DEFAULT_EDGES, drawerSystem, systemLabel, suggestModel } from '../model/drawerSystems.js';
import { drawerBoxFor } from '../model/drawerBoxes.js';

// Okienko „Szuflada” — ustawienia jednej zaznaczonej szuflady (front szuflady albo czoło szuflady wewnętrznej) w osobnym
// okienku obok okienka sekcji korpusu: mini-podgląd 3D szuflady (front + skrzynka, obracany), rodzaj, wysokość
// (z dopasowaniem do miejsca), kolejność, drzwi, kolor i frez frontu, szkic z obrzeżem, usuwanie.
// Pokazuje się, gdy zaznaczona jest dokładnie jedna szuflada. Kolejne ustawienia szuflad — dopisywać tutaj.

const KIND_LABELS = { drawer: 'Szuflada z frontem', innerDrawer: 'Szuflada wewnętrzna (za drzwiami / bez frontu)', space: 'Wolna przestrzeń' };

const cabinetSpacers = (cabinet, inner) => inner && !!cabinet.fronts?.innerSpacers;

export function createDrawerWindow(store, ui) {
  const win = document.createElement('aside');
  win.className = 'drawer-window';
  win.hidden = true;
  document.body.appendChild(win);
  win.innerHTML = `
    <div class="dw-head">
      <button type="button" class="dw-back" data-dw-close title="Wróć do listy szuflad i drzwi korpusu (sekcja „Fronty / szuflady”)">Powrót do frontów i szuflad →</button>
      <b data-dw-title></b>
    </div>
    <div class="dw-piece-head"><b data-dw-piece-title></b><button type="button" class="dw-piece-back" data-dw-piece-back hidden>wróć do frontu</button></div>
    <p class="dw-hint">klik w ściankę na podglądzie 3D po lewej — jej szkic tutaj; klik w krawędź frontu — obrzeże</p>
    <div class="dw-sketch obj-sketch bi-sketch"></div>
    <div class="bi-sec">Szuflada</div>
    <label class="bi-field wide"><span>Rodzaj</span><select data-dw="kind">${Object.entries(KIND_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    <div class="dw-row">
      <label class="bi-field"><span>Wysokość</span><input type="number" step="1" min="${FRONT_PART_MIN}" data-dw="height" placeholder="auto" /><small>mm</small></label>
      <button type="button" data-dw-fit title="Wysokość do miejsca w korpusie">⤢ Dopasuj</button>
    </div>
    <div class="dw-row">
      <button type="button" data-dw-move="up" title="Przenieś wyżej">↑ Wyżej</button>
      <button type="button" data-dw-move="down" title="Przenieś niżej">↓ Niżej</button>
      <button type="button" data-dw-cover title="Schowaj za drzwiami (szuflada wewnętrzna)">▣ Za drzwi</button>
      <button type="button" data-dw-uncover title="Wyjmij spod drzwi (własny front)">⇲ Spod drzwi</button>
      <button type="button" data-dw-door-full title="Drzwi przed tą szufladą przykryją też części pod i nad nimi (szuflady wewnętrzne, wolne miejsce)">⇕ Drzwi na całą wysokość</button>
    </div>
    <div class="bi-sec">System szuflady <small>(boki metalowe, dno i plecy do docięcia)</small></div>
    <label class="bi-field wide"><span>System</span><select data-dw="system"><option value="">— bez systemu (ogólne prowadnice)</option>${DRAWER_SYSTEMS.map((s) => `<option value="${s.key}">${escapeHtml(systemLabel(s))}</option>`).join('')}</select></label>
    <div class="dw-sys">
      <div class="dw-row">
        <label class="bi-field"><span>Model</span><select data-dw="model"></select></label>
        <label class="bi-field"><span>Prowadnice (NL)</span><select data-dw="length"></select></label>
        <label class="bi-field"><span>Kolor</span><select data-dw="sysColor"></select></label>
      </div>
      <div class="dw-calc"></div>
      <button type="button" class="dw-all" data-dw-all title="Ten sam system, model i kolor dla wszystkich szuflad w korpusie (prowadnice — auto)">Zastosuj do wszystkich szuflad w korpusie</button>
    </div>
    <div class="bi-sec">Front</div>
    <div class="dw-row">
      <label class="bi-field wide"><span>Kolor</span><select data-dw="color"><option value="">jak w korpusie</option>${COLOR_PRESETS.map((c) => `<option value="${c.hex}">${escapeHtml(c.name)}</option>`).join('')}</select></label>
      <label class="bi-field wide"><span>Frez</span><select data-dw="decor"><option value="">jak w korpusie</option>${FRONT_DECORS.map((d) => `<option value="${d.key}">${escapeHtml(d.label)}</option>`).join('')}</select></label>
    </div>
    <button type="button" class="danger dw-remove" data-dw-remove>🗑 Usuń szufladę</button>`;
  // miniatura 3D szuflady — po lewej, pod mapką (jak mini-korpus), bez ramki; obracana w każdą stronę
  const mini = document.createElement('div');
  mini.className = 'mini-window drawer-mini';
  mini.hidden = true;
  mini.innerHTML = '<div class="mini-canvas" title="Przeciągnij — obróć, kółko — przybliż"></div>';
  document.body.appendChild(mini);

  // --- mini-podgląd 3D szuflady ---
  const W3 = 300;
  const H3 = 210;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W3, H3);
  mini.querySelector('.mini-canvas').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(1, 1.3, 1.4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, W3 / H3, 0.01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0; // obrót w każdą stronę (także od spodu)
  controls.maxPolarAngle = Math.PI;
  mini.addEventListener('wheel', (e) => e.stopPropagation());
  // klik w ściankę szuflady (front, boki, dno, plecy) — podświetlenie i jej wymiary pod podglądem
  const tip = document.createElement('div');
  tip.className = 'dw-pick';
  tip.hidden = true;
  mini.appendChild(tip);
  const ray = new THREE.Raycaster();
  let picked = null;
  let pickedPiece = null; // 'front' | 'back' | 'bottom' | 'sideL' | 'sideR' — ścianka, której szkic jest w okienku
  let pieceFor = null; // (dla której szuflady)
  const markPicked = () => {
    group.children.forEach((m) => m.material.emissive?.setHex(m.userData.pick?.id && m.userData.pick.id === pickedPiece ? 0x1d4ed8 : 0x000000));
    const m = group.children.find((x) => x.userData.pick?.id === pickedPiece);
    picked = m ?? null;
    tip.hidden = !m;
    if (m) tip.innerHTML = `<b>${escapeHtml(m.userData.pick.name)}</b><br>${escapeHtml(m.userData.pick.dims)}`;
  };
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return (downAt = null);
    downAt = null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(group.children, false).find((h) => h.object.userData.pick);
    if (picked) picked.material.emissive?.setHex(0x000000);
    picked = hit && hit.object !== picked ? hit.object : null;
    pickedPiece = picked?.userData.pick.id ?? null;
    markPicked();
    sync();
  });
  // położenie: pod mapką (albo w jej miejscu, gdy mapka ukryta) — jak mini-korpus
  const placeMini = () => {
    const map = document.querySelector('.map-window');
    const vis = map && !document.documentElement.classList.contains('map-hidden') && map.getBoundingClientRect().height > 0;
    const r = vis ? map.getBoundingClientRect() : null;
    const cs = getComputedStyle(document.documentElement);
    mini.style.left = `${r ? r.left : parseFloat(cs.getPropertyValue('--map-left')) || 12}px`;
    mini.style.top = `${r ? r.bottom + 8 : parseFloat(cs.getPropertyValue('--map-top')) || 70}px`;
  };
  const group = new THREE.Group();
  scene.add(group);
  let raf = null;
  let modelSig = '';
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
    placeMini();
  };
  function buildModel(panel, cabinet, inner, sysBox = null) {
    group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    group.clear();
    picked = null;
    const MM = 0.001;
    const w = panel.width;
    const h = panel.height;
    const t = Math.max(12, panel.depth || 18);
    // z systemem — wymiary z katalogu (boki H, długość NL, dno i plecy wg wzorów); bez — przybliżenie
    const boxW = sysBox ? sysBox.LW - 26 : Math.max(100, (inner ? w : w - 60) - 10);
    const boxH = sysBox ? sysBox.sideH : Math.max(60, h * (inner ? 0.85 : 0.65));
    const boxD = sysBox ? sysBox.NL : Math.max(150, cabinet.depth - 80);
    const front = new THREE.MeshLambertMaterial({ color: panel.material?.color ?? '#e5e7eb' });
    const side = new THREE.MeshLambertMaterial({ color: '#d6d3d1' });
    // pick — { name, dims } (klik w ściankę — podgląd jej wymiarów)
    const mk = (sx, sy, sz, x, y, z, m, pick = null) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx * MM, sy * MM, sz * MM), m.clone());
      mesh.position.set(x * MM, y * MM, z * MM);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x6b7280 })));
      mesh.userData.pick = pick;
      group.add(mesh);
      return mesh;
    };
    // front (czoło) z przodu, skrzynka za nim — szuflada lekko wysunięta
    const sideMat = sysBox ? new THREE.MeshLambertMaterial({ color: sysBox.color.key === 'P32' ? '#4b5563' : '#f3f4f6' }) : side;
    const board = new THREE.MeshLambertMaterial({ color: '#e7dcc6' });
    const r1 = (v) => Math.round(v);
    mk(w, h, t, 0, 0, t / 2, front, { id: 'front', name: panel.name, dims: `${r1(w)} × ${r1(h)} × ${r1(t)} mm` });
    const by = -h / 2 + boxH / 2 + (inner ? 0 : h * 0.12);
    const bz = -boxD / 2;
    const sideLabel = sysBox ? `bok metalowy ${sysBox.system.brand} ${sysBox.system.name} H${sysBox.sideH}, dł. ${sysBox.NL} mm` : 'bok szuflady';
    mk(16, boxH, boxD, -boxW / 2 + 8, by, bz, sideMat, { id: 'sideL', name: 'Bok lewy', dims: sideLabel, w: boxD, h: boxH });
    mk(16, boxH, boxD, boxW / 2 - 8, by, bz, sideMat, { id: 'sideR', name: 'Bok prawy', dims: sideLabel, w: boxD, h: boxH });
    const backW = sysBox ? sysBox.back.width : boxW;
    const backH = sysBox ? sysBox.back.height : boxH;
    const botW = sysBox ? sysBox.bottom.width : boxW;
    const botL = sysBox ? sysBox.bottom.length : boxD;
    const th = sysBox ? sysBox.back.thickness : 16;
    mk(backW, backH, th, 0, by - boxH / 2 + backH / 2 + th, -boxD + th / 2 + 4, board, { id: 'back', name: 'Plecy', dims: `${backW} × ${backH} × ${th} mm${sysBox ? ' — płyta do docięcia' : ''}`, w: backW, h: backH, t: th });
    mk(botW, th, botL, 0, by - boxH / 2 + th / 2, -botL / 2 - 4, board, { id: 'bottom', name: 'Dno', dims: `${botW} × ${botL} × ${th} mm${sysBox ? ' — płyta do docięcia' : ''}`, w: botW, h: botL, t: th });
    if (!inner) mk(Math.min(160, w * 0.35), 14, 22, 0, h * 0.3, t + 11, new THREE.MeshLambertMaterial({ color: '#374151' })); // uchwyt
    const r = Math.max(w, h, boxD) * MM;
    camera.position.set(r * 0.9, r * 0.6, r * 1.1);
    controls.target.set(0, 0, -boxD * MM * 0.3);
    controls.update();
  }

  // --- stan: jedna zaznaczona szuflada ---
  const current = () => {
    const st = ui.get();
    const fronts = st.selectedFronts ?? [];
    if (fronts.length !== 1) return null;
    const [cabId, key] = fronts[0].split(':');
    const project = store.get();
    const cabinet = project.furniture.find((c) => c.id === cabId);
    if (!cabinet) return null;
    const panel = cabinetPanels(cabinet, project).find((p) => p.key === key);
    if (!panel || panel.part == null || !panel.opening?.drawer) return null;
    return { cabinet, panel, key, index: panel.part, project };
  };
  const update = (fn) => {
    const cur = current();
    if (!cur) return;
    store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cur.cabinet.id ? fn(c, p, cur) : c)) }));
  };
  const clearFronts = () => ui.set({ ...ui.get(), selectedFronts: [] }); // po zmianie rodzaju / kolejności klucze frontów się zmieniają

  function sync() {
    const cur = current();
    document.documentElement.classList.toggle('drawer-open', !!cur);
    if (!cur) {
      win.hidden = true;
      mini.hidden = true;
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      return;
    }
    const { cabinet, panel, key, index, project } = cur;
    const st = frontParts(cabinet.fronts);
    const part = st.parts[index];
    win.hidden = false;
    mini.hidden = false;
    win.querySelector('[data-dw-title]').textContent = `${panel.name} — ${cabinet.name}`;
    const inner = key.startsWith('idrawer-');
    const sysBox = part?.system ? drawerBoxFor(cabinet, index, project) : null;
    const sig = JSON.stringify([key, panel.width, panel.height, panel.material?.color, cabinet.depth, inner, sysBox && [sysBox.model.key, sysBox.NL, sysBox.LW, sysBox.color.key]]);
    if (pieceFor !== key) {
      pickedPiece = null;
      pieceFor = key;
    }
    if (sig !== modelSig) {
      buildModel(panel, cabinet, inner, sysBox);
      modelSig = sig;
    }
    markPicked();
    if (raf == null) loop();
    setIfNotFocused(win.querySelector('[data-dw="kind"]'), partKindOf(st, part));
    const hIn = win.querySelector('[data-dw="height"]');
    setIfNotFocused(hIn, part?.height ?? '');
    hIn.placeholder = `${Math.round(panel.height)} (auto)`;
    const gain = freeSpaceOf(cabinet, index, project);
    const fit = win.querySelector('[data-dw-fit]');
    fit.disabled = !gain;
    fit.title = gain ? fitLabel(gain) : 'Szuflada wypełnia już swoje miejsce';
    win.querySelector('[data-dw-move="up"]').disabled = index >= st.parts.length - 1;
    win.querySelector('[data-dw-move="down"]').disabled = index <= 0;
    const doorJ = st.doors.findIndex((d) => d.covers.includes(part?.id));
    win.querySelector('[data-dw-cover]').hidden = doorJ >= 0; // (szuflada wewnętrzna bez drzwi — też)
    win.querySelector('[data-dw-uncover]').hidden = doorJ < 0 || !canUncover(st, index);
    win.querySelector('[data-dw-door-full]').hidden = doorJ < 0 || !canDoorGrow(cabinet, doorJ);
    // system szuflady: listy modeli / długości / kolorów i wyliczone dno, plecy
    const sel = part?.system ?? null;
    const sys = sel && drawerSystem(sel.key);
    setIfNotFocused(win.querySelector('[data-dw="system"]'), sel?.key ?? '');
    win.querySelector('.dw-sys').hidden = !sys;
    if (sys) {
      const box = drawerBoxFor(cabinet, index, project);
      const fill = (name, opts, value) => {
        const el = win.querySelector(`[data-dw="${name}"]`);
        const html = opts.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
        if (el.dataset.html !== html) {
          el.innerHTML = html;
          el.dataset.html = html;
        }
        setIfNotFocused(el, value);
      };
      fill('model', sys.models.map((m) => [m.key, `${m.key} — ${m.label}`]), sel.model);
      fill('length', [['', `auto (${box?.autoLength ?? '—'})`], ...sys.lengths.map((l) => [String(l), `${l} mm`])], sel.length == null ? '' : String(sel.length));
      fill('sysColor', sys.colors.map((c) => [c.key, c.label]), sel.color);
      win.querySelector('.dw-calc').innerHTML = box
        ? `<div><b>Dno:</b> ${box.bottom.width} × ${box.bottom.length} × ${box.bottom.thickness} mm <small>(LW − ${sys.bottom.widthOffset} × NL − ${sys.bottom.lengthOffset})</small></div>
           <div><b>Plecy:</b> ${box.back.width} × ${box.back.height} × ${box.back.thickness} mm <small>(LW − ${sys.back.widthOffset})</small></div>
           <div><b>Boki:</b> metalowe H${box.sideH}, prowadnice ${box.NL} mm · szer. wewn. korpusu LW ${Math.round(box.LW)} mm</div>
           ${box.rail ? `<div class="dw-rail"><b>Prowadnice (lewa i prawa):</b> oś otworów ${box.rail.fromTop} mm nad wieńcem dolnym (${box.rail.fromBottom} mm od spodu korpusu), pierwszy otwór ${box.rail.frontHole} mm od przedniej krawędzi${cabinetSpacers(cabinet, inner) ? ', na dystansach' : ''} — przerywana linia na bokach w widoku 3D</div>` : ''}
           ${box.warnings.map((w) => `<div class="dw-warn">⚠ ${escapeHtml(w)}</div>`).join('')}`
        : '';
    }
    const ov = cabinet.panelOverrides?.[key] ?? {};
    setIfNotFocused(win.querySelector('[data-dw="color"]'), ov.color?.hex ?? '');
    setIfNotFocused(win.querySelector('[data-dw="decor"]'), ov.decor ?? '');
    const sk = win.querySelector('.dw-sketch');
    const piece = pickedPiece && pickedPiece !== 'front' ? group.children.find((m) => m.userData.pick?.id === pickedPiece)?.userData.pick : null;
    win.querySelector('[data-dw-piece-title]').textContent = piece ? `${piece.name} — ${panel.name}` : `Front: ${panel.name}`;
    win.querySelector('[data-dw-piece-back]').hidden = !piece;
    if (piece) {
      const sysNote = sysBox ? `${sysBox.system.brand} ${sysBox.system.name} ${sysBox.model.key}, prowadnice ${sysBox.NL} mm` : 'skrzynka przybliżona (bez systemu szuflady)';
      const isBoard = piece.id === 'back' || piece.id === 'bottom';
      const sides = piece.id === 'bottom' ? { top: 'tył', bottom: 'przód', left: 'lewo', right: 'prawo' } : piece.id === 'back' ? { top: 'góra', bottom: 'dół', left: 'lewo', right: 'prawo' } : { top: 'góra', bottom: 'dół', left: 'tył', right: 'przód' };
      const pe = isBoard && sysBox ? sysBox[piece.id].edges : [];
      const sideNames = pe.map((k) => sides[k]).join(', ');
      const notes = isBoard
        ? [`${piece.name}: ${piece.w} × ${piece.h} × ${piece.t} mm — płyta do docięcia (w Formatkach)`, sysBox ? (pe.length ? `obrzeże: ${sideNames}` : 'bez obrzeża') : '', sysNote, sysBox ? (piece.id === 'bottom' ? `dno = (LW − ${sysBox.system.bottom.widthOffset}) × (NL − ${sysBox.system.bottom.lengthOffset}), LW ${Math.round(sysBox.LW)}` : `plecy = (LW − ${sysBox.system.back.widthOffset}) × ${sysBox.back.height}, LW ${Math.round(sysBox.LW)}`) : '']
        : [`${piece.dims}`, 'element systemu (kupowany w komplecie — nie do cięcia)'];
      sk.innerHTML = pieceSketch({ W: Math.round(piece.w), H: Math.round(piece.h), sides, notes: notes.filter(Boolean), edges: pe, toggles: isBoard && !!sysBox });
      sk.dataset.key = '';
    } else sk.innerHTML = panelSketch(cabinet, key, project);
    sk.dataset.key = key;
    sk.dataset.cab = cabinet.id;
  }

  win.addEventListener('change', (e) => {
    const k = e.target.dataset.dw;
    if (!k) return;
    if (k === 'kind') {
      const kind = e.target.value;
      update((c, p, cur) => setPartKind(c, cur.index, kind, p));
      clearFronts();
    } else if (k === 'height') {
      const v = e.target.value.trim() === '' ? null : readNumberInput(e.target);
      if (v === undefined) return;
      update((c, p, cur) => setPartField(c, cur.index, 'height', v == null ? null : Math.round(v), p));
    } else if (k === 'system') {
      const val = e.target.value;
      update((c, p, cur) => {
        if (!val) return setPartField(c, cur.index, 'system', null, p);
        const sys = drawerSystem(val);
        return setPartField(c, cur.index, 'system', { key: val, model: suggestModel(sys, cur.panel.height), length: null, color: sys.colors[0].key }, p);
      });
    } else if (k === 'model' || k === 'length' || k === 'sysColor') {
      const val = e.target.value;
      update((c, p, cur) => {
        const part = frontParts(c.fronts).parts[cur.index];
        if (!part?.system) return c;
        const patch = k === 'model' ? { model: val } : k === 'length' ? { length: val ? Number(val) : null } : { color: val };
        return setPartField(c, cur.index, 'system', { ...part.system, ...patch }, p);
      });
    } else if (k === 'color' || k === 'decor') {
      const val = e.target.value || null;
      update((c, p, cur) => {
        const overrides = { ...c.panelOverrides };
        const { [k]: _old, ...rest } = overrides[cur.key] ?? {};
        const preset = k === 'color' && val ? COLOR_PRESETS.find((x) => x.hex === val) : null;
        overrides[cur.key] = val ? { ...rest, [k]: k === 'color' ? { ...preset } : val } : rest;
        if (!Object.keys(overrides[cur.key]).length) delete overrides[cur.key];
        return { ...c, panelOverrides: overrides };
      });
    }
  });
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.dw === 'height') e.target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  win.addEventListener('click', (e) => {
    const t = e.target;
    // obrzeże: klik w krawędź / napis na szkicu
    const edgeKey = t.closest?.('[data-edge-toggle]')?.getAttribute('data-edge-toggle');
    if (edgeKey) {
      e.stopPropagation();
      return update((c, p, cur) => {
        const panel = cabinetPanels(c, p).find((x) => x.key === cur.key);
        if (!panel) return c;
        const now = panelEdgeSet(panel, c, p, projectSolids(p));
        const next = now.includes(edgeKey) ? now.filter((k) => k !== edgeKey) : [...now, edgeKey];
        return { ...c, panelOverrides: { ...c.panelOverrides, [cur.key]: { ...c.panelOverrides?.[cur.key], edgeSet: next } } };
      });
    }
    // obrzeże dna / pleców szuflady z systemu: klik w krawędź / napis na szkicu elementu
    const pieceEdge = t.closest?.('[data-piece-edge]')?.getAttribute('data-piece-edge');
    if (pieceEdge && (pickedPiece === 'back' || pickedPiece === 'bottom')) {
      e.stopPropagation();
      const which = pickedPiece;
      return update((c, p, cur) => {
        const part = frontParts(c.fronts).parts[cur.index];
        if (!part?.system) return c;
        const box = drawerBoxFor(c, cur.index, p);
        const now = box ? box[which].edges : DEFAULT_EDGES[which];
        const next = now.includes(pieceEdge) ? now.filter((k) => k !== pieceEdge) : [...now, pieceEdge];
        const edges = { back: box?.back.edges ?? DEFAULT_EDGES.back, bottom: box?.bottom.edges ?? DEFAULT_EDGES.bottom, [which]: next };
        return setPartField(c, cur.index, 'system', { ...part.system, edges }, p);
      });
    }
    if (t.closest('[data-dw-close]')) return clearFronts();
    if (t.closest('[data-dw-piece-back]')) {
      pickedPiece = null;
      markPicked();
      return sync();
    }
    if (t.closest('[data-dw-all]')) {
      // ten sam system dla wszystkich szuflad korpusu (model — jak w tej; prowadnice — auto)
      return update((c, p, cur) => {
        const st = frontParts(c.fronts);
        const sys = st.parts[cur.index]?.system;
        if (!sys) return c;
        return st.parts.reduce((cc, pt, i) => (pt.type === 'drawer' || pt.type === 'innerDrawer' ? setPartField(cc, i, 'system', { ...sys, length: null }, p) : cc), c);
      });
    }
    if (t.closest('[data-dw-fit]')) return update((c, p, cur) => fillFreeSpace(c, cur.index, p));
    const mv = t.closest('[data-dw-move]')?.dataset.dwMove;
    if (mv) {
      update((c, p, cur) => movePart(c, cur.index, cur.index + (mv === 'up' ? 1 : -1), p));
      return clearFronts();
    }
    if (t.closest('[data-dw-cover]')) {
      update((c, p, cur) => coverWithDoor(c, cur.index, p));
      return clearFronts();
    }
    if (t.closest('[data-dw-door-full]')) {
      update((c, p, cur) => {
        const j = frontParts(c.fronts).doors.findIndex((d) => d.covers.includes(cur.part?.id ?? frontParts(c.fronts).parts[cur.index]?.id));
        return j >= 0 ? doorFullHeight(c, j, p) : c;
      });
      return clearFronts();
    }
    if (t.closest('[data-dw-uncover]')) {
      update((c, p, cur) => uncoverPart(c, cur.index, p));
      return clearFronts();
    }
    if (t.closest('[data-dw-remove]')) {
      update((c, p, cur) => removePart(c, cur.index, p));
      return clearFronts();
    }
  });
  // (klik w okienku nie trafia do sceny 3D; kółko — nie przybliża widoku)
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('wheel', (e) => e.stopPropagation());
  store.subscribe(sync);
  ui.subscribe(sync);
  sync();
  return { sync };
}
