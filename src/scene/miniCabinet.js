import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cabinetPanels } from '../model/furniture.js';
import { selectedCabinetIds } from '../state/selection.js';
import { getSettings } from '../state/settings.js';
import { t } from '../i18n.js';

// Mini-podgląd 3D zaznaczonego korpusu — okienko pod mapką zabudowy (lewy górny róg): obracany myszką, a klik
// w płytę zaznacza ją (bok, wieniec, plecy, półka, front — jak w głównym widoku 3D) i otwiera jej ustawienia.
// Fronty można schować (przycisk „fronty”), żeby dostać się do płyt w środku. Po najechaniu — nazwa płyty.
// Rysowane tylko wtedy, gdy zaznaczony jest jeden korpus (i okienko mapki nie jest ukryte).

const MM = 0.001;
const isFrontKey = (k) => k.startsWith('front-') || k.startsWith('idrawer-');

export function initMiniCabinet(store, ui) {
  const win = document.createElement('div');
  win.className = 'mini-window';
  win.hidden = true;
  // sam korpus (bez ramki okienka): przezroczyste tło, mały przełącznik frontów w rogu
  win.innerHTML = `
    <div class="mini-canvas" title="${t('Przeciągnij — obróć, klik — zaznacz płytę')}"></div>
    <button type="button" class="mini-toggle" data-mini-fronts title="${t('Pokaż / schowaj fronty (żeby zaznaczyć płyty w środku)')}">${t('fronty')}</button>
    <div class="mini-tip" hidden></div>`;
  document.body.appendChild(win);
  const box = win.querySelector('.mini-canvas');
  const tip = win.querySelector('.mini-tip');
  const W = 300;
  const H = 210;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(1, 1.4, 1.2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  const group = new THREE.Group();
  scene.add(group);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let showFronts = true;
  let cabinetId = null;
  let sig = '';
  let raf = null;

  const clearGroup = () => {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !o.material.userData?.shared) o.material.dispose?.();
    });
    group.clear();
  };

  function build(cabinet, project, picked) {
    clearGroup();
    const panels = cabinetPanels(cabinet, project).filter((p) => p.valid && !p.hidden && (showFronts || !isFrontKey(p.key)));
    // środek korpusu → (0, 0, 0)
    const cx = cabinet.x + cabinet.width / 2;
    const cz = cabinet.z + cabinet.depth / 2;
    const ys = panels.map((p) => [p.y, p.y + p.height]).flat();
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : cabinet.y + cabinet.height / 2;
    const highlight = new THREE.Color(getSettings().highlight);
    for (const p of panels) {
      const id = `${cabinet.id}:${p.key}`;
      const sel = picked.has(id);
      const front = isFrontKey(p.key);
      const color = new THREE.Color(p.material?.color ?? '#e5e7eb');
      const mat = new THREE.MeshLambertMaterial({ color: sel ? color.clone().lerp(highlight, 0.6) : color, transparent: front, opacity: front ? 0.55 : 1 });
      const geo = new THREE.BoxGeometry(Math.max(1, p.width) * MM, Math.max(1, p.height) * MM, Math.max(1, p.depth) * MM);
      const mesh = new THREE.Mesh(geo, mat);
      // oś z przestrzeni (od ściany) → w scenie do kamery (przód korpusu z przodu)
      mesh.position.set((p.x + p.width / 2 - cx) * MM, (p.y + p.height / 2 - cy) * MM, (p.z + p.depth / 2 - cz) * MM);
      mesh.userData.pick = { key: p.key, name: p.name, front };
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: sel ? highlight : 0x6b7280 }));
      mesh.add(edges);
      group.add(mesh);
    }
    return Math.max(cabinet.width, cabinet.height, cabinet.depth) * MM;
  }

  function fitCamera(size) {
    const d = size * 2.1;
    camera.position.set(d * 0.55, d * 0.35, d * 0.85);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
    place();
  };
  const start = () => raf == null && loop();
  const stop = () => {
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
  };
  // pod okienkiem mapki (albo w jego miejscu, gdy mapka ukryta)
  function place() {
    const map = document.querySelector('.map-window');
    const visibleMap = map && !document.documentElement.classList.contains('map-hidden') && map.getBoundingClientRect().height > 0;
    const r = visibleMap ? map.getBoundingClientRect() : null;
    const left = r ? r.left : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map-left')) || 12;
    const top = r ? r.bottom + 8 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map-top')) || 70;
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  }

  function sync() {
    const project = store.get();
    const st = ui.get();
    const ids = selectedCabinetIds(st);
    const cab = ids.size === 1 ? project.furniture.find((c) => c.id === st.selectedId) : null;
    if (!cab) {
      win.hidden = true;
      cabinetId = null;
      stop();
      return;
    }
    const picked = new Set([...(st.selectedBlends ?? []), ...(st.selectedFronts ?? [])]);
    const nextSig = JSON.stringify([cab, [...picked], showFronts, project.materials.length]);
    win.hidden = false;
    win.querySelector('[data-mini-fronts]').classList.toggle('active', showFronts);
    if (nextSig !== sig) {
      const size = build(cab, project, picked);
      if (cab.id !== cabinetId) fitCamera(size);
      sig = nextSig;
    }
    cabinetId = cab.id;
    start();
  }

  const hit = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(group.children, false)[0]?.object.userData.pick ?? null;
  };
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !cabinetId) return (down = null);
    down = null;
    const p = hit(e);
    if (!p) return;
    const id = `${cabinetId}:${p.key}`;
    const st = ui.get();
    // klik w zaznaczoną płytę — z powrotem cały korpus
    const again = (st.selectedBlends ?? []).includes(id) || (st.selectedFronts ?? []).includes(id);
    ui.set(
      {
        ...st,
        selectedId: cabinetId,
        selectedIds: [cabinetId],
        selectedFronts: !again && p.front ? [id] : [],
        selectedBlends: !again && !p.front ? [id] : [],
        selectedHole: null,
        selectedObstacle: null,
      },
      { reveal: true },
    );
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const p = hit(e);
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    tip.hidden = !p;
    if (p) {
      tip.textContent = p.name;
      const r = win.getBoundingClientRect();
      tip.style.left = `${e.clientX - r.left + 12}px`;
      tip.style.top = `${e.clientY - r.top + 14}px`;
    }
  });
  renderer.domElement.addEventListener('pointerleave', () => (tip.hidden = true));
  win.querySelector('[data-mini-fronts]').addEventListener('click', () => {
    showFronts = !showFronts;
    sig = '';
    sync();
  });
  // (kółko i przeciąganie w okienku nie trafiają do głównego widoku)
  win.addEventListener('wheel', (e) => e.stopPropagation());

  store.subscribe(sync);
  ui.subscribe(sync);
  sync();
}
