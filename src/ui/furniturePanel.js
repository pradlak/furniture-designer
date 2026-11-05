import {
  BOARD_THICKNESSES,
  BACK_TYPES,
  CABINET_LIMITS,
  createCabinet,
  fitCabinetToSpace,
  cabinetPanels,
  cabinetIssues,
  panelCutSize,
} from '../model/furniture.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused } from './dom.js';

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

// Panel mebli (korpusów). Podobnie jak panel przestrzeni: pełna przebudowa DOM tylko przy
// dodaniu/usunięciu korpusu, w pozostałych przypadkach odświeżane są wartości i ostrzeżenia.
export function createFurniturePanel(root, store) {
  let renderedKey = null;

  const structureKey = (project) => project.furniture.map((c) => c.id).join('|');
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
          <button type="button" class="danger" data-remove="${c.id}" title="Usuń">✕</button>
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
        </div>
        <div class="item-row">
          <label class="color-field">
            <input type="color" data-f="color" value="${c.color}" />
            <span>Kolor płyty</span>
          </label>
          <button type="button" data-action="fit">Dopasuj do wnęki</button>
        </div>
        <ul class="issues"></ul>
        <details class="parts">
          <summary>Elementy</summary>
          <table><tbody></tbody></table>
        </details>
      </div>`;
  }

  // Odświeża pola (np. po „Dopasuj do wnęki”), ostrzeżenia i listę elementów bez przebudowy DOM.
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
      el.querySelector('.parts tbody').innerHTML = panels
        .map((p) => {
          const s = panelCutSize(p);
          return `<tr><td>${p.name}</td><td>${fmt(s.length)} × ${fmt(s.width)}</td><td>${fmt(s.thickness)} mm</td></tr>`;
        })
        .join('');
    }
  }

  // --- zdarzenia (delegacja) ---
  root.addEventListener('input', (e) => {
    const input = e.target;
    const field = input.dataset.f;
    const cabinetEl = input.closest('[data-kind="cabinet"]');
    if (!field || !cabinetEl) return;

    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    } else if (input.dataset.type === 'number') {
      value = Number(value);
    }
    updateCabinet(cabinetEl.dataset.id, (c) => ({ ...c, [field]: value }));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number') return;
    if (input.classList.contains('invalid') || input.value.trim() === '') {
      const id = input.closest('[data-kind="cabinet"]')?.dataset.id;
      const cabinet = store.get().furniture.find((c) => c.id === id);
      if (cabinet) input.value = cabinet[input.dataset.f];
      input.classList.remove('invalid');
    }
  });

  root.addEventListener('click', (e) => {
    const { action, remove } = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
    if (action === 'add-cabinet') {
      updateFurniture((list, p) => [...list, createCabinet(p)]);
    } else if (action === 'fit' && id) {
      updateCabinet(id, (c, p) => fitCabinetToSpace(c, p.space));
    } else if (remove) {
      updateFurniture((list) => list.filter((c) => c.id !== remove));
    }
  });

  render(store.get());

  return {
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else updateStatus(project);
    },
  };
}

function fmt(v) {
  return Math.round(v * 10) / 10;
}
