import * as THREE from 'three';
import { escapeHtml } from './dom.js';
import { DECOR_CATEGORIES, DECOR_TYPES, decorType, normalizeDecoration } from '../model/decorations.js';
import { buildDecorations } from '../scene/buildDecorations.js';
import { t } from '../i18n.js';

// Okienko „Dekoracje” (po prawej, otwierane z „Dodaj → Dekoracje”): kategoria (lista), wyszukiwarka, dekoracja
// (lista), pod spodem obracający się podgląd 3D wybranej dekoracji z wymiarami i przycisk „Dodaj do projektu”.
// Dwuklik w dekorację na liście — od razu dodaje. onAdd(typ) — dodanie (main.js).
const PLACES = { floor: t('na podłodze'), top: t('na meblu'), wall: t('na ścianie'), ceiling: t('z sufitu') };

export function createDecorAddWindow(root, { onAdd }) {
  root.innerHTML = `
    <label class="bi-field wide"><span>${t('Kategoria')}</span>
      <select data-da-cat>
        <option value="">${t('Wszystkie')}</option>
        ${DECOR_CATEGORIES.filter((c) => DECOR_TYPES.some((dt) => dt.category === c.key)).map((c) => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('')}
      </select>
    </label>
    <label class="bi-field wide"><span>${t('Szukaj')}</span><input type="search" data-da-search placeholder="${t('np. lampa, roślina, okno…')}" /></label>
    <label class="bi-field wide"><span>${t('Dekoracja')}</span><select data-da-item size="6"></select></label>
    <div class="da-preview"></div>
    <p class="da-info"></p>
    <button type="button" class="da-add" data-da-add>${t('➕ Dodaj do projektu')}</button>
    <p class="hint">${t('Dekoracje są tylko do wyglądu — nie trafiają do formatek. Po dodaniu przeciągnij ją w 3D na miejsce.')}</p>`;
  const cat = root.querySelector('[data-da-cat]');
  const search = root.querySelector('[data-da-search]');
  const list = root.querySelector('[data-da-item]');
  const info = root.querySelector('.da-info');
  const box = root.querySelector('.da-preview');

  // --- podgląd 3D ---
  const W = 380;
  const H = 230;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(1, 1.5, 1.2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 50);
  let model = null;
  let raf = null;
  const disposeModel = () => {
    if (!model) return;
    scene.remove(model);
    model.traverse((o) => o.geometry?.dispose());
    model.userData.disposables?.forEach((m) => m.dispose());
    model = null;
  };
  function show(type) {
    disposeModel();
    if (!type) return;
    const dt = decorType(type);
    const d = normalizeDecoration({ type, x: 0, y: 0, z: 0, width: dt.size[0], height: dt.size[1], depth: dt.size[2] });
    model = buildDecorations({ space: { depth: 0 }, decorations: [d] });
    // na środek i w kadr (obiekty na ścianę — przodem do kamery)
    const bb = new THREE.Box3().setFromObject(model);
    const c = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    model.position.sub(c);
    const pivot = new THREE.Group();
    pivot.add(model);
    model = pivot;
    scene.add(model);
    const r = Math.max(size.x, size.y, size.z) || 0.5;
    camera.position.set(0, r * 0.35, r * 2.6);
    camera.lookAt(0, 0, 0);
    info.textContent = `${dt.icon} ${dt.label} · ${dt.size[0]} × ${dt.size[1]} × ${dt.size[2]} mm · ${PLACES[dt.place] ?? ''}`;
  }
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (model) model.rotation.y += 0.01;
    renderer.render(scene, camera);
  };

  // --- listy ---
  function fill() {
    const q = search.value.trim().toLowerCase();
    const items = DECOR_TYPES.filter((dt) => (!cat.value || dt.category === cat.value) && (!q || `${dt.label} ${dt.keywords ?? ''}`.toLowerCase().includes(q)));
    const keep = list.value;
    list.innerHTML = items.map((dt) => `<option value="${dt.key}">${dt.icon} ${escapeHtml(dt.label)}</option>`).join('') || `<option value="" disabled>${t('Nic nie znaleziono')}</option>`;
    list.value = items.some((dt) => dt.key === keep) ? keep : (items[0]?.key ?? '');
    show(list.value);
  }
  cat.addEventListener('change', fill);
  search.addEventListener('input', fill);
  list.addEventListener('change', () => show(list.value));
  list.addEventListener('dblclick', () => list.value && onAdd(list.value));
  root.querySelector('[data-da-add]').addEventListener('click', () => list.value && onAdd(list.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && list.value) {
      e.preventDefault();
      onAdd(list.value);
    }
  });
  fill();

  return {
    // okienko otwarte — podgląd się obraca; zamknięte — bez rysowania
    setOpen(open) {
      if (open && raf == null) {
        loop();
        search.focus({ preventScroll: true });
      } else if (!open && raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    },
  };
}
