import {
  BOARD_THICKNESSES,
  BACK_TYPES,
  CABINET_LIMITS,
  createCabinet,
  fitCabinetToSpace,
  cabinetPanels,
  cabinetIssues,
  panelCutSize,
  resizePanelLinked,
  JOINT_TYPES,
} from '../model/furniture.js';
import { duplicateCabinet, slideCabinet } from '../model/placement.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1 } from './dom.js';

const POSITION_FIELDS = [
  { key: 'x', label: 'X od lewej' },
  { key: 'y', label: 'Y od podłogi' },
  { key: 'z', label: 'Z od tyłu' },
];
const SIZE_FIELDS = [
  { key: 'width', label: 'Szerokość' },
  { key: 'height', label: 'Wysokość' },
  { key: 'depth', label: 'Głębokość' },
];

// Pola elementu korpusu: wymiary i przesunięcia w osiach X/Y/Z.
const PART_FIELDS = [
  { key: 'sx', label: 'Wymiar X', prop: 'width', min: 1 },
  { key: 'sy', label: 'Wymiar Y', prop: 'height', min: 1 },
  { key: 'sz', label: 'Wymiar Z', prop: 'depth', min: 1 },
  { key: 'dx', label: 'Przesuń X', min: -CABINET_LIMITS.sizeMax },
  { key: 'dy', label: 'Przesuń Y', min: -CABINET_LIMITS.sizeMax },
  { key: 'dz', label: 'Przesuń Z', min: -CABINET_LIMITS.sizeMax },
];

function jointSelect(label, field, options, value) {
  return `
    <label class="field small">
      <span>${label}</span>
      <select data-f="${field}">
        ${options.map((o) => `<option value="${o.key}" ${o.key === value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </label>`;
}

// Panel mebli (korpusów). Pełna przebudowa DOM tylko przy zmianach strukturalnych
// (dodanie/usunięcie korpusu, zmiana rodzaju pleców), w pozostałych przypadkach
// odświeżane są wartości pól i ostrzeżenia.
export function createFurniturePanel(root, store, ui, tabs) {
  let renderedKey = null;
  const openParts = new Set(); // korpusy z rozwiniętą listą elementów

  const structureKey = (project) => project.furniture.map((c) => `${c.id}:${c.backType}`).join('|');
  const updateFurniture = (fn) => store.set((p) => ({ ...p, furniture: fn(p.furniture, p) }));
  const updateCabinet = (id, fn) =>
    updateFurniture((list, p) => list.map((c) => (c.id === id ? fn(c, p) : c)));

  function render(project) {
    root.innerHTML = `
      <h2>Meble</h2>
      <p class="hint">Korpus składa się z boków, wieńca górnego i dolnego oraz pleców.
        Wymiary są zewnętrzne, pozycja to narożnik lewy‑dolny‑tylny.</p>
      <div class="items">
        ${project.furniture.map(renderCabinet).join('') || '<p class="empty">Brak mebli.</p>'}
      </div>
      <div class="add-row">
        <button type="button" data-action="add-cabinet">+ Korpus</button>
      </div>
    `;
    renderedKey = structureKey(project);
    updateStatus(project);
  }

  function renderCabinet(c) {
    const thicknesses = BOARD_THICKNESSES.includes(c.thickness)
      ? BOARD_THICKNESSES
      : [...BOARD_THICKNESSES, c.thickness].sort((a, b) => a - b);
    return `
      <div class="item cabinet" data-kind="cabinet" data-id="${c.id}">
        <div class="item-head">
          <input type="text" data-f="name" value="${escapeHtml(c.name)}" aria-label="Nazwa mebla" />
          <button type="button" data-action="duplicate" title="Duplikuj (Ctrl+D)">⧉</button>
          <button type="button" class="danger" data-remove="${c.id}" title="Usuń (Delete)">✕</button>
        </div>
        <div class="grid-3">
          ${SIZE_FIELDS.map((f) =>
            numberField(f.label, f.key, c[f.key], { min: CABINET_LIMITS.sizeMin, max: CABINET_LIMITS.sizeMax, small: true }),
          ).join('')}
          ${POSITION_FIELDS.map((f) =>
            numberField(f.label, f.key, c[f.key], { min: -CABINET_LIMITS.sizeMax, max: CABINET_LIMITS.sizeMax, small: true }),
          ).join('')}
        </div>
        <div class="grid-2">
          <label class="field small">
            <span>Grubość płyty</span>
            <select data-f="thickness" data-type="number">
              ${thicknesses.map((t) => `<option value="${t}" ${t === c.thickness ? 'selected' : ''}>${t} mm</option>`).join('')}
            </select>
          </label>
          <label class="field small">
            <span>Plecy</span>
            <select data-f="backType">
              ${BACK_TYPES.map((b) => `<option value="${b.key}" ${b.key === c.backType ? 'selected' : ''}>${b.label}</option>`).join('')}
            </select>
          </label>
          ${jointSelect('Wieniec górny', 'topJoint', JOINT_TYPES.top, c.topJoint)}
          ${jointSelect('Wieniec dolny', 'bottomJoint', JOINT_TYPES.bottom, c.bottomJoint)}
        </div>
        <div class="item-row">
          <label class="color-field">
            <input type="color" data-f="color" value="${c.color}" />
            <span>Kolor płyty</span>
          </label>
          <button type="button" data-action="fit">Dopasuj do wnęki</button>
        </div>
        <div class="slide-row" title="Przesuwa korpus aż do ściany, innego mebla lub przeszkody">
          <span>Dosuń:</span>
          <button type="button" data-slide="-x" title="W lewo">←</button>
          <button type="button" data-slide="+x" title="W prawo">→</button>
          <button type="button" data-slide="-z" title="Do tyłu">↑ tył</button>
          <button type="button" data-slide="+z" title="Do przodu">↓ przód</button>
          <button type="button" data-slide="-y" title="W dół — na podłogę albo na mebel poniżej">⤓ dół</button>
        </div>
        <ul class="issues"></ul>
        <details class="parts" ${openParts.has(c.id) ? 'open' : ''}>
          <summary>Elementy</summary>
          <p class="hint">Osie: X — szerokość, Y — wysokość, Z — głębokość korpusu.
            Elementy są powiązane: zmiana wymiaru płyty zmienia korpus, a pozostałe płyty
            się dopasowują (np. szerokość boku → głębokość korpusu i wieńców).
            Zmiana grubości przesuwa sąsiednie płyty.
            „Niezależny” odłącza płytę — jej wymiary dotyczą tylko jej.
            Wartości ręczne są wyróżnione, ↺ przywraca automatyczne.</p>
          ${cabinetPanels(c).map(renderPart).join('')}
        </details>
      </div>`;
  }

  function renderPart(p) {
    return `
      <div class="part" data-part="${p.key}">
        <div class="part-head">
          <span class="part-name">${p.name}</span>
          <span class="part-cut"></span>
          <label class="check small" title="Płyta nie zmienia korpusu i nie dopasowuje się do niego (poza grubościami sąsiadów)">
            <input type="checkbox" data-part-free ${p.free ? 'checked' : ''} /> Niezależny
          </label>
          <button type="button" class="icon" data-reset-part="${p.key}" title="Przywróć wymiary automatyczne">↺</button>
        </div>
        <div class="grid-3">
          ${PART_FIELDS.map(
            (f) => `
            <label class="field small">
              <span>${f.label}</span>
              <input type="number" step="1" min="${f.min}" max="${CABINET_LIMITS.sizeMax}" data-pf="${f.key}" />
            </label>`,
          ).join('')}
        </div>
      </div>`;
  }

  // Wartość pola elementu do wyświetlenia: wymiar wyliczony (lub ręczny) albo przesunięcie.
  const partFieldValue = (cabinet, panel, field) =>
    field.prop ? round1(panel[field.prop]) : (cabinet.panelOverrides?.[panel.key]?.[field.key] ?? 0);

  // Odświeża pola (np. po „Dopasuj do wnęki”), ostrzeżenia i elementy bez przebudowy DOM.
  function updateStatus(project) {
    for (const c of project.furniture) {
      const el = root.querySelector(`[data-kind="cabinet"][data-id="${c.id}"]`);
      if (!el) continue;

      el.querySelectorAll('[data-f]').forEach((input) => {
        if (!input.classList.contains('invalid')) setIfNotFocused(input, c[input.dataset.f]);
      });

      const issues = cabinetIssues(c, project);
      el.classList.toggle('has-issues', issues.length > 0);
      el.querySelector('.issues').innerHTML = issues.length
        ? issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')
        : '<li class="ok">Mieści się w przestrzeni.</li>';

      const panels = cabinetPanels(c);
      el.querySelector('.parts summary').textContent = `Elementy (${panels.length})`;
      for (const p of panels) {
        const partEl = el.querySelector(`[data-part="${p.key}"]`);
        if (!partEl) continue;
        const s = panelCutSize(p);
        partEl.classList.toggle('invalid', !p.valid);
        partEl.querySelector('.part-cut').textContent = p.valid
          ? `${round1(s.length)} × ${round1(s.width)} × ${round1(s.thickness)} mm`
          : 'błędne wymiary';
        partEl.querySelector('[data-reset-part]').hidden = p.overridden.length === 0 && !p.free;
        partEl.querySelector('[data-part-free]').checked = p.free;
        partEl.classList.toggle('free', p.free);
        for (const f of PART_FIELDS) {
          const input = partEl.querySelector(`[data-pf="${f.key}"]`);
          input.classList.toggle('overridden', p.overridden.includes(f.key));
          if (!input.classList.contains('invalid')) setIfNotFocused(input, partFieldValue(c, p, f));
        }
      }
    }
  }

  // --- zdarzenia (delegacja) ---
  root.addEventListener('input', (e) => {
    const input = e.target;
    const cabinetEl = input.closest('[data-kind="cabinet"]');
    if (!cabinetEl) return;
    const id = cabinetEl.dataset.id;

    const part = input.closest('[data-part]')?.dataset.part;

    // Przełącznik „Niezależny”: po ponownym powiązaniu płyta wraca do wymiarów z korpusu.
    if (input.dataset.partFree !== undefined) {
      updateCabinet(id, (c) => {
        const o = { ...c.panelOverrides?.[part] };
        if (input.checked) {
          // Zamrażamy bieżące wymiary płyty (bez grubości), żeby po odłączeniu nic się nie przesunęło.
          const p = cabinetPanels(c).find((x) => x.key === part);
          const sizes = { sx: p.width, sy: p.height, sz: p.depth };
          delete sizes[`s${p.thicknessAxis}`];
          Object.assign(o, { free: true, ...sizes });
        } else {
          const axis = cabinetPanels(c).find((x) => x.key === part).thicknessAxis;
          for (const a of ['x', 'y', 'z']) if (a !== axis) delete o[`s${a}`];
          delete o.free;
        }
        return { ...c, panelOverrides: { ...c.panelOverrides, [part]: o } };
      });
      return;
    }

    // Pole elementu korpusu.
    if (input.dataset.pf) {
      const value = readNumberInput(input);
      if (value === undefined) return;
      const pf = input.dataset.pf;
      const cabinet = store.get().furniture.find((c) => c.id === id);
      const panel = cabinetPanels(cabinet).find((p) => p.key === part);
      const isLinkedSize = pf[0] === 's' && pf[1] !== panel.thicknessAxis && !panel.free;

      if (isLinkedSize) {
        // Wymiar powiązany → zmieniamy korpus, reszta płyt dopasowuje się sama.
        const next = resizePanelLinked(cabinet, part, pf[1], value);
        if (!next) {
          input.classList.add('invalid');
          return;
        }
        updateCabinet(id, () => next);
      } else {
        // Grubość, przesunięcie albo wymiar płyty niezależnej → zapis w panelOverrides.
        updateCabinet(id, (c) => ({
          ...c,
          panelOverrides: { ...c.panelOverrides, [part]: { ...c.panelOverrides?.[part], [pf]: value } },
        }));
      }
      return;
    }

    const field = input.dataset.f;
    if (!field) return;
    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    } else if (input.dataset.type === 'number') {
      value = Number(value);
    }
    updateCabinet(id, (c) => ({ ...c, [field]: value }));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number') return;
    if (!input.classList.contains('invalid') && input.value.trim() !== '') return;
    input.classList.remove('invalid');
    const id = input.closest('[data-kind="cabinet"]')?.dataset.id;
    const cabinet = store.get().furniture.find((c) => c.id === id);
    if (!cabinet) return;
    if (input.dataset.pf) {
      const partKey = input.closest('[data-part]').dataset.part;
      const panel = cabinetPanels(cabinet).find((p) => p.key === partKey);
      const field = PART_FIELDS.find((f) => f.key === input.dataset.pf);
      if (panel) input.value = partFieldValue(cabinet, panel, field);
    } else {
      input.value = cabinet[input.dataset.f];
    }
  });

  // Zapamiętujemy rozwinięcie listy elementów, żeby nie zwijała się przy przebudowie panelu.
  root.addEventListener(
    'toggle',
    (e) => {
      const id = e.target.closest?.('[data-kind="cabinet"]')?.dataset.id;
      if (!id || !e.target.classList.contains('parts')) return;
      if (e.target.open) openParts.add(id);
      else openParts.delete(id);
    },
    true, // zdarzenie toggle nie „bąbelkuje”, łapiemy je w fazie przechwytywania
  );

  // Kliknięcie lub fokus w karcie korpusu zaznacza go (także w widoku 3D).
  const selectFrom = (target) => {
    const id = target.closest?.('[data-kind="cabinet"]')?.dataset.id;
    if (id && ui.get().selectedId !== id) ui.set({ ...ui.get(), selectedId: id });
  };
  root.addEventListener('focusin', (e) => selectFrom(e.target));

  root.addEventListener('click', (e) => {
    selectFrom(e.target);
    const { action, remove, resetPart, slide } = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
    if (action === 'add-cabinet') {
      const cabinet = createCabinet(store.get());
      updateFurniture((list) => [...list, cabinet]);
      ui.set({ ...ui.get(), selectedId: cabinet.id }, { reveal: true });
    } else if (action === 'duplicate' && id) {
      const copy = duplicateCabinet(store.get(), id);
      updateFurniture((list) => [...list, copy]);
      ui.set({ ...ui.get(), selectedId: copy.id }, { reveal: true });
    } else if (slide && id) {
      updateCabinet(id, (c, p) => slideCabinet(p, c.id, slide));
    } else if (action === 'fit' && id) {
      updateCabinet(id, (c, p) => fitCabinetToSpace(c, p.space));
    } else if (resetPart && id) {
      updateCabinet(id, (c) => {
        const { [resetPart]: _removed, ...rest } = c.panelOverrides ?? {};
        return { ...c, panelOverrides: rest };
      });
    } else if (remove) {
      updateFurniture((list) => list.filter((c) => c.id !== remove));
    }
  });

  // Podświetlenie zaznaczonego korpusu; przy `reveal` przełączamy zakładkę i przewijamy do niego.
  function syncSelection(meta = {}) {
    const { selectedId } = ui.get();
    root.querySelectorAll('[data-kind="cabinet"]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === selectedId);
    });
    if (meta.reveal && selectedId) {
      tabs.activate('furniture-panel');
      root.querySelector(`[data-kind="cabinet"][data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  render(store.get());
  syncSelection();

  return {
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) {
        render(project);
        syncSelection();
      } else updateStatus(project);
    },
    syncSelection,
  };
}
