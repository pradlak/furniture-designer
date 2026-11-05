import { panelCutSize, defaultEdges } from '../model/furniture.js';
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
} from '../model/trims.js';
import { trimMaterial } from '../model/materials.js';
import { escapeHtml, numberField, readNumberInput, setIfNotFocused, round1, commitEmptyAsZero } from './dom.js';
import { setEye, materialSelect } from './widgets.js';
import { renderSideBlendCard, updateSideBlendCard } from './sideBlends.js';
import { setPath } from '../model/furniture.js';

// Zakładka „Blendy i blaty”: elementy, które mogą obejmować kilka korpusów — blendy dolne,
// blendy górne i blaty. To jedyne miejsce ich edycji (karta korpusu tylko pokazuje, co go obejmuje).

const GROUPS = [
  {
    type: 'plinth',
    title: 'Blendy dolne',
    add: '+ Blenda dolna',
    hint:
      'Zasłania nóżki: wysokość = nóżki − 5 mm (bez nóżek 80 mm), cofnięta od frontu, dochodzi do paneli bocznych. ' +
      'Zapas na docięcie = zapas blendy bocznej skrajnego korpusu + dodatkowy zapas blendy dolnej.',
  },
  {
    type: 'topBlend',
    title: 'Blendy górne',
    add: '+ Blenda górna',
    hint: 'W płaszczyźnie frontu przy górnej krawędzi korpusu; front pod nią = korpus − blenda − szczelina.',
  },
  {
    type: 'countertop',
    title: 'Blaty',
    add: '+ Blat',
    hint: 'Leży na korpusach, z przodu wysunięty (domyślnie 30 mm od frontu), domyślnie od ściany do ściany.',
  },
];

const AUTO_TITLES = {
  height: 'Automatycznie: nóżki − 5 mm (bez nóżek 80 mm)',
  x: 'Automatycznie: do ściany albo sąsiedniego mebla',
  length: 'Automatycznie: do ścian albo sąsiednich mebli',
  depth: 'Automatycznie: od pleców do frontu + wysunięcie',
};

// Wartość pola do wyświetlenia (dla pól automatycznych — wyliczona).
const trimValue = (t, field, project) => {
  const v = trimFieldValue(t, field, project);
  return typeof v === 'number' ? round1(v) : v;
};

export function createTrimsPanel(root, store, ui) {
  let renderedKey = null;
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
      <h2>Blendy i blaty</h2>
      <h3>Blendy boczne</h3>
      <p class="hint">Po bokach korpusu: blenda boczna — pas z przodu przy ścianie (opcjonalnie z panelem przy ścianie),
        panel na pełną wysokość albo cokół boczny. Każdy korpus ma swoją kartę.</p>
      <div class="items">
        ${project.furniture.map(renderSideBlendCard).join('') || '<p class="empty">Brak korpusów.</p>'}
      </div>

      <p class="hint">Blendy dolne, górne i blaty mogą obejmować kilka korpusów — w karcie zaznacz, które.</p>
      <p class="hint add-target"></p>
      ${GROUPS.map(
        (g) => `
        <h3>${g.title}</h3>
        <p class="hint">${g.hint}</p>
        <div class="items">
          ${project.trims.filter((t) => t.type === g.type).map((t) => renderTrim(t, project)).join('') || '<p class="empty">Brak.</p>'}
        </div>
        <div class="add-row"><button type="button" data-add-trim="${g.type}">${g.add}</button></div>`,
      ).join('')}
    `;
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
      ],
      countertop: [
        field('Wysunięcie z przodu', 'overhang', { min: -500, max: 1000 }),
        `<label class="check small front-check" title="Wysunięcie liczone od przedniej powierzchni frontu (dodaje grubość frontu)">
          <input type="checkbox" data-f="includeFront" /> licz od frontu
        </label>`,
        field('Od lewej (X)', 'x', { min: -20000 }),
        field('Długość', 'length'),
        field('Głębokość', 'depth'),
      ],
    }[t.type];
    return `
      <div class="item trim ${t.type}" data-kind="trim" data-id="${t.id}">
        <div class="item-head">
          <input type="text" data-f="name" value="${escapeHtml(t.name)}" aria-label="Nazwa" />
          <button type="button" class="eye" data-toggle-trim-hidden>👁</button>
          <button type="button" class="danger" data-remove-trim title="Usuń">✕</button>
        </div>
        <div class="trim-cabinets">
          <span>Obejmuje:</span>
          ${
            project.furniture
              .map(
                (c) => `
            <label class="check small">
              <input type="checkbox" data-trim-cabinet="${c.id}" />
              <span class="cab-name" data-cab-name="${c.id}">${escapeHtml(c.name)}</span>
            </label>`,
              )
              .join('') || '<span>brak korpusów</span>'
          }
        </div>
        <div class="grid-3">
          ${fields.join('')}
          ${materialSelect('Materiał', 'materialId', project)}
        </div>
        <p class="trim-size"></p>
        <p class="allowance-note trim-allowance"></p>
        <ul class="issues"></ul>
      </div>`;
  }

  // Odświeża wartości, wymiary formatek i ostrzeżenia bez przebudowy DOM.
  function updateStatus(project) {
    for (const c of project.furniture) {
      const el = root.querySelector(`[data-kind="side-blends"][data-id="${c.id}"]`);
      if (el) updateSideBlendCard(el, c, project);
    }
    for (const t of project.trims) {
      const el = root.querySelector(`[data-kind="trim"][data-id="${t.id}"]`);
      if (!el) continue;
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

      const box = trimBox(t, project);
      const allowance = box ? trimAllowance(t, project) : { min: 0, max: 0 };
      let size = '';
      const segments = trimSegments(t, project);
      if (segments.length) {
        // Formatki odcinków: długość × szerokość × grubość (zapas — na skrajnych odcinkach);
        // do cięcia — pomniejszone o obrzeże.
        const cuts = segments.map((seg, i) =>
          panelCutSize({
            ...seg,
            material: trimMaterial(t, project),
            edges: defaultEdges(t.type),
            allowanceMin: i === 0 ? allowance.min : 0,
            allowanceMax: i === segments.length - 1 ? allowance.max : 0,
          }),
        );
        const dims = (c) => `${round1(c.length)} × ${round1(c.width)} × ${round1(c.thickness)}`;
        size =
          cuts.length > 1
            ? `Formatki (${cuts.length} szt. — podzielona przy panelach bocznych): ${cuts.map(dims).join(', ')} mm`
            : `Formatka: ${dims(cuts[0])} mm`;
        if (t.type === 'countertop' && t.depth == null) {
          size += ` · wystaje przed korpus: ${round1(countertopOverhang(t, project))} mm`;
        }
        if (cuts[0].band) size += ` · do cięcia: ${cuts.map((c) => `${round1(c.cutLength)} × ${round1(c.cutWidth)}`).join(', ')} mm`;
      }
      if (t.type === 'topBlend') {
        const fronts = [...new Set(frontHeightsUnder(t, project).map((f) => round1(f.height)))];
        if (fronts.length) size += ` · front pod blendą: ${fronts.join(' / ')} mm`;
      }
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
      el.querySelector('.issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    }
  }

  // Podświetlamy elementy obejmujące zaznaczony korpus i podpowiadamy, co obejmie nowy element.
  function syncSelection() {
    const project = store.get();
    const selected = project.furniture.find((c) => c.id === ui.get().selectedId);
    root.querySelectorAll('[data-kind="trim"]').forEach((el) => {
      const t = project.trims.find((x) => x.id === el.dataset.id);
      el.classList.toggle('related', !!(selected && t?.cabinetIds.includes(selected.id)));
    });
    root.querySelectorAll('[data-kind="side-blends"]').forEach((el) => {
      el.classList.toggle('related', el.dataset.id === selected?.id);
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

  root.addEventListener('input', (e) => {
    const input = e.target;
    const cabinetId = input.closest('[data-kind="side-blends"]')?.dataset.id;
    if (cabinetId && input.dataset.f) {
      let value = input.value;
      if (input.type === 'checkbox') value = input.checked;
      else if (input.type === 'number') {
        value = readNumberInput(input);
        if (value === undefined) return;
      }
      updateCabinet(cabinetId, (c) => setPath(c, input.dataset.f, value));
      return;
    }
    const id = input.closest('[data-kind="trim"]')?.dataset.id;
    if (!id) return;
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
      updateCabinet(sideCabinet, (c) => setPath(c, input.dataset.f, null));
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
    const data = e.target.dataset ?? {};
    const id = e.target.closest('[data-kind="trim"]')?.dataset.id;
    const cabinetId = e.target.closest('[data-kind="side-blends"]')?.dataset.id;
    if (data.resetSideField && data.side && cabinetId) {
      updateCabinet(cabinetId, (c) => setPath(c, `sideBlends.${data.side}.${data.resetSideField}`, null));
    } else if (data.resetSideWidth && cabinetId) {
      updateCabinet(cabinetId, (c) => setPath(c, `sideBlends.${data.resetSideWidth}.width`, null));
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
      root.querySelector(`[data-kind="side-blends"][data-id="${cabinetId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  };
}

