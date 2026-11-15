import { escapeHtml, readNumberInput, setIfNotFocused, numberField, commitEmptyAsZero } from './dom.js';
import { materialSelect, colorPicker, readColorInput, syncColorPicker, setEye } from './widgets.js';
import { BOARD_KINDS, BOARD_LIMITS, createBoard, boardMaterial, boardIssues } from '../model/boards.js';
import { setPath } from '../model/furniture.js';
import { renderBoardFeatures, syncBoardFeatures, readFeatureInput, readFeatureClick, applyFeatureChange } from './boardFeaturesEditor.js';
import { describeEdges, describeHoles } from '../model/boardFeatures.js';

// Samodzielne płyty (blaty, półki) w zakładce „Blaty i półki”, pod blatami na szafkach: dodawanie, wymiary, położenie,
// materiał i kolor, frezy krawędzi i otwory.
export function createBoardsPanel(root, store) {
  const update = (id, fn) =>
    store.set((p) => ({ ...p, boards: (p.boards ?? []).map((b) => (b.id === id ? fn(b, p) : b)) }));
  let renderedKey = null;
  const structureKey = (p) =>
    (p.boards ?? []).map((b) => b.id).join('|') + '#' + p.materials.map((m) => `${m.id}:${m.name}:${m.thickness}`).join('|');

  function card(b, project) {
    const L = BOARD_LIMITS;
    return `
      <div class="item board" data-kind="board" data-id="${b.id}">
        <div class="item-head">
          <input type="text" data-f="name" value="${escapeHtml(b.name)}" aria-label="Nazwa" />
          <button type="button" class="icon eye" data-board-hide title="Ukryj w widoku 3D">👁</button>
          <button type="button" class="danger" data-board-remove title="Usuń">✕</button>
        </div>
        <div class="grid-3">
          <label class="field small"><span>Rodzaj</span>
            <select data-f="kind">${BOARD_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select>
          </label>
          ${numberField('Szerokość', 'width', b.width, { min: L.sizeMin, max: L.sizeMax, small: true, unit: 'mm' })}
          ${numberField('Głębokość', 'depth', b.depth, { min: L.sizeMin, max: L.sizeMax, small: true, unit: 'mm' })}
          ${numberField('X od lewej', 'x', b.x, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
          ${numberField('Y od podłogi (spód)', 'y', b.y, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
          ${numberField('Z od tyłu', 'z', b.z, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
        </div>
        <div class="grid-2">
          ${materialSelect('Materiał', 'materialId', project)}
        </div>
        ${colorPicker('Kolor / dekor (dąb, orzech, beton, marmur…)', 'color', { wide: true })}
        ${renderBoardFeatures()}
        <p class="hint board-info"></p>
        <ul class="issues board-issues"></ul>
      </div>`;
  }

  function render(project) {
    const boards = project.boards ?? [];
    root.innerHTML = `
      <h3 class="boards-title">Samodzielne blaty i półki</h3>
      <p class="hint">Płyty niezwiązane z szafkami — np. blat biurka, parapet, półka na ścianie. Z frezami krawędzi
        i otworami (gniazdko, przepust na kable, zlew, płyta grzewcza).</p>
      <div class="items">${boards.map((b) => card(b, project)).join('')}</div>
      <div class="add-row">
        <button type="button" data-board-add="worktop">+ Blat samodzielny</button>
        <button type="button" data-board-add="shelf">+ Półka</button>
      </div>`;
    renderedKey = structureKey(project);
    sync(project);
  }

  function sync(project) {
    for (const b of project.boards ?? []) {
      const el = root.querySelector(`[data-kind="board"][data-id="${b.id}"]`);
      if (!el) continue;
      el.querySelectorAll('[data-f]').forEach((input) => {
        if (input.dataset.f === 'name') return setIfNotFocused(input, b.name);
        if (!input.classList.contains('invalid')) setIfNotFocused(input, b[input.dataset.f] ?? '');
      });
      const mat = boardMaterial(b, project);
      syncColorPicker(el, 'color', b.color, mat.color);
      setEye(el.querySelector('[data-board-hide]'), b.hidden, b.kind === 'worktop' ? 'blat' : 'półkę');
      syncBoardFeatures(el, b, b.width, b.depth);
      el.querySelector('.board-info').textContent =
        `Formatka: ${b.width} × ${b.depth} × ${mat.thickness} mm` + [describeEdges(b.edges), describeHoles(b.holes)].filter(Boolean).map((t) => ` · ${t}`).join('');
      const issues = boardIssues(b, project);
      el.classList.toggle('has-issues', issues.length > 0);
      el.querySelector('.board-issues').innerHTML = issues.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    }
  }

  root.addEventListener('input', (e) => {
    const input = e.target;
    const id = input.closest('[data-kind="board"]')?.dataset.id;
    if (!id) return;
    const color = readColorInput(input);
    if (color) return update(id, (b) => setPath(b, color.path, color.value));
    const feature = readFeatureInput(input);
    if (feature) return update(id, (b) => applyFeatureChange(b, feature, b.width, b.depth, setPath));
    if (input.dataset.bf || input.dataset.bfAdd !== undefined) return;
    const field = input.dataset.f;
    if (!field) return;
    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    }
    if (field === 'kind') {
      // inny rodzaj — materiał domyślny dla rodzaju (blat / płyta meblowa)
      return update(id, (b, p) => ({ ...b, kind: value, materialId: p.materials.find((m) => m.type === (value === 'worktop' ? 'worktop' : 'chipboard'))?.id ?? b.materialId }));
    }
    update(id, (b) => ({ ...b, [field]: value }));
  });
  root.addEventListener('change', (e) => commitEmptyAsZero(e.target));

  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-board-add]')?.dataset.boardAdd;
    if (add) {
      store.set((p) => ({ ...p, boards: [...(p.boards ?? []), createBoard(p, add)] }));
      root.querySelector('.items > .board:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const id = e.target.closest('[data-kind="board"]')?.dataset.id;
    if (!id) return;
    if (e.target.closest('[data-board-remove]')) {
      store.set((p) => ({ ...p, boards: p.boards.filter((b) => b.id !== id) }));
      return;
    }
    if (e.target.closest('[data-board-hide]')) return update(id, (b) => ({ ...b, hidden: !b.hidden }));
    const click = readFeatureClick(e.target);
    if (click) update(id, (b) => applyFeatureChange(b, click, b.width, b.depth, setPath));
  });

  render(store.get());
  return {
    // Przewija do karty płyty (po kliknięciu jej w widoku 3D).
    reveal(id) {
      root.querySelector(`[data-kind="board"][data-id="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else sync(project);
    },
  };
}
