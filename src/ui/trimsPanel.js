import { panelCutSize, cabinetPanels } from '../model/furniture.js';
import { projectSolids, trimEdgeSet, edgeCounts, TRIM_THICKNESS_AXIS, EDGE_LABELS } from '../model/edges.js';
import {
  createTrim,
  rowOf,
  trimBox,
  trimIssues,
  frontHeightsUnder,
  AUTO_FIELDS,
  trimFieldValue,
  countertopOverhang,
  trimAllowance,
  trimAllowanceParts,
  trimSegments,
  countertopFreeSpace,
} from '../model/trims.js';
import { attachDragReorder, moveInList, DRAG_HANDLE } from './dragReorder.js';
import { trimMaterial } from '../model/materials.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero } from './dom.js';
import { setEye, materialSelect, colorPicker, readColorInput, syncColorPicker } from './widgets.js';
import { renderSideBlendCard, updateSideBlendCard } from './sideBlends.js';
import { renderBoardFeatures, syncBoardFeatures, readFeatureInput, readFeatureClick, applyFeatureChange } from './boardFeaturesEditor.js';
import { createCardCollapse, COLLAPSE_BUTTON, COLLAPSE_ALL_BUTTONS } from './collapsible.js';
import { markInspectorCard } from './inspectorCard.js';
import { trimSketch } from './objectSketch.js';
import { setPath, setSideBlendField, cabinetReachesTop, describeCuts } from '../model/furniture.js';
import { updateCabinetKeepingRow } from '../model/layout.js';

// Zakładki „Blendy” i „Blaty i półki”: elementy, które mogą obejmować kilka korpusów — blendy dolne,
// blendy górne i blaty. To jedyne miejsce ich edycji (karta korpusu tylko pokazuje, co go obejmuje).

// Kolejność w panelu: od góry mebla — blendy górne, dolne, blaty.
const GROUPS = [
  {
    type: 'topBlend',
    title: 'Blendy górne',
    add: '+ Blenda górna',
    hint: 'W płaszczyźnie frontu przy górnej krawędzi korpusu; front pod nią = korpus − blenda − szczelina.',
  },
  {
    type: 'plinth',
    title: 'Blendy dolne',
    add: '+ Blenda dolna',
    hint:
      'Zasłania nóżki: wysokość = nóżki − 5 mm (bez nóżek 80 mm), cofnięta od frontu, dochodzi do paneli bocznych. ' +
      'Zapas na docięcie = zapas blendy bocznej skrajnego korpusu + dodatkowy zapas blendy dolnej.',
  },
  {
    type: 'countertop',
    title: 'Blaty na szafkach',
    add: '+ Blat na szafkach',
    hint: 'Leży na korpusach, z przodu wysunięty (domyślnie 30 mm od frontu), domyślnie na długość korpusów, a gdy stoją przy ścianie (do 100 mm od niej) — do ściany. Z frezami krawędzi i otworami (zlew, płyta grzewcza, przepust…).',
  },
];

const AUTO_TITLES = {
  height: 'Automatycznie: nóżki − 5 mm (bez nóżek 80 mm)',
  x: 'Automatycznie: do ściany albo sąsiedniego mebla',
  length: 'Automatycznie: do ścian albo sąsiednich mebli',
  depth: 'Automatycznie: od pleców do frontu + wysunięcie',
  thickness: 'Automatycznie: grubość materiału',
};

// Wartość pola do wyświetlenia (dla pól automatycznych — wyliczona).
const trimValue = (t, field, project) => {
  const v = trimFieldValue(t, field, project);
  return typeof v === 'number' ? round1(v) : v;
};

// mode: 'blends' — zakładka „Blendy” (blendy boczne, górne, dolne),
//       'worktops' — zakładka „Blaty i półki” (blaty na szafkach; samodzielne płyty — ui/boardsPanel.js).
export function createTrimsPanel(root, store, ui, { mode = 'blends' } = {}) {
  const groups = GROUPS.filter((g) => (mode === 'worktops' ? g.type === 'countertop' : g.type !== 'countertop'));
  let renderedKey = null;
  const cardCollapse = createCardCollapse(root); // zwijane karty (jak karty korpusów)
  const structureKey = (project) =>
    project.trims.map((t) => t.id).join('|') +
    '#' +
    project.furniture.map((c) => c.id).join('|') +
    '#' +
    project.materials.map((m) => `${m.id}:${m.name}:${m.thickness}`).join('|');
  const updateTrim = (id, fn) =>
    store.set((p) => ({ ...p, trims: p.trims.map((t) => (t.id === id ? fn(t, p) : t)) }));

  function render(project) {
    root.innerHTML = `
      ${
        mode === 'worktops'
          ? `<h2>Blaty i półki</h2>
             <p class="hint">Blaty na szafkach (mogą obejmować kilka korpusów) oraz samodzielne blaty i półki —
               wszystkie z frezami krawędzi i otworami.</p>
             <p class="hint add-target"></p>
             ${COLLAPSE_ALL_BUTTONS /* działa też na samodzielne płyty poniżej (boardsPanel) */}`
          : `<h2>Blendy</h2>
             <p class="hint">Blendy dolne i górne mogą obejmować kilka korpusów — w karcie zaznacz, które.</p>
             <p class="hint add-target"></p>
             ${project.furniture.length || project.trims.length ? COLLAPSE_ALL_BUTTONS : ''}
             <h3>Blendy boczne</h3>
             <p class="hint">Po bokach korpusu: blenda boczna — pas z przodu przy ścianie (opcjonalnie z panelem przy ścianie),
               panel na pełną wysokość albo cokół boczny. Każdy korpus ma swoją kartę.</p>
             <div class="items">
               ${project.furniture.map((c) => renderSideBlendCard(c, project)).join('') || '<p class="empty">Brak korpusów.</p>'}
             </div>`
      }
      ${groups.map(
        (g) => `
        <h3>${g.title}</h3>
        <p class="hint">${g.hint}</p>
        <div class="items">
          ${project.trims.filter((t) => t.type === g.type).map((t) => renderTrim(t, project)).join('') || '<p class="empty">Brak.</p>'}
        </div>
        <div class="add-row"><button type="button" data-add-trim="${g.type}">${g.add}</button></div>`,
      ).join('')}
    `;
    cardCollapse.applyAll();
    renderedKey = structureKey(project);
    updateStatus(project);
    syncSelection();
  }

  function renderTrim(t, project) {
    // Pole automatyczne: pokazuje wartość wyliczoną, wpisanie ustawia ją ręcznie, ↺ wraca do automatu.
    const field = (label, key, opts = {}) => {
      if (!AUTO_FIELDS[t.type].includes(key)) return numberField(label, key, '', { small: true, ...opts });
      return `
        <label class="field small" data-auto="${key}">
          <span>${label} <small class="auto-tag">auto</small>
            <button type="button" class="icon tiny" data-reset-trim-field="${key}" title="${AUTO_TITLES[key]}">↺</button>
          </span>
          <input type="number" step="1" min="${opts.min ?? 1}" max="${opts.max ?? 20000}" data-f="${key}" />
        </label>`;
    };
    const fields = {
      plinth: [
        field('Wysokość', 'height', { max: 2000 }),
        field('Cofnięcie', 'setback', { min: -500, max: 5000 }),
        `<span></span>`,
        field('Dodatkowy zapas z lewej', 'allowanceLeft', { min: 0, max: 500 }),
        field('Dodatkowy zapas z prawej', 'allowanceRight', { min: 0, max: 500 }),
      ],
      topBlend: [
        field('Wysokość', 'height', { min: 1, max: 2000 }),
        field('Szczelina do frontu', 'gap', { min: 0, max: 100 }),
        `<label class="check small to-ceiling">
          <input type="checkbox" data-f="toCeiling" /> do sufitu / skosu
        </label>`,
      ],
      countertop: [
        field('Wysunięcie z przodu', 'overhang', { min: -500, max: 1000 }),
        `<label class="check small front-check" title="Wysunięcie liczone od przedniej powierzchni frontu (dodaje grubość frontu)">
          <input type="checkbox" data-f="includeFront" /> licz od frontu
        </label>`,
        field('Od lewej (X)', 'x', { min: -20000 }),
        field('Długość', 'length'),
        field('Głębokość', 'depth'),
        field('Grubość', 'thickness', { min: 3, max: 100 }),
      ],
    }[t.type];
    return `
      <div class="item trim ${t.type}" data-kind="trim" data-id="${t.id}">
        <div class="item-head">
          ${DRAG_HANDLE}
          ${COLLAPSE_BUTTON}
          <input type="text" data-f="name" value="${escapeHtml(t.name)}" aria-label="Nazwa" />
          <button type="button" class="eye" data-toggle-trim-hidden>👁</button>
          <button type="button" class="danger" data-remove-trim title="Usuń" aria-label="Usuń">🗑</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"></div>
        <div class="obj-sketch bi-sketch" title="Kliknij, aby powiększyć szkic"></div>
        <div class="trim-cabinets">
          <span>Obejmuje:</span>
          ${
            project.furniture
              .map(
                (c) => `
            <label class="check small">
              <input type="checkbox" data-trim-cabinet="${c.id}" />
              <span class="cab-name" data-cab-name="${c.id}">${escapeHtml(c.name)}</span>
              ${t.type === 'countertop' ? `<small class="cab-depth" data-cab-depth="${c.id}" title="Głębokość korpusu (bez frontu)"></small>` : ''}
            </label>`,
              )
              .join('') || '<span>brak korpusów</span>'
          }
        </div>
        ${
          t.type === 'countertop'
            ? `<div class="trim-cabinets trim-extend" title="Blat przykrywa też wolne miejsce obok szafek (np. pod zmywarkę lub pralkę) — aż do ściany albo sąsiedniego mebla">
          <span>Też wolne miejsce:</span>
          <label class="check small"><input type="checkbox" data-f="extendLeft" /> z lewej <span class="free-size" data-free="left"></span></label>
          <label class="check small"><input type="checkbox" data-f="extendRight" /> z prawej <span class="free-size" data-free="right"></span></label>
        </div>`
            : ''
        }
        <div class="grid-3">
          ${fields.join('')}
          ${materialSelect('Materiał', 'materialId', project)}
          ${t.type === 'countertop' ? '' : colorPicker('Kolor', 'color')}
        </div>
        ${t.type === 'countertop' ? colorPicker('Kolor / dekor (dąb, orzech, beton, marmur…)', 'color', { wide: true }) : ''}
        ${t.type === 'countertop' ? renderBoardFeatures() : ''}
        <p class="trim-size"></p>
        <p class="allowance-note trim-allowance"></p>
        <ul class="issues"></ul>
      </div>`;
  }

  // Odświeża wartości, wymiary formatek i ostrzeżenia bez przebudowy DOM.
  function updateStatus(project) {
    let solids = null; // bryły projektu do wyznaczania widocznych krawędzi — liczone raz
    for (const c of project.furniture) {
      const el = root.querySelector(`[data-kind="side-blends"][data-id="${c.id}"]`);
      if (el) updateSideBlendCard(el, c, project);
    }
    for (const t of project.trims) {
      const el = root.querySelector(`[data-kind="trim"][data-id="${t.id}"]`);
      if (!el) continue;
      syncColorPicker(el, 'color', t.color, trimMaterial(t, project).color);
      if (el.classList.contains('in-inspector')) el.querySelector('.obj-sketch').innerHTML = trimSketch(t, project); // szkic w okienku
      // blat: frezy krawędzi i otwory (wymiary blatu — do położenia otworów)
      if (t.type === 'countertop') {
        const cb = trimBox(t, project);
        if (cb) syncBoardFeatures(el, t, cb.width, cb.depth);
        // wolne miejsce obok szafek: przełącznik tylko z tej strony, gdzie ono jest (albo gdy już włączony)
        const free = countertopFreeSpace(t, project);
        for (const side of ['left', 'right']) {
          const key = side === 'left' ? 'extendLeft' : 'extendRight';
          const label = el.querySelector(`[data-free="${side}"]`).closest('label');
          label.hidden = !free[side] && !t[key];
          label.querySelector('.free-size').textContent = free[side] ? `(${free[side]} mm)` : '';
        }
        el.querySelector('.trim-extend').hidden = [...el.querySelectorAll('.trim-extend label')].every((l) => l.hidden);
      }
      el.querySelectorAll('[data-f]').forEach((input) => {
        if (input.type === 'checkbox') {
          input.checked = !!t[input.dataset.f];
          return;
        }
        if (!input.classList.contains('invalid')) setIfNotFocused(input, trimValue(t, input.dataset.f, project));
      });
      el.querySelectorAll('[data-auto]').forEach((label) => {
        const isAuto = t[label.dataset.auto] == null;
        label.querySelector('.auto-tag').hidden = !isAuto;
        label.querySelector('[data-reset-trim-field]').hidden = isAuto;
      });
      el.classList.toggle('is-hidden', !!t.hidden);
      setEye(el.querySelector('[data-toggle-trim-hidden]'), t.hidden, 'element');
      el.querySelectorAll('[data-trim-cabinet]').forEach((cb) => (cb.checked = t.cabinetIds.includes(cb.dataset.trimCabinet)));
      el.querySelectorAll('[data-cab-name]').forEach((span) => {
        span.textContent = project.furniture.find((c) => c.id === span.dataset.cabName)?.name ?? '';
      });
      // blat: głębokość każdego korpusu obok nazwy — do porównania z głębokością blatu
      el.querySelectorAll('[data-cab-depth]').forEach((span) => {
        const c = project.furniture.find((f) => f.id === span.dataset.cabDepth);
        span.textContent = c ? `(gł. ${round1(c.depth)} mm)` : '';
      });

      const box = trimBox(t, project);
      const allowance = box ? trimAllowance(t, project) : { min: 0, max: 0 };
      let size = '';
      const segments = trimSegments(t, project);
      if (segments.length) {
        // Formatki odcinków: długość × szerokość × grubość (zapas — na skrajnych odcinkach);
        // do cięcia — pomniejszone o obrzeże.
        // Obrzeże — tylko na widocznych krawędziach odcinka.
        solids ??= projectSolids(project);
        const edgeSets = segments.map((seg, i) => trimEdgeSet(t, seg, i, solids));
        const cuts = segments.map((seg, i) => {
          const box = {
            ...seg,
            allowanceMin: i === 0 ? allowance.min : 0,
            allowanceMax: i === segments.length - 1 ? allowance.max : 0,
          };
          return panelCutSize({
            ...box,
            material: trimMaterial(t, project),
            edges: edgeCounts(box, TRIM_THICKNESS_AXIS[t.type], edgeSets[i]),
          });
        });
        const dims = (c) => `${round1(c.length)} × ${round1(c.width)} × ${round1(c.thickness)}`;
        size =
          cuts.length > 1
            ? `Formatki (${cuts.length} szt. — podzielona przy panelach bocznych): ${cuts.map(dims).join(', ')} mm`
            : `Formatka: ${dims(cuts[0])} mm`;
        if (t.type === 'countertop' && t.depth == null) {
          size += ` · wystaje przed korpus: ${round1(countertopOverhang(t, project))} mm`;
        }
        if (cuts[0].band) {
          size += ` · do cięcia: ${cuts.map((c) => `${round1(c.cutLength)} × ${round1(c.cutWidth)}`).join(', ')} mm`;
          size += ` (obrzeże: ${[...new Set(edgeSets.flat())].map((k) => EDGE_LABELS[k]).join(', ') || 'brak'})`;
        }
      }
      if (t.type === 'topBlend') {
        const fronts = [...new Set(frontHeightsUnder(t, project).map((f) => round1(f.height)))];
        if (fronts.length) size += ` · front pod blendą: ${fronts.join(' / ')} mm`;
        // „Do sufitu / skosu” — tylko gdy objęte korpusy sięgają sufitu lub skosu.
        const cabs = project.furniture.filter((c) => t.cabinetIds.includes(c.id));
        const possible = cabs.length > 0 && cabs.every((c) => cabinetReachesTop(c, project));
        const label = el.querySelector('.to-ceiling');
        label.querySelector('input').disabled = !possible;
        label.classList.toggle('inactive', !possible);
        label.title = possible
          ? 'Dolna krawędź zostaje (wysokość liczona od góry korpusu), a górą blenda dochodzi do sufitu albo skosu — docięta pod kąt skosu, z luzem do skosu. Odznaczone — blenda kończy się na górze korpusów.'
          : 'Objęte korpusy nie sięgają sufitu ani skosu — blenda kończy się na górze korpusów.';
      }
      // Blenda docięta pod skos: ścięte rogi / krawędzie cięte pod kątem.
      const shapes = [...new Set(segments.map((seg) => describeCuts(panelCutSize({ ...seg, material: trimMaterial(t, project) }))).filter(Boolean))];
      if (shapes.length) size += ` · ${shapes.join('; ')}`;
      el.querySelector('.trim-size').textContent = size;
      // Zapas z rozbiciem na źródła, np. „z prawej +40 mm (blenda boczna Korpus B: 20 + dodatkowy: 20)”.
      const parts = trimAllowanceParts(t, project);
      const describe = (label, list) => {
        const total = list.reduce((s, p) => s + p.value, 0);
        if (!total) return null;
        const from = list.map((p) => `${p.source}: ${p.value}`).join(' + ');
        return `${label} +${total} mm (${from})`;
      };
      const sides = [describe('z lewej', parts.left), describe('z prawej', parts.right)].filter(Boolean);
      el.querySelector('.trim-allowance').textContent = sides.length
        ? `⚠ Zapas na docięcie: ${sides.join(', ')} — docięcie na miejscu (wliczony w formatkę)`
        : '';

      const issues = trimIssues(t, project);
      el.classList.toggle('has-issues', issues.length > 0);
      // Podsumowanie widoczne w zwiniętej karcie: co obejmuje i ewentualne problemy.
      const covered = project.furniture.filter((c) => t.cabinetIds.includes(c.id)).map((c) => c.name);
      el.querySelector('.card-sum').textContent =
        (covered.length ? `Obejmuje: ${covered.join(', ')}` : 'Nie obejmuje żadnego korpusu') +
        (issues.length ? ` · ⚠ ${issues.length} ${issues.length === 1 ? 'problem' : issues.length < 5 ? 'problemy' : 'problemów'}` : '');
      el.querySelector('.issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    }
  }

  // Podświetlamy elementy obejmujące zaznaczony korpus i podpowiadamy, co obejmie nowy element.
  function syncSelection() {
    const project = store.get();
    const selected = project.furniture.find((c) => c.id === ui.get().selectedId);
    // jeden zaznaczony blat / blenda wspólna — karta jako okienko po prawej
    const sel = ui.get().selectedBlends ?? [];
    const one = sel.length === 1 && sel[0].startsWith('trim:') && !ui.get().selectedId ? sel[0].slice(5) : null;
    const card = markInspectorCard(root, '[data-kind="trim"]', one);
    const trim = card && project.trims.find((x) => x.id === one);
    if (trim) card.querySelector('.obj-sketch').innerHTML = trimSketch(trim, project);
    if (card?.classList.contains('collapsed')) cardCollapse.expand(card);
    // zaznaczone w 3D blendy (wspólne „trim:id”, boczne „idKorpusu:klucz”) — ich karty też podświetlone
    const picked = ui.get().selectedBlends ?? [];
    root.querySelectorAll('[data-kind="trim"]').forEach((el) => {
      const t = project.trims.find((x) => x.id === el.dataset.id);
      el.classList.toggle('related', !!(selected && t?.cabinetIds.includes(selected.id)) || picked.includes(`trim:${el.dataset.id}`));
    });
    root.querySelectorAll('[data-kind="side-blends"]').forEach((el) => {
      // tylko blendy boczne (płyty z grupy „blend”) — nie np. bok korpusu zaznaczony z menu w 3D
      const cab = project.furniture.find((c) => c.id === el.dataset.id);
      const blendKeys = cab ? new Set(cabinetPanels(cab, project).filter((p) => p.group === 'blend').map((p) => `${cab.id}:${p.key}`)) : new Set();
      const sidePicked = picked.some((id) => blendKeys.has(id));
      el.classList.toggle('related', el.dataset.id === selected?.id || sidePicked);
    });
    const target = root.querySelector('.add-target');
    if (!target) return;
    if (selected) {
      const names = rowOf(selected.id, project).map((id) => project.furniture.find((c) => c.id === id)?.name);
      target.textContent = `Nowy element obejmie zaznaczony korpus i sąsiadów w rzędzie: ${names.join(', ')}.`;
    } else {
      target.textContent = project.furniture.length
        ? 'Nic nie jest zaznaczone — nowy element obejmie wszystkie korpusy.'
        : 'Najpierw dodaj korpus w zakładce „Meble”.';
    }
  }

  // --- zdarzenia ---
  const updateCabinet = (id, fn) =>
    store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === id ? fn(c) : c)) }));
  // Zmiana blendy / panelu bocznego — korpusy w pełnym rzędzie robią jej miejsce (model/layout.js).
  const updateCabinetRow = (id, fn) => store.set((p) => updateCabinetKeepingRow(p, id, fn));

  root.addEventListener('input', (e) => {
    const input = e.target;
    // Kolor (niezależny od materiału): blendy boczne korpusu albo blenda wspólna / blat.
    const color = readColorInput(input);
    if (color) {
      const sideId = input.closest('[data-kind="side-blends"]')?.dataset.id;
      const trimId = input.closest('[data-kind="trim"]')?.dataset.id;
      if (sideId) updateCabinet(sideId, (c) => setPath(c, color.path, color.value));
      else if (trimId) updateTrim(trimId, (t) => setPath(t, color.path, color.value));
      return;
    }
    const cabinetId = input.closest('[data-kind="side-blends"]')?.dataset.id;
    if (cabinetId && input.dataset.f) {
      let value = input.value;
      if (input.type === 'checkbox') value = input.checked;
      else if (input.type === 'number') {
        value = readNumberInput(input);
        if (value === undefined) return;
      }
      const project = store.get(); // do szerokości nowej blendy (wolne miejsce obok korpusu)
      updateCabinetRow(cabinetId, (c) => setSideBlendField(c, input.dataset.f, value, project));
      return;
    }
    const id = input.closest('[data-kind="trim"]')?.dataset.id;
    if (!id) return;
    // blat: frezy krawędzi i otwory
    const feature = readFeatureInput(input);
    if (feature) {
      updateTrim(id, (t, p) => {
        const cb = trimBox(t, p);
        return applyFeatureChange(t, feature, cb?.width ?? 1000, cb?.depth ?? 600, setPath);
      });
      return;
    }
    if (input.dataset.bf || input.dataset.bfAdd !== undefined) return;
    if (input.dataset.trimCabinet) {
      const cabId = input.dataset.trimCabinet;
      updateTrim(id, (t, p) => ({
        ...t,
        // zachowujemy kolejność korpusów z projektu
        cabinetIds: p.furniture.map((c) => c.id).filter((cid) => (cid === cabId ? input.checked : t.cabinetIds.includes(cid))),
      }));
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
    }
    updateTrim(id, (t) => ({ ...t, [field]: value }));
  });

  // Po opuszczeniu pola z błędną wartością przywracamy ostatnią poprawną.
  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number') return;
    // Wyczyszczone pole automatyczne (np. długość blatu) wraca do wartości automatycznej.
    const autoKey = input.closest('[data-auto]')?.dataset.auto;
    const autoTrimId = input.closest('[data-kind="trim"]')?.dataset.id;
    if (autoKey && autoTrimId && input.value.trim() === '') {
      input.classList.remove('invalid');
      updateTrim(autoTrimId, (t) => ({ ...t, [autoKey]: null }));
      return;
    }
    // Wyczyszczona szerokość blendy bocznej wraca do automatycznej.
    const sideCabinet = input.closest('[data-kind="side-blends"]')?.dataset.id;
    if (sideCabinet && input.closest('[data-side-auto]') && input.value.trim() === '') {
      input.classList.remove('invalid');
      updateCabinetRow(sideCabinet, (c) => setPath(c, input.dataset.f, null));
      return;
    }
    if (commitEmptyAsZero(input)) return;
    if (!input.classList.contains('invalid') && input.value.trim() !== '') return;
    input.classList.remove('invalid');
    const cabinetId = input.closest('[data-kind="side-blends"]')?.dataset.id;
    if (cabinetId) {
      const c = store.get().furniture.find((x) => x.id === cabinetId);
      if (c) input.value = input.dataset.f.split('.').reduce((o, k) => o?.[k], c);
      return;
    }
    const trim = store.get().trims.find((t) => t.id === input.closest('[data-kind="trim"]')?.dataset.id);
    if (trim) input.value = trimValue(trim, input.dataset.f, store.get());
  });

  root.addEventListener('click', (e) => {
    if (cardCollapse.handleClick(e.target)) return;
    const data = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="trim"]')?.dataset.id;
    const cabinetId = e.target.closest('[data-kind="side-blends"]')?.dataset.id;
    const featureClick = id && readFeatureClick(e.target);
    if (featureClick) {
      updateTrim(id, (t, p) => {
        const cb = trimBox(t, p);
        return applyFeatureChange(t, featureClick, cb?.width ?? 1000, cb?.depth ?? 600, setPath);
      });
      return;
    }
    if (data.resetSideField && data.side && cabinetId) {
      updateCabinetRow(cabinetId, (c) => setPath(c, `sideBlends.${data.side}.${data.resetSideField}`, null));
    } else if (data.resetSideWidth && cabinetId) {
      updateCabinetRow(cabinetId, (c) => setPath(c, `sideBlends.${data.resetSideWidth}.width`, null));
    } else if (data.toggleSideHidden && cabinetId) {
      const side = data.toggleSideHidden;
      updateCabinet(cabinetId, (c) => setPath(c, `sideBlends.${side}.hidden`, !c.sideBlends?.[side]?.hidden));
    } else if (data.addTrim) {
      const project = store.get();
      const selectedId = ui.get().selectedId;
      const ids = selectedId ? rowOf(selectedId, project) : project.furniture.map((c) => c.id);
      store.set((p) => ({ ...p, trims: [...p.trims, createTrim(data.addTrim, ids, p)] }));
    } else if (data.removeTrim !== undefined && id) {
      store.set((p) => ({ ...p, trims: p.trims.filter((t) => t.id !== id) }));
    } else if (data.toggleTrimHidden !== undefined && id) {
      updateTrim(id, (t) => ({ ...t, hidden: !t.hidden }));
    } else if (data.resetTrimField && id) {
      updateTrim(id, (t) => ({ ...t, [data.resetTrimField]: null }));
    }
  });

  // Klik w kartę blatu / blendy dolnej lub górnej — zaznacza ten element (także w 3D), jak klik w niego w widoku.
  // Wiersz otworu zaznacza sam otwór (main.js), zwijanie / przeciąganie karty niczego nie zaznacza.
  root.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-kind="trim"]');
    if (!card || e.target.closest('.bf-hole, [data-collapse-card], [data-drag-card]')) return;
    const pick = `trim:${card.dataset.id}`;
    const state = ui.get();
    if (state.selectedBlends?.length === 1 && state.selectedBlends[0] === pick && !state.selectedId) return;
    ui.set(
      { ...state, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [pick], selectedHole: null, selectedObstacle: null },
      { fromPanel: true }, // karta jest już widoczna — bez przewijania (main.js)
    );
  });

  // Zmiana kolejności kart (blaty między blatami, blendy dolne między blendami…) przeciąganiem za uchwyt ⠿.
  attachDragReorder(root, 'trim', (moved, target, after) => store.set((p) => ({ ...p, trims: moveInList(p.trims, moved, target, after) })));

  render(store.get());

  return {
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else {
        updateStatus(project);
        syncSelection();
      }
    },
    syncSelection,
    // Przewija do pierwszego elementu obejmującego korpus (z karty korpusu: „Edytuj →”).
    reveal(cabinetId) {
      syncSelection();
      const card = root.querySelector(`[data-kind="side-blends"][data-id="${cabinetId}"]`);
      cardCollapse.expand(card); // karta mogła być zwinięta
      card?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    // Przewija do karty blendy wspólnej / blatu (po zaznaczeniu jej w 3D) i ją rozwija.
    revealTrim(trimId) {
      syncSelection();
      const card = root.querySelector(`[data-kind="trim"][data-id="${trimId}"]`);
      cardCollapse.expand(card);
      card?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  };
}

