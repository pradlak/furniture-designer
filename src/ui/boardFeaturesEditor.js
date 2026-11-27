import { escapeHtml, setIfNotFocused, readNumberInput } from './dom.js';
import {
  EDGE_KEYS,
  EDGE_NAMES,
  EDGE_PROFILES,
  profileInfo,
  HOLE_PRESETS,
  HOLE_LIMITS,
  HOLE_POSITIONS,
  HOLE_FILLS,
  createHole,
  holeFits,
  resolveHole,
  setHolePosition,
} from '../model/boardFeatures.js';
import { t } from '../i18n.js';

// Edytor frezów krawędzi i otworów płyty (blat, półka) — wspólny dla samodzielnych płyt (zakładka Meble)
// i blatów na szafkach (oba w zakładce „Blaty i półki”).
// Pola mają data-bf="ścieżka" (np. edges.front.profile, holes.0.x) — zmianę odczytuje readFeatureInput.

export function renderBoardFeatures() {
  return `
    <div class="bf">
      <div class="bf-title">${t('Frezy krawędzi <small>(patrząc z góry)</small>')}</div>
      <div class="bf-edges">
        ${EDGE_KEYS.map(
          (k) => `
          <div class="bf-edge" data-edge="${k}">
            <span class="bf-edge-name">${EDGE_NAMES[k]}</span>
            <select data-bf="edges.${k}.profile" aria-label="${t('Frez krawędzi: {edge}', { edge: EDGE_NAMES[k] })}">
              ${EDGE_PROFILES.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')}
            </select>
            <label class="bf-size" title="${t('Rozmiar frezu: fazka — szerokość ścięcia, zaokrąglenie — promień R')}">
              <input type="number" step="0.5" min="0.5" max="50" data-bf="edges.${k}.size" aria-label="${t('Rozmiar frezu')}" />
              <small>mm</small>
            </label>
          </div>`,
        ).join('')}
      </div>
      <div class="bf-title">${t('Otwory <small>(środek: od lewej i od przedniej krawędzi)</small>')}</div>
      <div class="bf-holes"></div>
      <label class="field small bf-add">
        <select data-bf-add>
          <option value="">${t('+ Dodaj otwór…')}</option>
          ${HOLE_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')}
        </select>
      </label>
    </div>`;
}

const holeRow = (h, i) => `
  <div class="bf-hole" data-hole="${i}">
    <span class="bf-hole-name" title="${escapeHtml(h.label || '')}">${i + 1}. ${h.shape === 'circle' ? t('okrągły') : t('prostokątny')}${h.label ? ` <small>${escapeHtml(h.label)}</small>` : ''}</span>
    <label class="bf-hole-pos" title="${t('Róg albo środek krawędzi z odstępem (jak uchwyt na froncie) — otwór zostaje na miejscu po zmianie wymiarów płyty')}">
      ${t('położenie')}
      <select data-bf="holes.${i}.pos">
        ${HOLE_POSITIONS.map((p) => `<option value="${p.key ?? ''}">${escapeHtml(p.label)}</option>`).join('')}
      </select>
    </label>
    <label class="bf-gap" data-gap="x"><span></span> <input type="number" step="1" data-bf="holes.${i}.gx" /></label>
    <label class="bf-gap" data-gap="y"><span></span> <input type="number" step="1" data-bf="holes.${i}.gy" /></label>
    <span class="bf-break"></span>
    <label title="${t('Środek otworu od lewej krawędzi (wpisanie zmienia położenie na „własne”)')}">x <input type="number" step="1" data-bf="holes.${i}.x" /></label>
    <label title="${t('Środek otworu od przedniej krawędzi (wpisanie zmienia położenie na „własne”)')}">y <input type="number" step="1" data-bf="holes.${i}.y" /></label>
    ${
      h.shape === 'circle'
        ? `<label>Ø <input type="number" step="1" min="${HOLE_LIMITS.min}" max="${HOLE_LIMITS.max}" data-bf="holes.${i}.d" /></label>`
        : `<label>${t('szer.')} <input type="number" step="1" min="${HOLE_LIMITS.min}" max="${HOLE_LIMITS.max}" data-bf="holes.${i}.w" /></label>
           <label>${t('gł.')} <input type="number" step="1" min="${HOLE_LIMITS.min}" max="${HOLE_LIMITS.max}" data-bf="holes.${i}.h" /></label>
           <label>R <input type="number" step="1" min="0" max="500" data-bf="holes.${i}.r" /></label>
           <label class="bf-hole-fill" title="${t('Płyta grzewcza w otworze — widoczna w 3D (leży na blacie, 15 mm większa od wycięcia z każdej strony)')}">${t('w otworze')}
             <select data-bf="holes.${i}.fill">${HOLE_FILLS.map((f) => `<option value="${f.key ?? ''}">${escapeHtml(f.label)}</option>`).join('')}</select>
           </label>`
    }
    <button type="button" class="icon tiny danger" data-bf-remove="${i}" title="${t('Usuń otwór')}">✕</button>
    <span class="bf-hole-warn" hidden>${t('⚠ nie mieści się')}</span>
  </div>`;

// Odświeża pola edytora: wartości frezów i lista otworów (lista budowana na nowo, gdy zmieniła się liczba / rodzaje).
export function syncBoardFeatures(el, { edges, holes }, width, depth) {
  for (const k of EDGE_KEYS) {
    const e = edges?.[k] ?? { profile: 'none', size: 0 };
    const row = el.querySelector(`.bf-edge[data-edge="${k}"]`);
    if (!row) continue;
    setIfNotFocused(row.querySelector('select'), e.profile);
    const info = profileInfo(e.profile);
    const size = row.querySelector('.bf-size');
    size.hidden = !info.sizes.length;
    if (!size.querySelector('input').classList.contains('invalid')) setIfNotFocused(size.querySelector('input'), e.size);
  }
  const list = el.querySelector('.bf-holes');
  const sig = (holes ?? []).map((h) => h.shape + (h.label ?? '')).join('|');
  if (list.dataset.sig !== sig) {
    list.innerHTML = (holes ?? []).map(holeRow).join('') || `<p class="hint">${t('Brak otworów.')}</p>`;
    list.dataset.sig = sig;
  }
  (holes ?? []).forEach((h, i) => {
    const row = list.querySelector(`[data-hole="${i}"]`);
    if (!row) return;
    const shown = resolveHole(h, width, depth); // x, y wyliczone dla otworu w rogu / przy krawędzi
    row.querySelectorAll('[data-bf]').forEach((input) => {
      const key = input.dataset.bf.split('.')[2];
      if (key === 'pos') return setIfNotFocused(input, h.pos ?? '');
      if (!input.classList.contains('invalid')) setIfNotFocused(input, shown[key] ?? '');
    });
    // odstępy: tylko przy położeniu; opis zależy od krawędzi (przy środku — przesunięcie od środka)
    const [rowKey, colKey] = h.pos ?? '';
    const gapLabels = {
      x: { l: t('od lewej'), r: t('od prawej'), c: t('przesunięcie ←→') }[colKey],
      y: { f: t('od przodu'), b: t('od tyłu'), c: t('przesunięcie w głąb') }[rowKey],
    };
    row.querySelectorAll('.bf-gap').forEach((label) => {
      label.hidden = !h.pos;
      label.querySelector('span').textContent = gapLabels[label.dataset.gap] ?? '';
      label.title = label.dataset.gap === 'x' && colKey !== 'c' || label.dataset.gap === 'y' && rowKey !== 'c'
        ? t('Odstęp od krawędzi płyty do krawędzi otworu (mm)')
        : t('Przesunięcie środka otworu od środka płyty (mm)');
    });
    row.querySelector('.bf-hole-warn').hidden = holeFits(h, width, depth);
  });
}

// Zmiana w edytorze → { path, value } (do setPath na płycie / blacie) albo { add: presetKey } albo null.
export function readFeatureInput(input) {
  if (input.dataset.bfAdd !== undefined) {
    const key = input.value;
    input.value = '';
    return key ? { add: key } : null;
  }
  const path = input.dataset.bf;
  if (!path) return null;
  if (/^holes\.\d+\.pos$/.test(path)) return { holePos: Number(path.split('.')[1]), value: input.value || null };
  if (/^holes\.\d+\.fill$/.test(path)) return { path, value: input.value || null }; // płyta grzewcza w otworze
  if (input.tagName === 'SELECT') {
    // zmiana profilu: rozmiar — pierwszy typowy dla nowego profilu
    const info = profileInfo(input.value);
    return { path: path.replace(/\.profile$/, ''), value: { profile: info.key, size: info.sizes[0] ?? 0 } };
  }
  const value = readNumberInput(input);
  return value === undefined ? null : { path, value };
}

// Akcje przycisków (usunięcie otworu) → { remove: index } albo null.
export function readFeatureClick(target) {
  const btn = target.closest('[data-bf-remove]');
  return btn ? { remove: Number(btn.dataset.bfRemove) } : null;
}

// Zastosowanie zmiany do obiektu z edges / holes (płyta albo blat). width / depth — do położenia nowego otworu.
export function applyFeatureChange(obj, change, width, depth, setPath) {
  if (change.add) return { ...obj, holes: [...(obj.holes ?? []), createHole(change.add, width, depth)] };
  if (change.remove != null) return { ...obj, holes: (obj.holes ?? []).filter((_, i) => i !== change.remove) };
  if (change.holePos != null) {
    return { ...obj, holes: (obj.holes ?? []).map((h, i) => (i === change.holePos ? setHolePosition(h, change.value) : h)) };
  }
  // wpisane x / y — otwór przestaje być przypięty do rogu / krawędzi (położenie „własne”)
  const xy = /^holes\.(\d+)\.(x|y)$/.exec(change.path ?? '');
  if (xy) {
    const i = Number(xy[1]);
    const unpinned = { ...obj, holes: (obj.holes ?? []).map((h, j) => (j === i && h.pos ? { ...resolveHole(h, width, depth), pos: null } : h)) };
    return setPath(unpinned, change.path, change.value);
  }
  return setPath(obj, change.path, change.value);
}
