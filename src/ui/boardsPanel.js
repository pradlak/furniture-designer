import { escapeHtml, readNumberInput, setIfNotFocused, numberField, commitEmptyAsZero, scrollIntoPanel } from './dom.js';
import { materialSelect, colorPicker, readColorInput, syncColorPicker, setEye } from './widgets.js';
import { BOARD_KINDS, BOARD_LIMITS, createBoard, boardMaterial, boardIssues, BOARD_MOUNTS, mountPoints, MOUNT_MACHINING, normalizeMount, describeMountWork } from '../model/boards.js';
import { setPath } from '../model/furniture.js';
import { renderBoardFeatures, syncBoardFeatures, readFeatureInput, readFeatureClick, applyFeatureChange } from './boardFeaturesEditor.js';
import { describeEdges, describeHoles } from '../model/boardFeatures.js';
import { attachDragReorder, moveInList, DRAG_HANDLE } from './dragReorder.js';
import { createCardCollapse, COLLAPSE_BUTTON } from './collapsible.js';
import { groupPanelSections } from './panelSections.js';
import { t } from '../i18n.js';

// Samodzielne płyty (blaty, półki) w zakładce „Blaty i półki”, pod blatami na szafkach: dodawanie, wymiary, położenie,
// materiał i kolor, frezy krawędzi i otwory.
// ui — stan zaznaczenia: klik w kartę zaznacza płytę (także w 3D), zaznaczona w 3D płyta ma wyróżnioną kartę.
export function createBoardsPanel(root, store, ui) {
  const cardCollapse = createCardCollapse(root, 'płytę'); // zwijane karty (jak blaty na szafkach)
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
          ${DRAG_HANDLE}
          ${COLLAPSE_BUTTON}
          <input type="text" data-f="name" value="${escapeHtml(b.name)}" aria-label="${t('Nazwa')}" />
          <button type="button" class="eye" data-board-hide title="${t('Ukryj w widoku 3D')}">👁</button>
          <button type="button" class="danger" data-board-remove title="${t('Usuń')}" aria-label="${t('Usuń')}">🗑</button>
        </div>
        <div class="card-sum" data-collapse-card title="${t('Kliknij, aby rozwinąć')}"></div>
        <div class="grid-3">
          <label class="field small"><span>${t('Rodzaj')}</span>
            <select data-f="kind">${BOARD_KINDS.map((k) => `<option value="${k.key}">${k.label}</option>`).join('')}</select>
          </label>
          ${numberField(t('Szerokość'), 'width', b.width, { min: L.sizeMin, max: L.sizeMax, small: true, unit: 'mm' })}
          ${numberField(t('Głębokość'), 'depth', b.depth, { min: L.sizeMin, max: L.sizeMax, small: true, unit: 'mm' })}
          ${numberField(t('Grubość (puste — z materiału)'), 'thickness', b.thickness ?? '', { min: 3, max: 100, small: true, unit: 'mm' })}
          ${numberField(t('X od lewej'), 'x', b.x, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
          ${numberField(t('Y od podłogi (spód)'), 'y', b.y, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
          ${numberField(t('Z od tyłu'), 'z', b.z, { min: -L.sizeMax, max: L.sizeMax * 4, small: true, unit: 'mm' })}
          ${numberField(t('Zapas (luz) przy wnęce'), 'clearance', b.clearance ?? 0, { min: 0, max: 50, small: true, unit: 'mm' })}
        </div>
        <div class="grid-2">
          ${materialSelect(t('Materiał'), 'materialId', project)}
        </div>
        <div class="grid-2 board-mount">
          <label class="field small" title="${t('Jak płyta trzyma się tylnej ściany — widać w 3D, a wsporniki / bolce trafiają do akcesoriów w „Formatkach”')}">
            <span>${t('Mocowanie do ściany')}</span>
            <select data-mount="type">${BOARD_MOUNTS.map((m) => `<option value="${m.key ?? ''}">${escapeHtml(m.label)}</option>`).join('')}</select>
          </label>
          <label class="field small mount-machining" title="${t('Ukryte mocowanie chowa się w płycie — trzeba wywiercić otwory albo wyfrezować wpust; opis z położeniami trafia do „Formatek”')}">
            <span>${t('Obróbka tylnej krawędzi')}</span>
            <select data-mount="machining">${MOUNT_MACHINING.map((m) => `<option value="${m.key ?? ''}">${escapeHtml(m.label)}</option>`).join('')}</select>
          </label>
          <label class="field small mount-count" title="${t('Liczba wsporników / bolców — puste: automatycznie (co ok. 70 cm, ukryte co 40 cm; skrajne: wspornik 7 cm, płytka mocowania ukrytego 3 cm od boku płyty)')}">
            <span>${t('Ilość (puste — auto)')}</span>
            <input type="number" step="1" min="1" max="20" data-mount="count" />
          </label>
        </div>
        ${colorPicker(t('Kolor / dekor (dąb, orzech, beton, marmur…)'), 'color', { wide: true })}
        ${renderBoardFeatures()}
        <p class="hint board-info"></p>
        <ul class="issues board-issues"></ul>
      </div>`;
  }

  function render(project) {
    const boards = project.boards ?? [];
    root.innerHTML = `
      <h3 class="boards-title">${t('Samodzielne blaty i półki')}</h3>
      <p class="hint">${t(`Płyty niezwiązane z szafkami — np. blat biurka, parapet, półka na ścianie. Z frezami krawędzi
        i otworami (gniazdko, przepust na kable, zlew, płyta grzewcza).`)}</p>
      <div class="items">${boards.map((b) => card(b, project)).join('')}</div>
      <div class="add-row">
        <button type="button" data-board-add="worktop" draggable="true" data-dnd="application/x-meble-board-worktop" title="${t('Kliknij — blat w wolnym miejscu; albo przeciągnij do widoku 3D i upuść tam, gdzie ma być')}">${t('+ Blat samodzielny')}</button>
        <button type="button" data-board-add="shelf" draggable="true" data-dnd="application/x-meble-board-shelf" title="${t('Kliknij — półka w wolnym miejscu; albo przeciągnij do widoku 3D i upuść tam, gdzie ma być')}">${t('+ Półka')}</button>
      </div>`;
    renderedKey = structureKey(project);
    cardCollapse.applyAll();
    sync(project);
    markPicked();
    groupPanelSections(root, 'furnitureDesigner.sec.boards', true);
  }

  // Karta płyty zaznaczonej (w 3D albo kliknięciem w kartę) — wyróżniona.
  function markPicked() {
    const picked = ui?.get().selectedBlends ?? [];
    root.querySelectorAll('[data-kind="board"]').forEach((el) => el.classList.toggle('related', picked.includes(`board:${el.dataset.id}`)));
  }
  ui?.subscribe(markPicked);

  function sync(project) {
    for (const b of project.boards ?? []) {
      const el = root.querySelector(`[data-kind="board"][data-id="${b.id}"]`);
      if (!el) continue;
      el.querySelectorAll('[data-f]').forEach((input) => {
        if (input.dataset.f === 'name') return setIfNotFocused(input, b.name);
        if (!input.classList.contains('invalid')) setIfNotFocused(input, b[input.dataset.f] ?? '');
      });
      const mat = boardMaterial(b, project);
      // mocowanie do ściany
      const mount = mountPoints(b);
      setIfNotFocused(el.querySelector('[data-mount="type"]'), b.mount?.type ?? '');
      const cnt = el.querySelector('[data-mount="count"]');
      setIfNotFocused(cnt, b.mount?.count ?? '');
      cnt.placeholder = mount.count && mount.type !== 'cleat' ? t('{count} (auto)', { count: mount.count }) : '';
      el.querySelector('.mount-count').hidden = !mount.type || mount.type === 'cleat';
      el.querySelector('.mount-machining').hidden = mount.type !== 'hidden';
      setIfNotFocused(el.querySelector('[data-mount="machining"]'), normalizeMount(b.mount).machining ?? '');
      const thIn = el.querySelector('[data-f="thickness"]');
      if (thIn) thIn.placeholder = String(boardMaterial({ ...b, thickness: null }, project).thickness);
      syncColorPicker(el, 'color', b.color, mat.color);
      setEye(el.querySelector('[data-board-hide]'), b.hidden, b.kind === 'worktop' ? t('blat') : t('półkę'));
      syncBoardFeatures(el, b, b.width, b.depth);
      el.querySelector('.board-info').textContent =
        t('Formatka: {w} × {d} × {t} mm', { w: b.width, d: b.depth, t: mat.thickness }) + [describeEdges(b.edges), describeHoles(b.holes, b.width, b.depth), describeMountWork(b, mat.thickness)].filter(Boolean).map((x) => ` · ${x}`).join('');
      const issues = boardIssues(b, project);
      // podsumowanie widoczne w zwiniętej karcie
      el.querySelector('.card-sum').textContent =
        `${BOARD_KINDS.find((k) => k.key === b.kind)?.label ?? t('Płyta')} ${b.width} × ${b.depth} × ${mat.thickness} mm` +
        (b.holes?.length ? ' · ' + t('otwory: {n}', { n: b.holes.length }) : '') +
        (issues.length ? ' · ⚠ ' + issues[0] : '');
      el.classList.toggle('has-issues', issues.length > 0);
      el.querySelector('.board-issues').innerHTML = issues.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
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
    // mocowanie do ściany: rodzaj, liczba wsporników (puste — automatycznie)
    if (input.dataset.mount === 'type') return update(id, (b) => ({ ...b, mount: { type: input.value || null, count: null } }));
    if (input.dataset.mount === 'machining') return update(id, (b) => ({ ...b, mount: { ...normalizeMount(b.mount), machining: input.value || null } }));
    if (input.dataset.mount === 'count') {
      const v = input.value.trim() === '' ? null : readNumberInput(input);
      if (v === undefined) return;
      return update(id, (b) => ({ ...b, mount: { ...(b.mount ?? { type: null }), count: v } }));
    }
    const field = input.dataset.f;
    if (!field) return;
    let value = input.value;
    if (field === 'thickness' && input.value.trim() === '') return update(id, (b) => ({ ...b, thickness: null }));
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
  root.addEventListener('change', (e) => e.target.dataset?.f !== 'thickness' && commitEmptyAsZero(e.target));

  // „Zwiń / Rozwiń wszystkie” na górze zakładki (nad blatami na szafkach, poza tym panelem) — też dla tych kart.
  root.parentElement?.addEventListener('click', (e) => {
    if (!root.contains(e.target) && e.target.closest('[data-collapse-all], [data-expand-all]')) cardCollapse.handleClick(e.target);
  });

  // Klik w kartę płyty — zaznacza ją (także w 3D); wiersz otworu zaznacza sam otwór (main.js).
  root.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-kind="board"]');
    if (!card || !ui || e.target.closest('.bf-hole, [data-collapse-card], [data-drag-card]')) return;
    const pick = `board:${card.dataset.id}`;
    const state = ui.get();
    if (state.selectedBlends?.length === 1 && state.selectedBlends[0] === pick && !state.selectedId) return;
    ui.set(
      { ...state, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [pick], selectedHole: null, selectedObstacle: null },
      { fromPanel: true }, // karta jest już widoczna — bez przewijania (main.js)
    );
  });

  // przeciąganie „+ Półka” / „+ Blat” do widoku 3D (upuszczenie — scene/interaction.js); rodzaj w nazwie typu danych
  root.addEventListener('dragstart', (e) => {
    const kind = e.target.closest?.('[data-board-add]')?.dataset.boardAdd;
    if (!kind) return;
    e.dataTransfer.setData(`application/x-meble-board-${kind}`, kind);
    e.dataTransfer.effectAllowed = 'copy';
  });

  root.addEventListener('click', (e) => {
    if (cardCollapse.handleClick(e.target)) return;
    const add = e.target.closest('[data-board-add]')?.dataset.boardAdd;
    if (add) {
      store.set((p) => ({ ...p, boards: [...(p.boards ?? []), createBoard(p, add)] }));
      scrollIntoPanel(root.querySelector('.items > .board:last-child'), { block: 'nearest', behavior: 'smooth' });
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

  // Zmiana kolejności kart przeciąganiem za uchwyt ⠿ (ui/dragReorder.js).
  attachDragReorder(root, 'board', (moved, target, after) => store.set((p) => ({ ...p, boards: moveInList(p.boards ?? [], moved, target, after) })));

  render(store.get());
  return {
    // Przewija do karty płyty (po kliknięciu jej w widoku 3D).
    reveal(id) {
      const card = root.querySelector(`[data-kind="board"][data-id="${id}"]`);
      cardCollapse.expand(card); // karta mogła być zwinięta
      scrollIntoPanel(card, { block: 'start', behavior: 'smooth' });
    },
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else sync(project);
    },
  };
}
