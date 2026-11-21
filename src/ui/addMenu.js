// Przycisk „+ Dodaj ▾” na pasku narzędzi: korpus, półka, blat, blendy, przeszkody — lista budowana z przycisków
// dodawania w panelach (klik w pozycję = klik w ten przycisk, więc działa tak samo, także gdy panel jest zwinięty).
const GROUPS = [
  { title: 'Meble', selector: '#furniture-panel [data-action="add-cabinet"]' },
  { title: 'Blaty i półki', selector: '#boards-panel [data-board-add], #worktop-trims-panel [data-add-trim]' },
  { title: 'Blendy', selector: '#trims-panel [data-add-trim]' },
  { title: 'Przeszkody w pokoju', selector: '#space-panel [data-add-obstacle]' },
];

export function initAddMenu(toolbar) {
  const anchor = toolbar.querySelector('.group');
  const menu = document.createElement('details');
  menu.className = 'group add-menu';
  menu.innerHTML = '<summary title="Dodaj korpus, półkę, blat, blendę albo przeszkodę"><svg class="add-ico" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5.8v8.4M5.8 10h8.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Dodaj ▾</summary><div class="add-menu-list"></div>';
  anchor?.after(menu);
  const list = menu.querySelector('.add-menu-list');
  let sources = [];
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    sources = [];
    list.innerHTML = GROUPS.map((g) => {
      const btns = [...document.querySelectorAll(g.selector)];
      if (!btns.length) return '';
      return `<div class="add-menu-title">${g.title}</div>` + btns
        .map((b) => {
          sources.push(b);
          const label = b.textContent.replace(/^\s*\+\s*/, '').trim();
          return `<button type="button" data-add-src="${sources.length - 1}" title="${(b.title || '').replace(/"/g, '&quot;')}">${label}</button>`;
        })
        .join('');
    }).join('');
  });
  list.addEventListener('click', (e) => {
    const i = e.target.closest('[data-add-src]')?.dataset.addSrc;
    if (i == null) return;
    menu.open = false;
    sources[Number(i)]?.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}
