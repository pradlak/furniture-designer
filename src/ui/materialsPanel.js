import {
  MATERIAL_TYPES,
  MATERIAL_THICKNESSES,
  EDGE_BANDING_OPTIONS,
  createMaterial,
} from '../model/materials.js';
import { escapeHtml, readNumberInput, setIfNotFocused } from './dom.js';

// Zakładka „Materiały”: biblioteka płyt projektu. Zmiana grubości materiału od razu przebudowuje
// wszystkie korpusy i blendy, które go używają.
export function createMaterialsPanel(root, store) {
  let renderedKey = null;
  const structureKey = (project) => project.materials.map((m) => m.id).join('|');
  const updateMaterial = (id, patch) =>
    store.set((p) => ({ ...p, materials: p.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  // Gdzie materiał jest użyty (do podpowiedzi i ostrzeżenia przy usuwaniu).
  function usage(project, id) {
    const body = project.furniture.filter((c) => c.materialId === id).length;
    const blend = project.furniture.filter((c) => c.blendMaterialId === id).length;
    const trims = project.trims.filter((t) => t.materialId === id).length;
    const parts = [];
    if (body) parts.push(`korpus: ${body}`);
    if (blend) parts.push(`blendy korpusów: ${blend}`);
    if (trims) parts.push(`blendy dolne/górne: ${trims}`);
    return parts;
  }

  function render(project) {
    root.innerHTML = `
      <h2>Materiały</h2>
      <p class="hint">Płyty używane w projekcie. Materiał określa grubość i kolor elementów.
        <b>Obrzeże</b> to taśma (ABS/PCV) oklejająca krawędzie płyty — wymiar gotowego elementu
        zawiera obrzeże, a wymiar do cięcia jest o nie mniejszy. Lakierowany MDF i HDF zwykle nie mają obrzeża.</p>
      <div class="items">
        ${project.materials.map(renderMaterial).join('') || '<p class="empty">Brak materiałów.</p>'}
      </div>
      <div class="add-row"><button type="button" data-action="add-material">+ Materiał</button></div>
      <datalist id="material-thicknesses">${MATERIAL_THICKNESSES.map((t) => `<option value="${t}"></option>`).join('')}</datalist>
    `;
    renderedKey = structureKey(project);
    updateStatus(project);
  }

  function renderMaterial(m) {
    return `
      <div class="item material" data-id="${m.id}">
        <div class="item-head">
          <input type="color" data-f="color" title="Kolor" />
          <input type="text" data-f="name" value="${escapeHtml(m.name)}" aria-label="Nazwa materiału" />
          <button type="button" class="danger" data-remove-material="${m.id}" title="Usuń">✕</button>
        </div>
        <div class="grid-3">
          <label class="field small">
            <span>Rodzaj</span>
            <select data-f="type">
              ${MATERIAL_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
            </select>
          </label>
          <label class="field small">
            <span>Grubość <small>mm</small></span>
            <input type="number" list="material-thicknesses" step="0.1" min="1" max="100" data-f="thickness" data-type="number" />
          </label>
          <label class="field small">
            <span>Obrzeże <small>mm</small></span>
            <select data-f="edgeBanding" data-type="number">
              ${EDGE_BANDING_OPTIONS.map((b) => `<option value="${b}">${b ? String(b).replace('.', ',') : 'brak'}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="material-usage hint"></p>
      </div>`;
  }

  function updateStatus(project) {
    for (const m of project.materials) {
      const el = root.querySelector(`.material[data-id="${m.id}"]`);
      if (!el) continue;
      el.querySelectorAll('[data-f]').forEach((input) => {
        if (!input.classList.contains('invalid')) setIfNotFocused(input, m[input.dataset.f]);
      });
      const used = usage(project, m.id);
      el.querySelector('.material-usage').textContent = used.length ? `Używany — ${used.join(', ')}` : 'Nieużywany';
    }
  }

  root.addEventListener('input', (e) => {
    const input = e.target;
    const id = input.closest('.material')?.dataset.id;
    const field = input.dataset.f;
    if (!id || !field) return;
    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    } else if (input.dataset.type === 'number') {
      value = Number(value);
    }
    updateMaterial(id, { [field]: value });
  });

  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number' || (!input.classList.contains('invalid') && input.value.trim() !== '')) return;
    input.classList.remove('invalid');
    const m = store.get().materials.find((x) => x.id === input.closest('.material')?.dataset.id);
    if (m) input.value = m[input.dataset.f];
  });

  root.addEventListener('click', (e) => {
    const { action, removeMaterial } = e.target.dataset ?? {};
    if (action === 'add-material') {
      store.set((p) => ({ ...p, materials: [...p.materials, createMaterial()] }));
    } else if (removeMaterial) {
      const project = store.get();
      const used = usage(project, removeMaterial);
      const msg = used.length
        ? `Materiał jest używany (${used.join(', ')}). Elementy przejdą na pierwszy materiał tego samego rodzaju. Usunąć?`
        : 'Usunąć materiał?';
      if (confirm(msg)) store.set((p) => ({ ...p, materials: p.materials.filter((m) => m.id !== removeMaterial) }));
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
