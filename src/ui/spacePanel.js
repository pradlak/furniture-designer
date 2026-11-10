import {
  WALLS,
  LIMITS,
  SLOPE_SIDES,
  OBSTACLE_PRESETS,
  DEFAULT_COLORS,
  createSlope,
  isObstacleOutside,
  slopeAngle,
  runFromAngle,
} from '../model/space.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero } from './dom.js';
import { createCardCollapse, COLLAPSE_BUTTON, COLLAPSE_ALL_BUTTONS } from './collapsible.js';
import { updateSpaceRefit } from '../model/layout.js';

const SPACE_FIELDS = [
  { key: 'width', label: 'Szerokość' },
  { key: 'height', label: 'Wysokość' },
  { key: 'depth', label: 'Głębokość' },
];

const OBSTACLE_FIELDS = [
  { key: 'x', label: 'X od lewej', min: -LIMITS.spaceMax },
  { key: 'y', label: 'Y od podłogi', min: -LIMITS.spaceMax },
  { key: 'z', label: 'Z od tyłu', min: -LIMITS.spaceMax },
  { key: 'width', label: 'Szerokość', min: LIMITS.obstacleMin },
  { key: 'height', label: 'Wysokość', min: LIMITS.obstacleMin },
  { key: 'depth', label: 'Głębokość', min: LIMITS.obstacleMin },
];

const COLOR_FIELDS = [
  { key: 'walls', label: 'Ściany, sufit, skosy' },
  { key: 'floor', label: 'Podłoga' },
];

// Listy elementów edytowanych w panelu: data-kind → klucz tablicy w modelu przestrzeni.
const LISTS = { obstacle: 'obstacles', slope: 'slopes' };

// Panel edycji przestrzeni. Przebudowuje DOM tylko przy zmianach strukturalnych
// (dodanie/usunięcie elementu, wczytanie projektu), żeby nie gubić fokusu podczas pisania.
export function createSpacePanel(root, store) {
  let renderedKey = null;
  const cardCollapse = createCardCollapse(root); // zwijane karty skosów i przeszkód (jak karty korpusów)

  const structureKey = ({ space }) =>
    [...space.slopes.map((s) => s.id), '#', ...space.obstacles.map((o) => o.id)].join('|');

  // Po każdej zmianie przestrzeni (wymiary, skosy) korpusy z wysokością automatyczną dopasowują się same.
  const updateSpace = (fn) => store.set((p) => updateSpaceRefit(p, fn));
  const updateItem = (kind, id, patch) =>
    updateSpace((s) => ({
      ...s,
      [LISTS[kind]]: s[LISTS[kind]].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  function render(project) {
    const { space } = project;
    root.innerHTML = `
      <h2>Przestrzeń</h2>
      <label class="field">
        <span>Nazwa</span>
        <input type="text" data-f="name" value="${escapeHtml(space.name)}" />
      </label>
      <div class="grid-3">
        ${SPACE_FIELDS.map((f) =>
          numberField(f.label, f.key, space[f.key], { min: LIMITS.spaceMin, max: LIMITS.spaceMax, unit: 'mm' }),
        ).join('')}
      </div>
      <p class="hint">Wysokość to pełna wysokość pomieszczenia (tam, gdzie nie ma skosu).</p>
      ${space.slopes.length || space.obstacles.length ? COLLAPSE_ALL_BUTTONS : ''}

      <h3>Ściany</h3>
      <div class="walls">
        ${WALLS.map(
          (w) => `
          <label class="check">
            <input type="checkbox" data-wall="${w.key}" ${space.walls[w.key] ? 'checked' : ''} />
            ${w.label}
          </label>`,
        ).join('')}
      </div>
      <p class="hint">Odznacz ściankę, jeśli z danej strony przestrzeń jest otwarta.</p>

      <h3>Kolory</h3>
      <div class="colors">
        ${COLOR_FIELDS.map(
          (c) => `
          <label class="color-field">
            <input type="color" data-color="${c.key}" value="${space.colors[c.key]}" />
            <span>${c.label}</span>
          </label>`,
        ).join('')}
        <button type="button" data-action="reset-colors">Domyślne</button>
      </div>

      <h3>Skosy</h3>
      <p class="hint">Np. poddasze. Ścianka kolankowa to wysokość, na której skos zaczyna się przy ścianie.
        Długość skosu mierzymy w poziomie — od ściany do miejsca, gdzie skos spotyka sufit.</p>
      <div class="items">
        ${space.slopes.map((s) => renderSlope(s, space)).join('') || '<p class="empty">Brak skosów.</p>'}
      </div>
      <div class="add-row">
        <button type="button" data-action="add-slope">+ Skos</button>
      </div>

      <h3>Przeszkody</h3>
      <p class="hint">Elementy zajmujące miejsce w przestrzeni: listwy, rury, parapety, gniazdka…
        Pozycja to narożnik lewy‑dolny‑tylny przeszkody.</p>
      <div class="items">
        ${space.obstacles.map(renderObstacle).join('') || '<p class="empty">Brak przeszkód.</p>'}
      </div>
      <div class="add-row">
        ${OBSTACLE_PRESETS.map((p) => `<button type="button" data-add-obstacle="${p.key}">+ ${p.label}</button>`).join('')}
      </div>
    `;
    cardCollapse.applyAll();
    renderedKey = structureKey(project);
    updateStatus(project);
  }

  function renderSlope(s, space) {
    const angle = slopeAngle(s, space);
    return `
      <div class="item slope" data-kind="slope" data-id="${s.id}">
        <div class="item-head">
          ${COLLAPSE_BUTTON}
          <select data-f="side" aria-label="Strona skosu">
            ${SLOPE_SIDES.map((o) => `<option value="${o.key}" ${o.key === s.side ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <button type="button" class="danger" data-remove="${s.id}" title="Usuń">✕</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"></div>
        <div class="grid-3">
          ${numberField('Ścianka kolankowa', 'kneeHeight', s.kneeHeight, { min: 0, max: LIMITS.spaceMax, small: true })}
          ${numberField('Długość skosu', 'run', s.run, { min: 1, max: LIMITS.spaceMax, small: true })}
          ${numberField('Kąt [°]', 'angle', angle == null ? '' : round1(angle), { min: 1, max: 89, step: 0.1, small: true })}
        </div>
        <div class="grid-3 slope-gap" title="Odstęp mebli od skosu (prostopadle do skosu) — na nierówności ściany. Dotyczy korpusów ze skośną górą; w karcie korpusu można ustawić wyjątek.">
          ${numberField('Luz mebli do skosu [mm]', 'gap', s.gap, { min: 0, max: 500, small: true })}
        </div>
        <p class="warning" hidden>Ścianka kolankowa jest nie niższa niż pomieszczenie — skos nie działa.</p>
      </div>`;
  }

  function renderObstacle(o) {
    return `
      <div class="item obstacle" data-kind="obstacle" data-id="${o.id}">
        <div class="item-head">
          ${COLLAPSE_BUTTON}
          <input type="text" data-f="name" value="${escapeHtml(o.name)}" aria-label="Nazwa przeszkody" />
          <button type="button" class="danger" data-remove="${o.id}" title="Usuń">✕</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"></div>
        <div class="grid-3">
          ${OBSTACLE_FIELDS.map((f) => numberField(f.label, f.key, o[f.key], { min: f.min, small: true })).join('')}
        </div>
        <p class="warning" hidden>Przeszkoda wystaje poza przestrzeń.</p>
      </div>`;
  }

  // Odświeża wartości wyliczane i ostrzeżenia bez przebudowy DOM.
  function updateStatus({ space }) {
    for (const o of space.obstacles) {
      const el = itemEl('obstacle', o.id);
      if (!el) continue;
      const outside = isObstacleOutside(o, space);
      el.querySelector('.warning').hidden = !outside;
      // Podsumowanie widoczne w zwiniętej karcie.
      el.querySelector('.card-sum').textContent =
        `${o.width} × ${o.height} × ${o.depth} mm · od lewej ${o.x}, od podłogi ${o.y}, od tyłu ${o.z}` +
        (outside ? ' · ⚠ wystaje poza przestrzeń' : '');
      el.classList.toggle('has-issues', outside);
    }
    for (const s of space.slopes) {
      const el = itemEl('slope', s.id);
      if (!el) continue;
      const angle = slopeAngle(s, space);
      el.querySelector('.warning').hidden = angle != null;
      el.querySelector('.card-sum').textContent =
        `ścianka ${s.kneeHeight} mm · długość ${s.run} mm` +
        (angle == null ? ' · ⚠ skos nie działa' : ` · ${round1(angle)}°`) +
        (s.side === 'back' || s.side === 'front' ? ` · luz ${s.gap} mm` : '');
      // Luz dotyczy skośnej góry korpusów — na razie tylko skosy z tyłu i z przodu.
      el.querySelector('.slope-gap').hidden = !(s.side === 'back' || s.side === 'front');
      el.classList.toggle('has-issues', angle == null);
      setIfNotFocused(el.querySelector('[data-f="angle"]'), angle == null ? '' : round1(angle));
      setIfNotFocused(el.querySelector('[data-f="run"]'), s.run);
    }
  }

  const itemEl = (kind, id) => root.querySelector(`[data-kind="${kind}"][data-id="${id}"]`);

  // Wartość pola w modelu (do przywrócenia po błędnym wpisie).
  function modelValue(input) {
    const { space } = store.get();
    const field = input.dataset.f;
    const itemNode = input.closest('[data-kind]');
    if (!itemNode) return space[field];
    const item = space[LISTS[itemNode.dataset.kind]].find((i) => i.id === itemNode.dataset.id);
    if (field === 'angle') {
      const a = slopeAngle(item, space);
      return a == null ? '' : round1(a);
    }
    return item[field];
  }

  // --- zdarzenia (delegacja) ---
  root.addEventListener('input', (e) => {
    const input = e.target;

    if (input.dataset.wall) {
      updateSpace((s) => ({ ...s, walls: { ...s.walls, [input.dataset.wall]: input.checked } }));
      return;
    }
    if (input.dataset.color) {
      updateSpace((s) => ({ ...s, colors: { ...s.colors, [input.dataset.color]: input.value } }));
      return;
    }

    let field = input.dataset.f;
    if (!field) return;
    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    }

    const itemNode = input.closest('[data-kind]');
    if (!itemNode) {
      updateSpace((s) => ({ ...s, [field]: value }));
      return;
    }
    const { kind, id } = itemNode.dataset;
    if (kind === 'slope' && field === 'angle') {
      // Kąt nie jest zapisywany — przeliczamy go na długość skosu.
      const { space } = store.get();
      const run = runFromAngle(value, space.slopes.find((s) => s.id === id), space);
      if (run == null || run < 1) return;
      field = 'run';
      value = run;
    }
    updateItem(kind, id, { [field]: value });
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number' || commitEmptyAsZero(input)) return;
    if (input.classList.contains('invalid') || input.value.trim() === '') {
      input.value = modelValue(input);
      input.classList.remove('invalid');
    }
  });

  root.addEventListener('click', (e) => {
    if (cardCollapse.handleClick(e.target)) return;
    const { action, addObstacle, remove } = e.target.dataset ?? {};
    if (action === 'add-slope') {
      updateSpace((s) => ({ ...s, slopes: [...s.slopes, createSlope(s)] }));
    } else if (action === 'reset-colors') {
      updateSpace((s) => ({ ...s, colors: { ...DEFAULT_COLORS } }));
      root.querySelectorAll('[data-color]').forEach((el) => (el.value = DEFAULT_COLORS[el.dataset.color]));
    } else if (addObstacle) {
      const preset = OBSTACLE_PRESETS.find((p) => p.key === addObstacle);
      updateSpace((s) => ({ ...s, obstacles: [...s.obstacles, preset.create(s)] }));
    } else if (remove) {
      const kind = e.target.closest('[data-kind]').dataset.kind;
      updateSpace((s) => ({ ...s, [LISTS[kind]]: s[LISTS[kind]].filter((i) => i.id !== remove) }));
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

