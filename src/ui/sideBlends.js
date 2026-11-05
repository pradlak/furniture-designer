import { SIDE_BLEND_TYPES, CABINET_LIMITS, sidePanelExtension, getPath } from '../model/furniture.js';
import { escapeHtml, setIfNotFocused } from './dom.js';
import { setEye } from './widgets.js';

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
        <label class="field small">
          <span>Szerokość blendy <small>mm</small></span>
          <input type="number" step="1" min="1" max="${CABINET_LIMITS.sizeMax}" data-f="sideBlends.${side}.width" />
        </label>
        <label class="check small" title="Panel na pełną wysokość za blendą boczną, przylegający do ściany">
          <input type="checkbox" data-f="sideBlends.${side}.wallPanel" /> + panel przy ścianie
        </label>
        <label class="field small allowance-field" title="Blenda boczna dłuższa o zapas w stronę ściany — do docięcia na miejscu. Blenda dolna wydłuża się razem z nią. Zapas nie powoduje kolizji.">
          <span>Zapas na docięcie <small>mm</small></span>
          <input type="number" step="1" min="0" max="500" data-f="sideBlends.${side}.allowance" />
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

export function renderSideBlendCard(cabinet) {
  return `
    <div class="item side-blends" data-kind="side-blends" data-id="${cabinet.id}">
      <div class="item-head">
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

  for (const side of ['left', 'right']) {
    const sb = cabinet.sideBlends?.[side];
    const box = el.querySelector(`.side-blend[data-side="${side}"]`);
    const isFiller = sb?.type === 'filler';
    const canExtend = sb?.type === 'full' || isFiller;
    box.querySelector('.filler-opts').hidden = !isFiller;
    box.querySelector('.panel-opts').hidden = !canExtend;
    const extend = box.querySelector(`[data-f="sideBlends.${side}.extend"]`);
    extend.disabled = !!sb?.flushFront;
    if (canExtend && sb.flushFront) extend.value = sidePanelExtension(cabinet, side, project); // wartość wyliczona
    const eye = box.querySelector('[data-toggle-side-hidden]');
    eye.hidden = !sb || sb.type === 'none';
    setEye(eye, sb?.hidden, 'blendę');
    box.classList.toggle('is-hidden', !!sb?.hidden);
  }
}
