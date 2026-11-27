import { SEAT_HEIGHT } from '../model/project.js';
import { showNotice } from './sizeNotices.js';
import {
  BACK_TYPES,
  MOUNT_TYPES,
  setCabinetMount,
  CABINET_LIMITS,
  legHeight,
  fitCabinetToSpace,
  cabinetPanels,
  cabinetIssues,
  cabinetProblems,
  panelCutSize,
  resizePanelLinked,
  JOINT_TYPES,
  TOP_TYPES,
  STIFFENER_POSITIONS,
  createStiffener,
  setBackGap,
  LEG_HEIGHTS,
  LEG_LIMITS,
  LEG_DIAMETER,
  cabinetLegs,
  getPath,
  setPath,
  slopeTopPlane,
  slopeTopGap,
  setFrontType,
  frontParts,
  doorSpan,
  PART_TYPES,
  INNER_SPACER,
  setFrontLayout,
  frontLayout,
  hasAnyFronts,
  UPPER_FRONTS,
  DRAWER_FRONT_DEFAULT,
  BOTTOM_DRAWER_KINDS,
  BOTTOM_DRAWER_LIMITS,
  wallFitPlanes,
  WALL_FIT_GAP,
  ceilingGapFor,
  describeCuts,
  stiffenerY,
  addShelf,
  setShelfY,
  spreadShelvesEvenly,
  shelfPlacement,
  shelfKey,
  newId,
  FRONT_TYPES,
  FRONT_LIMITS,
  HANDLE_GROOVES,
  FRONT_DECORS,
  DECOR_LIMITS,
  DECOR_GAP_LIMITS,
  describeMilling,
  HANDLE_TYPES,
  HANDLE_POSITIONS,
  HANDLE_SPACINGS,
  HANDLE_LIMITS,
  defaultHandle,
  handleOffsets,
  describeHandle,
  DEFAULT_FRONT_GAP_V,
  FRONT_PART_MIN,
} from '../model/furniture.js';
import { t } from '../i18n.js';

// Inne korpusy o tej samej wysokości i głębokości — do skopiowania półek. Szerokość nie ma znaczenia
// (półka idzie od boku do boku), np. przy podziale wnęki 2000 mm na trzy korpusy: 666 / 666 / 668.
const sameSize = (a, b) => ['height', 'depth'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
const sameSizeCabinets = (cabinet, project) => project.furniture.filter((c) => c.id !== cabinet.id && sameSize(c, cabinet));
import { duplicateCabinet, slideCabinet, slideCabinets } from '../model/placement.js';
import { addCabinetNoResize, cabinetAlcoves, updateCabinetRefit, updateCabinetCeilingGap, setLegs } from '../model/layout.js';
import { createAlcoveDialog } from './alcoveDialog.js';
import { cabinetMapSvg } from './cabinetMap.js';
import { ICON_COLLAPSE, ICON_EXPAND } from './collapsible.js';
import { duplicateSelected } from '../state/duplicate.js';
import { markInspectorCard } from './inspectorCard.js';
import { cabinetSketch, panelSketch } from './objectSketch.js';
import { addPart, addParts, setPartField, setPartKind, partKindOf, removePart, movePart, fillFreeSpace, freeAround, fitLabel, addDoor, doorFullHeight, canDoorGrow, setDoorField, setDoorHeight, removeDoor, toggleDoorCover, doorCoverOptions } from '../model/frontEdit.js';
import { attachDragReorder, moveInList, DRAG_HANDLE } from './dragReorder.js';
import { cabinetMaterials, trimMaterial } from '../model/materials.js';
import { setEye, materialSelect, colorPicker, readColorInput, syncColorPicker, NEW_MATERIAL_OPTION } from './widgets.js';
import { sideBlendSummary } from './sideBlends.js';
import { edgeKeys, EDGE_LABELS, projectSolids, panelEdgeSet, isManualEdgeSet, edgeCounts } from '../model/edges.js';

import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero, scrollIntoPanel } from './dom.js';
import { createLegsDialog } from './legsDialog.js';
import { decorInfo, decorPreviewSvg } from '../model/decor.js';
import { rowOf, createTrim } from '../model/trims.js';
import { selectedCabinetIds, toggleCabinet } from '../state/selection.js';

const POSITION_FIELDS = [
  { key: 'x', label: t('X od lewej') },
  { key: 'y', label: t('Y od podłogi') },
  { key: 'z', label: t('Z od tyłu') },
];
const SIZE_FIELDS = [
  { key: 'width', label: t('Szerokość') },
  { key: 'height', label: t('Wysokość') },
  { key: 'depth', label: t('Głębokość') },
];

// Pola elementu korpusu: wymiary i przesunięcia w osiach X/Y/Z.
const PART_FIELDS = [
  { key: 'sx', label: t('Wymiar X'), prop: 'width', min: 1 },
  { key: 'sy', label: t('Wymiar Y'), prop: 'height', min: 1 },
  { key: 'sz', label: t('Wymiar Z'), prop: 'depth', min: 1 },
  { key: 'dx', label: t('Przesuń X'), min: -CABINET_LIMITS.sizeMax },
  { key: 'dy', label: t('Przesuń Y'), min: -CABINET_LIMITS.sizeMax },
  { key: 'dz', label: t('Przesuń Z'), min: -CABINET_LIMITS.sizeMax },
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

// Pola wyboru oklejonych krawędzi płyty (przód, góra, tył, dół / lewa, prawa — zależnie od ułożenia).
function edgeChecks(thicknessAxis) {
  return edgeKeys(thicknessAxis)
    .map((k) => `<label class="check small"><input type="checkbox" data-edge-key="${k}" /> ${EDGE_LABELS[k]}</label>`)
    .join('');
}

function setSummary(cardEl, section, text) {
  const el = cardEl.querySelector(`[data-section="${section}"] .section-sum`);
  if (el) el.textContent = text;
}

// Panel mebli (korpusów). Pełna przebudowa DOM tylko przy zmianach strukturalnych
// (dodanie/usunięcie korpusu, zmiana rodzaju pleców), w pozostałych przypadkach
// odświeżane są wartości pól i ostrzeżenia.
// onShowTrims(cabinetId) — przejście do zakładki „Blendy” (z karty korpusu);
// onShowWorktop(trimId) — przejście do karty blatu w zakładce „Blaty i półki”.
// Nazwy części wnętrza do panelu (od góry: „Szuflada 1” — najwyżej, „Wolna przestrzeń 1”…), indeksy jak w modelu (od dołu).
function partLabels(parts) {
  const labels = [];
  let d = 0;
  let s = 0;
  for (let i = parts.length - 1; i >= 0; i--) labels[i] = parts[i].type !== 'space' ? t('Szuflada {n}', { n: ++d }) : t('Wolna przestrzeń {n}', { n: ++s });
  return labels;
}
// krótko: „Sz. 1”, „Prz. 1” (wiersze listy i pola „Przykrywa”)
function partShortLabels(parts) {
  const labels = [];
  let d = 0;
  let s = 0;
  for (let i = parts.length - 1; i >= 0; i--) labels[i] = parts[i].type !== 'space' ? t('Sz. {n}', { n: ++d }) : t('Prz. {n}', { n: ++s });
  return labels;
}

// Lista części wnętrza (od góry): ⠿, rodzaj, wysokość (puste — auto), ✕; przy przykrytych — „za drzwiami N”.
function frontPartsHtml(st) {
  const labels = partLabels(st.parts);
  const rows = st.parts
    .map((p, i) => ({ p, i }))
    .reverse()
    .map(({ p, i }) => {
      const j = st.doors.findIndex((d) => d.covers.includes(p.id));
      const short = partShortLabels(st.parts)[i];
      const where = j >= 0 ? (st.doors.length > 1 ? t('za drzwiami {n}', { n: j + 1 }) : t('za drzwiami')) : p.type === 'drawer' ? t('z frontem') : p.type === 'innerDrawer' ? t('wewnętrzna, bez drzwi') : t('otwarta');
      return `
      <div class="fp-item fp-${p.type}" data-fpart="${i}">
        <span class="drag-handle fs-drag" draggable="true" data-fpart-drag title="${t('Przeciągnij, aby przenieść wyżej albo niżej')}">⠿</span>
        <span class="fp-tag" title="${labels[i]} — ${where}">${short}${j >= 0 ? ' 🚪' : ''}</span>
        <select data-fpart-f="type" aria-label="${t('Rodzaj części')}" title="${t('Szuflada — z własnym frontem; Szuflada wewn. — czoło w korpusie (bez frontu); Przestrzeń — wolne miejsce (otwarte albo za drzwiami)')}"><option value="drawer">${t('Szuflada')}</option><option value="innerDrawer">${t('Szuflada wewn.')}</option><option value="space">${t('Przestrzeń')}</option></select>
        <label class="fs-height" title="${t('Wysokość (szuflady — jej frontu / czoła). Puste — automatycznie: części bez wysokości dzielą resztę po równo.')}"><input type="number" step="1" min="1" data-fpart-f="height" /><small>mm</small></label>
        <button type="button" class="icon fp-fill" data-fpart-fill hidden title="${t('Dopasuj wysokość szuflady do miejsca w korpusie')}">⤢</button>
        <button type="button" class="icon danger" data-fpart-remove title="${t('Usuń')}">✕</button>
      </div>`;
    })
    .join('');
  return rows || `<p class="empty">${t('Brak — dodaj szuflady albo wolną przestrzeń.')}</p>`;
}

// Lista drzwi: rodzaj, wysokość (jak front szuflady — puste: auto), ✕, zawiasy, „Przykrywa:” — części wnętrza od góry.
function frontDoorsHtml(st) {
  const labels = partLabels(st.parts);
  const rows = st.doors
    .map(
      (d, j) => `
      <div class="fd-item" data-fdoor="${j}">
        <div class="fs-head">
          <select data-fdoor-f="type" aria-label="${t('Rodzaj drzwi')}"><option value="door">${t('Pojedyncze')}</option><option value="doubleDoor">${t('Podwójne')}</option></select>
          <label class="fs-height" title="${t('Wysokość drzwi — suma przykrytych części; zmienia się przykryta wolna przestrzeń (albo najwyższa część). Puste — automatycznie.')}"><input type="number" step="1" min="1" data-fdoor-f="height" /><small>mm</small></label>
          <button type="button" class="icon danger" data-fdoor-remove title="${t('Usuń drzwi (szuflady za nimi dostaną własne fronty)')}">✕</button>
        </div>
        ${d.type === 'door' ? `<label class="fs-row"><span>${t('Zawiasy')}</span><select data-fdoor-f="hingeSide"><option value="left">${t('po lewej')}</option><option value="right">${t('po prawej')}</option></select></label>` : ''}
        <button type="button" class="fd-full" data-fdoor-full title="${t('Drzwi przykrywają też części pod i nad nimi (szuflady wewnętrzne, wolne miejsce) — aż do innych drzwi albo do końca korpusu')}">${t('⇕ Na całą wysokość')}</button>
        <div class="fd-covers"><span>${t('Przykrywa:')}</span>
          ${st.parts
            .map((_, i) => i)
            .reverse()
            .map((i) => `<label class="check small" title="${labels[i]}"><input type="checkbox" data-fdoor-cover="${i}" /> ${partShortLabels(st.parts)[i]}</label>`)
            .join('')}
        </div>
      </div>`,
    )
    .join('');
  return rows || `<p class="empty">${t('Bez drzwi.')}</p>`;
}

// Rysunek układu frontów korpusu (widok z przodu, w skali): obrys korpusu, drzwi (z linią zawiasów),
// fronty szuflad (z uchwytem), czoła szuflad wewnętrznych — przerywane (za drzwiami).
function frontLayoutSvg(cabinet, panels) {
  const W = cabinet.width;
  const H = cabinet.height;
  const y0 = cabinet.y + legHeight(cabinet);
  const pad = Math.max(W, H) * 0.04;
  const Y = (y) => H - (y - y0);
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" class="fl-body" />`];
  for (const p of panels) {
    const internal = p.key.startsWith('idrawer-');
    const cls = internal ? 'fl-internal' : p.opening?.hinge ? 'fl-door' : 'fl-drawer';
    const x = p.x - cabinet.x;
    parts.push(`<rect x="${x}" y="${Y(p.y + p.height)}" width="${p.width}" height="${p.height}" class="${cls}"><title>${p.name}: ${Math.round(p.width)} × ${Math.round(p.height)} mm</title></rect>`);
    if (p.opening?.drawer && !internal) {
      const cy = Y(p.y + p.height / 2);
      parts.push(`<line x1="${x + p.width * 0.4}" y1="${cy}" x2="${x + p.width * 0.6}" y2="${cy}" class="fl-handle" />`);
    }
    if (p.opening?.hinge) {
      // trójkąt otwierania: od strony zawiasów do środka krawędzi otwierania
      const hx = p.opening.hinge === 'left' ? x : x + p.width;
      const ox = p.opening.hinge === 'left' ? x + p.width : x;
      parts.push(`<polyline points="${hx},${Y(p.y + p.height)} ${ox},${Y(p.y + p.height / 2)} ${hx},${Y(p.y)}" class="fl-swing" />`);
    }
  }
  return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${t('Układ frontów')}">${parts.join('')}</svg>`;
}

export function createFurniturePanel(root, store, ui, tabs, { onShowTrims, onShowWorktop } = {}) {
  let renderedKey = null;
  const legsDialog = createLegsDialog();
  const alcoveDialog = createAlcoveDialog();
  // Łańcuszki: zmiana wysokości / nóżek dotyczy też korpusów z rzędu (stykają się bokami,
  // wspólna linia frontu), które mają tę samą wysokość / takie same nóżki.
  // linked[kind] — korpusy z włączonym łańcuszkiem (stan widoku, nie zapisuje się w projekcie).
  const linked = { width: new Set(), height: new Set(), depth: new Set(), legs: new Set(), backGap: new Set() };
  const LINK_MATCH = {
    backGap: (a, b) => Math.abs((a.backGap ?? 0) - (b.backGap ?? 0)) < 0.5,
    height: (a, b) => Math.abs(a.height - b.height) < 0.5,
    depth: (a, b) => Math.abs(a.depth - b.depth) < 0.5,
    width: (a, b) => Math.abs(a.width - b.width) < 0.5,
    legs: (a, b) => legHeight(a) === legHeight(b),
  };
  // Wymiary, których łańcuszki włączają się same przy zaznaczeniu kilku korpusów (Ctrl + klik).
  const DIM_LINKS = ['width', 'height', 'depth'];
  let wasMulti = false; // czy przy ostatniej zmianie zaznaczenia było zaznaczonych kilka korpusów
  // Kilka zaznaczonych korpusów, w tym ten — łańcuszek wymiaru łączy wtedy zaznaczone korpusy
  // (bez względu na rząd i dotychczasowy wymiar); null — zwykły łańcuszek (rząd, ta sama wartość).
  const selectionGroup = (kind, cabinet, project) => {
    const ids = selectedCabinetIds(ui.get());
    if (!DIM_LINKS.includes(kind) || ids.size < 2 || !ids.has(cabinet.id)) return null;
    return project.furniture.filter((x) => ids.has(x.id) && x.id !== cabinet.id);
  };
  const linkTwins = (kind, cabinet, project) =>
    selectionGroup(kind, cabinet, project) ??
    rowOf(cabinet.id, project)
      .filter((cid) => cid !== cabinet.id)
      .map((cid) => project.furniture.find((x) => x.id === cid))
      .filter((x) => LINK_MATCH[kind](x, cabinet));
  // Korpus + połączone z nim (gdy łańcuszek jest włączony).
  const linkedIds = (kind, id, project) => {
    if (!linked[kind].has(id)) return [id];
    return [id, ...linkTwins(kind, project.furniture.find((c) => c.id === id), project).map((c) => c.id)];
  };
  const linkButton = (kind) =>
    `<button type="button" class="icon tiny link-btn" data-link="${kind}" aria-pressed="false">⛓</button>`;
  // Rozwinięte sekcje kart korpusów („id:sekcja”); domyślnie otwarta jest sekcja „Korpus”.
  const sectionState = new Map();
  // podsekcje („sub:…”, np. „Front” / „Uchwyt”) są domyślnie rozwinięte
  const isOpen = (id, key) => sectionState.get(`${id}:${key}`) ?? (key === 'body' || key.startsWith('sub:'));
  // Całe karty zwinięte do nagłówka (id korpusów).
  const collapsed = new Set();
  const applyCollapsed = (el) => {
    const isCollapsed = collapsed.has(el.dataset.id);
    el.classList.toggle('collapsed', isCollapsed);
    const btn = el.querySelector('[data-collapse-card]');
    btn.textContent = isCollapsed ? '▸' : '▾';
    btn.title = isCollapsed ? t('Rozwiń korpus') : t('Zwiń korpus');
    btn.setAttribute('aria-expanded', String(!isCollapsed));
  };
  const setCollapsed = (ids, value) => {
    for (const id of ids) value ? collapsed.add(id) : collapsed.delete(id);
    root.querySelectorAll('[data-kind="cabinet"]').forEach(applyCollapsed);
  };

  // Zmiany, po których zmienia się lista elementów (np. dochodzi blenda), wymagają przebudowy karty.
  const structureKey = (project) =>
    project.furniture
      .map((c) => cabinetPanels(c, project).map((p) => p.key).join(',') + `@${c.id}`)
      .join('|') +
    '#' +
    project.materials.map((m) => `${m.id}:${m.name}:${m.thickness}`).join('|') +
    `#${(project.boards?.length ?? 0) > 0}${project.space.obstacles.length > 0}`; // (mapka — także bez korpusów)
  const updateFurniture = (fn) => store.set((p) => ({ ...p, furniture: fn(p.furniture, p) }));
  const updateCabinet = (id, fn) =>
    updateFurniture((list, p) => list.map((c) => (c.id === id ? fn(c, p) : c)));

  function render(project) {
    root.innerHTML = `
      <p class="hint">${t('Korpus składa się z boków, wieńca górnego i dolnego oraz pleców. Wymiary są zewnętrzne, pozycja to narożnik lewy‑dolny‑tylny.')}</p>
      ${
        project.furniture.length || project.boards?.length || project.space.obstacles.length
          ? `<div class="map-window">
              <div class="map-window-head" title="${t('Przeciągnij, aby przesunąć okienko')}"><b>${t('Mapka zabudowy')}</b><button type="button" class="insp-close map-close" data-map-close title="${t('Ukryj mapkę (pokażesz ją przyciskiem „🗺️ Mapka” na górnym pasku)')}" aria-label="${t('Ukryj mapkę')}">✕</button></div>
              <div class="cab-map" title="${t('Mapka zabudowy (widok z przodu): klik — zaznacz korpus, kolejny klik w front — ten front, Ctrl + klik — kilka')}"></div>
            </div>
            <div class="collapse-all">
              <button type="button" class="icon-btn" data-action="collapse-all" title="${t('Zwiń wszystkie karty korpusów do nagłówków')}" aria-label="${t('Zwiń wszystkie')}">${ICON_COLLAPSE}</button>
              <button type="button" class="icon-btn" data-action="expand-all" title="${t('Rozwiń wszystkie karty korpusów')}" aria-label="${t('Rozwiń wszystkie')}">${ICON_EXPAND}</button>
              <button type="button" class="icon-btn" data-action="sort-cabinets" title="${t('Ułóż karty tak jak na mapce: od lewej do prawej')}" aria-label="${t('Ułóż od lewej')}"><small class="sort-ico">1→2</small></button>
            </div>`
          : ''
      }
      <div class="items">
        ${project.furniture.map((c) => renderCabinet(c, project)).join('') || `<p class="empty">${t('Brak mebli.')}</p>`}
      </div>
      <div class="add-row">
        <button type="button" data-action="add-cabinet" draggable="true" data-dnd="application/x-meble-cabinet" title="${t('Kliknij — nowy korpus pojawi się w widoku 3D i pójdzie za kursorem; kliknij na podłodze, żeby go postawić (Esc — anuluj). Można też przeciągnąć i upuścić.')}">${t('+ Korpus')}</button>
      </div>

      <datalist id="leg-heights">${LEG_HEIGHTS.map((h) => `<option value="${h}"></option>`).join('')}</datalist>
      <div class="scroll-spacer" aria-hidden="true"></div>
    `;
    renderedKey = structureKey(project);
    root.querySelectorAll('[data-kind="cabinet"]').forEach(applyCollapsed);
    updateStatus(project);
  }

  // Karta korpusu podzielona na zwijane sekcje; w nagłówku każdej — krótkie podsumowanie
  // (uzupełniane w updateStatus), żeby nie trzeba było jej rozwijać.
  function renderCabinet(c, project) {
    // headExtra — przyciski na pasku sekcji (np. oko przy „Fronty”)
    const section = (key, title, body, extraClass = '', headExtra = '') => `
      <details class="section ${extraClass}" data-section="${key}" ${isOpen(c.id, key) ? 'open' : ''}>
        <summary><span class="section-title">${title}</span><span class="section-sum"></span>${headExtra}</summary>
        <div class="section-body" data-title="${escapeHtml(title)} — ${escapeHtml(c.name)}"><button type="button" class="icon tiny section-close" data-close-section title="${t('Zamknij')}">✕</button>${body}</div>
      </details>`;

    // Zwijana podsekcja w sekcji (ramka z tytułem); key — do zapamiętania stanu, extraClass — np. do ukrywania.
    const sub = (key, title, html, extraClass = '') => `
      <details class="subsection ${extraClass}" data-section="sub:${key}" ${isOpen(c.id, `sub:${key}`) ? 'open' : ''}>
        <summary class="subsection-title">${title}</summary>
        <div class="subsection-body">${html}</div>
      </details>`;

    const body =
      sub(
        'size',
        t('Wymiary i położenie'),
        `
      <div class="grid-3">
        ${SIZE_FIELDS.map((f) => {
          const field = numberField(f.label, f.key, c[f.key], { min: CABINET_LIMITS.sizeMin, max: CABINET_LIMITS.sizeMax, small: true });
          // Wymiary: łańcuszek — zmiana dotyczy też korpusów w rzędzie o tym samym wymiarze.
          return f.key in linked
            ? field.replace('</span>', ` ${linkButton(f.key)}</span>`)
            : field;
        }).join('')}
        ${POSITION_FIELDS.map((f) =>
          numberField(f.label, f.key, c[f.key], { min: -CABINET_LIMITS.sizeMax, max: CABINET_LIMITS.sizeMax, small: true }),
        ).join('')}
      </div>
      <div class="grid-2">
        <label class="field small" title="${t('Odstęp pleców od tylnej ściany (np. na rury). Front zostaje na miejscu — korpus robi się płytszy, blat się nie zmienia.')}">
          <span>${t('Odstęp od tylnej ściany')} <small>mm</small> ${linkButton('backGap')}</span>
          <input type="number" step="1" min="0" max="${CABINET_LIMITS.sizeMax}" data-f="backGap" />
        </label>
        <label class="field small ceiling-gap-field" title="${t('Odstęp korpusu (i blend „do sufitu”) od sufitu — dotyczy korpusów dopasowanych do sufitu. Domyślnie — luz ustawiony w zakładce „Przestrzeń”; wpisana wartość dotyczy tylko tego korpusu.')}">
          <span>${t('Luz do sufitu')} <small>mm</small> <small class="auto-tag">${t('z przestrzeni')}</small>
            <button type="button" class="icon tiny" data-reset-ceiling-gap title="${t('Wróć do luzu ustawionego w przestrzeni')}">↺</button>
          </span>
          <input type="number" step="1" min="0" max="500" data-f="ceilingGap" />
        </label>
      </div>
      <div class="item-row">
        <span class="hint">${t('Wypełnij całą wnękę jednym korpusem:')}</span>
        <button type="button" data-action="fit">${t('Dopasuj do wnęki')}</button>
      </div>
      <div class="item-row">
        <span class="hint">${t('Siedzisko / ławka — góra na wysokości siedziska:')}</span>
        <button type="button" data-action="seat" title="${t('Wysokość korpusu tak, żeby jego góra (z nóżkami i blatem na nim) była na wysokości siedziska z ustawień widoku (Pokaż → Linia siedziska)')}">${t('🪑 Do siedziska')}</button>
      </div>
      <div class="slide-row" title="${t('Przesuwa korpus aż do ściany, innego mebla lub przeszkody. Kilka korpusów zaznaczonych Ctrl + klik przesuwa się razem.')}">
        <span>${t('Dosuń:')}</span>
        <button type="button" data-slide="-x" title="${t('W lewo')}">←</button>
        <button type="button" data-slide="+x" title="${t('W prawo')}">→</button>
        <button type="button" data-slide="-z" title="${t('Do tyłu')}">${t('↑ tył')}</button>
        <button type="button" data-slide="+z" title="${t('Do przodu')}">${t('↓ przód')}</button>
        <button type="button" data-slide="-y" title="${t('W dół — na podłogę albo na mebel poniżej')}">${t('⤓ dół')}</button>
      </div>`,
      ) +
      sub(
        'build',
        t('Konstrukcja i materiały'),
        `
      <div class="grid-2">
        ${materialSelect(t('Materiał korpusu'), 'materialId', project)}
        ${colorPicker(t('Kolor korpusu'), 'colors.body')}
        ${materialSelect(t('Materiał blend'), 'blendMaterialId', project)}
        ${colorPicker(t('Kolor blend'), 'colors.blend')}
        <label class="field small" title="${t('Wiszący — bez nóżek, na zawieszkach i szynie montażowej; plecy cofnięte (miejsce na szynę)')}">
          <span>${t('Montaż')}</span>
          <select data-f="mount">
            ${MOUNT_TYPES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small back-setback" title="${t('O ile plecy są cofnięte od tylnej krawędzi boków — miejsce na szynę montażową (typowo 16–20 mm)')}">
          <span>${t('Cofnięcie pleców')} <small>mm</small></span>
          <input type="number" step="1" min="0" max="100" data-f="backSetback" />
        </label>
        <label class="field small">
          <span>${t('Plecy')}</span>
          <select data-f="backType">
            ${BACK_TYPES.map((b) => `<option value="${b.key}">${b.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small">
          <span>${t('Góra korpusu')}</span>
          <select data-f="topType">
            ${TOP_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small rail-width">
          <span>${t('Szerokość trawersów')} <small>mm</small></span>
          <input type="number" step="1" min="10" max="${CABINET_LIMITS.sizeMax}" data-f="railWidth" />
        </label>
        ${jointSelect(t('Wieniec / trawersy górne'), 'topJoint', JOINT_TYPES.top, c.topJoint)}
        ${jointSelect(t('Wieniec dolny'), 'bottomJoint', JOINT_TYPES.bottom, c.bottomJoint)}
      </div>
      <p class="hint">${t('Grubości i kolory materiałów — w zakładce „Materiały”.')}</p>`,
      ) +
      sub(
        'slope',
        t('Skos'),
        `
        <div class="grid-2">
          <label class="check" title="${t('Korpus pod skosem dostaje skośną górę: boki i plecy docięte równolegle do skosu, wieniec górny pod kątem')}">
            <input type="checkbox" data-f="slopeTop.enabled" /> ${t('Góra pod skos')}
          </label>
          <label class="field small slope-gap-field" title="${t('Odstęp między skośną górą korpusu a skosem (prostopadle do skosu). Domyślnie — luz ustawiony przy skosie (Przestrzeń); wpisana wartość dotyczy tylko tego korpusu.')}">
            <span>${t('Luz do skosu')} <small>mm</small> <small class="auto-tag">${t('ze skosu')}</small>
              <button type="button" class="icon tiny" data-reset-slope-gap title="${t('Wróć do luzu ustawionego przy skosie')}">↺</button>
            </span>
            <input type="number" step="1" min="0" max="500" data-f="slopeTop.gap" />
          </label>
        </div>
        <p class="hint slope-top-info"></p>`,
        'slope-top',
      ) +
      sub(
        'wallfit',
        t('Skośna ściana'),
        `
        <div class="grid-2">
          <label class="check" title="${t('Korpus przysunięty do skośnej ściany dostaje skośny bok równoległy do ściany: wieńce, półki i plecy docięte pod kątem')}">
            <input type="checkbox" data-f="wallFit.enabled" /> ${t('Bok pod skośną ścianę')}
          </label>
          <label class="field small" title="${t('Odstęp między skośnym bokiem a ścianą (prostopadle do ściany). Puste — {mm} mm.', { mm: WALL_FIT_GAP })}">
            <span>${t('Luz do ściany')} <small>mm</small></span>
            <input type="number" step="1" min="0" max="500" data-f="wallFit.gap" placeholder="${WALL_FIT_GAP}" />
          </label>
        </div>
        <p class="hint wall-fit-info"></p>`,
        'wall-fit',
      );

    const legs = `
      <div class="grid-2">
        <label class="check"><input type="checkbox" data-f="legs.enabled" /> ${t('Nóżki')} ${linkButton('legs')}</label>
        <label class="field small">
          <span>${t('Wysokość nóżek')} <small>mm</small></span>
          <input type="number" list="leg-heights" step="1" min="${LEG_LIMITS.min}" max="${LEG_LIMITS.max}" data-f="legs.height" />
        </label>
      </div>`;

    const stiff = `
      <p class="hint">${t('Pionowe listwy tuż przed plecami, między bokami — usztywniają korpus (np. do zawieszenia szafki). Mieszczą się w korpusie, nie zmieniają jego wymiarów. Nowe poprzeczki rozkładają się równo: jedna — na środku, dwie — dzielą wnętrze na trzy równe części itd. Poprzeczka nie nachodzi na półkę — jeśli trafia na półkę, przesuwa się tuż nad nią albo pod nią.')}</p>
      ${(c.stiffeners ?? [])
        .map(
          (st, i) => `
        <div class="stiff-row">
          <label class="field small">
            <span>${t('Położenie')}</span>
            <select data-f="stiffeners.${i}.position">
              ${STIFFENER_POSITIONS.map((p) => `<option value="${p.key}">${p.label}</option>`).join('')}
            </select>
          </label>
          <label class="field small">
            <span>${t('Szerokość')} <small>mm</small></span>
            <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="stiffeners.${i}.height" />
          </label>
          <label class="field small stiff-y">
            <span>${t('Od dołu korpusu')} <small>mm</small></span>
            <input type="number" step="1" min="0" max="${CABINET_LIMITS.sizeMax}" data-f="stiffeners.${i}.y" />
          </label>
          <button type="button" class="icon danger" data-remove-stiff="${st.id}" title="${t('Usuń poprzeczkę')}">✕</button>
          <span class="stiff-note"></span>
        </div>`,
        )
        .join('')}
      <div class="add-row"><button type="button" data-action="add-stiff">${t('+ poprzeczka')}</button></div>`;

    // Fronty nakładane: drzwi pojedyncze / podwójne albo szuflady (równe fronty).
    // Dwie części: „Front” (płyta) i „Uchwyt” (frez uchwytowy albo uchwyt przykręcany).
    const frontsHtml = `
      <details class="subsection" data-section="sub:front" ${isOpen(c.id, 'sub:front') ? 'open' : ''}>
      <summary class="subsection-title">${t('Front')}</summary>
      <div class="subsection-body">
      <div class="front-layout">
        <div class="front-layout-preview" title="${t('Układ frontów (widok z przodu)')}"></div>
        <div class="front-parts-col">
          <div class="fp-title" title="${t('Części wnętrza od góry do dołu: szuflady i wolne przestrzenie. Szuflada nieprzykryta drzwiami ma własny front, przykryta — chowa się za drzwiami.')}">${t('Wnętrze')} <small>${t('(od góry)')}</small></div>
          <div class="front-parts"></div>
          <div class="front-parts-add">
            <button type="button" data-fpart-add="drawer" title="${t('Nowa szuflada z frontem na dole')}">${t('+ Szuflada')}</button>
            <button type="button" data-fpart-add="innerDrawer" title="${t('Nowa szuflada wewnętrzna na dole — czoło w korpusie, bez frontu (drzwi dodaj osobno i zaznacz, co przykrywają)')}">${t('+ Szuflada wewnętrzna')}</button>
            <button type="button" data-fpart-add="space" title="${t('Nowa wolna przestrzeń na górze')}">${t('+ Wolna przestrzeń')}</button>
          </div>
          <div class="front-bulk" title="${t('Kilka szuflad naraz (na dole); wysokość puste — automatycznie')}">
            ${t('Dodaj')} <input type="number" min="1" max="12" step="1" value="3" data-bulk-n /> ×
            <select data-bulk-type><option value="drawer">${t('szuflada')}</option><option value="innerDrawer">${t('szuflada wewn.')}</option></select>
            ${t('po')} <input type="number" min="20" step="1" placeholder="${t('auto')}" data-bulk-h /> mm
            <button type="button" data-bulk-add>${t('Dodaj')}</button>
          </div>
          <div class="fp-title" title="${t('Drzwi przykrywają wybrane części wnętrza (ciągły zakres) — szuflady za nimi są wewnętrzne.')}">${t('Drzwi')}</div>
          <div class="front-doors"></div>
          <div class="front-parts-add">
            <button type="button" data-fdoor-add="door">${t('+ Drzwi pojedyncze')}</button>
            <button type="button" data-fdoor-add="doubleDoor">${t('+ Drzwi podwójne')}</button>
          </div>
        </div>
      </div>
      <label class="check small front-spacers" title="${t('Listwy dystansowe na bokach korpusu pod prowadnice szuflad wewnętrznych: szuflady są węższe o 2 × {mm} mm i mijają prowadniki zawiasów drzwi', { mm: INNER_SPACER })}">
        <input type="checkbox" data-f="fronts.innerSpacers" /> ${t('Dystanse pod prowadnice szuflad wewnętrznych (szuflady węższe o 2 × {mm} mm — mijają zawiasy)', { mm: INNER_SPACER })}
      </label>
      <div class="grid-2 inner-grip" title="${t('Szuflada wewnętrzna nie ma uchwytu: żeby ją otworzyć, trzeba ją chwycić od góry. Gdy nad nią jest inna szuflada, potrzebny jest odstęp na palce — chyba że czoło ma frez uchwytowy.')}">
        <label class="field small"><span>${t('Uchwyt szuflad wewnętrznych')}</span>
          <select data-f="fronts.innerGrip">
            <option value="gap">${t('odstęp na palce nad czołem')}</option>
            <option value="groove">${t('frez uchwytowy w czole (bez odstępu)')}</option>
          </select>
        </label>
        <label class="field small inner-grip-gap"><span>${t('Odstęp na palce')}</span><span class="unit-input"><input type="number" step="1" min="0" max="100" data-f="fronts.innerGripGap" /><small>mm</small></span></label>
      </div>
      <p class="hint front-bottom-info"></p>
      <div class="grid-2">
        <label class="field small front-opt" title="${t('Szczelina boczna (lewa + prawa razem): po połowie przy każdym boku korpusu (np. 5 mm = 2,5 + 2,5 — sąsiednie korpusy mają między frontami pełne 5 mm), cała między drzwiami podwójnymi')}">
          <span>${t('Szczelina boczna')} <small>${t('(lewa + prawa) mm')}</small></span>
          <input type="number" step="0.5" min="0" max="${FRONT_LIMITS.gapMax}" data-f="fronts.gap" />
        </label>
        <label class="field small front-opt" title="${t('Szczelina pionowa (góra + dół razem): cała od góry i między szufladami; od dołu nie ma szczeliny — dolny front równa się z dołem korpusu (chyba że pod korpusem stoi inny korpus — wtedy szczelina dzieli się po połowie)')}">
          <span>${t('Szczelina pionowa')} <small>${t('(góra + dół) mm')}</small></span>
          <input type="number" step="0.5" min="0" max="${FRONT_LIMITS.gapMax}" data-f="fronts.gapV" />
        </label>
        <span class="front-opt">${materialSelect(t('Materiał frontów'), 'frontMaterialId', project)}</span>
        <span class="front-opt">${colorPicker(t('Kolor frontów'), 'colors.front')}</span>
        <div class="front-opt front-decor-row" title="${t('Ozdobne frezowanie lica frontu (zwykle MDF lakierowany)')}">
          <label class="field small">
            <span>${t('Frez dekoracyjny')}</span>
            <select data-f="fronts.decor">
              ${FRONT_DECORS.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}
            </select>
          </label>
          <span class="front-decor-preview" aria-hidden="true"></span>
        </div>
        <label class="field small front-decor-param" data-decor-field="decorMargin">
          <span><span class="param-label">${t('Odległość od krawędzi')}</span> <small>mm</small></span>
          <input type="number" step="1" min="${DECOR_LIMITS.min}" max="${DECOR_LIMITS.max}" data-f="fronts.decorMargin" />
        </label>
        <label class="field small front-decor-param" data-decor-field="decorSpacing">
          <span><span class="param-label">${t('Rozstaw rowków')}</span> <small>mm</small></span>
          <input type="number" step="1" min="${DECOR_LIMITS.min}" max="${DECOR_LIMITS.max}" data-f="fronts.decorSpacing" />
        </label>
        <label class="field small front-decor-param" data-decor-field="decorGap">
          <span><span class="param-label">${t('Odstęp między liniami')}</span> <small>mm</small></span>
          <input type="number" step="1" min="${DECOR_GAP_LIMITS.min}" max="${DECOR_GAP_LIMITS.max}" data-f="fronts.decorGap" />
        </label>
      </div>
      </div>
      </details>
      <details class="subsection front-opt" data-section="sub:handle" ${isOpen(c.id, 'sub:handle') ? 'open' : ''}>
      <summary class="subsection-title">${t('Uchwyt')}</summary>
      <div class="subsection-body">
      <div class="grid-2">
        <label class="field small" title="${t('Uchwyt wyfrezowany w krawędzi frontu — zamiast uchwytu przykręcanego. Krawędź otwierania: w drzwiach po stronie przeciwnej do zawiasów (w podwójnych — na środku), w szufladach — górna.')}">
          <span>${t('Frez uchwytowy')}</span>
          <select data-f="fronts.groove">
            ${HANDLE_GROOVES.map((g) => `<option value="${g.key}">${g.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="grid-2 front-handle-box">
        <label class="field small" title="${t('Uchwyt przykręcany. W drzwiach — pionowo przy krawędzi otwierania, w szufladach — poziomo na środku szerokości.')}">
          <span>${t('Uchwyt')}</span>
          <select data-f="fronts.handle.type">
            ${HANDLE_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small handle-spacing" title="${t('Odległość między otworami (osiami śrub) — z opisu uchwytu, np. 128 mm. Wybierz z listy albo wpisz własną.')}">
          <span>${t('Rozstaw otworów')} <small>mm</small></span>
          <span class="spacing-row">
            <input type="number" step="1" min="${HANDLE_LIMITS.spacingMin}" max="${HANDLE_LIMITS.spacingMax}" data-f="fronts.handle.spacing" />
            <select data-spacing-preset title="${t('Typowe rozstawy uchwytów')}">
              <option value="">${t('typowe ▾')}</option>
              ${HANDLE_SPACINGS.map((v) => `<option value="${v}">${v} mm</option>`).join('')}
            </select>
          </span>
        </label>
        <label class="field small handle-opt" title="${t('Średnica otworu pod śrubę uchwytu (zwykle 5 mm pod M4)')}">
          <span>${t('Średnica otworu')} <small>mm</small></span>
          <input type="number" step="0.5" min="${HANDLE_LIMITS.holeMin}" max="${HANDLE_LIMITS.holeMax}" data-f="fronts.handle.hole" />
        </label>
        <label class="field small handle-opt" title="${t('Położenie uchwytu na wysokości frontu')}">
          <span>${t('Położenie')}</span>
          <select data-f="fronts.handle.position">
            ${HANDLE_POSITIONS.map((p) => `<option value="${p.key}">${p.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small handle-opt handle-offset-x">
          <span><span class="param-label">${t('Od krawędzi otwierania')}</span> <small>mm</small></span>
          <input type="number" step="1" min="-${HANDLE_LIMITS.shiftMax}" max="${HANDLE_LIMITS.shiftMax}" data-f="fronts.handle.offsetX" />
        </label>
        <label class="field small handle-opt handle-offset-y">
          <span><span class="param-label">${t('Od górnej krawędzi')}</span> <small>mm</small>
            <button type="button" class="icon tiny" data-reset-handle title="${t('Przywróć domyślne położenie uchwytu')}">↺</button>
          </span>
          <input type="number" step="1" min="-${HANDLE_LIMITS.shiftMax}" max="${HANDLE_LIMITS.shiftMax}" data-f="fronts.handle.offsetY" />
        </label>
        <p class="hint handle-hint handle-opt">${t('Uchwyt możesz też przeciągnąć myszką w widoku 3D.')}</p>
      </div>
      </div>
      </details>
      <p class="hint front-info"></p>`;

    // Półki: wysokość i głębokość — wartości wyliczone (równy rozkład / pełna głębokość) albo wpisane.
    const shelvesHtml = `
      <p class="hint">${t('Półki rozkładają się równo — jedna dzieli wnętrze na dwa równe prześwity, dwie na trzy itd. Zmiana wysokości jednej półki (wpisanie albo przeciągnięcie w 3D) ustawia półki ręcznie — pozostałe zostają na swoich miejscach; ↺ rozkłada wszystkie półki równo od nowa. Głębokość skraca półkę od przodu.')}</p>
      <label class="field small shelf-material" title="${t('Półki mogą być z innej płyty niż korpus, np. korpus z płyty 18 mm, a półki z 16 mm. Na liście formatek są wtedy w grupie tego materiału (osobny plik dla meble.pl).')}">
        <span>${t('Materiał półek')}</span>
        <select data-f="shelfMaterialId">
          <option value="">${t('jak korpus')}</option>
          ${project.materials
            .filter((m) => m.type !== 'hdf' && m.type !== 'worktop')
            .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${m.thickness} mm)</option>`)
            .join('')}
          ${NEW_MATERIAL_OPTION}
        </select>
      </label>
      ${(c.shelves ?? [])
        .map(
          (s, i) => `
        <div class="shelf-row" data-shelf="${i}">
          <span class="shelf-name">${t('Półka')} ${i + 1}</span>
          <label class="field small">
            <span>${t('Od dołu korpusu')} <small>mm</small> <small class="auto-tag">${t('równo')}</small>
              <button type="button" class="icon tiny" data-reset-shelf-y title="${t('Rozłóż wszystkie półki równo od nowa')}">↺</button>
            </span>
            <input type="number" step="1" min="0" max="${CABINET_LIMITS.sizeMax}" data-shelf-y />
          </label>
          <label class="field small">
            <span>${t('Głębokość')} <small>mm</small> <small class="auto-tag">${t('pełna')}</small>
              <button type="button" class="icon tiny" data-reset-shelf-depth title="${t('Pełna głębokość wnętrza')}">↺</button>
            </span>
            <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-shelf-depth />
          </label>
          <button type="button" class="icon danger" data-remove-shelf="${s.id}" title="${t('Usuń półkę')}">✕</button>
        </div>`,
        )
        .join('')}
      <div class="add-row">
        <button type="button" data-action="add-shelf">${t('+ półka')}</button>
        <button type="button" data-action="copy-shelves" title="${t('Kopiuje półki (położenie i głębokość) do korpusów o tej samej wysokości i głębokości (szerokość może być inna) — ich dotychczasowe półki zostaną zastąpione. Ctrl+Z cofa.')}">${t('⧉ Kopiuj półki')}</button>
      </div>`;

    const parts = `
      <p class="hint">${t('Osie: X — szerokość, Y — wysokość, Z — głębokość korpusu. Elementy są powiązane: zmiana wymiaru płyty zmienia korpus, a pozostałe płyty się dopasowują (np. szerokość boku → głębokość korpusu i wieńców). Zmiana grubości przesuwa sąsiednie płyty. „Niezależny” odłącza płytę — jej wymiary dotyczą tylko jej. Wartości ręczne są wyróżnione, ↺ przywraca automatyczne.')}</p>
      ${cabinetPanels(c, project).map(renderPart).join('')}
      <p class="legs-info"></p>`;

    return `
      <div class="item cabinet" data-kind="cabinet" data-id="${c.id}">
        <div class="item-head">
          ${DRAG_HANDLE}
          <button type="button" class="collapse-toggle" data-collapse-card>▾</button>
          <input type="text" data-f="name" value="${escapeHtml(c.name)}" aria-label="${t('Nazwa mebla')}" />
          <button type="button" class="eye" data-toggle-hidden="cabinet">👁</button>
          <button type="button" data-action="duplicate" title="${t('Duplikuj (Ctrl+D)')}">⧉</button>
          <button type="button" class="danger" data-remove="${c.id}" title="${t('Usuń korpus (Delete)')}" aria-label="${t('Usuń korpus')}">🗑</button>
        </div>
        <div class="card-sum" data-collapse-card title="${t('Kliknij, aby rozwinąć')}"></div>
        <ul class="issues"></ul>
        <div class="obj-sketch bi-sketch" title="${t('Kliknij, aby powiększyć szkic')}"></div>
        ${section('body', t('Korpus'), body)}
        ${section('fronts', t('Fronty / szuflady'), frontsHtml, '', '<button type="button" class="icon eye section-eye" data-toggle-fronts-hidden>👁</button>')}
        ${section('shelves', t('Półki'), shelvesHtml)}
        ${section('stiff', t('Wzmocnienia'), stiff)}
        ${section('legs', t('Nóżki'), legs)}
        <div class="section section-static">
          <div class="section-bar">
            <span class="section-title">${t('Blendy i blat')}</span>
            <span class="section-sum trims-sum"></span>
            <span class="section-links">
              <button type="button" class="section-link" data-action="show-trims" title="${t('Blendy boczne tego korpusu — okienko obok')}">${t('Blendy boczne ◂')}</button>
              <button type="button" class="section-link worktop-show" data-action="show-worktop" title="${t('Blat leżący na tym korpusie — jego okienko')}">${t('Blat →')}</button>
              <button type="button" class="section-link worktop-add" data-action="add-worktop" title="${t('Dodaj blat na tym korpusie i sąsiednich w rzędzie (z frezami krawędzi i otworami)')}">${t('+ Dodaj blat')}</button>
            </span>
          </div>
        </div>
        ${section('parts', t('Elementy'), parts, 'parts')}
      </div>`;
  }

  function renderPart(p) {
    return `
      <div class="part" data-part="${p.key}">
        <div class="part-head">
          <span class="part-name">${p.name}</span>
          <span class="part-cut"></span>
          <button type="button" class="icon eye" data-toggle-part-hidden="${p.key}">👁</button>
          <label class="check small" title="${t('Płyta nie zmienia korpusu i nie dopasowuje się do niego (poza grubościami sąsiadów)')}">
            <input type="checkbox" data-part-free ${p.free ? 'checked' : ''} /> ${t('Niezależny')}
          </label>
          <button type="button" class="icon" data-reset-part="${p.key}" title="${t('Przywróć wymiary automatyczne')}">↺</button>
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
        <div class="part-edges" title="${t('Krawędzie oklejone obrzeżem. Domyślnie tylko widoczne — schowane przy ścianie, pod blatem albo przy innej płycie są pomijane.')}">
          <span class="part-material"></span>
          <span class="edges-label">${t('obrzeże')} <small class="auto-tag">auto</small>
            <button type="button" class="icon tiny" data-reset-edges title="${t('Automatycznie: tylko krawędzie widoczne')}">↺</button>
          </span>
          ${edgeChecks(p.thicknessAxis)}
        </div>
        <div class="part-cutsize"></div>
        <div class="part-shape"></div>
        <div class="allowance-note part-allowance"></div>
      </div>`;
  }

  // Wartość pola elementu do wyświetlenia: wymiar wyliczony (lub ręczny) albo przesunięcie.
  const partFieldValue = (cabinet, panel, field) =>
    field.prop ? round1(panel[field.prop]) : (cabinet.panelOverrides?.[panel.key]?.[field.key] ?? 0);

  // Odświeża pola (np. po „Dopasuj do wnęki”), ostrzeżenia i elementy bez przebudowy DOM.
  // Mapka zabudowy (ui/cabinetMap.js) — rysowana na nowo przy zmianie projektu i zaznaczenia.
  function updateMap(project = store.get()) {
    const map = root.querySelector('.cab-map');
    const st = ui.get();
    if (map) map.innerHTML = cabinetMapSvg(project, selectedCabinetIds(st), new Set([...(st.selectedFronts ?? []), ...(st.selectedBlends ?? []), ...(st.selectedObstacle ? [`obstacle:${st.selectedObstacle}`] : [])]));
  }

  function updateStatus(project) {
    updateMap(project);
    let solids = null; // bryły projektu do wyznaczania widocznych krawędzi — liczone raz
    for (const c of project.furniture) {
      const el = root.querySelector(`[data-kind="cabinet"][data-id="${c.id}"]`);
      if (!el) continue;

      el.querySelectorAll('[data-f]').forEach((input) => {
        const value = getPath(c, input.dataset.f);
        if (input.type === 'checkbox') input.checked = !!value;
        else if (!input.classList.contains('invalid')) setIfNotFocused(input, value);
      });
      // materiał półek: brak wyboru (null) — „jak korpus”
      setIfNotFocused(el.querySelector('select[data-f="shelfMaterialId"]'), c.shelfMaterialId ?? '');
      // szkic — tylko w okienku po prawej
      if (el.classList.contains('in-inspector')) el.querySelector('.obj-sketch').innerHTML = sketchFor(c, project);

      // Blendy i blat — tylko informacja (edycja w zakładkach „Blendy” i „Blaty i półki”).
      const covering = project.trims.filter((t) => t.cabinetIds.includes(c.id));
      // blat na korpusie: „Blat →”, bez blatu: „+ Dodaj blat”
      const hasWorktop = covering.some((t) => t.type === 'countertop');
      el.querySelector('.worktop-show').hidden = !hasWorktop;
      el.querySelector('.worktop-add').hidden = hasWorktop;
      const side = sideBlendSummary(c);
      el.querySelector('.trims-sum').textContent =
        [side && t('Blendy boczne: {list}', { list: side }), covering.length && t('Obejmują go: {names}', { names: covering.map((tr) => tr.name).join(', ') })]
          .filter(Boolean)
          .join(' · ') || t('Bez blend i blatu');
      el.classList.toggle('is-hidden', !!c.hidden);
      setEye(el.querySelector('[data-toggle-hidden="cabinet"]'), c.hidden, t('korpus'));
      el.querySelector('.rail-width').hidden = c.topType !== 'rails';
      el.querySelector('.back-setback').hidden = c.mount !== 'wall';
      // szafka wisząca: plecy wsunięte między boki i cofnięte (miejsce na szynę) — napisy w liście „Plecy”
      const sb = c.backSetback ?? 18;
      const backLabels = c.mount === 'wall'
        ? { hdf: t('HDF (wsunięte, cofnięte o {mm} mm)', { mm: sb }), board: t('Z płyty (wsunięte, cofnięte o {mm} mm)', { mm: sb }) }
        : Object.fromEntries(BACK_TYPES.map((b) => [b.key, b.label]));
      el.querySelectorAll('select[data-f="backType"] option').forEach((o) => {
        if (backLabels[o.value] && o.textContent !== backLabels[o.value]) o.textContent = backLabels[o.value];
      });
      // Góra pod skos — tylko gdy przestrzeń ma skos z tyłu lub z przodu.
      const zSlope = project.space.slopes.some((s) => s.side === 'back' || s.side === 'front');
      el.querySelector('.slope-top').hidden = !zSlope;
      // Bok pod skośną ścianę — tylko gdy przestrzeń ma własny kształt ścian.
      el.querySelector('.wall-fit').hidden = !project.space.outline;
      if (project.space.outline) {
        const cuts = wallFitPlanes(c, project);
        const SIDE = { left: t('lewy'), right: t('prawy') };
        el.querySelector('.wall-fit-info').textContent =
          c.wallFit?.enabled === false
            ? t('Wyłączone — korpus zostaje prostopadłościanem (przy skośnej ścianie pojawi się ostrzeżenie).')
            : cuts.length
              ? t('Korpus sięga skośnej ściany — {cuts}; wieńce, półki i plecy docięte.', { cuts: cuts.map((w) => t('bok {side} skośny, pod kątem {angle}°', { side: SIDE[w.side], angle: Math.round(w.angle * 10) / 10 })).join('; ') })
              : t('Korpus nie sięga skośnej ściany — zwykłe, proste boki. Przysuń go do ściany, a bok dopasuje się sam.');
      }
      // Luz do sufitu: własny korpusu albo (pusty) — z przestrzeni; pokazujemy wartość, która obowiązuje.
      const ceilInput = el.querySelector('[data-f="ceilingGap"]');
      const ceilAuto = c.ceilingGap == null;
      if (ceilAuto && !ceilInput.classList.contains('invalid')) setIfNotFocused(ceilInput, ceilingGapFor(c, project));
      ceilInput.classList.toggle('overridden', !ceilAuto);
      el.querySelector('.ceiling-gap-field .auto-tag').hidden = !ceilAuto;
      el.querySelector('[data-reset-ceiling-gap]').hidden = ceilAuto;
      // Łańcuszki (wysokość, nóżki) — włączone / wyłączone i z iloma korpusami łączą.
      const LINK_TEXT = {
        height: [t('zmiana wysokości zmienia'), t('Połącz wysokość z korpusami w rzędzie, które mają tę samą wysokość'), t('o tej samej wysokości')],
        width: [t('zmiana szerokości zmienia'), t('Połącz szerokość z korpusami w rzędzie, które mają tę samą szerokość'), t('o tej samej szerokości (korpusy w rzędzie przesuwają się, żeby dalej stały bok przy boku)')],
        depth: [t('zmiana głębokości zmienia'), t('Połącz głębokość z korpusami w rzędzie, które mają tę samą głębokość'), t('o tej samej głębokości')],
        backGap: [t('zmiana odstępu od tylnej ściany zmienia'), t('Połącz odstęp od tylnej ściany z korpusami w rzędzie, które mają ten sam odstęp'), t('z tym samym odstępem')],
        legs: [t('dodanie, usunięcie i zmiana nóżek dotyczy'), t('Połącz nóżki z korpusami w rzędzie, które mają takie same nóżki'), t('z takimi samymi nóżkami')],
      };
      for (const kind of Object.keys(linked)) {
        const btn = el.querySelector(`[data-link="${kind}"]`);
        const on = linked[kind].has(c.id);
        const n = linkTwins(kind, c, project).length;
        const [what, offText, which] = LINK_TEXT[kind];
        const cabs = `${n} ${n === 1 ? t('korpus') : n > 1 && n < 5 ? t('korpusy') : t('korpusów')}`;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.title = !on
          ? t('{text} (teraz: {n}).', { text: offText, n })
          : selectionGroup(kind, c, project)
            ? t('Połączone z zaznaczonymi korpusami: {what} też {cabs} (zaznaczone z Ctrl). Kliknij, żeby rozłączyć.', { what, cabs })
            : t('Połączone: {what} też {cabs} w rzędzie {which}. Kliknij, żeby rozłączyć.', { what, cabs, which });
      }
      // Luz: własny korpusu albo (pusty) — ze skosu; pokazujemy wartość, która obowiązuje.
      const gapInput = el.querySelector('[data-f="slopeTop.gap"]');
      const gapAuto = c.slopeTop?.gap == null;
      if (gapAuto && !gapInput.classList.contains('invalid')) setIfNotFocused(gapInput, slopeTopGap(c, project));
      gapInput.classList.toggle('overridden', !gapAuto);
      el.querySelector('.slope-gap-field .auto-tag').hidden = !gapAuto;
      el.querySelector('[data-reset-slope-gap]').hidden = gapAuto;
      const slant = slopeTopPlane(c, project);
      const angle = slant ? Math.round((Math.acos(slant.normal[1]) * 180) / Math.PI * 10) / 10 : null;
      el.querySelector('.slope-top-info').textContent = !zSlope
        ? ''
        : c.slopeTop?.enabled === false
          ? t('Góra prosta — korpus jest prostopadłościanem.')
          : slant
            ? t('Korpus sięga skosu — góra docięta pod kątem {angle}°', { angle }) + (c.topType === 'rails' ? t(' (zamiast trawersów pełny wieniec skośny)') : '') + '.'
            : t('Korpus nie sięga skosu — zwykła, prosta góra.');

      // Podsumowania w nagłówkach sekcji.
      const mats = cabinetMaterials(c, project);
      const bodyMat = mats.body;
      // Kolory: wybrany kolor albo „jak w materiale” (próbnik pokazuje wtedy kolor materiału).
      syncColorPicker(el, 'colors.body', c.colors?.body, mats.body.color);
      syncColorPicker(el, 'colors.blend', c.colors?.blend, mats.blend.color);
      syncColorPicker(el, 'colors.front', c.colors?.front, mats.front.color);
      setSummary(el, 'body', `${c.width} × ${c.height} × ${c.depth} mm · ${bodyMat.name}${c.topType === 'rails' ? t(' · trawersy') : ''}${c.backGap ? t(' · odstęp {mm}', { mm: c.backGap }) : ''}`);
      setSummary(el, 'legs', c.legs?.enabled ? `${c.legs.height} mm` : t('brak'));
      const nStiff = c.stiffeners?.length ?? 0;
      setSummary(el, 'stiff', nStiff ? `${nStiff} ${nStiff === 1 ? t('poprzeczka') : nStiff < 5 ? t('poprzeczki') : t('poprzeczek')}` : t('brak'));
      // Fronty: widoczne tylko pola pasujące do rodzaju; podsumowanie z wymiarami frontów.
      const fr = c.fronts ?? { type: 'none' };
      const st = frontParts(fr);
      const anyFronts = hasAnyFronts(fr);
      const layAll = cabinetPanels(c, project);
      const layPanels = layAll.filter((x) => x.valid && (x.key.startsWith('front-') || x.key.startsWith('idrawer-')));
      const r = (v) => Math.round(v);
      // listy wnętrza i drzwi: przebudowa tylko przy zmianie kształtu (rodzaje, liczba części, przykrycia) — bez gubienia fokusu
      {
        const partsEl = el.querySelector('.front-parts');
        const doorsEl = el.querySelector('.front-doors');
        const sig = JSON.stringify([st.parts.map((p) => [p.id, p.type]), st.doors.map((d) => [d.type, d.covers])]);
        if (partsEl.dataset.sig !== sig) {
          partsEl.innerHTML = frontPartsHtml(st);
          doorsEl.innerHTML = frontDoorsHtml(st);
          partsEl.dataset.sig = sig;
        }
        const gripGapField = el.querySelector('.inner-grip-gap');
        if (gripGapField) gripGapField.hidden = (c.fronts?.innerGrip ?? 'gap') !== 'gap';
        const ranges = layAll.partRanges ?? [];
        // zaznaczone szuflady tego korpusu (Ctrl + klik w 3D, na mapce albo w wierszach) → indeksy części
        const pickedFronts = new Set((ui.get().selectedFronts ?? []).filter((f) => f.startsWith(`${c.id}:`)).map((f) => f.slice(c.id.length + 1)));
        const pickedParts = [...new Set(layAll.filter((x) => x.valid && x.part != null && pickedFronts.has(x.key)).map((x) => x.part))].sort((a, b) => a - b);
        if (pickedParts.length >= 2) partsEl.querySelectorAll('.fp-item[data-fpart]').forEach((it) => it.classList.toggle('picked', pickedParts.includes(Number(it.dataset.fpart))));
        let bulk = el.querySelector('.parts-bulk');
        if (pickedParts.length >= 2) {
          if (!bulk) {
            partsEl.insertAdjacentHTML(
              'beforebegin',
              `<div class="parts-bulk">
                <div class="parts-bulk-head"><b></b><button type="button" class="icon tiny" data-bulk-clear title="${t('Odznacz')}">✕</button></div>
                <div class="parts-bulk-row">
                  <label>${t('wysokość')} <input type="number" step="1" min="${FRONT_PART_MIN}" data-bulk-height placeholder="${t('mm')}" /></label>
                  <button type="button" data-bulk-apply-height title="${t('Ta sama wysokość dla wszystkich zaznaczonych')}">${t('Ustaw')}</button>
                  <button type="button" data-bulk-equal title="${t('Podziel ich łączną wysokość po równo')}">${t('⇕ Wyrównaj')}</button>
                </div>
                <div class="parts-bulk-row">
                  <select data-bulk-kind aria-label="${t('Rodzaj')}"><option value="">${t('rodzaj…')}</option><option value="drawer">${t('Szuflada z frontem')}</option><option value="innerDrawer">${t('Szuflada wewnętrzna')}</option><option value="space">${t('Wolna przestrzeń')}</option></select>
                  <button type="button" class="danger" data-bulk-remove title="${t('Usuń zaznaczone części')}">${t('🗑 Usuń zaznaczone')}</button>
                </div>
              </div>`,
            );
            bulk = el.querySelector('.parts-bulk');
          }
          bulk.dataset.parts = pickedParts.join(',');
          bulk.querySelector('.parts-bulk-head b').textContent = t('Zaznaczone szuflady: {n} (Ctrl + klik — dodaj / odejmij)', { n: pickedParts.length });
          const hs = pickedParts.map((i) => Math.round(ranges[i] ? ranges[i][1] - ranges[i][0] : 0));
          const hIn = bulk.querySelector('[data-bulk-height]');
          if (document.activeElement !== hIn) hIn.placeholder = new Set(hs).size === 1 ? `${hs[0]}` : t('różne');
        } else bulk?.remove();
        const set = (root2, sel, v) => {
          const inp = root2.querySelector(sel);
          if (inp && !inp.classList.contains('invalid')) setIfNotFocused(inp, v);
          return inp;
        };
        st.parts.forEach((p, i) => {
          const item = partsEl.querySelector(`[data-fpart="${i}"]`);
          if (!item) return;
          set(item, '[data-fpart-f="type"]', partKindOf(st, p));
          // wolna przestrzeń zmniejszona, bo części się nie mieszczą — pokazana rzeczywista wysokość
          const actual = ranges[i] ? ranges[i][1] - ranges[i][0] : null;
          const fitted = p.type === 'space' && p.height != null && actual != null && actual < p.height - 0.5;
          const hIn = set(item, '[data-fpart-f="height"]', fitted ? r(actual) : p.height ?? '');
          hIn.placeholder = ranges[i] ? `${r(ranges[i][1] - ranges[i][0])} (${t('auto')})` : t('auto');
          hIn.classList.toggle('overridden', p.height != null);
          hIn.classList.toggle('fitted', fitted);
          hIn.title = fitted ? t('Dopasowana do korpusu (wpisano {mm} mm) — wolne przestrzenie zmniejszają się same, gdy części się nie mieszczą', { mm: p.height }) : '';
          // szuflada z wolnym miejscem obok — przycisk „wypełnij”
          const fill = item.querySelector('[data-fpart-fill]');
          const gain = freeAround(st, ranges, layAll.frontArea, c.fronts?.gapV ?? DEFAULT_FRONT_GAP_V, i, layAll.frontOverflow).gain;
          fill.hidden = !gain;
          if (gain) fill.title = `${fitLabel(gain)} — ${gain > 0 ? t('szuflada wypełni wolne miejsce obok') : t('szuflady się nie mieszczą, ta się zmniejszy')}`;
        });
        st.doors.forEach((d, j) => {
          const item = doorsEl.querySelector(`[data-fdoor="${j}"]`);
          if (!item) return;
          set(item, '[data-fdoor-f="type"]', d.type);
          set(item, '[data-fdoor-f="hingeSide"]', d.hingeSide);
          const fullBtn = item.querySelector('[data-fdoor-full]');
          if (fullBtn) fullBtn.hidden = !canDoorGrow(c, j);
          const span = doorSpan(d, st.parts);
          const dr = layAll.doorRanges?.[j];
          const doorH = dr ? r(dr[1] - dr[0]) : span && ranges[span[0]] ? r(ranges[span[1]][1] - ranges[span[0]][0]) : null;
          // wysokość wpisana, gdy część, która ją ustala (najwyższa przykryta wolna przestrzeń / najwyższa część), ma wysokość
          let k = span ? span[1] : -1;
          while (span && k >= span[0] && st.parts[k].type !== 'space') k--;
          if (span && k < span[0]) k = span[1];
          const fixed = k >= 0 && st.parts[k]?.height != null;
          const hIn = set(item, '[data-fdoor-f="height"]', fixed ? doorH : '');
          hIn.placeholder = doorH != null ? `${doorH} (${t('auto')})` : t('auto');
          hIn.classList.toggle('overridden', fixed);
          const opts = doorCoverOptions(st, j);
          opts.forEach((o, i) => {
            const cb = item.querySelector(`[data-fdoor-cover="${i}"]`);
            if (!cb) return;
            cb.checked = o.checked;
            cb.disabled = !o.enabled;
            cb.closest('label').classList.toggle('disabled', !o.enabled);
          });
        });
        // podświetlenie części / drzwi z zaznaczonym w 3D elementem (np. szufladą)
        const sel = ui.get();
        const keys = [...(sel.selectedFronts ?? []), ...(sel.selectedBlends ?? [])].filter((id) => id.startsWith(`${c.id}:`)).map((id) => id.split(':')[1]);
        const picked = keys.map((k2) => layPanels.find((x) => x.key === k2)).filter(Boolean);
        partsEl.querySelectorAll('.fp-item').forEach((it) => it.classList.toggle('picked', picked.some((x) => x.part === Number(it.dataset.fpart))));
        doorsEl.querySelectorAll('.fd-item').forEach((it) => it.classList.toggle('picked', picked.some((x) => x.part == null && x.door === Number(it.dataset.fdoor))));
      }
      el.querySelector('.front-spacers').hidden = !layPanels.some((x) => x.key.startsWith('idrawer-'));
      el.querySelector('.front-layout-preview').innerHTML = frontLayoutSvg(c, layPanels);
      // opis: zawiasy przy szufladach wewnętrznych
      {
        const parts = [];
        for (const d of layPanels.filter((x) => x.opening?.hinge)) {
          if (d.hingeClash?.length) parts.push(t('⚠ {name}: zawiasy na wysokości {ys} mm (od dołu drzwi) wypadają na szufladach wewnętrznych — włącz dystanse pod prowadnice albo zmień wysokości szuflad.', { name: d.name, ys: d.hingeClash.join(', ') }));
        }
        el.querySelector('.front-bottom-info').textContent = parts.join(' ');
      }
      el.querySelectorAll('.front-opt').forEach((x) => (x.hidden = !anyFronts));      el.querySelectorAll('.front-opt').forEach((x) => (x.hidden = fr.type === 'none'));
      // Uchwyt: przy frezie uchwytowym niepotrzebny; rozstaw — tylko dla uchwytu listwowego.
      const handleType = fr.handle?.type ?? 'none';
      const groove = fr.groove && fr.groove !== 'none';
      el.querySelector('.front-handle-box').hidden = !anyFronts || groove;
      el.querySelector('.handle-spacing').hidden = handleType !== 'bar';
      el.querySelectorAll('.handle-opt').forEach((x) => (x.hidden = handleType === 'none'));
      // Położenie uchwytu — dwa wymiary (ustawione albo domyślne) z nazwami zależnymi od frontu i położenia.
      {
        const spec = fr.handle ?? defaultHandle();
        // same drzwi (bez szuflad) — uchwyt pionowy przy krawędzi otwierania
        const door = st.doors.length > 0 && !st.parts.some((x) => x.type === 'drawer' && !st.doors.some((d) => d.covers.includes(x.id))); // (bez szuflad z frontem)
        const off = handleOffsets(spec, door);
        const xLabel = door ? t('Od krawędzi otwierania') : t('Przesunięcie od środka (w prawo +)');
        const yLabel = { top: t('Od górnej krawędzi'), bottom: t('Od dolnej krawędzi'), center: t('Przesunięcie od środka (w górę +)') }[spec.position];
        const xEl = el.querySelector('.handle-offset-x');
        const yEl = el.querySelector('.handle-offset-y');
        xEl.querySelector('.param-label').textContent = xLabel;
        yEl.querySelector('.param-label').textContent = yLabel;
        xEl.title = door ? t('Odległość osi uchwytu od krawędzi drzwi po stronie otwierania') : t('Przesunięcie uchwytu od środka szerokości szuflady');
        yEl.title = spec.position === 'center' ? t('Przesunięcie środka uchwytu od środka wysokości frontu') : t('Odległość skrajnego otworu od krawędzi frontu');
        const xIn = xEl.querySelector('input');
        const yIn = yEl.querySelector('input');
        if (!xIn.classList.contains('invalid')) setIfNotFocused(xIn, off.x);
        if (!yIn.classList.contains('invalid')) setIfNotFocused(yIn, off.y);
        // ↺ — tylko gdy położenie różni się od domyślnego
        const d = defaultHandle();
        el.querySelector('[data-reset-handle]').hidden = spec.offsetX == null && spec.offsetY == null && spec.position === d.position && spec.edgeOffset === d.edgeOffset;
      }
      const frontPanels = cabinetPanels(c, project).filter((p) => p.key.startsWith('front-') && p.valid);
      // Frez dekoracyjny: pola parametrów wybranego wzoru (z ich nazwami) i podgląd na pierwszym froncie.
      const decor = decorInfo(fr.decor ?? 'none');
      el.querySelectorAll('.front-decor-param').forEach((label) => {
        const param = decor.params.find((x) => x.field === label.dataset.decorField);
        label.hidden = !anyFronts || !param;
        if (param) label.querySelector('.param-label').textContent = param.label;
      });
      const sample = frontPanels[0];
      el.querySelector('.front-decor-preview').innerHTML =
        sample && decor.key !== 'none'
          ? decorPreviewSvg(decor.key, sample.width, sample.height, { margin: fr.decorMargin, spacing: fr.decorSpacing, gap: fr.decorGap }, 72)
          : '';
      const sizes = [...new Set(frontPanels.map((p) => `${round1(p.width)} × ${round1(p.height)}`))];
      // od góry, np. „1 szufl. / drzwi / 1 szufl.”
      // np. „2 szufl. + drzwi (1 wewn.)”
      const nDrawers = st.parts.filter((x) => x.type !== 'space').length;
      const nInner = st.parts.filter((x) => x.type === 'innerDrawer' || (x.type === 'drawer' && st.doors.some((d) => d.covers.includes(x.id)))).length;
      const frontLabel = [
        nDrawers - nInner ? t('{n} szufl.', { n: nDrawers - nInner }) : '',
        st.doors.length ? `${st.doors.length > 1 ? st.doors.length + ' × ' : ''}${t('drzwi')}${nInner ? t(' ({n} wewn.)', { n: nInner }) : ''}` : '',
      ]
        .filter(Boolean)
        .join(' + ');
      setSummary(el, 'fronts', !anyFronts ? t('brak') : `${frontLabel} · ${frontPanels.length} × ${sizes.join(' / ')} mm${fr.hidden ? t(' · ukryte') : ''}`);
      // Oko na pasku „Fronty”: ukrywa / pokazuje fronty tego korpusu w widoku 3D (tylko gdy są fronty).
      const frontsEye = el.querySelector('[data-toggle-fronts-hidden]');
      frontsEye.hidden = !anyFronts;
      setEye(frontsEye, fr.hidden, t('fronty tego korpusu'));
      el.querySelector('.front-info').textContent =
        !anyFronts
          ? t('Fronty nakładane (przed korpusem). Dodaj szuflady i / albo drzwi.')
          : t('Fronty: {n} szt. {sizes} mm (szer. × wys.)', { n: frontPanels.length, sizes: sizes.join(' / ') }) +
            (st.parts.some((x) => x.type !== 'space') ? t(' · szuflady: skrzynki tylko w widoku 3D (bez formatek).') : '') +
            ((frontPanels[0] && describeMilling(frontPanels[0])) ? ` · ${describeMilling(frontPanels[0])}.` : '') +
            t(' Zawiasy, prowadnice i uchwyty są w liście formatek (CSV) w części „Akcesoria”') +
            (fr.groove !== 'none' && fr.groove ? t(' (fronty z frezem uchwytowym — bez uchwytów).') : '.');

      const nShelves = c.shelves?.length ?? 0;
      const shelfMat = nShelves && c.shelfMaterialId ? project.materials.find((m) => m.id === c.shelfMaterialId) : null;
      setSummary(
        el,
        'shelves',
        nShelves ? `${nShelves} ${nShelves === 1 ? t('półka') : nShelves < 5 ? t('półki') : t('półek')}${shelfMat ? ` · ${shelfMat.name}` : ''}` : t('brak'),
      );
      // Kopiowanie półek: do korpusów o identycznych wymiarach.
      const twins = sameSizeCabinets(c, project);
      const copyBtn = el.querySelector('[data-action="copy-shelves"]');
      copyBtn.hidden = nShelves === 0;
      copyBtn.disabled = twins.length === 0;
      copyBtn.textContent = twins.length
        ? t('⧉ Kopiuj półki do {target} o tej samej wysokości i głębokości', { target: twins.length === 1 ? twins[0].name : t('{n} korpusów', { n: twins.length }) })
        : t('⧉ Kopiuj półki — brak korpusów o tej samej wysokości i głębokości');
      el.querySelectorAll('.shelf-row').forEach((row) => {
        const s = c.shelves?.[Number(row.dataset.shelf)];
        if (!s) return;
        const place = shelfPlacement(c, s, project);
        const yInput = row.querySelector('[data-shelf-y]');
        const dInput = row.querySelector('[data-shelf-depth]');
        if (!yInput.classList.contains('invalid')) setIfNotFocused(yInput, round1(place.y));
        if (!dInput.classList.contains('invalid')) setIfNotFocused(dInput, round1(place.depth));
        const even = s.position === 'even';
        yInput.classList.toggle('overridden', !even);
        row.querySelector('[data-reset-shelf-y]').hidden = even;
        row.querySelector('[data-reset-shelf-y]').previousElementSibling.hidden = !even;
        const fullDepth = s.depth == null;
        dInput.classList.toggle('overridden', !fullDepth);
        row.querySelector('[data-reset-shelf-depth]').hidden = fullDepth;
        row.querySelector('[data-reset-shelf-depth]').previousElementSibling.hidden = !fullDepth;
      });
      el.querySelectorAll('.stiff-row').forEach((row, i) => {
        const st = c.stiffeners?.[i];
        const label = row.querySelector('.stiff-y');
        const input = label.querySelector('input');
        // „Na wysokości…” — wpisywana; „równo rozłożone” — wyliczona (tylko do odczytu).
        label.hidden = st?.position !== 'backAt' && st?.position !== 'even';
        input.disabled = st?.position === 'even';
        const actual = st ? stiffenerY(c, st, project) : 0;
        if (st?.position === 'even') input.value = round1(actual);
        // Poprzeczka ustawiona na wysokości, na której jest półka (albo inna poprzeczka) — przesunięta obok.
        const wanted = st?.position === 'backAt' ? st.y : null;
        const moved = (c.shelves?.length ?? 0) > 0 && wanted !== null && Math.abs(actual - wanted) > 0.5;
        row.querySelector('.stiff-note').textContent = moved
          ? t('Przesunięta na {actual} mm — na {wanted} mm nachodziłaby na półkę.', { actual: round1(actual), wanted: round1(wanted) })
          : '';
      });
      const { errors: issues, warnings } = cabinetProblems(c, project);
      el.classList.toggle('has-issues', issues.length > 0);
      // Podsumowanie widoczne w zwiniętej karcie.
      el.querySelector('.card-sum').textContent =
        t('szer. {w} × wys. {h} × gł. {d} mm', { w: c.width, h: c.height, d: c.depth }) +
        (issues.length ? ` · ⚠ ${issues.length} ${issues.length === 1 ? t('problem') : issues.length < 5 ? t('problemy') : t('problemów')}` : '') +
        (warnings.length ? ` · ⓘ ${warnings.length} ${warnings.length === 1 ? t('ostrzeżenie') : warnings.length < 5 ? t('ostrzeżenia') : t('ostrzeżeń')}` : '');
      el.querySelector('.issues').innerHTML =
        (issues.length ? issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('') : `<li class="ok">${t('Mieści się w przestrzeni.')}</li>`) +
        warnings.map((w) => `<li class="warn">ⓘ ${escapeHtml(w)}</li>`).join('');

      const panels = cabinetPanels(c, project);
      solids ??= projectSolids(project);
      setSummary(el, 'parts', t('{n} płyt', { n: panels.length }));
      const legs = cabinetLegs(c, project);
      el.querySelector('.legs-info').textContent = legs.length
        ? t('Nóżki: {n} szt. × {h} mm (Ø{d} mm)', { n: legs.length, h: legs[0].height, d: LEG_DIAMETER })
        : '';
      for (const p of panels) {
        const partEl = el.querySelector(`[data-part="${p.key}"]`);
        if (!partEl) continue;
        const edgeSet = panelEdgeSet(p, c, project, solids);
        const s = panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, edgeSet) });
        partEl.classList.toggle('invalid', !p.valid);
        partEl.querySelector('.part-cut').textContent = p.valid
          ? `${round1(s.length)} × ${round1(s.width)} × ${round1(s.thickness)} mm`
          : t('błędne wymiary');
        // Materiał, obrzeże i wymiar do cięcia (gotowy wymiar pomniejszony o taśmę).
        partEl.querySelector('.part-material').textContent = p.material.name;
        partEl.querySelectorAll('[data-edge-key]').forEach((cb) => {
          cb.checked = edgeSet.includes(cb.dataset.edgeKey);
          cb.disabled = !s.band;
        });
        const manualEdges = isManualEdgeSet(p, c);
        partEl.querySelector('.edges-label .auto-tag').hidden = manualEdges || !s.band;
        partEl.querySelector('[data-reset-edges]').hidden = !manualEdges;
        partEl.querySelector('.part-edges').classList.toggle('no-band', !s.band);
        partEl.querySelector('.part-allowance').textContent = s.allowance
          ? t('⚠ Zapas na docięcie +{mm} mm — docięcie na miejscu (wliczony w formatkę)', { mm: s.allowance })
          : '';
        partEl.querySelector('.part-cutsize').textContent =
          p.valid && s.band && (s.edges.l || s.edges.w)
            ? t('do cięcia: {size} mm (obrzeże {band} mm: {edges})', { size: `${round1(s.cutLength)} × ${round1(s.cutWidth)}`, band: s.band, edges: edgeSet.map((k) => EDGE_LABELS[k]).join(', ') })
            : '';
        // Płyta docięta pod skos: ścięte rogi i krawędzie cięte pod kątem.
        partEl.querySelector('.part-shape').textContent = p.valid
          ? [describeCuts(s), describeMilling(p), describeHandle(p)].filter(Boolean).join('; ')
          : '';
        partEl.querySelector('[data-reset-part]').hidden = p.overridden.length === 0 && !p.free;
        partEl.querySelector('[data-part-free]').checked = p.free;
        partEl.classList.toggle('free', p.free);
        partEl.classList.toggle('is-hidden', p.hidden);
        setEye(partEl.querySelector('[data-toggle-part-hidden]'), p.hidden, t('płytę'));
        for (const f of PART_FIELDS) {
          const input = partEl.querySelector(`[data-pf="${f.key}"]`);
          input.classList.toggle('overridden', p.overridden.includes(f.key));
          if (!input.classList.contains('invalid')) setIfNotFocused(input, partFieldValue(c, p, f));
        }
      }
    }
  }

  // Kolejność sekcji frontu: przeciąganie za uchwyt ⠿ w sekcji (w obrębie listy jednego korpusu); kreska nad / pod
  // sekcją pokazuje miejsce upuszczenia. Lista pokazuje sekcje od góry, w modelu są od dołu.
  {
    let secDrag = null; // { cabinetId, index, list }
    const clearSecMarks = () => root.querySelectorAll('.fp-item.drop-before, .fp-item.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    const secTarget = (e) => {
      const item = e.target.closest?.('.fp-item');
      if (!secDrag || !item || item.parentElement !== secDrag.list || Number(item.dataset.fpart) === secDrag.index) return null;
      const r = item.getBoundingClientRect();
      return { item, after: e.clientY > r.top + r.height / 2 };
    };
    root.addEventListener('dragstart', (e) => {
      const handle = e.target.closest?.('[data-fpart-drag]');
      if (!handle) return;
      e.stopPropagation();
      const item = handle.closest('.fp-item');
      secDrag = { cabinetId: handle.closest('[data-kind="cabinet"]').dataset.id, index: Number(item.dataset.fpart), list: item.parentElement };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'section');
      e.dataTransfer.setDragImage(item, 16, 12);
      item.classList.add('dragging');
    });
    root.addEventListener('dragover', (e) => {
      const t = secTarget(e);
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearSecMarks();
      t.item.classList.add(t.after ? 'drop-after' : 'drop-before');
    });
    root.addEventListener('drop', (e) => {
      const t = secTarget(e);
      clearSecMarks();
      if (!t) return;
      e.preventDefault();
      const { cabinetId, index: from } = secDrag;
      const target = Number(t.item.dataset.fpart);
      // lista od góry: „pod” częścią = niżej (mniejszy indeks), „nad” = wyżej
      const at = target > from ? target - 1 : target; // indeks celu po wyjęciu
      updateCabinet(cabinetId, (c, p) => movePart(c, from, t.after ? at : at + 1, p));
    });
    root.addEventListener('dragend', () => {
      secDrag = null;
      clearSecMarks();
      root.querySelectorAll('.fp-item.dragging').forEach((x) => x.classList.remove('dragging'));
    });
  }

  // Zmiana kolejności kart: przeciąganie za uchwyt ⠿ (ui/dragReorder.js).
  attachDragReorder(root, 'cabinet', (moved, target, after) => updateFurniture((list) => moveInList(list, moved, target, after)));

  // przeciąganie „+ Korpus” do widoku 3D (upuszczenie — scene/interaction.js)
  root.addEventListener('dragstart', (e) => {
    const t = e.target.closest?.('[data-dnd]')?.dataset.dnd;
    if (!t) return;
    e.dataTransfer.setData(t, '1');
    e.dataTransfer.effectAllowed = 'copy';
  });

  // Klik w korpus na mapce: zaznacza go (jak klik w 3D) i pokazuje jego kartę; Ctrl + klik — kilka korpusów.
  root.addEventListener('click', (e) => {
    {
      const bulk = e.target.closest('[data-bulk-add]');
      const bulkCab = bulk?.closest('[data-kind="cabinet"]');
      if (bulk && bulkCab) {
        const box = bulk.closest('.front-bulk');
        const n = Number(box.querySelector('[data-bulk-n]').value) || 1;
        const h = Number(box.querySelector('[data-bulk-h]').value) || null;
        const type = box.querySelector('[data-bulk-type]').value;
        updateCabinet(bulkCab.dataset.id, (c, p) => addParts(c, type, n, h, p));
        return;
      }
      const btn = e.target.closest('[data-fpart-add], [data-fpart-remove], [data-fpart-fill], [data-fdoor-add], [data-fdoor-remove], [data-fdoor-full]');
      const cabId = btn?.closest('[data-kind="cabinet"]')?.dataset.id;
      if (btn && cabId) {
        updateCabinet(cabId, (c, p) => {
          if (btn.dataset.fpartAdd) return addPart(c, btn.dataset.fpartAdd, p);
          if (btn.dataset.fdoorAdd) return addDoor(c, btn.dataset.fdoorAdd, p);
          if (btn.dataset.fdoorFull !== undefined) return doorFullHeight(c, Number(btn.closest('[data-fdoor]').dataset.fdoor), p);
          if (btn.dataset.fpartFill !== undefined) return fillFreeSpace(c, Number(btn.closest('[data-fpart]').dataset.fpart), p);
          if (btn.dataset.fpartRemove !== undefined) return removePart(c, Number(btn.closest('[data-fpart]').dataset.fpart), p);
          return removeDoor(c, Number(btn.closest('[data-fdoor]').dataset.fdoor), p);
        });
        return;
      }
    }
    // Klik w wiersz szuflady / drzwi (poza polami i przyciskami) albo w front na mapce — zaznacza ten front w 3D
    const pickFront = (cabId, key) => {
      const state = ui.get();
      const frontId = `${cabId}:${key}`;
      const fronts = e.ctrlKey || e.metaKey ? ((l) => (l.includes(frontId) ? l.filter((x) => x !== frontId) : [...l, frontId]))(state.selectedFronts ?? []) : [frontId];
      ui.set({ ...state, selectedId: cabId, selectedIds: [cabId], selectedFronts: fronts, selectedBlends: [], selectedHole: null, selectedObstacle: null }, { fromPanel: true });
    };
    const mapObstacle = e.target.closest('[data-map-obstacle]')?.dataset.mapObstacle;
    const mapBoard = e.target.closest('[data-map-board]')?.dataset.mapBoard;
    if (mapObstacle || mapBoard) {
      ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedHole: null, selectedBlends: mapBoard ? [`board:${mapBoard}`] : [], selectedObstacle: mapObstacle ?? null });
      return;
    }
    const mapFront = e.target.closest('[data-map-front]')?.dataset.mapFront;
    if (mapFront) {
      const [cabId, key] = mapFront.split(':');
      const st = ui.get();
      const cabinetPicked = selectedCabinetIds(st).has(cabId);
      const frontPicked = (st.selectedFronts ?? []).some((f) => f.startsWith(`${cabId}:`));
      // jak w 3D: front zaznaczonego korpusu (albo z Ctrl) — sam front; inaczej — najpierw cały korpus
      if (e.ctrlKey || e.metaKey || cabinetPicked || frontPicked) pickFront(cabId, key);
      else ui.set({ ...st, selectedId: cabId, selectedIds: [cabId], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }, { reveal: true });
      return;
    }
    const row = e.target.closest('input, select, button, label, [data-fpart-drag]') ? null : e.target.closest('.fp-item[data-fpart], .fd-item[data-fdoor]');
    const rowCab = row?.closest('[data-kind="cabinet"]')?.dataset.id;
    if (row && rowCab) {
      const prj = store.get();
      const cab = prj.furniture.find((x) => x.id === rowCab);
      const panels = cab ? cabinetPanels(cab, prj).filter((p) => p.valid && (p.key.startsWith('front-') || p.key.startsWith('idrawer-'))) : [];
      let panel = null;
      if (row.dataset.fpart != null) {
        const i = Number(row.dataset.fpart);
        panel = panels.find((p) => p.part === i);
        // wolna przestrzeń — drzwi, które ją przykrywają
        if (!panel) {
          const st = frontParts(cab.fronts);
          const j = st.doors.findIndex((d) => d.covers.includes(st.parts[i]?.id));
          if (j >= 0) panel = panels.find((p) => p.door === j && p.part == null);
        }
      } else panel = panels.find((p) => p.door === Number(row.dataset.fdoor) && p.part == null);
      if (panel) pickFront(rowCab, panel.key);
      return;
    }
    const id = e.target.closest('[data-map-cab]')?.dataset.mapCab;
    if (!id) return;
    const state = ui.get();
    const pick = e.ctrlKey || e.metaKey ? toggleCabinet(state, id) : { selectedId: id, selectedIds: [id] };
    ui.set({ ...state, ...pick, selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }, { reveal: true });
  });

  root.addEventListener('dblclick', (e) => {
    const mapFront = e.target.closest('[data-map-front]')?.dataset.mapFront;
    if (!mapFront) return;
    const [cabId, key] = mapFront.split(':');
    ui.set({ ...ui.get(), selectedId: cabId, selectedIds: [cabId], selectedFronts: [`${cabId}:${key}`], selectedBlends: [], selectedHole: null, selectedObstacle: null }, { fromPanel: true });
  });

  // --- zdarzenia (delegacja) ---
  root.addEventListener('input', (e) => {
    const input = e.target;
    const cabinetEl = input.closest('[data-kind="cabinet"]');
    if (!cabinetEl) return;
    const id = cabinetEl.dataset.id;

    // Kolor (niezależny od materiału): korpus, blendy, fronty — przy zaznaczonych kilku korpusach
    // (Ctrl + klik) zmienia się we wszystkich zaznaczonych.
    const color = readColorInput(input);
    if (color) {
      const ids = selectedCabinetIds(ui.get());
      const targets = ids.has(id) && ids.size > 1 ? ids : new Set([id]);
      store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (targets.has(c.id) ? setPath(c, color.path, color.value) : c)) }));
      return;
    }

    // Układ frontów: szuflady (liczba, do wysokości, rodzaj) i front nad nimi (brak / drzwi / drzwi podwójne).
    // Wnętrze i drzwi: rodzaj, wysokość (puste — auto), zawiasy, „Przykrywa”.
    const fpartItem = input.closest('[data-fpart]');
    const fdoorItem = input.closest('[data-fdoor]');
    if ((fpartItem && input.dataset.fpartF) || (fdoorItem && (input.dataset.fdoorF || input.dataset.fdoorCover !== undefined))) {
      if (input.dataset.fdoorCover !== undefined) {
        const j = Number(fdoorItem.dataset.fdoor);
        updateCabinet(id, (c, p) => toggleDoorCover(c, j, Number(input.dataset.fdoorCover), p));
        return;
      }
      const numeric = input.type === 'number';
      const value = numeric ? (input.value.trim() === '' ? null : readNumberInput(input)) : input.value;
      if (value === undefined) return;
      if (fpartItem && input.dataset.fpartF) {
        const i = Number(fpartItem.dataset.fpart);
        updateCabinet(id, (c, p) => (input.dataset.fpartF === 'type' ? setPartKind(c, i, value, p) : setPartField(c, i, input.dataset.fpartF, value, p)));
      } else {
        const j = Number(fdoorItem.dataset.fdoor);
        const f = input.dataset.fdoorF;
        updateCabinet(id, (c, p) => (f === 'height' ? setDoorHeight(c, j, value, p) : setDoorField(c, j, f, value, p)));
      }
      return;
    }

    const part = input.closest('[data-part]')?.dataset.part;

    // Przełącznik „Niezależny”: po ponownym powiązaniu płyta wraca do wymiarów z korpusu.
    if (input.dataset.partFree !== undefined) {
      updateCabinet(id, (c, prj) => {
        const o = { ...c.panelOverrides?.[part] };
        if (input.checked) {
          // Zamrażamy bieżące wymiary płyty (bez grubości), żeby po odłączeniu nic się nie przesunęło.
          const p = cabinetPanels(c, prj).find((x) => x.key === part);
          const sizes = { sx: p.width, sy: p.height, sz: p.depth };
          delete sizes[`s${p.thicknessAxis}`];
          Object.assign(o, { free: true, ...sizes });
        } else {
          const axis = cabinetPanels(c, prj).find((x) => x.key === part).thicknessAxis;
          for (const a of ['x', 'y', 'z']) if (a !== axis) delete o[`s${a}`];
          delete o.free;
        }
        return { ...c, panelOverrides: { ...c.panelOverrides, [part]: o } };
      });
      return;
    }

    // Obrzeże: zaznaczenie / odznaczenie krawędzi — od tej chwili wybór ręczny (↺ wraca do automatu).
    if (input.dataset.edgeKey) {
      const key = input.dataset.edgeKey;
      updateCabinet(id, (c, prj) => {
        const panel = cabinetPanels(c, prj).find((x) => x.key === part);
        const current = panelEdgeSet(panel, c, prj);
        const edgeSet = input.checked ? [...new Set([...current, key])] : current.filter((k) => k !== key);
        const o = { ...c.panelOverrides?.[part], edgeSet };
        return { ...c, panelOverrides: { ...c.panelOverrides, [part]: o } };
      });
      return;
    }

    // Półka: wpisana wysokość ustawia ją ręcznie, głębokość — płytsza półka.
    const shelfRow = input.closest('[data-shelf]');
    if (shelfRow && (input.dataset.shelfY !== undefined || input.dataset.shelfDepth !== undefined)) {
      const value = readNumberInput(input);
      if (value === undefined) return;
      const i = Number(shelfRow.dataset.shelf);
      if (input.dataset.shelfY !== undefined) {
        // wysokość jednej półki — pozostałe zostają na swoich miejscach
        updateCabinet(id, (c, p) => setShelfY(c, c.shelves[i].id, value, p));
      } else {
        updateCabinet(id, (c) => ({ ...c, shelves: c.shelves.map((s, j) => (j === i ? { ...s, depth: value } : s)) }));
      }
      return;
    }

    // Pole elementu korpusu.
    if (input.dataset.pf) {
      const value = readNumberInput(input);
      if (value === undefined) return;
      const pf = input.dataset.pf;
      const cabinet = store.get().furniture.find((c) => c.id === id);
      const panel = cabinetPanels(cabinet, store.get()).find((p) => p.key === part);
      const isLinkedSize = pf[0] === 's' && pf[1] !== panel.thicknessAxis && !panel.free;

      if (isLinkedSize) {
        // Wymiar powiązany → zmieniamy korpus, reszta płyt dopasowuje się sama.
        const next = resizePanelLinked(cabinet, part, pf[1], value, store.get());
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

    // Typowy rozstaw z listy — wpisujemy go w pole rozstawu (lista wraca do „typowe ▾”).
    if (input.dataset.spacingPreset !== undefined) {
      const v = Number(input.value);
      input.value = '';
      if (v) updateCabinet(id, (c) => setPath(c, 'fronts.handle.spacing', v));
      return;
    }
    const field = input.dataset.f;
    if (!field) return;
    let value = input.value;
    if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    } else if (input.dataset.type === 'number') {
      value = Number(value);
    }
    if (field === 'shelfMaterialId' && !value) value = null; // „jak korpus”
    if (field === 'backGap') {
      // Front zostaje na miejscu — zmienia się położenie pleców i głębokość korpusu.
      // Łańcuszek — też w korpusach z rzędu, które mają ten sam odstęp; gdy w którymś się nie da
      // (korpus byłby za płytki) — nic nie zmieniamy.
      const p = store.get();
      const ids = linkedIds('backGap', id, p);
      const changed = new Map(ids.map((cid) => [cid, setBackGap(p.furniture.find((c) => c.id === cid), value)]));
      if ([...changed.values()].some((c) => !c)) {
        input.classList.add('invalid');
        return;
      }
      store.set((proj) => ({ ...proj, furniture: proj.furniture.map((c) => changed.get(c.id) ?? c) }));
      return;
    }
    // Przejście na „na wysokości…”: zaczynamy od miejsca, w którym poprzeczka jest teraz.
    const stiffPos = field.match(/^stiffeners\.(\d+)\.position$/);
    if (stiffPos && value === 'backAt') {
      updateCabinet(id, (c, p) => {
        const i = Number(stiffPos[1]);
        const y = Math.round(stiffenerY(c, c.stiffeners[i], p));
        return setPath(setPath(c, field, value), `stiffeners.${i}.y`, y);
      });
      return;
    }
    if (field === 'width' && linked.width.has(id)) {
      // Łańcuszek szerokości — ta sama szerokość dla korpusów z rzędu o tej samej szerokości; korpusy
      // rzędu na prawo od zmienionych przesuwają się o sumę zmian, żeby dalej stały bok przy boku.
      // Przy zaznaczonych korpusach z kilku rzędów — każdy rząd przesuwa się osobno.
      store.set((p) => {
        const ids = new Set(linkedIds('width', id, p));
        const moved = new Map();
        for (const cid of ids) {
          if (moved.has(cid)) continue; // rząd już przeliczony
          const row = rowOf(cid, p)
            .map((rid) => p.furniture.find((c) => c.id === rid))
            .sort((a, b) => a.x - b.x);
          let shift = 0;
          for (const c of row) {
            const width = ids.has(c.id) ? value : c.width;
            moved.set(c.id, { ...c, x: c.x + shift, width });
            shift += width - c.width;
          }
        }
        return { ...p, furniture: p.furniture.map((c) => moved.get(c.id) ?? c) };
      });
      return;
    }
    if ((field === 'height' || field === 'depth') && linked[field].has(id)) {
      // Łańcuszek — ten sam wymiar dla korpusów z rzędu, które miały ten sam wymiar co ten.
      store.set((p) => {
        const ids = new Set(linkedIds(field, id, p));
        return { ...p, furniture: p.furniture.map((c) => (ids.has(c.id) ? { ...c, [field]: value } : c)) };
      });
      return;
    }
    if (field === 'fronts.handle.position') {
      // Inne położenie (góra / środek / dół) — wymiar w pionie znaczy co innego, wraca do domyślnego.
      updateCabinet(id, (c) => setPath(setPath(c, field, value), 'fronts.handle.offsetY', null));
      return;
    }
    if (field === 'ceilingGap') {
      // Luz do sufitu — korpus zmniejsza się tylko wtedy, gdy z nowym luzem by się nie zmieścił.
      store.set((p) => updateCabinetCeilingGap(p, id, (c) => setPath(c, field, value)));
      return;
    }
    if (field === 'mount') {
      // wiszący: bez nóżek, zawieszony nad podłogą (Y od podłogi = spód szafki); stojący: z powrotem na podłodze
      updateCabinet(id, (c) => setCabinetMount(c, value));
      return;
    }
    if (field === 'legs.enabled') {
      // Dodanie / usunięcie nóżek — pytamy, czy zachować wysokość zabudowy, czy ją zmienić o nóżki.
      // Przy włączonym łańcuszku — też w połączonych korpusach.
      input.checked = !value; // zmieni się po odpowiedzi (przy następnym odświeżeniu karty)
      const p = store.get();
      const cabinet = p.furniture.find((c) => c.id === id);
      const h = cabinet.legs?.height ?? 80;
      const ids = linkedIds('legs', id, p);
      // Usuwanie: korpusy, w których pamiętamy, jak dodano nóżki, wracają do stanu sprzed ich dodania
      // bez pytania — pytamy tylko o te, w których tego nie wiadomo (np. starszy projekt, przykład).
      const unknown = value ? ids : ids.filter((cid) => !p.furniture.find((c) => c.id === cid).legs?.mode);
      if (!unknown.length) {
        store.set((proj) => setLegs(proj, ids, false, h, null));
        return;
      }
      legsDialog.ask({ legHeight: h, adding: value, count: unknown.length }).then((mode) => {
        if (mode) store.set((proj) => setLegs(proj, ids, value, h, mode));
      });
      return;
    }
    if (field === 'legs.height' && linked.legs.has(id)) {
      // Łańcuszek — ta sama wysokość nóżek w połączonych korpusach.
      store.set((p) =>
        linkedIds('legs', id, p).reduce((proj, cid) => updateCabinetRefit(proj, cid, (c) => setPath(c, field, value)), p),
      );
      return;
    }
    if (field.startsWith('slopeTop.') || field.startsWith('legs.') || field.startsWith('wallFit.')) {
      // Włączenie / wyłączenie skośnej góry, zmiana luzu do skosu albo nóżek — korpus o wysokości automatycznej
      // dopasowuje się na nowo (z przodu sięga skosu albo zniża się do najniższego miejsca);
      // korpus z wysokością ręczną zniża się tylko wtedy, gdy przestałby się mieścić pod sufitem.
      store.set((p) => updateCabinetRefit(p, id, (c) => setPath(c, field, value)));
      return;
    }
    if (field === 'fronts.type') {
      updateCabinet(id, (c, p) => setFrontType(c, value, p));
      return;
    }
    updateCabinet(id, (c) => setPath(c, field, value));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if ((input.closest('[data-fpart]') || input.closest('[data-fdoor]')) && input.type === 'number') {
      // (puste — automatycznie, obsłużone w input; błędna wartość — przebudowa wartości z modelu przy kolejnym odświeżeniu)
      if (input.classList.contains('invalid')) {
        input.classList.remove('invalid');
        input.value = '';
        const cid = input.closest('[data-kind="cabinet"]')?.dataset.id;
        if (cid) updateCabinet(cid, (c) => ({ ...c }));
      }
      return;
    }
    // Wyczyszczony luz do skosu wraca do luzu ustawionego przy skosie.
    const gapCabinet = input.closest('[data-kind="cabinet"]')?.dataset.id;
    // Wyczyszczone pole półki wraca do wartości automatycznej (równy rozkład / pełna głębokość);
    // błędna wartość — do bieżącej.
    const shelfRow = input.closest('[data-shelf]');
    if (shelfRow && gapCabinet && (input.dataset.shelfY !== undefined || input.dataset.shelfDepth !== undefined)) {
      const i = Number(shelfRow.dataset.shelf);
      const isY = input.dataset.shelfY !== undefined;
      if (input.value.trim() === '') {
        input.classList.remove('invalid');
        if (isY) updateCabinet(gapCabinet, (c) => spreadShelvesEvenly(c));
        else updateCabinet(gapCabinet, (c) => ({ ...c, shelves: c.shelves.map((s, j) => (j === i ? { ...s, depth: null } : s)) }));
      } else if (input.classList.contains('invalid')) {
        input.classList.remove('invalid');
        const p = store.get();
        const c = p.furniture.find((x) => x.id === gapCabinet);
        const place = shelfPlacement(c, c.shelves[i], p);
        input.value = round1(isY ? place.y : place.depth);
      }
      return;
    }
    // Wyczyszczony luz do sufitu wraca do luzu z przestrzeni.
    if (input.dataset.f === 'ceilingGap' && input.value.trim() === '' && gapCabinet) {
      input.classList.remove('invalid');
      store.set((p) => updateCabinetCeilingGap(p, gapCabinet, (c) => ({ ...c, ceilingGap: null })));
      return;
    }
    if (input.dataset.f === 'wallFit.gap' && input.value.trim() === '' && gapCabinet) {
      input.classList.remove('invalid');
      store.set((p) => updateCabinetRefit(p, gapCabinet, (c) => setPath(c, 'wallFit.gap', null)));
      return;
    }
    if (input.dataset.f === 'slopeTop.gap' && input.value.trim() === '' && gapCabinet) {
      input.classList.remove('invalid');
      store.set((p) => updateCabinetRefit(p, gapCabinet, (c) => setPath(c, 'slopeTop.gap', null)));
      return;
    }
    if (input.type !== 'number' || commitEmptyAsZero(input)) return;
    if (!input.classList.contains('invalid') && input.value.trim() !== '') return;
    input.classList.remove('invalid');
    const id = input.closest('[data-kind="cabinet"]')?.dataset.id;
    const cabinet = store.get().furniture.find((c) => c.id === id);
    if (!cabinet) return;
    if (input.dataset.pf) {
      const partKey = input.closest('[data-part]').dataset.part;
      const panel = cabinetPanels(cabinet, store.get()).find((p) => p.key === partKey);
      const field = PART_FIELDS.find((f) => f.key === input.dataset.pf);
      if (panel) input.value = partFieldValue(cabinet, panel, field);
    } else {
      input.value = getPath(cabinet, input.dataset.f);
    }
  });

  // Zapamiętujemy rozwinięcie listy elementów, żeby nie zwijała się przy przebudowie panelu.
  root.addEventListener(
    'toggle',
    (e) => {
      const id = e.target.closest?.('[data-kind="cabinet"]')?.dataset.id;
      const key = e.target.dataset?.section;
      if (id && key) sectionState.set(`${id}:${key}`, e.target.open);
      // karta w okienku po prawej: otwarta sekcja pokazuje się w okienku obok — tylko jedna naraz
      const card = e.target.closest?.('.in-inspector');
      if (card && e.target.open && e.target.matches('details.section')) {
        card.querySelectorAll(':scope > details.section[open]').forEach((d) => {
          if (d === e.target) return;
          d.open = false;
          sectionState.set(`${id}:${d.dataset.section}`, false);
        });
      }
    },
    true, // zdarzenie toggle nie „bąbelkuje”, łapiemy je w fazie przechwytywania
  );

  // Kliknięcie lub fokus w karcie korpusu zaznacza go (także w widoku 3D).
  const selectFrom = (target) => {
    const id = target.closest?.('[data-kind="cabinet"]')?.dataset.id;
    // wybór innego korpusu w panelu czyści zaznaczenie frontów (żeby Delete nie usunął ich niechcący)
    if (id && ui.get().selectedId !== id) ui.set({ ...ui.get(), selectedId: id, selectedFronts: [], selectedBlends: [] });
  };
  root.addEventListener('focusin', (e) => selectFrom(e.target));
  // Ctrl + klik w kartę korpusu (poza polami i przyciskami) — dodaje korpus do zaznaczenia albo go
  // z niego usuwa, jak Ctrl + klik w widoku 3D. mousedown — żeby nie przenosić fokusu (focusin
  // zaznaczyłby wtedy tylko ten korpus).
  root.addEventListener(
    'mousedown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.closest('input, select, textarea, button')) return;
      const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      ui.set({ ...ui.get(), ...toggleCabinet(ui.get(), id), selectedFronts: [], selectedBlends: [] });
    },
    true,
  );

  // ramka edycji kilku zaznaczonych szuflad (sekcja „Fronty / szuflady”)
  const bulkParts = (el) => (el.closest('.parts-bulk')?.dataset.parts ?? '').split(',').filter(Boolean).map(Number);
  const bulkCabinet = (el) => el.closest('[data-kind="cabinet"]')?.dataset.id;
  const clearFronts = () => ui.set({ ...ui.get(), selectedFronts: [] }); // klucze frontów po zmianie rodzaju / usunięciu się zmieniają
  root.addEventListener('click', (e) => {
    const t = e.target.closest?.('.part-sketch [data-edge-toggle]');
    if (!t) return;
    e.stopPropagation(); // (bez powiększania szkicu)
    const box = t.closest('.part-sketch');
    const id = t.closest('[data-kind="cabinet"]')?.dataset.id;
    const key = box?.dataset.key;
    const edgeKey = t.getAttribute('data-edge-toggle');
    if (!id || !key || !edgeKey) return;
    updateCabinet(id, (c, p) => {
      const panel = cabinetPanels(c, p).find((x) => x.key === key);
      if (!panel) return c;
      const current = panelEdgeSet(panel, c, p, projectSolids(p));
      const next = current.includes(edgeKey) ? current.filter((k) => k !== edgeKey) : [...current, edgeKey];
      return { ...c, panelOverrides: { ...c.panelOverrides, [key]: { ...c.panelOverrides?.[key], edgeSet: next } } };
    });
  }, true);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulk-apply-height], [data-bulk-equal], [data-bulk-remove], [data-bulk-clear]');
    if (!b) return;
    const id = bulkCabinet(b);
    const parts = bulkParts(b);
    if (!id) return;
    if (b.dataset.bulkClear !== undefined) return clearFronts();
    if (b.dataset.bulkApplyHeight !== undefined) {
      const v = Number(b.closest('.parts-bulk').querySelector('[data-bulk-height]').value);
      if (!(v >= FRONT_PART_MIN)) return;
      updateCabinet(id, (c, p) => parts.reduce((cc, i) => setPartField(cc, i, 'height', Math.round(v), p), c));
    } else if (b.dataset.bulkEqual !== undefined) {
      updateCabinet(id, (c, p) => {
        const ranges = cabinetPanels(c, p).partRanges ?? [];
        const total = parts.reduce((a, i) => a + (ranges[i] ? ranges[i][1] - ranges[i][0] : 0), 0);
        const each = Math.round(total / parts.length);
        return parts.reduce((cc, i) => setPartField(cc, i, 'height', each, p), c);
      });
    } else if (b.dataset.bulkRemove !== undefined) {
      if (!confirm(t('Usunąć {n} zaznaczone części?', { n: parts.length }))) return;
      updateCabinet(id, (c, p) => [...parts].sort((a, b2) => b2 - a).reduce((cc, i) => removePart(cc, i, p), c));
      clearFronts();
    }
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-bulk-kind]');
    if (!sel || !sel.value) return;
    const id = bulkCabinet(sel);
    const parts = bulkParts(sel);
    const kind = sel.value;
    sel.value = '';
    updateCabinet(id, (c, p) => parts.reduce((cc, i) => setPartKind(cc, i, kind, p), c));
    clearFronts();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-bulk-height]')) e.target.closest('.parts-bulk').querySelector('[data-bulk-apply-height]').click();
  });

  root.addEventListener('click', (e) => {
    // „Elementy”: przełącznik — tylko zaznaczona płyta / wszystkie
    const showAll = e.target.closest('[data-parts-show-all]');
    if (showAll) {
      const sec = showAll.closest('.section-body');
      const focused = sec.querySelector('.part.part-focused')?.dataset.part ?? '';
      if (sec.classList.contains('focus-part')) sec.dataset.showAll = focused;
      else delete sec.dataset.showAll;
      const cab = store.get().furniture.find((c) => c.id === showAll.closest('[data-kind="cabinet"]')?.dataset.id);
      if (cab) placePartSketch(cab, store.get());
      return;
    }
    const closeSection = e.target.closest('[data-close-section]');
    if (closeSection) {
      closeSection.closest('details').open = false;
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) selectFrom(e.target); // Ctrl + klik — obsłużony przy mousedown
    const {
      action, remove, resetPart, slide, removeStiff, toggleHidden, togglePartHidden,
    } = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
    const shelfIndex = Number(e.target.closest('[data-shelf]')?.dataset.shelf);
    const patchShelf = (patch) =>
      updateCabinet(id, (c) => ({ ...c, shelves: c.shelves.map((s, j) => (j === shelfIndex ? { ...s, ...patch } : s)) }));
    if (e.target.closest('[data-toggle-fronts-hidden]') && id) {
      // przycisk na pasku sekcji — bez zwijania / rozwijania sekcji
      e.preventDefault();
      updateCabinet(id, (c) => ({ ...c, fronts: { ...c.fronts, hidden: !c.fronts?.hidden } }));
    } else if (action === 'copy-shelves' && id) {
      // Półki z nowymi identyfikatorami (każdy korpus ma własne płyty), w tym ręczne ustawienia płyt półek.
      store.set((p) => {
        const source = p.furniture.find((c) => c.id === id);
        const targets = new Set(sameSizeCabinets(source, p).map((c) => c.id));
        return {
          ...p,
          furniture: p.furniture.map((c) => {
            if (!targets.has(c.id)) return c;
            const overrides = Object.fromEntries(
              Object.entries(c.panelOverrides ?? {}).filter(([key]) => !key.startsWith('shelf-')),
            );
            const shelves = source.shelves.map((s) => {
              const copy = { ...s, id: newId() };
              const o = source.panelOverrides?.[shelfKey(s)];
              if (o) overrides[shelfKey(copy)] = structuredClone(o);
              return copy;
            });
            return { ...c, shelves, panelOverrides: overrides };
          }),
        };
      });
    } else if (action === 'add-shelf' && id) {
      updateCabinet(id, (c, p) => addShelf(c, p));
    } else if (e.target.dataset.removeShelf && id) {
      updateCabinet(id, (c) => ({ ...c, shelves: c.shelves.filter((s) => s.id !== e.target.dataset.removeShelf) }));
    } else if (e.target.closest('[data-reset-shelf-y]') && id) {
      updateCabinet(id, (c) => spreadShelvesEvenly(c)); // równy rozkład dotyczy wszystkich półek
    } else if (e.target.closest('[data-reset-shelf-depth]') && id) {
      patchShelf({ depth: null });
    } else if (e.target.closest('[data-link]') && id) {
      e.preventDefault(); // przycisk w etykiecie pola — bez zaznaczania pola / przenoszenia do niego kursora
      const set = linked[e.target.closest('[data-link]').dataset.link];
      if (set.has(id)) set.delete(id);
      else set.add(id);
      updateStatus(store.get());
    } else if (e.target.closest('[data-reset-handle]') && id) {
      e.preventDefault(); // przycisk w etykiecie pola
      // domyślne położenie uchwytu (zostają rodzaj, rozstaw i średnica otworów)
      const d = defaultHandle();
      updateCabinet(id, (c) => ({
        ...c,
        fronts: { ...c.fronts, handle: { ...c.fronts.handle, position: d.position, edgeOffset: d.edgeOffset, offsetX: null, offsetY: null } },
      }));
    } else if (e.target.closest('[data-reset-ceiling-gap]') && id) {
      store.set((p) => updateCabinetCeilingGap(p, id, (c) => ({ ...c, ceilingGap: null })));
    } else if (e.target.closest('[data-reset-slope-gap]') && id) {
      store.set((p) => updateCabinetRefit(p, id, (c) => setPath(c, 'slopeTop.gap', null)));
    } else if (e.target.closest('[data-collapse-card]') && id) {
      setCollapsed([id], !collapsed.has(id));
    } else if (action === 'collapse-all') {
      setCollapsed(store.get().furniture.map((c) => c.id), true);
    } else if (action === 'expand-all') {
      setCollapsed(store.get().furniture.map((c) => c.id), false);
    } else if (action === 'sort-cabinets') {
      // kolejność kart jak na mapce: od lewej do prawej, przy tej samej pozycji — od dołu (szafki dolne przed górnymi)
      updateFurniture((list) => [...list].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z));
    } else if (toggleHidden && id) {
      updateCabinet(id, (c) => ({ ...c, hidden: !c.hidden }));
    } else if (e.target.dataset.resetEdges !== undefined && id) {
      const part = e.target.closest('[data-part]')?.dataset.part;
      updateCabinet(id, (c) => {
        const { edgeSet: _removed, ...o } = c.panelOverrides?.[part] ?? {};
        return { ...c, panelOverrides: { ...c.panelOverrides, [part]: o } };
      });
    } else if (action === 'show-worktop' && id) {
      const top = store.get().trims.find((t) => t.type === 'countertop' && t.cabinetIds.includes(id));
      if (top) onShowWorktop?.(top.id);
    } else if (action === 'add-worktop' && id) {
      // nowy blat na korpusie i sąsiadach w rzędzie (jak „+ Blat na szafkach”), potem jego karta
      const p = store.get();
      // korpusy rzędu bez blatu (te z blatem zostają przy swoim)
      const covered = new Set(p.trims.filter((t) => t.type === 'countertop').flatMap((t) => t.cabinetIds));
      const top = createTrim('countertop', rowOf(id, p).filter((cid) => cid === id || !covered.has(cid)), p);
      store.set({ ...p, trims: [...p.trims, top] });
      onShowWorktop?.(top.id);
    } else if (action === 'show-trims' && id) {
      onShowTrims?.(id);
    } else if (togglePartHidden && id) {
      updateCabinet(id, (c) => {
        const o = { ...c.panelOverrides?.[togglePartHidden] };
        if (o.hidden) delete o.hidden;
        else o.hidden = true;
        return { ...c, panelOverrides: { ...c.panelOverrides, [togglePartHidden]: o } };
      });
    } else if (action === 'add-stiff' && id) {
      updateCabinet(id, (c) => ({ ...c, stiffeners: [...(c.stiffeners ?? []), createStiffener(c)] }));
    } else if (removeStiff && id) {
      updateCabinet(id, (c) => ({ ...c, stiffeners: c.stiffeners.filter((st) => st.id !== removeStiff) }));
    } else if (action === 'add-cabinet') {
      // Pierwszy na całą szerokość, kolejne wypełniają wolne miejsce albo dzielą rząd (model/layout.js).
      // Kilka wnęk (występ ściany, np. kominek) — najpierw pytamy, do której.
      // gotowe korpusy NIE zmieniają wymiarów: gdy nie ma wolnego miejsca — podpowiedź (przeciągnij na miejsce)
      const add = (segment) => {
        const res = addCabinetNoResize(store.get(), { segment });
        if (!res) {
          showNotice(t('Brak wolnego miejsca na nowy korpus'), t('Gotowe korpusy nie zmieniają wymiarów. Przeciągnij „+ Korpus” (z menu „Dodaj”) na wolne miejsce w widoku 3D albo najpierw zmniejsz któryś korpus.'));
          return;
        }
        store.set(res.project);
        ui.set({ ...ui.get(), selectedId: res.cabinet.id }, { reveal: true });
      };
      // są już korpusy — nowy „w powietrzu” idzie za kursorem w widoku 3D, klik stawia go w wolnym miejscu
      // (scene/interaction.js → tryb wstawiania); pierwszy korpus — jak dotąd, na całą wnękę
      if (store.get().furniture.length) {
        ui.set({ ...ui.get(), placingCabinet: true, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [] });
        return;
      }
      const alcoves = cabinetAlcoves(store.get());
      if (alcoves.length > 1) alcoveDialog.ask(store.get().space, alcoves).then((segment) => segment && add(segment));
      else add(null);
    } else if (action === 'duplicate' && id) {
      duplicateSelected(store, ui, id);
    } else if (slide && id) {
      // kilka korpusów zaznaczonych Ctrl + klik (np. cały rząd) — dosuwamy je razem
      const ids = selectedCabinetIds(ui.get());
      if (ids.has(id) && ids.size > 1) store.set((p) => slideCabinets(p, [...ids], slide));
      else updateCabinet(id, (c, p) => slideCabinet(p, c.id, slide));
    } else if (action === 'fit' && id) {
      updateCabinet(id, (c, p) => fitCabinetToSpace(c, p));
    } else if (action === 'seat' && id) {
      // góra korpusu (od podłogi: położenie Y + nóżki + korpus + blat na nim) = wysokość siedziska; linia w widoku się włącza
      const seat = store.get().view?.seatHeight ?? SEAT_HEIGHT.default;
      updateCabinet(id, (c, p) => {
        const top = (p.trims ?? []).find((t) => t.type === 'countertop' && t.cabinetIds.includes(c.id));
        const ct = top ? trimMaterial(top, p).thickness : 0;
        const height = Math.round(seat - (c.y ?? 0) - legHeight(c) - ct);
        return { ...c, height: Math.max(CABINET_LIMITS.sizeMin, height) };
      });
      if (!store.get().view?.seatLine) store.set((p) => ({ ...p, view: { ...p.view, seatLine: true } }));
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
  // Szkic w okienku korpusu: na górze zawsze szkic całego korpusu; zaznaczona jedna płyta (bok, wieniec, plecy,
  // półka, front) — dodatkowo jej szkic w sekcji tego elementu (placePartSketch).
  function sketchFor(cabinet, project) {
    placePartSketch(cabinet, project);
    return cabinetSketch(cabinet, project);
  }
  // Sekcja, w której jest element: front / czoło — „Fronty”, półka — „Półki”, poprzeczka — „Wzmocnienia”,
  // pozostałe płyty — „Elementy” (szkic w wierszu tej płyty).
  const sectionOfPart = (key) => (key.startsWith('front-') || key.startsWith('idrawer-') ? 'fronts' : key.startsWith('shelf-') ? 'shelves' : key.startsWith('stiff-') ? 'stiff' : 'parts');
  function placePartSketch(cabinet, project) {
    const card = root.querySelector(`[data-kind="cabinet"][data-id="${cabinet.id}"]`);
    if (!card) return;
    const st = ui.get();
    const parts = [...(st.selectedFronts ?? []), ...(st.selectedBlends ?? [])].filter((id) => id.startsWith(`${cabinet.id}:`) && !id.endsWith(':legs'));
    const key = parts.length === 1 && card.classList.contains('in-inspector') ? parts[0].slice(cabinet.id.length + 1) : null;
    const svg = key && panelSketch(cabinet, key, project);
    // „Elementy” przy zaznaczonej płycie — tylko jej wiersz (reszta zbędna); „pokaż wszystkie” odsłania listę
    const partsSec = card.querySelector('[data-section="parts"] > .section-body');
    if (partsSec) {
      const focus = key && sectionOfPart(key) === 'parts' ? key : null;
      partsSec.classList.toggle('focus-part', !!focus && partsSec.dataset.showAll !== focus);
      partsSec.querySelectorAll(':scope > .part').forEach((el) => el.classList.toggle('part-focused', el.dataset.part === focus));
      let toggle = partsSec.querySelector(':scope > .parts-show-all');
      if (focus && !toggle) {
        partsSec.insertAdjacentHTML('beforeend', '<button type="button" class="parts-show-all" data-parts-show-all></button>');
        toggle = partsSec.querySelector(':scope > .parts-show-all');
      }
      if (toggle) {
        toggle.hidden = !focus;
        toggle.textContent = partsSec.classList.contains('focus-part') ? t('Pokaż wszystkie elementy korpusu ▾') : t('Pokaż tylko zaznaczony element ▴');
      }
      if (!focus) delete partsSec.dataset.showAll;
    }
    let box = card.querySelector('.part-sketch');
    if (!svg) {
      box?.remove();
      return;
    }
    const sec = card.querySelector(`[data-section="${sectionOfPart(key)}"] > .section-body`);
    const host = sectionOfPart(key) === 'parts' ? (sec?.querySelector(`.part[data-part="${key}"]`) ?? sec) : sec;
    if (!host) return;
    if (!box || box.parentElement !== host || box.dataset.key !== key) {
      box?.remove();
      box = document.createElement('div');
      box.className = 'obj-sketch part-sketch bi-sketch';
      box.title = t('Szkic zaznaczonego elementu — kliknij, aby powiększyć');
      box.dataset.key = key;
      const head = host.querySelector(':scope > .part-head');
      if (head) head.after(box);
      else host.insertBefore(box, host.querySelector(':scope > .section-close')?.nextSibling ?? host.firstChild);
    }
    box.innerHTML = svg;
  }

  let lastFrontsKey = '';
  let inspectorCabinet = null; // korpus w okienku po prawej (ostatnio)
  function syncSelection(meta = {}) {
    // zmiana zaznaczonych frontów — odśwież ramkę edycji kilku szuflad i podświetlenie wierszy
    const frontsKey = (ui.get().selectedFronts ?? []).join('|');
    if (frontsKey !== lastFrontsKey) {
      lastFrontsKey = frontsKey;
      updateStatus(store.get());
    }
    const { selectedId } = ui.get();
    const ids = selectedCabinetIds(ui.get());
    root.querySelectorAll('[data-kind="cabinet"]').forEach((el) => {
      el.classList.toggle('selected', ids.has(el.dataset.id));
    });
    updateMap();
    // Kilka zaznaczonych korpusów — łańcuszki wymiarów włączają się same (łączą zaznaczone korpusy);
    // powrót do jednego zaznaczonego — wyłączają się.
    const multi = ids.size > 1;
    if (multi) DIM_LINKS.forEach((k) => ids.forEach((cid) => linked[k].add(cid)));
    else if (wasMulti) DIM_LINKS.forEach((k) => linked[k].clear());
    if (multi !== wasMulti || multi) updateStatus(store.get());
    wasMulti = multi;
    // jeden zaznaczony korpus — jego karta jako okienko po prawej (rozwinięta)
    // (który korpus był w okienku — zapamiętane, nie z DOM: przebudowa karty, np. po dodaniu szuflady, nie zamyka sekcji)
    const wasInInspector = inspectorCabinet;
    // sekcja otwarta w okienku poprzedniego korpusu (np. „Korpus”) — po kliknięciu w inny korpus otwiera się ta sama
    const prevCard = wasInInspector && wasInInspector !== selectedId ? root.querySelector(`[data-kind="cabinet"][data-id="${wasInInspector}"]`) : null;
    const prevSection = prevCard?.querySelector(':scope > details.section[open][data-section]')?.dataset.section ?? null;
    const card = markInspectorCard(root, '[data-kind="cabinet"]', ids.size === 1 ? selectedId : null);
    inspectorCabinet = card ? selectedId : null;
    if (card) {
      const cab = store.get().furniture.find((x) => x.id === selectedId);
      if (cab) card.querySelector('.obj-sketch').innerHTML = sketchFor(cab, store.get());
    }
    if (card && wasInInspector !== selectedId) {
      card.querySelectorAll(':scope > details.section[open]').forEach((d) => {
        if (d.dataset.section === prevSection) return;
        d.open = false;
        sectionState.set(`${selectedId}:${d.dataset.section}`, false);
      });
      const same = prevSection && card.querySelector(`:scope > details.section[data-section="${prevSection}"]`);
      if (same && !same.open) {
        same.open = true;
        sectionState.set(`${selectedId}:${prevSection}`, true);
      }
      // rozwinięte / zwinięte podsekcje — jak w poprzednim korpusie
      if (same) {
        prevCard.querySelectorAll(`:scope > details.section[data-section="${prevSection}"] details[data-section]`).forEach((d) => {
          const t = same.querySelector(`details[data-section="${d.dataset.section}"]`);
          if (t && t.open !== d.open) {
            t.open = d.open;
            sectionState.set(`${selectedId}:${d.dataset.section}`, d.open);
          }
        });
      }
    }
    if (card && collapsed.has(selectedId)) setCollapsed([selectedId], false);
    if (meta.reveal && selectedId && !card) tabs.activate('furniture-panel');
    const changed = accordion(ids, card ? prevSection : null);
    if ((changed || meta.reveal) && selectedId && !card) {
      if (collapsed.has(selectedId)) setCollapsed([selectedId], false); // pokazujemy zaznaczony korpus
      scrollUnderMap(selectedId);
    }
  }

  // Karta korpusu przewinięta tak, żeby zaczynała się tuż pod mapką zabudowy (przyklejoną u góry panelu).
  function scrollUnderMap(id) {
    const card = root.querySelector(`[data-kind="cabinet"][data-id="${id}"]`);
    const scroller = root.closest('.panel');
    if (!card || !scroller || root.hidden) return;
    const mapHeight = root.querySelector('.cab-map')?.offsetHeight ?? 0;
    const top = Math.max(0, scroller.scrollTop + card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - mapHeight - 8);
    // Karta blisko końca listy (pod nią mało treści, bo reszta zwinięta) — pusty odstęp na dole listy,
    // żeby dało się ją przewinąć aż pod mapkę; tylko tyle, ile trzeba.
    const spacer = root.querySelector('.scroll-spacer');
    if (spacer) {
      spacer.style.height = '0px';
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      if (top > maxTop) spacer.style.height = `${Math.ceil(top - maxTop)}px`;
    }
    scroller.scrollTo({ top, behavior: 'smooth' });
  }

  // Akordeon: po zmianie zaznaczenia karty zaznaczonych korpusów są rozwinięte, pozostałe zwinięte do nagłówka
  // (karta głównego zaznaczonego przewija się potem pod mapkę — scrollUnderMap). Odznaczenie niczego nie zwija.
  // Zwraca true, gdy zaznaczenie się zmieniło.
  let lastSelection = '';
  // keepSection — sekcja, która zostaje otwarta (ta sama, co w okienku poprzedniego korpusu)
  function accordion(ids, keepSection = null) {
    const key = [...ids].sort().join('|');
    if (!ids.size || key === lastSelection) return false;
    lastSelection = key;
    const others = store.get().furniture.map((c) => c.id).filter((id) => !ids.has(id));
    for (const id of others) collapsed.add(id);
    for (const id of ids) collapsed.delete(id);
    root.querySelectorAll('[data-kind="cabinet"]').forEach(applyCollapsed);
    // W kartach zaznaczonych — wszystkie sekcje zwinięte (Korpus, Fronty, Półki…); sekcję klikniętego elementu
    // (np. „Fronty” po kliknięciu frontu, „Nóżki” po kliknięciu nóżek) otwiera zaraz potem revealSection.
    // Podsekcje wewnątrz sekcji („sub:…”, np. Front / Uchwyt) zostają, jak były.
    for (const id of ids) {
      root.querySelectorAll(`[data-kind="cabinet"][data-id="${id}"] details.section[data-section]`).forEach((d) => {
        if (keepSection && d.dataset.section === keepSection) return;
        sectionState.set(`${id}:${d.dataset.section}`, false);
        d.open = false;
      });
    }
    return true;
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
    // Pokazuje sekcję karty korpusu (np. „legs” po zaznaczeniu nóżek w 3D): zakładka, rozwinięta karta
    // i sekcja, przewinięcie do niej.
    // Front (np. szuflada) zaznaczony w 3D: sekcja „Fronty” i podsekcja „Front” otwarte, przewinięte do sekcji
    // frontu, w której jest ten element (podświetlonej).
    revealFront(cabinetId, key, quiet = false) {
      // quiet — zaznaczenie kliknięciem w panelu: sekcja już widoczna, bez przewijania karty
      if (!quiet) this.revealSection(cabinetId, 'fronts');
      const card = root.querySelector(`[data-kind="cabinet"][data-id="${cabinetId}"]`);
      const sub = card?.querySelector('[data-section="sub:front"]');
      if (sub) {
        sectionState.set(`${cabinetId}:sub:front`, true);
        sub.open = true;
      }
      const cab = store.get().furniture.find((x) => x.id === cabinetId);
      const panel = cab && cabinetPanels(cab, store.get()).find((x) => x.key === key);
      const item = panel?.part != null ? card?.querySelector(`.fp-item[data-fpart="${panel.part}"]`) : panel?.door != null ? card?.querySelector(`.fd-item[data-fdoor="${panel.door}"]`) : null;
      if (item) {
        // wyróżnione wszystkie zaznaczone fronty tego korpusu (Ctrl + klik — kilka), nie tylko ostatni
        const keys = new Set((ui.get().selectedFronts ?? []).filter((f) => f.startsWith(`${cabinetId}:`)).map((f) => f.slice(cabinetId.length + 1)));
        const panels = cabinetPanels(cab, store.get());
        card.querySelectorAll('.fp-item.picked, .fd-item.picked').forEach((x) => x.classList.remove('picked'));
        for (const pnl of panels.filter((x) => keys.has(x.key))) {
          const el2 = pnl.part != null ? card.querySelector(`.fp-item[data-fpart="${pnl.part}"]`) : pnl.door != null ? card.querySelector(`.fd-item[data-fdoor="${pnl.door}"]`) : null;
          el2?.classList.add('picked');
        }
        item.classList.add('picked');
        if (!quiet) requestAnimationFrame(() => scrollIntoPanel(item, { block: 'nearest', behavior: 'smooth' }));
      }
    },
    revealSection(cabinetId, key) {
      const inInspector = root.querySelector(`[data-kind="cabinet"][data-id="${cabinetId}"].in-inspector`);
      if (!inInspector) tabs.activate('furniture-panel');
      if (collapsed.has(cabinetId)) setCollapsed([cabinetId], false);
      const section = root.querySelector(`[data-kind="cabinet"][data-id="${cabinetId}"] [data-section="${key}"]`);
      if (!section) return;
      sectionState.set(`${cabinetId}:${key}`, true);
      section.open = true;
      // karta w okienku po prawej — przewijamy samo okienko do sekcji; w panelu — karta pod mapką zabudowy
      if (inInspector) requestAnimationFrame(() => scrollIntoPanel(section, { block: 'nearest', behavior: 'smooth' }));
      else scrollUnderMap(cabinetId);
    },
  };
}
