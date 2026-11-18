import { escapeHtml } from './dom.js';

// Okienko „Do której wnęki dodać korpus?” — gdy występ ściany (np. kominek) dzieli przestrzeń na kilka wnęk.
// Każda wnęka to przycisk z małym rzutem z góry (wnęka wyróżniona) i opisem zajętości.
// ask(space, alcoves) → Promise<[od, do] | null> (null — anulowano); alcoves — z cabinetAlcoves (model/layout.js).
export function createAlcoveDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome alcove-dialog" role="dialog" aria-modal="true" aria-labelledby="alcove-dialog-title">
      <h2 id="alcove-dialog-title">Do której wnęki dodać korpus?</h2>
      <div class="alcove-options"></div>
      <div class="welcome-actions">
        <button type="button" data-alcove="cancel">Anuluj</button>
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

  const NAMES = { 2: ['Lewa wnęka', 'Prawa wnęka'], 3: ['Lewa wnęka', 'Środkowa wnęka', 'Prawa wnęka'] };
  const nameOf = (i, n) => NAMES[n]?.[i] ?? `Wnęka ${i + 1}`;
  const status = ({ count, free }) =>
    !count ? 'pusta' : free >= 200 ? `${count === 1 ? '1 korpus' : `${count} korpusy`}, wolne ${free} mm` : 'pełna — korpusy zwężą się, żeby zrobić miejsce';

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
