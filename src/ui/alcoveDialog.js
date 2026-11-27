import { escapeHtml } from './dom.js';
import { t } from '../i18n.js';

// Okienko „Do której wnęki dodać korpus?” — gdy występ ściany (np. kominek) dzieli przestrzeń na kilka wnęk.
// Każda wnęka to przycisk z małym rzutem z góry (wnęka wyróżniona) i opisem zajętości.
// ask(space, alcoves) → Promise<[od, do] | null> (null — anulowano); alcoves — z cabinetAlcoves (model/layout.js).
export function createAlcoveDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome alcove-dialog" role="dialog" aria-modal="true" aria-labelledby="alcove-dialog-title">
      <div class="ui-h2" role="heading" aria-level="2" id="alcove-dialog-title">${t('Do której wnęki dodać korpus?')}</div>
      <div class="alcove-options"></div>
      <div class="welcome-actions">
        <button type="button" data-alcove="cancel">${t('Anuluj')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let resolve = null;
  let current = [];
  const finish = (result) => {
    overlay.hidden = true;
    resolve?.(result);
    resolve = null;
  };

  overlay.addEventListener('click', (e) => {
    const choice = e.target.closest('[data-alcove]')?.dataset.alcove;
    if (e.target === overlay || choice === 'cancel') finish(null);
    else if (choice != null) finish(current[Number(choice)]?.segment ?? null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) finish(null);
  });

  const NAMES = { 2: [t('Lewa wnęka'), t('Prawa wnęka')], 3: [t('Lewa wnęka'), t('Środkowa wnęka'), t('Prawa wnęka')] };
  const nameOf = (i, n) => NAMES[n]?.[i] ?? t('Wnęka {n}', { n: i + 1 });
  const status = ({ count, free }) =>
    !count
      ? t('pusta')
      : free >= 200
        ? count === 1
          ? t('1 korpus, wolne {free} mm', { free })
          : t('{count} korpusy, wolne {free} mm', { count, free })
        : t('pełna — korpusy zwężą się, żeby zrobić miejsce');

  // Rzut z góry: cała szerokość, występy ścian (szare), wybrana wnęka (zielona).
  function sketch(space, alcoves, index) {
    const W = 120;
    const s = W / space.width;
    const rects = alcoves
      .map(({ segment: [a, b] }, i) => `<rect x="${a * s}" y="4" width="${(b - a) * s}" height="16" class="${i === index ? 'alcove-pick' : 'alcove-other'}" />`)
      .join('');
    return `<svg viewBox="-2 0 ${W + 4} 24" aria-hidden="true"><rect x="0" y="0" width="${W}" height="20" class="alcove-wall" />${rects}</svg>`;
  }

  function ask(space, alcoves) {
    current = alcoves;
    overlay.querySelector('.alcove-options').innerHTML = alcoves
      .map(
        (al, i) => `
        <button type="button" class="alcove-option" data-alcove="${i}">
          ${sketch(space, alcoves, i)}
          <span><b>${escapeHtml(nameOf(i, alcoves.length))}</b> · ${Math.round(al.segment[1] - al.segment[0])} mm
            <small>${escapeHtml(status(al))}</small></span>
        </button>`,
      )
      .join('');
    overlay.hidden = false;
    overlay.querySelector('.alcove-option')?.focus();
    return new Promise((r) => (resolve = r));
  }

  return { ask };
}
