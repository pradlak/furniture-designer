import {
  BACK_TYPES,
  CABINET_LIMITS,
  createCabinet,
  fitCabinetToSpace,
  cabinetPanels,
  cabinetIssues,
  panelCutSize,
  resizePanelLinked,
  JOINT_TYPES,
  TOP_TYPES,
  STIFFENER_POSITIONS,
  createStiffener,
  SIDE_BLEND_TYPES,
  LEG_HEIGHTS,
  LEG_LIMITS,
  LEG_DIAMETER,
  cabinetLegs,
  getPath,
  setPath,
  sidePanelExtension,
  plinthHeight,
  defaultEdges,
} from '../model/furniture.js';
import { duplicateCabinet, slideCabinet } from '../model/placement.js';
import { createTrim, rowOf, trimBox, trimIssues, frontHeightsUnder } from '../model/trims.js';
import { cabinetMaterials, trimMaterial } from '../model/materials.js';

// Wysokość blendy do wyświetlenia: dla blendy dolnej automatycznej — wyliczona.
const trimHeightValue = (t, project) => round1(t.type === 'plinth' ? plinthHeight(t, project) : t.height);
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

// Blenda boczna jednej strony. Widoczne są tylko opcje pasujące do wybranego wariantu
// (patrz updateStatus): szerokość i panel przy ścianie — dla listwy; wysunięcie — dla panelu i listwy.
function edgeSelect(key) {
  return `<select data-edge="${key}">${[0, 1, 2].map((n) => `<option value="${n}">${n}</option>`).join('')}</select>`;
}

function materialSelect(label, field, project) {
  return `
    <label class="field small">
      <span>${label}</span>
      <select data-f="${field}">
        ${project.materials.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${m.thickness} mm)</option>`).join('')}
      </select>
    </label>`;
}

function setSummary(cardEl, section, text) {
  const el = cardEl.querySelector(`[data-section="${section}"] .section-sum`);
  if (el) el.textContent = text;
}

function sideBlendFields(side) {
  const label = side === 'left' ? 'Blenda lewa' : 'Blenda prawa';
  return `
    <div class="side-blend" data-side="${side}">
      <label class="field small">
        <span>${label}</span>
        <select data-f="sideBlends.${side}.type">
          ${SIDE_BLEND_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
        </select>
      </label>
      <div class="grid-2 filler-opts">
        <label class="field small">
          <span>Szerokość listwy <small>mm</small></span>
          <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="sideBlends.${side}.width" />
        </label>
        <label class="check small" title="Panel na pełną wysokość za listwą, przylegający do ściany">
          <input type="checkbox" data-f="sideBlends.${side}.wallPanel" /> + panel przy ścianie
        </label>
      </div>
      <div class="grid-2 panel-opts">
        <label class="check small" title="Wysunięcie o grubość blendy górnej (albo frontu), żeby licowało z frontem">
          <input type="checkbox" data-f="sideBlends.${side}.flushFront" /> wysuń do linii frontu
        </label>
        <label class="field small">
          <span>Wysunięcie <small>mm</small></span>
          <input type="number" step="1" min="0" max="500" data-f="sideBlends.${side}.extend" />
        </label>
      </div>
    </div>`;
}

// Panel mebli (korpusów). Pełna przebudowa DOM tylko przy zmianach strukturalnych
// (dodanie/usunięcie korpusu, zmiana rodzaju pleców), w pozostałych przypadkach
// odświeżane są wartości pól i ostrzeżenia.
export function createFurniturePanel(root, store, ui, tabs) {
  let renderedKey = null;
  // Rozwinięte sekcje kart korpusów („id:sekcja”); domyślnie otwarta jest sekcja „Korpus”.
  const sectionState = new Map();
  const isOpen = (id, key) => sectionState.get(`${id}:${key}`) ?? key === 'body';

  // Zmiany, po których zmienia się lista elementów (np. dochodzi blenda), wymagają przebudowy karty.
  const structureKey = (project) =>
    project.furniture
      .map((c) => cabinetPanels(c, project).map((p) => p.key).join(',') + `@${c.id}`)
      .join('|') +
    '#' +
    project.trims.map((t) => t.id).join('|') +
    '#' +
    project.materials.map((m) => `${m.id}:${m.name}:${m.thickness}`).join('|');
  const updateTrim = (id, fn) =>
    store.set((p) => ({ ...p, trims: p.trims.map((t) => (t.id === id ? fn(t, p) : t)) }));
  const updateFurniture = (fn) => store.set((p) => ({ ...p, furniture: fn(p.furniture, p) }));
  const updateCabinet = (id, fn) =>
    updateFurniture((list, p) => list.map((c) => (c.id === id ? fn(c, p) : c)));

  function render(project) {
    root.innerHTML = `
      <h2>Meble</h2>
      <p class="hint">Korpus składa się z boków, wieńca górnego i dolnego oraz pleców.
        Wymiary są zewnętrzne, pozycja to narożnik lewy‑dolny‑tylny.</p>
      <div class="items">
        ${project.furniture.map((c) => renderCabinet(c, project)).join('') || '<p class="empty">Brak mebli.</p>'}
      </div>
      <div class="add-row">
        <button type="button" data-action="add-cabinet">+ Korpus</button>
      </div>

      <h3>Blendy dolne i górne</h3>
      <p class="hint">Jedna blenda może obejmować kilka korpusów — zaznacz, które.
        Blenda dolna zasłania nóżki (wysokość = nóżki − szczelina) i dochodzi do paneli bocznych.
        Blenda górna jest w płaszczyźnie frontu przy górnej krawędzi korpusu —
        front pod nią = wysokość korpusu − blenda − szczelina.</p>
      <div class="items">
        ${project.trims.map((t) => renderTrim(t, project)).join('') || '<p class="empty">Brak.</p>'}
      </div>
      <div class="add-row">
        <button type="button" data-add-trim="plinth">+ Blenda dolna</button>
        <button type="button" data-add-trim="topBlend">+ Blenda górna</button>
      </div>
      <datalist id="leg-heights">${LEG_HEIGHTS.map((h) => `<option value="${h}"></option>`).join('')}</datalist>
    `;
    renderedKey = structureKey(project);
    updateStatus(project);
  }

  // Karta korpusu podzielona na zwijane sekcje; w nagłówku każdej — krótkie podsumowanie
  // (uzupełniane w updateStatus), żeby nie trzeba było jej rozwijać.
  function renderCabinet(c, project) {
    const section = (key, title, body, extraClass = '') => `
      <details class="section ${extraClass}" data-section="${key}" ${isOpen(c.id, key) ? 'open' : ''}>
        <summary><span class="section-title">${title}</span><span class="section-sum"></span></summary>
        <div class="section-body">${body}</div>
      </details>`;

    const body = `
      <div class="grid-3">
        ${SIZE_FIELDS.map((f) =>
          numberField(f.label, f.key, c[f.key], { min: CABINET_LIMITS.sizeMin, max: CABINET_LIMITS.sizeMax, small: true }),
        ).join('')}
        ${POSITION_FIELDS.map((f) =>
          numberField(f.label, f.key, c[f.key], { min: -CABINET_LIMITS.sizeMax, max: CABINET_LIMITS.sizeMax, small: true }),
        ).join('')}
      </div>
      <div class="grid-2">
        ${materialSelect('Materiał korpusu', 'materialId', project)}
        ${materialSelect('Materiał blend', 'blendMaterialId', project)}
        <label class="field small">
          <span>Plecy</span>
          <select data-f="backType">
            ${BACK_TYPES.map((b) => `<option value="${b.key}">${b.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small">
          <span>Góra korpusu</span>
          <select data-f="topType">
            ${TOP_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="field small rail-width">
          <span>Szerokość trawersów <small>mm</small></span>
          <input type="number" step="1" min="10" max="${CABINET_LIMITS.sizeMax}" data-f="railWidth" />
        </label>
        ${jointSelect('Wieniec / trawersy górne', 'topJoint', JOINT_TYPES.top, c.topJoint)}
        ${jointSelect('Wieniec dolny', 'bottomJoint', JOINT_TYPES.bottom, c.bottomJoint)}
      </div>
      <div class="item-row">
        <span class="hint">Grubości i kolory — z zakładki „Materiały”.</span>
        <button type="button" data-action="fit">Dopasuj do wnęki</button>
      </div>
      <div class="slide-row" title="Przesuwa korpus aż do ściany, innego mebla lub przeszkody">
        <span>Dosuń:</span>
        <button type="button" data-slide="-x" title="W lewo">←</button>
        <button type="button" data-slide="+x" title="W prawo">→</button>
        <button type="button" data-slide="-z" title="Do tyłu">↑ tył</button>
        <button type="button" data-slide="+z" title="Do przodu">↓ przód</button>
        <button type="button" data-slide="-y" title="W dół — na podłogę albo na mebel poniżej">⤓ dół</button>
      </div>`;

    const legs = `
      <div class="grid-2">
        <label class="check"><input type="checkbox" data-f="legs.enabled" /> Nóżki</label>
        <label class="field small">
          <span>Wysokość nóżek <small>mm</small></span>
          <input type="number" list="leg-heights" step="1" min="${LEG_LIMITS.min}" max="${LEG_LIMITS.max}" data-f="legs.height" />
        </label>
      </div>`;

    const stiff = `
      <p class="hint">Pionowe listwy tuż przed plecami, między bokami — usztywniają korpus
        (np. do zawieszenia szafki). Mieszczą się w korpusie, nie zmieniają jego wymiarów.</p>
      ${(c.stiffeners ?? [])
        .map(
          (st, i) => `
        <div class="stiff-row">
          <label class="field small">
            <span>Położenie</span>
            <select data-f="stiffeners.${i}.position">
              ${STIFFENER_POSITIONS.map((p) => `<option value="${p.key}">${p.label}</option>`).join('')}
            </select>
          </label>
          <label class="field small">
            <span>Szerokość <small>mm</small></span>
            <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="stiffeners.${i}.height" />
          </label>
          <label class="field small stiff-y">
            <span>Od dołu korpusu <small>mm</small></span>
            <input type="number" step="1" min="0" max="${CABINET_LIMITS.sizeMax}" data-f="stiffeners.${i}.y" />
          </label>
          <button type="button" class="icon danger" data-remove-stiff="${st.id}" title="Usuń poprzeczkę">✕</button>
        </div>`,
        )
        .join('')}
      <div class="add-row"><button type="button" data-action="add-stiff">+ poprzeczka</button></div>`;

    const blends = `
      <div class="grid-2">${['left', 'right'].map((side) => sideBlendFields(side)).join('')}</div>
      <div class="trim-row">
        <span class="sub-title">Blenda dolna i górna</span>
        <div class="cabinet-trims"></div>
        <button type="button" data-add-trim="plinth" title="Blenda dolna dla tego korpusu i sąsiadów w rzędzie">+ blenda dolna</button>
        <button type="button" data-add-trim="topBlend" title="Blenda górna dla tego korpusu i sąsiadów w rzędzie">+ blenda górna</button>
      </div>`;

    const parts = `
      <p class="hint">Osie: X — szerokość, Y — wysokość, Z — głębokość korpusu.
        Elementy są powiązane: zmiana wymiaru płyty zmienia korpus, a pozostałe płyty
        się dopasowują (np. szerokość boku → głębokość korpusu i wieńców).
        Zmiana grubości przesuwa sąsiednie płyty.
        „Niezależny” odłącza płytę — jej wymiary dotyczą tylko jej.
        Wartości ręczne są wyróżnione, ↺ przywraca automatyczne.</p>
      ${cabinetPanels(c, project).map(renderPart).join('')}
      <p class="legs-info"></p>`;

    return `
      <div class="item cabinet" data-kind="cabinet" data-id="${c.id}">
        <div class="item-head">
          <input type="text" data-f="name" value="${escapeHtml(c.name)}" aria-label="Nazwa mebla" />
          <button type="button" data-action="duplicate" title="Duplikuj (Ctrl+D)">⧉</button>
          <button type="button" class="danger" data-remove="${c.id}" title="Usuń (Delete)">✕</button>
        </div>
        <ul class="issues"></ul>
        ${section('body', 'Korpus', body)}
        ${section('stiff', 'Wzmocnienia', stiff)}
        ${section('legs', 'Nóżki', legs)}
        ${section('blends', 'Blendy', blends)}
        ${section('parts', 'Elementy', parts, 'parts')}
      </div>`;
  }

  function renderTrim(t, project) {
    const heightField = `
      <label class="field small">
        <span>Wysokość <small>mm</small>${
          t.type === 'plinth'
            ? ` <small class="auto-tag">auto</small>
               <button type="button" class="icon tiny" data-reset-trim-height="${t.id}" title="Wysokość automatyczna: nóżki − 5 mm (bez nóżek 80 mm)">↺</button>`
            : ''
        }</span>
        <input type="number" step="1" min="1" max="2000" data-f="height" />
      </label>`;
    const fields =
      t.type === 'plinth'
        ? [heightField, numberField('Cofnięcie', 'setback', t.setback, { min: -500, max: 5000, small: true })]
        : [heightField, numberField('Szczelina do frontu', 'gap', t.gap, { min: 0, max: 100, small: true })];
    return `
      <div class="item trim ${t.type}" data-kind="trim" data-id="${t.id}">
        <div class="item-head">
          <input type="text" data-f="name" value="${escapeHtml(t.name)}" aria-label="Nazwa" />
          <button type="button" class="danger" data-remove-trim="${t.id}" title="Usuń">✕</button>
        </div>
        <div class="trim-cabinets">
          <span>Obejmuje:</span>
          ${project.furniture
            .map(
              (c) => `
            <label class="check small">
              <input type="checkbox" data-trim-cabinet="${c.id}" ${t.cabinetIds.includes(c.id) ? 'checked' : ''} />
              <span class="cab-name" data-cab-name="${c.id}">${escapeHtml(c.name)}</span>
            </label>`,
            )
            .join('')}
        </div>
        <div class="grid-3">
          ${fields.join('')}
          ${materialSelect('Materiał', 'materialId', project)}
        </div>
        <p class="trim-size"></p>
        <ul class="issues"></ul>
      </div>`;
  }

  function updateTrimStatus(project) {
    for (const t of project.trims) {
      const el = root.querySelector(`[data-kind="trim"][data-id="${t.id}"]`);
      if (!el) continue;
      el.querySelectorAll('[data-f]').forEach((input) => {
        const value = input.dataset.f === 'height' ? trimHeightValue(t, project) : t[input.dataset.f];
        if (!input.classList.contains('invalid')) setIfNotFocused(input, value);
      });
      const isAuto = t.type === 'plinth' && t.height == null;
      el.querySelector('.auto-tag')?.toggleAttribute('hidden', !isAuto);
      el.querySelector('[data-reset-trim-height]')?.toggleAttribute('hidden', isAuto);
      el.querySelectorAll('[data-trim-cabinet]').forEach((cb) => (cb.checked = t.cabinetIds.includes(cb.dataset.trimCabinet)));
      el.querySelectorAll('[data-cab-name]').forEach((span) => {
        span.textContent = project.furniture.find((c) => c.id === span.dataset.cabName)?.name ?? '';
      });
      const box = trimBox(t, project);
      let size =
        box && box.height > 0 ? `Formatka: ${round1(box.width)} × ${round1(box.height)} × ${round1(box.depth)} mm` : '';
      if (box && box.height > 0) {
        // Blendy mają oklejone wszystkie krawędzie (jeśli materiał ma obrzeże).
        const cut = panelCutSize({ ...box, material: trimMaterial(t, project), edges: defaultEdges(t.type) });
        if (cut.band) size += ` · do cięcia: ${round1(cut.cutLength)} × ${round1(cut.cutWidth)} mm`;
      }
      if (t.type === 'topBlend') {
        const fronts = [...new Set(frontHeightsUnder(t, project).map((f) => round1(f.height)))];
        if (fronts.length) size += ` · front pod blendą: ${fronts.join(' / ')} mm`;
      }
      el.querySelector('.trim-size').textContent = size;
      const issues = trimIssues(t, project);
      el.classList.toggle('has-issues', issues.length > 0);
      el.querySelector('.issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    }
  }

  // Blendy obejmujące korpus — w jego karcie, z wysokością i usuwaniem pod ręką.
  // DOM przebudowujemy tylko, gdy zmienia się lista blend (żeby nie gubić fokusu w polu).
  function updateCabinetTrims(container, cabinet, project) {
    const covering = project.trims.filter((t) => t.cabinetIds.includes(cabinet.id));
    const key = covering.map((t) => t.id).join('|');
    if (container.dataset.key !== key) {
      container.dataset.key = key;
      container.innerHTML = covering
        .map(
          (t) => `
          <div class="cab-trim">
            <span class="cab-trim-name" data-trim-name="${t.id}"></span>
            <label class="cab-trim-height">wys.
              <input type="number" step="1" min="1" max="2000" data-trim-field="height" data-trim-id="${t.id}" /> mm
            </label>
            <button type="button" class="icon danger" data-remove-trim="${t.id}" title="Usuń tę blendę">✕</button>
          </div>`,
        )
        .join('');
    }
    for (const t of covering) {
      container.querySelector(`[data-trim-name="${t.id}"]`).textContent =
        t.name + (t.type === 'plinth' && t.height == null ? ' (auto)' : '');
      const input = container.querySelector(`[data-trim-id="${t.id}"]`);
      if (!input.classList.contains('invalid')) setIfNotFocused(input, trimHeightValue(t, project));
    }
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
        <div class="part-edges">
          <span class="part-material"></span>
          <label title="Ile długich krawędzi jest oklejonych obrzeżem">obrzeże: dł. ${edgeSelect('l')}</label>
          <label title="Ile krótkich krawędzi jest oklejonych obrzeżem">kr. ${edgeSelect('w')}</label>
        </div>
        <div class="part-cutsize"></div>
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
        const value = getPath(c, input.dataset.f);
        if (input.type === 'checkbox') input.checked = !!value;
        else if (!input.classList.contains('invalid')) setIfNotFocused(input, value);
      });

      // Cokół boczny ma sens tylko z nóżkami; szerokość tylko dla listwy.
      const hasLegs = !!c.legs?.enabled;
      el.querySelectorAll('option[value="plinth"]').forEach((opt) => (opt.disabled = !hasLegs));
      updateCabinetTrims(el.querySelector('.cabinet-trims'), c, project);
      el.querySelector('.rail-width').hidden = c.topType !== 'rails';

      // Podsumowania w nagłówkach sekcji.
      const bodyMat = cabinetMaterials(c, project).body;
      setSummary(el, 'body', `${c.width} × ${c.height} × ${c.depth} mm · ${bodyMat.name}${c.topType === 'rails' ? ' · trawersy' : ''}`);
      setSummary(el, 'legs', c.legs?.enabled ? `${c.legs.height} mm` : 'brak');
      const nStiff = c.stiffeners?.length ?? 0;
      setSummary(el, 'stiff', nStiff ? `${nStiff} ${nStiff === 1 ? 'poprzeczka' : nStiff < 5 ? 'poprzeczki' : 'poprzeczek'}` : 'brak');
      el.querySelectorAll('.stiff-row').forEach((row, i) => {
        row.querySelector('.stiff-y').hidden = c.stiffeners?.[i]?.position !== 'backAt';
      });
      const blendParts = ['left', 'right']
        .map((side) => {
          const sb = c.sideBlends?.[side];
          const name = { plinth: 'cokół boczny', full: 'panel', filler: sb?.wallPanel ? 'listwa + panel' : 'listwa' }[sb?.type];
          return name && `${side === 'left' ? 'L' : 'P'}: ${name}`;
        })
        .filter(Boolean);
      const trimNames = project.trims
        .filter((t) => t.cabinetIds.includes(c.id))
        .map((t) => (t.type === 'plinth' ? 'dolna' : 'górna'));
      if (trimNames.length) blendParts.push(trimNames.join(', '));
      setSummary(el, 'blends', blendParts.join(' · ') || 'brak');
      for (const side of ['left', 'right']) {
        // Pokazujemy tylko opcje pasujące do wariantu: listwa → szerokość i panel przy ścianie;
        // panel na pełną wysokość albo listwa (z panelem lub bez) → wysunięcie do przodu.
        const sb = c.sideBlends?.[side];
        const box = el.querySelector(`.side-blend[data-side="${side}"]`);
        const isFiller = sb?.type === 'filler';
        const canExtend = sb?.type === 'full' || isFiller;
        box.querySelector('.filler-opts').hidden = !isFiller;
        box.querySelector('.panel-opts').hidden = !canExtend;
        const extend = box.querySelector(`[data-f="sideBlends.${side}.extend"]`);
        extend.disabled = !!sb?.flushFront;
        if (canExtend && sb.flushFront) extend.value = sidePanelExtension(c, side, project); // wartość wyliczona
      }

      const issues = cabinetIssues(c, project);
      el.classList.toggle('has-issues', issues.length > 0);
      el.querySelector('.issues').innerHTML = issues.length
        ? issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')
        : '<li class="ok">Mieści się w przestrzeni.</li>';

      const panels = cabinetPanels(c, project);
      setSummary(el, 'parts', `${panels.length} płyt`);
      const legs = cabinetLegs(c, project);
      el.querySelector('.legs-info').textContent = legs.length
        ? `Nóżki: ${legs.length} szt. × ${legs[0].height} mm (Ø${LEG_DIAMETER} mm)`
        : '';
      for (const p of panels) {
        const partEl = el.querySelector(`[data-part="${p.key}"]`);
        if (!partEl) continue;
        const s = panelCutSize(p);
        partEl.classList.toggle('invalid', !p.valid);
        partEl.querySelector('.part-cut').textContent = p.valid
          ? `${round1(s.length)} × ${round1(s.width)} × ${round1(s.thickness)} mm`
          : 'błędne wymiary';
        // Materiał, obrzeże i wymiar do cięcia (gotowy wymiar pomniejszony o taśmę).
        partEl.querySelector('.part-material').textContent = p.material.name;
        partEl.querySelectorAll('[data-edge]').forEach((sel) => {
          sel.value = p.edges[sel.dataset.edge];
          sel.disabled = !s.band;
        });
        partEl.querySelector('.part-cutsize').textContent =
          p.valid && s.band && (s.edges.l || s.edges.w)
            ? `do cięcia: ${round1(s.cutLength)} × ${round1(s.cutWidth)} mm (obrzeże ${s.band} mm)`
            : '';
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
    updateTrimStatus(project);
  }

  // Pola blendy wspólnej: zaznaczenie korpusów i parametry.
  function handleTrimInput(input, trimEl) {
    const id = trimEl.dataset.id;
    if (input.dataset.trimCabinet) {
      const cabId = input.dataset.trimCabinet;
      updateTrim(id, (t, p) => ({
        ...t,
        // zachowujemy kolejność korpusów z projektu
        cabinetIds: p.furniture
          .map((c) => c.id)
          .filter((cid) => (cid === cabId ? input.checked : t.cabinetIds.includes(cid))),
      }));
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
    updateTrim(id, (t) => ({ ...t, [field]: value }));
  }

  // --- zdarzenia (delegacja) ---
  root.addEventListener('input', (e) => {
    const input = e.target;
    if (input.dataset.trimField) {
      const value = readNumberInput(input);
      if (value !== undefined) updateTrim(input.dataset.trimId, (t) => ({ ...t, [input.dataset.trimField]: value }));
      return;
    }
    const trimEl = input.closest('[data-kind="trim"]');
    if (trimEl) {
      handleTrimInput(input, trimEl);
      return;
    }
    const cabinetEl = input.closest('[data-kind="cabinet"]');
    if (!cabinetEl) return;
    const id = cabinetEl.dataset.id;

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

    // Obrzeże elementu: liczba oklejonych krawędzi długich (l) i krótkich (w).
    if (input.dataset.edge) {
      const value = Number(input.value);
      updateCabinet(id, (c, prj) => {
        const current = cabinetPanels(c, prj).find((x) => x.key === part).edges;
        const o = { ...c.panelOverrides?.[part], edges: { ...current, [input.dataset.edge]: value } };
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
    updateCabinet(id, (c) => setPath(c, field, value));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number') return;
    if (!input.classList.contains('invalid') && input.value.trim() !== '') return;
    input.classList.remove('invalid');
    const trimId = input.dataset.trimId ?? input.closest('[data-kind="trim"]')?.dataset.id;
    if (trimId) {
      const trim = store.get().trims.find((t) => t.id === trimId);
      const field = input.dataset.trimField ?? input.dataset.f;
      if (trim) input.value = field === 'height' ? trimHeightValue(trim, store.get()) : trim[field];
      return;
    }
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
    const { action, remove, resetPart, slide, addTrim, removeTrim, resetTrimHeight, removeStiff } =
      e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
    if (action === 'add-stiff' && id) {
      updateCabinet(id, (c) => ({ ...c, stiffeners: [...(c.stiffeners ?? []), createStiffener(c)] }));
    } else if (removeStiff && id) {
      updateCabinet(id, (c) => ({ ...c, stiffeners: c.stiffeners.filter((st) => st.id !== removeStiff) }));
    } else if (resetTrimHeight) {
      updateTrim(resetTrimHeight, (t) => ({ ...t, height: null }));
    } else if (addTrim) {
      // Z karty korpusu: ten korpus + sąsiedzi w rzędzie; z dołu panelu: zaznaczony korpus i jego rząd
      // (a gdy nic nie jest zaznaczone — wszystkie korpusy).
      const project = store.get();
      const baseId = id ?? ui.get().selectedId;
      const ids = baseId ? rowOf(baseId, project) : project.furniture.map((c) => c.id);
      const trim = createTrim(addTrim, ids, project);
      store.set((p) => ({ ...p, trims: [...p.trims, trim] }));
    } else if (removeTrim) {
      store.set((p) => ({ ...p, trims: p.trims.filter((t) => t.id !== removeTrim) }));
    } else if (action === 'add-cabinet') {
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
      updateCabinet(id, (c, p) => fitCabinetToSpace(c, p));
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
