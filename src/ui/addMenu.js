// Przycisk „+ Dodaj ▾” na pasku narzędzi: korpus, półka, blat, blendy, przeszkody — lista budowana z przycisków
// dodawania w panelach (klik w pozycję = klik w ten przycisk, więc działa tak samo, także gdy panel jest zwinięty).
const GROUPS = [
  { title: 'Meble', selector: '#furniture-panel [data-action="add-cabinet"]' },
  { title: 'Blaty i półki', selector: '#boards-panel [data-board-add], #worktop-trims-panel [data-add-trim]' },
  { title: 'Blendy', selector: '#trims-panel [data-add-trim]' },
  { title: 'Przeszkody w pokoju', selector: '#space-panel [data-add-obstacle]' },
];

// extra — dodatkowe podmenu: [{ title, search?, items?: [{ label, run, keywords? }], groups?: [{ title, items }] }]
// (np. dekoracje — z kategoriami i wyszukiwarką)
export function initAddMenu(toolbar, { extra = [] } = {}) {
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
    }).join('') + extra
      // dodatkowe podmenu (np. dekoracje) — zwinięte; w środku wyszukiwarka i zwijane kategorie
      .map((g, gi) => {
        const groups = g.groups ?? [{ title: '', items: g.items ?? [] }];
        const btn = (it, ci, i) => `<button type="button" data-add-extra="${gi}:${ci}:${i}" data-kw="${(it.keywords ?? it.label).toLowerCase().replace(/"/g, '')}">${it.label}</button>`;
        const cats = groups
          .map((c, ci) =>
            c.title
              ? `<details class="add-cat"><summary>${c.title} <small>${c.items.length}</small></summary><div class="add-sub-list">${c.items.map((it, i) => btn(it, ci, i)).join('')}</div></details>`
              : `<div class="add-sub-list">${c.items.map((it, i) => btn(it, ci, i)).join('')}</div>`,
          )
          .join('');
        if (!g.title) return `<div class="add-menu-sep"></div>${groups[0].items.map((it, i) => btn(it, 0, i)).join('')}`; // (zwykłe pozycje)
        return `<details class="add-sub"><summary>${g.title}</summary><div class="add-sub-body">${g.search ? '<input type="search" class="add-search" placeholder="Szukaj…" aria-label="Szukaj" />' : ''}${cats}<p class="add-none" hidden>Nic nie znaleziono.</p></div></details>`;
      })
      .join('');
  });
  list.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-add-extra]')?.dataset.addExtra;
    if (ex) {
      menu.open = false;
      const [g, c, i] = ex.split(':').map(Number);
      const grp = extra[g];
      (grp?.groups ? grp.groups[c]?.items[i] : grp?.items?.[i])?.run();
      return;
    }
    const i = e.target.closest('[data-add-src]')?.dataset.addSrc;
    if (i == null) return;
    menu.open = false;
    sources[Number(i)]?.click();
  });
  // podmenu / kategorie — naraz otwarte jedno na danym poziomie (okienka obok siebie)
  list.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!d.open || !d.matches?.('.add-sub, .add-cat') || d.closest('.searching')) return;
      d.parentElement.querySelectorAll(':scope > details[open]').forEach((x) => x !== d && (x.open = false));
    },
    true,
  );
  list.addEventListener('input', (e) => {
    if (!e.target.classList.contains('add-search')) return;
    const q = e.target.value.trim().toLowerCase();
    const body = e.target.closest('.add-sub-body');
    body.classList.toggle('searching', !!q); // wyniki wyszukiwania — w jednej liście (bez okienek kategorii)
    let any = false;
    body.querySelectorAll('[data-add-extra]').forEach((b) => {
      const ok = !q || b.dataset.kw.includes(q);
      b.hidden = !ok;
      any ||= ok;
    });
    body.querySelectorAll('.add-cat').forEach((cat) => {
      const has = [...cat.querySelectorAll('[data-add-extra]')].some((b) => !b.hidden);
      cat.hidden = !has;
      cat.open = !!q && has;
    });
    body.querySelector('.add-none').hidden = any;
  });
  // (Enter w wyszukiwarce — pierwsza znaleziona pozycja)
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('add-search')) return;
    e.preventDefault();
    e.target.closest('.add-sub-body').querySelector('[data-add-extra]:not([hidden])')?.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}
