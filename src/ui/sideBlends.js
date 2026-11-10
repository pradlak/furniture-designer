import { SIDE_BLEND_TYPES, CABINET_LIMITS, sidePanelExtension, sideBlendWidth, getPath, cabinetReachesTop } from '../model/furniture.js';
import { escapeHtml, setIfNotFocused, round1 } from './dom.js';
import { setEye } from './widgets.js';
import { COLLAPSE_BUTTON } from './collapsible.js';

// Blendy boczne korpusu (lewa i prawa): blenda boczna (przy ścianie), panel na pełną wysokość, cokół boczny.
// Edytowane w zakładce „Blendy i blaty” — po jednej karcie na korpus.

const SIDE_LABEL = { left: 'Lewa', right: 'Prawa' };

// Krótki opis, np. „L: blenda + panel · P: panel” (pusty, gdy korpus nie ma blend bocznych).
export function sideBlendSummary(cabinet) {
  return ['left', 'right']
    .map((side) => {
      const sb = cabinet.sideBlends?.[side];
      const name = { plinth: 'cokół boczny', full: 'panel', filler: sb?.wallPanel ? 'blenda + panel' : 'blenda' }[sb?.type];
      return name && `${side === 'left' ? 'L' : 'P'}: ${name}${sb.hidden ? ' (ukryta)' : ''}`;
    })
    .filter(Boolean)
    .join(' · ');
}

// Głębokość panelu (przy ścianie / na pełną wysokość) — skracanie od tyłu; puste = pełna głębokość.
function panelDepthField(side, field, cls, title) {
  return `
    <label class="field small ${cls}" data-side-auto="${field}" title="${title}">
      <span>Głębokość panelu <small class="auto-tag">pełna</small>
        <button type="button" class="icon tiny" data-reset-side-field="${field}" data-side="${side}" title="Pełna głębokość korpusu">↺</button>
      </span>
      <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="sideBlends.${side}.${field}" />
    </label>`;
}

// Odświeża pole głębokości panelu: widoczność, znacznik „pełna” i wyliczoną pełną głębokość.
function updatePanelDepth(label, visible, value, fullDepth) {
  label.hidden = !visible;
  const isFull = value == null;
  label.querySelector('.auto-tag').hidden = !isFull;
  label.querySelector('[data-reset-side-field]').hidden = isFull;
  const input = label.querySelector('input');
  if (isFull && !input.classList.contains('invalid')) setIfNotFocused(input, round1(fullDepth));
}

// Jedna strona. Widoczne są tylko opcje pasujące do wariantu (patrz updateSideBlendCard).
function sideFields(side) {
  return `
    <div class="side-blend" data-side="${side}">
      <div class="side-blend-head">
        <label class="field small">
          <span>${SIDE_LABEL[side]}</span>
          <select data-f="sideBlends.${side}.type">
            ${SIDE_BLEND_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="icon eye" data-toggle-side-hidden="${side}">👁</button>
      </div>
      <div class="grid-2 filler-opts">
        <label class="field small" data-side-auto="width">
          <span>Szerokość blendy <small class="auto-tag">auto</small>
            <button type="button" class="icon tiny" data-reset-side-width="${side}" title="Automatycznie: wypełnia miejsce do ściany / sąsiada (minus panel przy ścianie)">↺</button>
          </span>
          <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="sideBlends.${side}.width" />
        </label>
        <label class="check small" title="Panel na pełną wysokość za blendą boczną, przylegający do ściany">
          <input type="checkbox" data-f="sideBlends.${side}.wallPanel" /> + panel przy ścianie
        </label>
        ${panelDepthField(side, 'wallPanelDepth', 'wall-panel-depth', 'Panel jest widoczny głównie z przodu — można go skrócić od tyłu (oszczędność materiału)')}
        <label class="field small allowance-field" title="Blenda boczna dłuższa o zapas w stronę ściany — do docięcia na miejscu. Blenda dolna wydłuża się razem z nią. Zapas nie powoduje kolizji.">
          <span>Zapas na docięcie <small>mm</small></span>
          <input type="number" step="1" min="0" max="500" data-f="sideBlends.${side}.allowance" />
        </label>
      </div>
      <div class="grid-2 panel-opts">
        <label class="check small" title="Wysunięcie o grubość blendy górnej (albo frontu), żeby licowało z frontem">
          <input type="checkbox" data-f="sideBlends.${side}.flushFront" /> wysuń do linii frontu
        </label>
        <label class="check small to-ceiling" title="Blenda i panele górą do sufitu albo skosu (docięte pod kąt skosu, z luzem do skosu). Działa, gdy korpus sam sięga sufitu lub skosu; odznaczone — wysokość korpusu.">
          <input type="checkbox" data-f="sideBlends.${side}.toCeiling" /> do sufitu / skosu
        </label>
        <label class="field small">
          <span>Wysunięcie <small>mm</small></span>
          <input type="number" step="1" min="0" max="500" data-f="sideBlends.${side}.extend" />
        </label>
        ${panelDepthField(side, 'fullPanelDepth', 'full-panel-depth', 'Panel można skrócić od tyłu, jeśli jego tylna część jest niewidoczna')}
      </div>
    </div>`;
}

export function renderSideBlendCard(cabinet) {
  return `
    <div class="item side-blends" data-kind="side-blends" data-id="${cabinet.id}">
      <div class="item-head">
        ${COLLAPSE_BUTTON}
        <span class="side-blends-name">${escapeHtml(cabinet.name)}</span>
        <span class="side-blends-sum"></span>
      </div>
      <div class="side-blend-pair">${sideFields('left')}${sideFields('right')}</div>
    </div>`;
}

export function updateSideBlendCard(el, cabinet, project) {
  el.querySelector('.side-blends-name').textContent = cabinet.name;
  el.querySelector('.side-blends-sum').textContent = sideBlendSummary(cabinet) || 'brak';
  el.querySelectorAll('[data-f]').forEach((input) => {
    const value = getPath(cabinet, input.dataset.f);
    if (input.type === 'checkbox') input.checked = !!value;
    else if (!input.classList.contains('invalid')) setIfNotFocused(input, value);
  });
  // Cokół boczny ma sens tylko z nóżkami.
  el.querySelectorAll('option[value="plinth"]').forEach((opt) => (opt.disabled = !cabinet.legs?.enabled));

  const reachesTop = cabinetReachesTop(cabinet, project);
  for (const side of ['left', 'right']) {
    const sb = cabinet.sideBlends?.[side];
    const box = el.querySelector(`.side-blend[data-side="${side}"]`);
    const isFiller = sb?.type === 'filler';
    const canExtend = sb?.type === 'full' || isFiller;
    box.querySelector('.filler-opts').hidden = !isFiller;
    // Głębokość paneli: przy ścianie (gdy jest) i na pełną wysokość; „pełna” = głębokość korpusu + wysunięcie.
    const fullDepth = cabinet.depth + sidePanelExtension(cabinet, side, project);
    updatePanelDepth(box.querySelector('.wall-panel-depth'), isFiller && sb?.wallPanel, sb?.wallPanelDepth, fullDepth);
    updatePanelDepth(box.querySelector('.full-panel-depth'), sb?.type === 'full', sb?.fullPanelDepth, fullDepth);
    box.querySelector('.panel-opts').hidden = !canExtend;
    // „Do sufitu / skosu” ma sens tylko przy korpusie sięgającym sufitu lub skosu.
    const toCeiling = box.querySelector('.to-ceiling');
    toCeiling.querySelector('input').disabled = !reachesTop;
    toCeiling.classList.toggle('inactive', !reachesTop);
    toCeiling.title = reachesTop
      ? 'Blenda i panele górą do sufitu albo skosu (docięte pod kąt skosu, z luzem do skosu); odznaczone — wysokość korpusu.'
      : 'Korpus nie sięga sufitu ani skosu — blenda ma wysokość korpusu.';
    const extend = box.querySelector(`[data-f="sideBlends.${side}.extend"]`);
    extend.disabled = !!sb?.flushFront;
    if (canExtend && sb.flushFront) extend.value = sidePanelExtension(cabinet, side, project); // wartość wyliczona
    // Szerokość: dla automatycznej pokazujemy wartość wyliczoną.
    const widthInput = box.querySelector(`[data-f="sideBlends.${side}.width"]`);
    const isAuto = sb?.width == null;
    if (isAuto && !widthInput.classList.contains('invalid')) setIfNotFocused(widthInput, round1(sideBlendWidth(cabinet, side, project)));
    box.querySelector('[data-side-auto="width"] .auto-tag').hidden = !isAuto;
    box.querySelector('[data-reset-side-width]').hidden = isAuto;

    const eye = box.querySelector('[data-toggle-side-hidden]');
    eye.hidden = !sb || sb.type === 'none';
    setEye(eye, sb?.hidden, 'blendę');
    box.classList.toggle('is-hidden', !!sb?.hidden);
  }
}
