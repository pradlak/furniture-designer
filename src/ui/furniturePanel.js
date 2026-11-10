import {
  BACK_TYPES,
  CABINET_LIMITS,
  fitCabinetToSpace,
  cabinetPanels,
  cabinetIssues,
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
  describeCuts,
  stiffenerY,
} from '../model/furniture.js';
import { duplicateCabinet, slideCabinet } from '../model/placement.js';
import { addCabinetToLayout, updateCabinetRefit } from '../model/layout.js';
import { cabinetMaterials } from '../model/materials.js';
import { setEye, materialSelect } from './widgets.js';
import { sideBlendSummary } from './sideBlends.js';
import { edgeKeys, EDGE_LABELS, projectSolids, panelEdgeSet, isManualEdgeSet, edgeCounts } from '../model/edges.js';

import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero } from './dom.js';

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
// onShowTrims(cabinetId) — przejście do zakładki „Blendy i blaty” (z karty korpusu).
export function createFurniturePanel(root, store, ui, tabs, { onShowTrims } = {}) {
  let renderedKey = null;
  // Rozwinięte sekcje kart korpusów („id:sekcja”); domyślnie otwarta jest sekcja „Korpus”.
  const sectionState = new Map();
  const isOpen = (id, key) => sectionState.get(`${id}:${key}`) ?? key === 'body';
  // Całe karty zwinięte do nagłówka (id korpusów).
  const collapsed = new Set();
  const applyCollapsed = (el) => {
    const isCollapsed = collapsed.has(el.dataset.id);
    el.classList.toggle('collapsed', isCollapsed);
    const btn = el.querySelector('[data-collapse-card]');
    btn.textContent = isCollapsed ? '▸' : '▾';
    btn.title = isCollapsed ? 'Rozwiń korpus' : 'Zwiń korpus';
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
    project.materials.map((m) => `${m.id}:${m.name}:${m.thickness}`).join('|');
  const updateFurniture = (fn) => store.set((p) => ({ ...p, furniture: fn(p.furniture, p) }));
  const updateCabinet = (id, fn) =>
    updateFurniture((list, p) => list.map((c) => (c.id === id ? fn(c, p) : c)));

  function render(project) {
    root.innerHTML = `
      <h2>Meble</h2>
      <p class="hint">Korpus składa się z boków, wieńca górnego i dolnego oraz pleców.
        Wymiary są zewnętrzne, pozycja to narożnik lewy‑dolny‑tylny.</p>
      ${
        project.furniture.length
          ? `<div class="collapse-all">
              <button type="button" data-action="collapse-all" title="Zwiń wszystkie karty korpusów do nagłówków">▸ Zwiń wszystkie</button>
              <button type="button" data-action="expand-all" title="Rozwiń wszystkie karty korpusów">▾ Rozwiń wszystkie</button>
            </div>`
          : ''
      }
      <div class="items">
        ${project.furniture.map((c) => renderCabinet(c, project)).join('') || '<p class="empty">Brak mebli.</p>'}
      </div>
      <div class="add-row">
        <button type="button" data-action="add-cabinet">+ Korpus</button>
      </div>

      <datalist id="leg-heights">${LEG_HEIGHTS.map((h) => `<option value="${h}"></option>`).join('')}</datalist>
    `;
    renderedKey = structureKey(project);
    root.querySelectorAll('[data-kind="cabinet"]').forEach(applyCollapsed);
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
      <div class="grid-2">
        <label class="field small" title="Odstęp pleców od tylnej ściany (np. na rury). Front zostaje na miejscu — korpus robi się płytszy, blat się nie zmienia.">
          <span>Odstęp od tylnej ściany <small>mm</small></span>
          <input type="number" step="1" min="0" max="${CABINET_LIMITS.sizeMax}" data-f="backGap" />
        </label>
      </div>
      <div class="slope-top">
        <div class="grid-2">
          <label class="check" title="Korpus pod skosem dostaje skośną górę: boki i plecy docięte równolegle do skosu, wieniec górny pod kątem">
            <input type="checkbox" data-f="slopeTop.enabled" /> Góra pod skos
          </label>
          <label class="field small slope-gap-field" title="Odstęp między skośną górą korpusu a skosem (prostopadle do skosu). Domyślnie — luz ustawiony przy skosie (Przestrzeń); wpisana wartość dotyczy tylko tego korpusu.">
            <span>Luz do skosu <small>mm</small> <small class="auto-tag">ze skosu</small>
              <button type="button" class="icon tiny" data-reset-slope-gap title="Wróć do luzu ustawionego przy skosie">↺</button>
            </span>
            <input type="number" step="1" min="0" max="500" data-f="slopeTop.gap" />
          </label>
        </div>
        <p class="hint slope-top-info"></p>
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
        (np. do zawieszenia szafki). Mieszczą się w korpusie, nie zmieniają jego wymiarów.
        Nowe poprzeczki rozkładają się równo: jedna — na środku, dwie — dzielą wnętrze na trzy równe części itd.</p>
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
          <button type="button" class="collapse-toggle" data-collapse-card>▾</button>
          <input type="text" data-f="name" value="${escapeHtml(c.name)}" aria-label="Nazwa mebla" />
          <button type="button" class="eye" data-toggle-hidden="cabinet">👁</button>
          <button type="button" data-action="duplicate" title="Duplikuj (Ctrl+D)">⧉</button>
          <button type="button" class="danger" data-remove="${c.id}" title="Usuń (Delete)">✕</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"></div>
        <ul class="issues"></ul>
        ${section('body', 'Korpus', body)}
        ${section('stiff', 'Wzmocnienia', stiff)}
        ${section('legs', 'Nóżki', legs)}
        <div class="trims-info">
          <span class="cabinet-trims"></span>
          <button type="button" data-action="show-trims" title="Blendy boczne, dolne, górne i blaty edytujesz w zakładce „Blendy i blaty”">Blendy i blaty →</button>
        </div>
        ${section('parts', 'Elementy', parts, 'parts')}
      </div>`;
  }

  function renderPart(p) {
    return `
      <div class="part" data-part="${p.key}">
        <div class="part-head">
          <span class="part-name">${p.name}</span>
          <span class="part-cut"></span>
          <button type="button" class="icon eye" data-toggle-part-hidden="${p.key}">👁</button>
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
        <div class="part-edges" title="Krawędzie oklejone obrzeżem. Domyślnie tylko widoczne — schowane przy ścianie, pod blatem albo przy innej płycie są pomijane.">
          <span class="part-material"></span>
          <span class="edges-label">obrzeże <small class="auto-tag">auto</small>
            <button type="button" class="icon tiny" data-reset-edges title="Automatycznie: tylko krawędzie widoczne">↺</button>
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
  function updateStatus(project) {
    let solids = null; // bryły projektu do wyznaczania widocznych krawędzi — liczone raz
    for (const c of project.furniture) {
      const el = root.querySelector(`[data-kind="cabinet"][data-id="${c.id}"]`);
      if (!el) continue;

      el.querySelectorAll('[data-f]').forEach((input) => {
        const value = getPath(c, input.dataset.f);
        if (input.type === 'checkbox') input.checked = !!value;
        else if (!input.classList.contains('invalid')) setIfNotFocused(input, value);
      });

      // Blendy i blaty — tylko informacja (edycja w zakładce „Blendy i blaty”).
      const covering = project.trims.filter((t) => t.cabinetIds.includes(c.id));
      const side = sideBlendSummary(c);
      el.querySelector('.cabinet-trims').textContent =
        [side && `Blendy boczne: ${side}`, covering.length && `Obejmują go: ${covering.map((t) => t.name).join(', ')}`]
          .filter(Boolean)
          .join(' · ') || 'Bez blend i blatu';
      el.classList.toggle('is-hidden', !!c.hidden);
      setEye(el.querySelector('[data-toggle-hidden="cabinet"]'), c.hidden, 'korpus');
      el.querySelector('.rail-width').hidden = c.topType !== 'rails';
      // Góra pod skos — tylko gdy przestrzeń ma skos z tyłu lub z przodu.
      const zSlope = project.space.slopes.some((s) => s.side === 'back' || s.side === 'front');
      el.querySelector('.slope-top').hidden = !zSlope;
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
          ? 'Góra prosta — korpus jest prostopadłościanem.'
          : slant
            ? `Korpus sięga skosu — góra docięta pod kątem ${angle}°${c.topType === 'rails' ? ' (zamiast trawersów pełny wieniec skośny)' : ''}.`
            : 'Korpus nie sięga skosu — zwykła, prosta góra.';

      // Podsumowania w nagłówkach sekcji.
      const bodyMat = cabinetMaterials(c, project).body;
      setSummary(el, 'body', `${c.width} × ${c.height} × ${c.depth} mm · ${bodyMat.name}${c.topType === 'rails' ? ' · trawersy' : ''}${c.backGap ? ` · odstęp ${c.backGap}` : ''}`);
      setSummary(el, 'legs', c.legs?.enabled ? `${c.legs.height} mm` : 'brak');
      const nStiff = c.stiffeners?.length ?? 0;
      setSummary(el, 'stiff', nStiff ? `${nStiff} ${nStiff === 1 ? 'poprzeczka' : nStiff < 5 ? 'poprzeczki' : 'poprzeczek'}` : 'brak');
      el.querySelectorAll('.stiff-row').forEach((row, i) => {
        const st = c.stiffeners?.[i];
        const label = row.querySelector('.stiff-y');
        const input = label.querySelector('input');
        // „Na wysokości…” — wpisywana; „równo rozłożone” — wyliczona (tylko do odczytu).
        label.hidden = st?.position !== 'backAt' && st?.position !== 'even';
        input.disabled = st?.position === 'even';
        if (st?.position === 'even') input.value = round1(stiffenerY(c, st, project));
      });
      const issues = cabinetIssues(c, project);
      el.classList.toggle('has-issues', issues.length > 0);
      // Podsumowanie widoczne w zwiniętej karcie.
      el.querySelector('.card-sum').textContent =
        `${c.width} × ${c.height} × ${c.depth} mm` +
        (issues.length ? ` · ⚠ ${issues.length} ${issues.length === 1 ? 'problem' : issues.length < 5 ? 'problemy' : 'problemów'}` : '');
      el.querySelector('.issues').innerHTML = issues.length
        ? issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')
        : '<li class="ok">Mieści się w przestrzeni.</li>';

      const panels = cabinetPanels(c, project);
      solids ??= projectSolids(project);
      setSummary(el, 'parts', `${panels.length} płyt`);
      const legs = cabinetLegs(c, project);
      el.querySelector('.legs-info').textContent = legs.length
        ? `Nóżki: ${legs.length} szt. × ${legs[0].height} mm (Ø${LEG_DIAMETER} mm)`
        : '';
      for (const p of panels) {
        const partEl = el.querySelector(`[data-part="${p.key}"]`);
        if (!partEl) continue;
        const edgeSet = panelEdgeSet(p, c, project, solids);
        const s = panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, edgeSet) });
        partEl.classList.toggle('invalid', !p.valid);
        partEl.querySelector('.part-cut').textContent = p.valid
          ? `${round1(s.length)} × ${round1(s.width)} × ${round1(s.thickness)} mm`
          : 'błędne wymiary';
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
          ? `⚠ Zapas na docięcie +${s.allowance} mm — docięcie na miejscu (wliczony w formatkę)`
          : '';
        partEl.querySelector('.part-cutsize').textContent =
          p.valid && s.band && (s.edges.l || s.edges.w)
            ? `do cięcia: ${round1(s.cutLength)} × ${round1(s.cutWidth)} mm (obrzeże ${s.band} mm: ${edgeSet.map((k) => EDGE_LABELS[k]).join(', ')})`
            : '';
        // Płyta docięta pod skos: ścięte rogi i krawędzie cięte pod kątem.
        partEl.querySelector('.part-shape').textContent = p.valid ? describeCuts(s) : '';
        partEl.querySelector('[data-reset-part]').hidden = p.overridden.length === 0 && !p.free;
        partEl.querySelector('[data-part-free]').checked = p.free;
        partEl.classList.toggle('free', p.free);
        partEl.classList.toggle('is-hidden', p.hidden);
        setEye(partEl.querySelector('[data-toggle-part-hidden]'), p.hidden, 'płytę');
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
    if (field === 'backGap') {
      // Front zostaje na miejscu — zmienia się położenie pleców i głębokość korpusu.
      const cabinet = store.get().furniture.find((c) => c.id === id);
      const next = setBackGap(cabinet, value);
      if (!next) {
        input.classList.add('invalid');
        return;
      }
      updateCabinet(id, () => next);
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
    if (field.startsWith('slopeTop.')) {
      // Włączenie / wyłączenie skośnej góry albo zmiana luzu — korpus o wysokości automatycznej
      // dopasowuje się na nowo (z przodu sięga skosu albo zniża się do najniższego miejsca).
      store.set((p) => updateCabinetRefit(p, id, (c) => setPath(c, field, value)));
      return;
    }
    updateCabinet(id, (c) => setPath(c, field, value));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    // Wyczyszczony luz do skosu wraca do luzu ustawionego przy skosie.
    const gapCabinet = input.closest('[data-kind="cabinet"]')?.dataset.id;
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
    const {
      action, remove, resetPart, slide, removeStiff, toggleHidden, togglePartHidden,
    } = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="cabinet"]')?.dataset.id;
    if (e.target.closest('[data-reset-slope-gap]') && id) {
      store.set((p) => updateCabinetRefit(p, id, (c) => setPath(c, 'slopeTop.gap', null)));
    } else if (e.target.closest('[data-collapse-card]') && id) {
      setCollapsed([id], !collapsed.has(id));
    } else if (action === 'collapse-all') {
      setCollapsed(store.get().furniture.map((c) => c.id), true);
    } else if (action === 'expand-all') {
      setCollapsed(store.get().furniture.map((c) => c.id), false);
    } else if (toggleHidden && id) {
      updateCabinet(id, (c) => ({ ...c, hidden: !c.hidden }));
    } else if (e.target.dataset.resetEdges !== undefined && id) {
      const part = e.target.closest('[data-part]')?.dataset.part;
      updateCabinet(id, (c) => {
        const { edgeSet: _removed, ...o } = c.panelOverrides?.[part] ?? {};
        return { ...c, panelOverrides: { ...c.panelOverrides, [part]: o } };
      });
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
      const { project, cabinet } = addCabinetToLayout(store.get());
      store.set(project);
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
      if (collapsed.has(selectedId)) setCollapsed([selectedId], false); // pokazujemy zaznaczony korpus
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
