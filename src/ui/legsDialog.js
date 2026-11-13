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
      <h2 id="legs-dialog-title"></h2>
      <p class="welcome-note legs-dialog-text"></p>
      <p class="welcome-note legs-dialog-count"></p>
      <div class="welcome-actions">
        <button type="button" data-legs="cancel">Anuluj</button>
        <button type="button" data-legs="shift"></button>
        <button type="button" class="primary" data-legs="keep">Zachowaj wysokość zabudowy</button>
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
    $('#legs-dialog-title').textContent = adding ? 'Dodać nóżki' : 'Usunąć nóżki';
    $('.legs-dialog-text').textContent = adding
      ? `Nóżki ${legHeight} mm podnoszą korpus. Zachować obecną wysokość zabudowy (korpus będzie niższy ` +
        `o ${legHeight} mm), czy cała zabudowa ma być wyższa o ${legHeight} mm? ` +
        'Jeśli zabudowa nie zmieści się pod sufitem, korpus zniży się tyle, ile trzeba.'
      : `Bez nóżek korpus opuści się o ${legHeight} mm. Zachować obecną wysokość zabudowy (korpus będzie ` +
        `wyższy o ${legHeight} mm), czy cała zabudowa ma być niższa o ${legHeight} mm?`;
    $('.legs-dialog-count').textContent = count > 1 ? `Dotyczy ${count} korpusów połączonych łańcuszkiem.` : '';
    $('.legs-dialog-count').hidden = count <= 1;
    $('[data-legs="shift"]').textContent = `Zabudowa ${adding ? 'wyższa' : 'niższa'} o ${legHeight} mm`;
    overlay.hidden = false;
    $('[data-legs="keep"]').focus();
    return new Promise((r) => (resolve = r));
  }

  return { ask };
}
