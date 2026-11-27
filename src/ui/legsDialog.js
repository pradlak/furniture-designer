import { t } from '../i18n.js';
// Okienko po dodaniu / usunięciu nóżek: czy zabudowa ma być wyższa / niższa o nóżki, czy zachować
// swoją wysokość (korpus niższy / wyższy o nóżki).
// ask({ legHeight, adding, count }) → Promise<'shift' | 'keep' | null> (null — anulowano);
// count — ilu korpusów dotyczy zmiana (więcej niż 1, gdy łańcuszek przy nóżkach jest włączony).
export function createLegsDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome legs-dialog" role="dialog" aria-modal="true" aria-labelledby="legs-dialog-title">
      <div class="ui-h2" role="heading" aria-level="2" id="legs-dialog-title"></div>
      <p class="welcome-note legs-dialog-text"></p>
      <p class="welcome-note legs-dialog-count"></p>
      <div class="welcome-actions">
        <button type="button" data-legs="cancel">${t('Anuluj')}</button>
        <button type="button" data-legs="shift"></button>
        <button type="button" class="primary" data-legs="keep">${t('Zachowaj wysokość zabudowy')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let resolve = null;
  const finish = (result) => {
    overlay.hidden = true;
    resolve?.(result);
    resolve = null;
  };

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-legs]')?.dataset.legs;
    if (e.target === overlay || action === 'cancel') finish(null);
    else if (action === 'shift' || action === 'keep') finish(action);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) finish(null);
  });

  function ask({ legHeight, adding, count }) {
    const $ = (sel) => overlay.querySelector(sel);
    $('#legs-dialog-title').textContent = adding ? t('Dodać nóżki') : t('Usunąć nóżki');
    $('.legs-dialog-text').textContent = adding
      ? t('Nóżki {h} mm podnoszą korpus. Zachować obecną wysokość zabudowy (korpus będzie niższy o {h} mm), czy cała zabudowa ma być wyższa o {h} mm? Jeśli zabudowa nie zmieści się pod sufitem, korpus zniży się tyle, ile trzeba.', { h: legHeight })
      : t('Bez nóżek korpus opuści się o {h} mm. Zachować obecną wysokość zabudowy (korpus będzie wyższy o {h} mm), czy cała zabudowa ma być niższa o {h} mm?', { h: legHeight });
    $('.legs-dialog-count').textContent = count > 1 ? t('Dotyczy {n} korpusów połączonych łańcuszkiem.', { n: count }) : '';
    $('.legs-dialog-count').hidden = count <= 1;
    $('[data-legs="shift"]').textContent = adding ? t('Zabudowa wyższa o {h} mm', { h: legHeight }) : t('Zabudowa niższa o {h} mm', { h: legHeight });
    overlay.hidden = false;
    $('[data-legs="keep"]').focus();
    return new Promise((r) => (resolve = r));
  }

  return { ask };
}
