import { escapeHtml, readNumberInput } from './dom.js';
import { colorPicker, readColorInput, materialSelect } from './widgets.js';
import { selectedCabinetIds } from '../state/selection.js';
import { resizeCabinets } from '../model/groupResize.js';
import { updateCabinetRefit, setLegs } from '../model/layout.js';
import { createLegsDialog } from './legsDialog.js';
import { getPath, setPath, BACK_TYPES, TOP_TYPES, HANDLE_TYPES, HANDLE_GROOVES, HANDLE_POSITIONS, CABINET_LIMITS, LEG_LIMITS, FRONT_LIMITS } from '../model/furniture.js';
import { FRONT_DECORS } from '../model/decor.js';
import { duplicateSelected } from '../state/duplicate.js';
import { t } from '../i18n.js';

// Okienko po prawej przy kilku zaznaczonych korpusach (Ctrl + klik): pola wspólne dla wszystkich — zmiana
// dotyczy każdego zaznaczonego korpusu. Pole z różnymi wartościami w korpusach — puste („różne”); zostaje,
// dopóki go nie zmienisz.
const MIXED = '__mixed';

export function createMultiCabinetWindow(viewport, store, ui) {
  const root = document.createElement('aside');
  root.className = 'board-inspector multi-cab';
  root.hidden = true;
  viewport.appendChild(root);
  let shownSig = '';

  const selected = () => {
    const ids = selectedCabinetIds(ui.get());
    if (ids.size < 2) return [];
    return store.get().furniture.filter((c) => ids.has(c.id));
  };
  const num = (label, path, { min = 0, max = CABINET_LIMITS.sizeMax, step = 1 } = {}) =>
    `<label class="bi-field"><span>${label}</span><input type="number" step="${step}" min="${min}" max="${max}" data-mc="${path}" /><small>mm</small></label>`;
  const sel = (label, path, options) =>
    `<label class="bi-field wide"><span>${label}</span><select data-mc="${path}">${options.map((o) => `<option value="${o.key}">${escapeHtml(o.label)}</option>`).join('')}</select></label>`;

  function render(project) {
    root.innerHTML = `
      <div class="bi-head"><b data-mc-title></b><button type="button" class="icon tiny" data-mc-close title="${t('Odznacz')}">✕</button></div>
      <p class="bi-note">${t('Zmiana dotyczy wszystkich zaznaczonych korpusów. Puste pole — w korpusach są różne wartości. Ctrl + klik w 3D albo na mapce — dodaj / odejmij korpus.')}</p>
      <div class="mc-list" data-mc-list></div>
      <div class="bi-sec">${t('Wymiary')}</div>
      <div class="bi-grid">${num(t('Szerokość'), 'width', { min: CABINET_LIMITS.sizeMin })}${num(t('Wysokość'), 'height', { min: CABINET_LIMITS.sizeMin })}${num(t('Głębokość'), 'depth', { min: CABINET_LIMITS.sizeMin })}</div>
      <p class="bi-note mc-small">${t('Szerokość: korpusy w rzędzie obok przesuwają się, żeby dalej stały bok przy boku.')}</p>
      <div class="bi-sec">${t('Korpus')}</div>
      <div class="mc-form">
        ${materialSelect(t('Materiał korpusu'), 'materialId', project).replace('data-f=', 'data-mc=')}
        ${colorPicker(t('Kolor korpusu'), 'colors.body')}
        ${sel(t('Plecy'), 'backType', BACK_TYPES)}
        ${sel(t('Góra korpusu'), 'topType', TOP_TYPES)}
        ${materialSelect(t('Materiał blend'), 'blendMaterialId', project).replace('data-f=', 'data-mc=')}
        ${colorPicker(t('Kolor blend'), 'colors.blend')}
      </div>
      <div class="bi-sec">${t('Fronty')}</div>
      <div class="mc-form">
        ${materialSelect(t('Materiał frontów'), 'frontMaterialId', project).replace('data-f=', 'data-mc=')}
        ${colorPicker(t('Kolor frontów'), 'colors.front')}
        ${sel(t('Frez dekoracyjny'), 'fronts.decor', FRONT_DECORS)}
        ${sel(t('Frez uchwytowy'), 'fronts.groove', HANDLE_GROOVES)}
        ${sel(t('Uchwyt'), 'fronts.handle.type', HANDLE_TYPES)}
        ${sel(t('Położenie uchwytu'), 'fronts.handle.position', HANDLE_POSITIONS)}
      </div>
      <div class="bi-grid">${num(t('Rozstaw uchw.'), 'fronts.handle.spacing', { min: 16, max: 2000 })}${num(t('Szczelina pion.'), 'fronts.gap', { max: FRONT_LIMITS.gapMax, step: 0.5 })}${num(t('Szczelina poz.'), 'fronts.gapV', { max: FRONT_LIMITS.gapMax, step: 0.5 })}</div>
      <div class="bi-sec">${t('Nóżki')}</div>
      <div class="bi-grid">${num(t('Wysokość nóżek'), 'legs.height', { min: LEG_LIMITS.min, max: LEG_LIMITS.max })}</div>
      <p class="bi-note mc-small" data-mc-legs-note></p>
      <div class="bi-actions mc-legs-actions">
        <button type="button" data-mc-legs="add" title="${t('Nóżki we wszystkich zaznaczonych korpusach, które ich nie mają')}">${t('+ Dodaj nóżki')}</button>
        <button type="button" data-mc-legs="remove" title="${t('Usuń nóżki ze wszystkich zaznaczonych korpusów')}">${t('Usuń nóżki')}</button>
      </div>
      <div class="bi-actions">
        <button type="button" data-mc-dup>${t('⧉ Duplikuj')}</button>
        <button type="button" class="danger" data-mc-del>${t('🗑 Usuń zaznaczone')}</button>
      </div>`;
  }

  // wartość wspólna albo MIXED (kolory — porównanie po hex)
  const common = (cabs, path) => {
    const vals = cabs.map((c) => getPath(c, path));
    const key = (v) => (v && typeof v === 'object' ? v.hex : v ?? null);
    return vals.every((v) => key(v) === key(vals[0])) ? vals[0] : MIXED;
  };
  const mixedOption = (select, mixed) => {
    let o = select.querySelector(`option[value="${MIXED}"]`);
    if (mixed && !o) select.insertAdjacentHTML('afterbegin', `<option value="${MIXED}">${t('— różne —')}</option>`);
    if (!mixed && o) o.remove();
  };

  function sync() {
    const cabs = selected();
    if (!cabs.length) {
      root.hidden = true;
      shownSig = '';
      return;
    }
    const project = store.get();
    const sig = project.materials.map((m) => m.id + m.name).join('|');
    if (sig !== shownSig) render(project);
    shownSig = sig;
    root.hidden = false;
    root.querySelector('[data-mc-title]').textContent = t('Zaznaczone korpusy: {n}', { n: cabs.length });
    root.querySelector('[data-mc-list]').innerHTML = cabs.map((c) => `<span class="mc-chip">${escapeHtml(c.name)}</span>`).join('');
    root.querySelectorAll('[data-mc]').forEach((el) => {
      if (document.activeElement === el) return;
      const path = el.dataset.mc;
      const group = path.startsWith('legs.') ? cabs.filter((c) => c.legs?.enabled) : cabs;
      const v = group.length ? common(group, path) : MIXED;
      if (el.tagName === 'SELECT') {
        mixedOption(el, v === MIXED);
        el.value = v === MIXED ? MIXED : String(v ?? '');
      } else {
        el.value = v === MIXED || v == null ? '' : Math.round(v * 10) / 10;
        el.placeholder = v === MIXED ? t('różne') : '';
      }
      if (path.startsWith('legs.')) el.disabled = !group.length;
    });
    root.querySelectorAll('[data-color-select]').forEach((s) => {
      if (document.activeElement === s) return;
      const v = common(cabs, s.dataset.colorSelect);
      const custom = s.parentElement.querySelector('[data-color-custom]');
      mixedOption(s, v === MIXED);
      if (v === MIXED) s.value = MIXED;
      else if (!v) s.value = '';
      else s.value = [...s.options].some((o) => o.value === v.hex) ? v.hex : 'custom';
      if (v && v !== MIXED) custom.value = v.hex;
    });
    const withLegs = cabs.filter((c) => c.legs?.enabled).length;
    root.querySelector('[data-mc-legs-note]').textContent =
      withLegs === cabs.length ? '' : withLegs ? t('Nóżki ma {n} z {total} korpusów — wysokość zmienia się tylko w nich.', { n: withLegs, total: cabs.length }) : t('Zaznaczone korpusy nie mają nóżek.');
    const addBtn = root.querySelector('[data-mc-legs="add"]');
    addBtn.hidden = withLegs === cabs.length;
    addBtn.textContent = withLegs ? t('+ Dodaj nóżki pozostałym ({n})', { n: cabs.length - withLegs }) : t('+ Dodaj nóżki ({n})', { n: cabs.length });
    root.querySelector('[data-mc-legs="remove"]').hidden = !withLegs;
  }

  // zmiana pola we wszystkich zaznaczonych
  function apply(path, value) {
    const ids = new Set(selected().map((c) => c.id));
    if (!ids.size) return;
    if (path === 'width' || path === 'height' || path === 'depth') {
      store.set((p) => resizeCabinets(p, [...ids], path, value));
      return;
    }
    if (path.startsWith('legs.')) {
      store.set((p) => [...ids].filter((id) => p.furniture.find((c) => c.id === id)?.legs?.enabled).reduce((proj, id) => updateCabinetRefit(proj, id, (c) => setPath(c, path, value)), p));
      return;
    }
    store.set((p) => ({
      ...p,
      furniture: p.furniture.map((c) => {
        if (!ids.has(c.id)) return c;
        let next = setPath(c, path, value);
        if (path === 'fronts.handle.position') next = setPath(next, 'fronts.handle.offsetY', null);
        return next;
      }),
    }));
  }

  // nóżki: dodanie / usunięcie we wszystkich zaznaczonych — jak w karcie korpusu (pytanie o wysokość zabudowy)
  const legsDialog = createLegsDialog();
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-mc-legs]')?.dataset.mcLegs;
    if (!act) return;
    const cabs = selected();
    const withLegs = cabs.filter((c) => c.legs?.enabled);
    // wysokość: wspólna z korpusów, które już mają nóżki, albo domyślna
    const h = withLegs[0]?.legs?.height ?? cabs[0]?.legs?.height ?? 80;
    if (act === 'add') {
      const ids = cabs.filter((c) => !c.legs?.enabled).map((c) => c.id);
      if (!ids.length) return;
      legsDialog.ask({ legHeight: h, adding: true, count: ids.length }).then((mode) => {
        if (mode) store.set((p) => setLegs(p, ids, true, h, mode));
      });
    } else {
      const ids = withLegs.map((c) => c.id);
      if (!ids.length) return;
      // korpusy, w których pamiętamy, jak dodano nóżki, wracają do stanu sprzed ich dodania bez pytania
      const unknown = withLegs.filter((c) => !c.legs?.mode);
      if (!unknown.length) return store.set((p) => setLegs(p, ids, false, h, null));
      legsDialog.ask({ legHeight: h, adding: false, count: unknown.length }).then((mode) => {
        if (mode) store.set((p) => setLegs(p, ids, false, h, mode));
      });
    }
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    const color = readColorInput(el);
    if (color) {
      if (el.value === MIXED) return;
      return apply(color.path, color.value);
    }
    const path = el.dataset.mc;
    if (!path) return;
    if (el.tagName === 'SELECT') {
      if (el.value === MIXED) return;
      return apply(path, el.value);
    }
    if (el.value.trim() === '') return sync(); // puste — bez zmian
    const v = readNumberInput(el);
    if (v == null) return sync();
    apply(path, v);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.mc) e.target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  root.addEventListener('click', (e) => {
    const tg = e.target;
    if (tg.closest('[data-mc-close]')) {
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [] });
      return;
    }
    if (tg.closest('[data-mc-dup]')) {
      const id = ui.get().selectedId;
      if (id) duplicateSelected(store, ui, id);
      return;
    }
    if (tg.closest('[data-mc-del]')) {
      const cabs = selected();
      if (!cabs.length || !confirm(t('Usunąć zaznaczone korpusy ({n})?', { n: cabs.length }))) return;
      const ids = new Set(cabs.map((c) => c.id));
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [] });
      store.set((p) => ({ ...p, furniture: p.furniture.filter((c) => !ids.has(c.id)) }));
    }
  });

  store.subscribe(sync);
  ui.subscribe(sync);
  sync();
}
