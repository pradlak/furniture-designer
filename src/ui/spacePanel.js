import {
  WALLS,
  LIMITS,
  SLOPE_SIDES,
  OBSTACLE_PRESETS,
  OBSTACLE_KINDS,
  WALL_DECORS,
  HOOD_DECORS,
  isWallObstacle,
  isWallLike,
  isHoodObstacle,
  DEFAULT_COLORS,
  createSlope,
  isObstacleOutside,
  slopeAngle,
  runFromAngle,
  OUTLINE_PRESETS,
  applyOutlinePreset,
} from '../model/space.js';
import {
  spaceOutline,
  outlineEdges,
  edgeLength,
  isFrontPoint,
  canRemovePoint,
  insertPoint,
  cleanOutline,
  selfIntersects,
  resizeOutline,
} from '../model/outline.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero, scrollIntoPanel } from './dom.js';
import { colorPicker, readColorInput, syncColorPicker } from './widgets.js';
import { createCardCollapse, COLLAPSE_BUTTON, COLLAPSE_ALL_BUTTONS } from './collapsible.js';
import { markInspectorCard } from './inspectorCard.js';
import { groupPanelSections } from './panelSections.js';
import { obstacleSketch } from './objectSketch.js';
import { updateSpaceRefit, refillRows, refillDepth } from '../model/layout.js';
import { tileTargets } from '../model/tileTargets.js';
import { wallList, wallFinishOf, setWallFinish, tilesEstimate, TILE_DEFAULTS, TILE_LAYOUTS, TILE_LIMITS } from '../model/wallFinish.js';

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
    [...space.slopes.map((s) => s.id), '#', `outline:${space.outline?.length ?? 0}`, '#', ...space.obstacles.map((o) => o.id), '#',
      ...wallList(space).map((w) => `${w.tag}:${wallFinishOf(space, w.tag).tiles ? 't' : ''}`), JSON.stringify(space.walls)].join('|');

  // Po każdej zmianie przestrzeni (wymiary, skosy) korpusy z wysokością automatyczną dopasowują się same.
  // (zmiana szerokości / głębokości — korpusy od ściany do ściany wypełniają nowe wymiary)
  const updateSpace = (fn) => store.set((p) => refillDepth(p, refillRows(p, updateSpaceRefit(p, fn))));
  const updateItem = (kind, id, patch) =>
    updateSpace((s) => ({
      ...s,
      [LISTS[kind]]: s[LISTS[kind]].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  function render(project) {
    const { space } = project;
    root.innerHTML = `
      <div class="space-head"><h2>Przestrzeń</h2><button type="button" class="insp-close" data-space-close title="Zamknij okienko" aria-label="Zamknij okienko">✕</button></div>
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
      <div class="grid-3" title="Odstęp mebli od sufitu — korpusy dopasowane do sufitu (np. „Dopasuj do wnęki”) i blendy „do sufitu” kończą się tyle niżej. W karcie korpusu można ustawić wyjątek.">
        ${numberField('Luz mebli do sufitu', 'ceilingGap', space.ceilingGap ?? 10, { min: 0, max: 500, unit: 'mm' })}
      </div>
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

      <h3>Wykończenie ścian</h3>
      <p class="hint">Kolor pojedynczej ściany i płytki (np. pas nad blatem) — tylko wygląd w widoku 3D. To samo: prawy klik w ścianę w 3D.</p>
      <div class="wall-finish">
        ${wallList(space).map((w) => renderWallFinish(space, w)).join('')}
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

      <h3>Kształt ścian</h3>
      <p class="hint">Ściany nie muszą stać pod kątem prostym. Kształt podłogi (widok z góry) wyznaczają punkty —
        można je dodawać, przesuwać i usuwać, np. skośna ściana, ścięty narożnik, wnęka w kształcie litery L.
        Punkty na przodzie (od tyłu = głębokość) tworzą otwarty przód przestrzeni.</p>
      <p class="hint"><b>Myszką w widoku 3D</b> (gdy ta zakładka jest otwarta): przeciągaj niebieskie kulki (punkty);
        zielona kulka na środku ściany — przeciągnij, żeby dodać tam punkt; <b>fioletowy krążek</b> — przesuwa całą ścianę
        (lewą, prawą, tylną, sufit albo ścianę z punktów; meble zostają na miejscu). Prawy klik w punkt — „Usuń punkt”,
        w ścianę — „Dodaj punkt tutaj” i gotowe kształty. Alt — bez przyciągania.</p>
      <div class="plan-preview" title="Rzut z góry: tylna ściana u góry, przód przestrzeni na dole"></div>
      <div class="outline-points">${renderPoints(space)}</div>
      <div class="add-row">
        ${OUTLINE_PRESETS.map((p) => `<button type="button" data-outline-preset="${p.key}" title="${p.title}">+ ${p.label}</button>`).join('')}
        <button type="button" data-action="outline-add-point" title="Nowy punkt na środku najdłuższej ściany">+ Punkt</button>
        ${space.outline ? '<button type="button" data-action="outline-reset">Prostokąt</button>' : ''}
      </div>

      <h3>Przeszkody</h3>
      <p class="hint">Elementy zajmujące miejsce w przestrzeni: listwy, rury, parapety, gniazdka…
        Pozycja to narożnik lewy‑dolny‑tylny przeszkody. <b>Kominek / występ ściany</b> dzieli przestrzeń na wnęki
        (np. zabudowa po obu stronach kominka) — rysowany jest jak ściana.</p>
      <div class="items">
        ${space.obstacles.map(renderObstacle).join('') || '<p class="empty">Brak przeszkód.</p>'}
      </div>
      <div class="add-row">
        ${OBSTACLE_PRESETS.map((p) => `<button type="button" data-add-obstacle="${p.key}">+ ${p.label}</button>`).join('')}
      </div>
    `;
    cardCollapse.applyAll();
    // grupy zwijane (Ściany, Kolory, Wykończenie, Skosy, Kształt, Przeszkody) — wymiary na górze zawsze widoczne
    groupPanelSections(root, 'furnitureDesigner.sec.space', [], { windows: true }); // grupy otwierają się w okienku obok
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
          <button type="button" class="danger" data-remove="${s.id}" title="Usuń skos" aria-label="Usuń skos">🗑</button>
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

  // Lista punktów kształtu podłogi: od lewej (X), od tyłu (Z), długość ściany do następnego punktu, usuń.
  function renderPoints(space) {
    if (!space.outline) return '<p class="empty">Prostokąt — wszystkie ściany pod kątem prostym.</p>';
    return space.outline
      .map(
        ([x, z], i) => `
        <div class="outline-pt" data-pt="${i}">
          <span class="pt-no">${i + 1}</span>
          <label>X <input type="number" data-pt-x="${i}" value="${x}" min="0" max="${space.width}" step="1" /></label>
          <label>Z <input type="number" data-pt-z="${i}" value="${z}" min="0" max="${space.depth}" step="1" /></label>
          <small class="pt-len"></small>
          <button type="button" class="icon danger" data-pt-remove="${i}" title="Usuń punkt">✕</button>
        </div>`,
      )
      .join('');
  }

  // Rzut z góry: obrys podłogi (z odciętymi narożnikami), występy ścian, korpusy.
  function planSvg(project) {
    const { space } = project;
    const W = space.width;
    const D = space.depth;
    const pad = Math.max(W, D) * 0.03;
    const outline = spaceOutline(space);
    const pts = outline.map(([x, z]) => `${x},${z}`).join(' ');
    const walls = space.obstacles
      .filter(isWallLike)
      .map((o) => `<rect x="${o.x}" y="${o.z}" width="${o.width}" height="${o.depth}" class="plan-wall" />`)
      .join('');
    const cabs = project.furniture
      .filter((c) => !c.hidden)
      .map((c) => `<rect x="${c.x}" y="${c.z}" width="${c.width}" height="${c.depth}" class="plan-cab" />`)
      .join('');
    const cutLines = space.outline
      ? outlineEdges(space)
          .filter((e) => e.tag.startsWith('edge:'))
          .map((e) => `<line x1="${e.a[0]}" y1="${e.a[1]}" x2="${e.b[0]}" y2="${e.b[1]}" class="plan-cut" />`)
          .join('')
      : '';
    const r = Math.max(W, D) * 0.012;
    const dots = space.outline
      ? outline.map(([x, z], i) => `<circle cx="${x}" cy="${z}" r="${r}" class="plan-pt"><title>Punkt ${i + 1}</title></circle>`).join('')
      : '';
    return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${D + 2 * pad}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rzut z góry">
      <rect x="0" y="0" width="${W}" height="${D}" class="plan-box" />
      <polygon points="${pts}" class="plan-floor" />${walls}${cabs}${cutLines}${dots}
      <line x1="0" y1="${D}" x2="${W}" y2="${D}" class="plan-front" />
    </svg>`;
  }

  function renderWallFinish(space, w) {
    const f = wallFinishOf(space, w.tag);
    const t = f.tiles;
    const tf = (label, key, min, max) => `<label class="field small"><span>${label}</span><input type="number" step="1" min="${min}" max="${max}" data-wf-tile="${key}" value="${t[key]}" /></label>`;
    return `
      <div class="wf-item" data-wf="${w.tag}">
        <div class="wf-head">
          <b>${escapeHtml(w.label)}</b>
          <label class="color-field" title="Kolor tej ściany"><input type="color" data-wf-color value="${f.color ?? space.colors.walls}" /></label>
          <button type="button" class="icon tiny" data-wf-reset title="Kolor jak pozostałe ściany" ${f.color ? '' : 'hidden'}>↺</button>
          <label class="check small"><input type="checkbox" data-wf-tiles ${t ? 'checked' : ''} /> płytki</label>
        </div>
        ${t ? `
          <div class="grid-3">
            ${tf('Od wysokości', 'from', 0, 20000)}
            ${tf('Do wysokości', 'to', 0, 20000)}
            ${tf('Fuga', 'grout', 0, TILE_LIMITS.groutMax)}
            ${tf('Płytka — szer.', 'width', TILE_LIMITS.sizeMin, TILE_LIMITS.sizeMax)}
            ${tf('Płytka — wys.', 'height', TILE_LIMITS.sizeMin, TILE_LIMITS.sizeMax)}
            <div class="wf-quick">${tileTargets(store.get()).map((q) => `<button type="button" data-wf-quick="${q.key}" title="${escapeHtml(q.label)}">${q.icon} ${escapeHtml(q.label.replace(/ \(.*\)$/, ''))}</button>`).join('')}</div>
            <label class="field small"><span>Układ</span><select data-wf-tile="layout">${TILE_LAYOUTS.map((l) => `<option value="${l.key}" ${l.key === t.layout ? 'selected' : ''}>${l.label}</option>`).join('')}</select></label>
          </div>
          <div class="wf-colors">
            <label class="color-field"><input type="color" data-wf-tile="color" value="${t.color}" /><span>płytki</span></label>
            <label class="color-field"><input type="color" data-wf-tile="groutColor" value="${t.groutColor}" /><span>fuga</span></label>
            <small class="wf-est"></small>
          </div>` : ''}
      </div>`;
  }

  function renderObstacle(o) {
    return `
      <div class="item obstacle" data-kind="obstacle" data-id="${o.id}">
        <div class="item-head">
          ${COLLAPSE_BUTTON}
          <input type="text" data-f="name" value="${escapeHtml(o.name)}" aria-label="Nazwa przeszkody" />
          <select data-f="kind" class="obstacle-kind" aria-label="Rodzaj" title="Występ ściany (kominek, filar) wygląda jak ściana i dzieli przestrzeń na osobne wnęki — „Dopasuj do wnęki” i „+ Korpus” wypełniają wnękę po jednej stronie">
            ${OBSTACLE_KINDS.map((k) => `<option value="${k.key}" ${k.key === o.kind ? 'selected' : ''}>${k.label}</option>`).join('')}
          </select>
          <button type="button" class="danger" data-remove="${o.id}" title="Usuń przeszkodę" aria-label="Usuń przeszkodę">🗑</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"></div>
        <div class="obj-sketch bi-sketch" title="Kliknij, aby powiększyć szkic"></div>
        <div class="grid-3">
          ${OBSTACLE_FIELDS.map((f) => numberField(f.label, f.key, o[f.key], { min: f.min, small: true })).join('')}
        </div>
        <label class="field small obstacle-decor" title="Tylko wygląd w widoku 3D — nie zmienia formatek ani wymiarów">
          <span>Wygląd (na przedniej ścianie)</span>
          <select data-f="decor">
            ${WALL_DECORS.map((d) => `<option data-for="wall" value="${d.key ?? ''}" ${d.key === (o.decor ?? null) ? 'selected' : ''}>${d.label}</option>`).join('')}
            ${HOOD_DECORS.filter((d) => d.key).map((d) => `<option data-for="hood" value="${d.key}" ${d.key === (o.decor ?? null) ? 'selected' : ''}>${d.label}</option>`).join('')}
          </select>
        </label>
        ${colorPicker('Kolor (tylko wygląd w 3D)', 'color', { resetLabel: 'domyślny (jak ściany)' })}
        <p class="warning" hidden>Przeszkoda wystaje poza przestrzeń.</p>
      </div>`;
  }

  // Odświeża wartości wyliczane i ostrzeżenia bez przebudowy DOM.
  function updateStatus(project) {
    const { space } = project;
    const plan = root.querySelector('.plan-preview');
    if (plan) plan.innerHTML = planSvg(project);
    if (space.outline) {
      const edges = outlineEdges(space);
      space.outline.forEach(([x, z], i) => {
        const row = root.querySelector(`.outline-pt[data-pt="${i}"]`);
        if (!row) return;
        setIfNotFocused(row.querySelector('[data-pt-x]'), x);
        const zInput = row.querySelector('[data-pt-z]');
        setIfNotFocused(zInput, z);
        const front = isFrontPoint([x, z], space);
        zInput.disabled = front;
        zInput.title = front ? 'Punkt na przodzie przestrzeni (otwarty przód)' : '';
        const e = edges[i];
        row.querySelector('.pt-len').textContent = e.open ? 'przód' : `ściana ${Math.round(edgeLength(e))} mm`;
        row.querySelector('[data-pt-remove]').disabled = !canRemovePoint(space, i);
      });
    }
    // wykończenie ścian: wartości i orientacyjna ilość płytek
    for (const w of wallList(space)) {
      const el = root.querySelector(`.wf-item[data-wf="${w.tag}"]`);
      if (!el) continue;
      const f = wallFinishOf(space, w.tag);
      setIfNotFocused(el.querySelector('[data-wf-color]'), f.color ?? space.colors.walls);
      el.querySelector('[data-wf-reset]').hidden = !f.color;
      if (!f.tiles) continue;
      el.querySelectorAll('[data-wf-tile]').forEach((inp) => !inp.classList.contains('invalid') && setIfNotFocused(inp, f.tiles[inp.dataset.wfTile]));
      const est = tilesEstimate(space, w.tag);
      el.querySelector('.wf-est').textContent = est ? `ok. ${est.area.toFixed(2).replace('.', ',')} m² · ok. ${est.count} płytek (z 10% zapasu)` : '';
    }
    for (const o of space.obstacles) {
      const el = itemEl('obstacle', o.id);
      if (!el) continue;
      if (el.classList.contains('in-inspector')) el.querySelector('.obj-sketch').innerHTML = obstacleSketch(o, space); // szkic w okienku
      const outside = isObstacleOutside(o, space);
      el.querySelector('.warning').hidden = !outside;
      // Podsumowanie widoczne w zwiniętej karcie.
      el.querySelector('.card-sum').textContent =
        `${o.width} × ${o.height} × ${o.depth} mm · od lewej ${o.x}, od podłogi ${o.y}, od tyłu ${o.z}` +
        (outside ? ' · ⚠ wystaje poza przestrzeń' : '');
      el.classList.toggle('has-issues', outside);
      el.classList.toggle('wall-part', isWallLike(o));
      // okap: przyczepiony do sufitu — „od podłogi” wynika z wysokości
      const yIn = el.querySelector('[data-f="y"]');
      if (yIn) {
        yIn.disabled = isHoodObstacle(o);
        yIn.title = isHoodObstacle(o) ? 'Okap jest przyczepiony do sufitu — zmień jego wysokość (od sufitu w dół)' : '';
      }
      el.querySelector('[data-f="kind"]').value = o.kind;
      el.querySelector('.obstacle-decor').hidden = !isWallObstacle(o) && !isHoodObstacle(o);
      // opcje wyglądu według rodzaju: występ ściany — kominek / telewizor, okap — urządzenie (puste — bez dekoracji)
      el.querySelectorAll('.obstacle-decor option').forEach((opt) => {
        const forKind = opt.dataset.for;
        opt.hidden = opt.value ? forKind !== o.kind : false;
        if (!opt.value) opt.textContent = isHoodObstacle(o) ? 'Sama zabudowa (bez okapu)' : 'Sama ściana';
      });
      el.querySelector('[data-f="decor"]').value = o.decor ?? '';
      syncColorPicker(el, 'color', o.color, isWallLike(o) ? space.colors.walls : '#f59e0b');
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
    // wykończenie ściany: kolor, płytki
    const wf = input.closest('[data-wf]')?.dataset.wf;
    if (wf) {
      const setF = (patch) => store.set((p) => ({ ...p, space: setWallFinish(p.space, wf, patch) }));
      if (input.dataset.wfColor !== undefined) return setF({ color: input.value });
      if (input.dataset.wfTiles !== undefined) return setF({ tiles: input.checked ? { ...TILE_DEFAULTS } : null });
      const key = input.dataset.wfTile;
      if (!key) return;
      if (input.type === 'number') {
        const v = readNumberInput(input);
        if (v === undefined) return;
        return setF({ tiles: { [key]: v } });
      }
      return setF({ tiles: { [key]: input.value } });
    }
    // kolor przeszkody (lista kolorów / próbnik)
    const pickedColor = readColorInput(input);
    if (pickedColor) {
      const node = input.closest('[data-kind="obstacle"]');
      if (node) updateItem('obstacle', node.dataset.id, { color: pickedColor.value });
      return;
    }

    // punkt kształtu podłogi (X / Z)
    const ptIndex = input.dataset.ptX ?? input.dataset.ptZ;
    if (ptIndex !== undefined) {
      const value = readNumberInput(input);
      if (value === undefined) return;
      const { space } = store.get();
      const pts = spaceOutline(space).map((q) => [...q]);
      const k = input.dataset.ptX !== undefined ? 0 : 1;
      pts[ptIndex][k] = Math.round(Math.min(k ? space.depth : space.width, Math.max(0, value)));
      if (selfIntersects(pts)) {
        input.classList.add('invalid');
        return;
      }
      input.classList.remove('invalid');
      updateSpace((s) => ({ ...s, outline: pts }));
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
      // zmiana szerokości / głębokości — punkty na prawej ścianie i na przodzie idą razem z nią
      updateSpace((s) => {
        const next = { ...s, [field]: value };
        if (s.outline && (field === 'width' || field === 'depth')) next.outline = resizeOutline(s.outline, s.width, s.depth, next.width, next.depth);
        return next;
      });
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
    if (field === 'decor') value = value || null; // „Sama ściana”
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
    const wfQuick = e.target.closest?.('[data-wf-quick]');
    if (wfQuick) {
      const tag = wfQuick.closest('[data-wf]').dataset.wf;
      const q = tileTargets(store.get()).find((x) => x.key === wfQuick.dataset.wfQuick);
      if (q) store.set((p) => ({ ...p, space: setWallFinish(p.space, tag, { tiles: q.patch }) }));
      return;
    }
    const wfReset = e.target.closest?.('[data-wf-reset]');
    if (wfReset) {
      const tag = wfReset.closest('[data-wf]').dataset.wf;
      store.set((p) => ({ ...p, space: setWallFinish(p.space, tag, { color: null }) }));
      return;
    }
    const { action, addObstacle, outlinePreset, ptRemove, remove } = e.target.dataset ?? {};
    const space = store.get().space;
    if (action === 'add-slope') {
      updateSpace((s) => ({ ...s, slopes: [...s.slopes, createSlope(s)] }));
    } else if (action === 'reset-colors') {
      updateSpace((s) => ({ ...s, colors: { ...DEFAULT_COLORS } }));
      root.querySelectorAll('[data-color]').forEach((el) => (el.value = DEFAULT_COLORS[el.dataset.color]));
    } else if (outlinePreset) {
      const outline = applyOutlinePreset(space, outlinePreset);
      if (outline) updateSpace((s) => ({ ...s, outline }));
      else alert('Ten narożnik ma już zmieniony kształt — przesuń jego punkty albo zacznij od prostokąta.');
    } else if (action === 'outline-add-point') {
      // na środku najdłuższej ściany (bez przodu)
      const longest = outlineEdges(space)
        .filter((ed) => !ed.open)
        .sort((m, k) => edgeLength(k) - edgeLength(m))[0];
      if (longest) updateSpace((s) => ({ ...s, outline: insertPoint(s, longest.i).outline }));
    } else if (action === 'outline-reset') {
      updateSpace((s) => ({ ...s, outline: null }));
    } else if (ptRemove !== undefined) {
      const pts = spaceOutline(space).filter((_, j) => j !== Number(ptRemove));
      if (canRemovePoint(space, Number(ptRemove)) && !selfIntersects(pts)) updateSpace((s) => ({ ...s, outline: cleanOutline(pts, s) }));
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
    // Karta przeszkody (np. kominka klikniętego w 3D): rozwinięta i przewinięta do widoku.
    reveal(id, kind = 'obstacle') {
      const el = itemEl(kind, id);
      if (!el) return;
      cardCollapse.expand(el);
      scrollIntoPanel(el, { block: 'nearest', behavior: 'smooth' });
    },
    // Wyróżnienie karty zaznaczonego w 3D występu ściany (null — żadnej).
    markPicked(id) {
      root.querySelectorAll('.item.obstacle.picked').forEach((el) => el.classList.remove('picked'));
      if (id) itemEl('obstacle', id)?.classList.add('picked');
      // zaznaczona przeszkoda — karta jako okienko po prawej
      const card = markInspectorCard(root, '.item.obstacle', id);
      if (card?.classList.contains('collapsed')) cardCollapse.expand(card);
      // karta jest w grupie „Przeszkody” — zwinięta grupa nie pokazuje treści, więc ją rozwijamy
      const group = card?.closest('details.panel-sec');
      if (group && !group.open) group.open = true;
      const o = card && store.get().space.obstacles.find((x) => x.id === id);
      if (o) card.querySelector('.obj-sketch').innerHTML = obstacleSketch(o, store.get().space);
    },
  };
}

