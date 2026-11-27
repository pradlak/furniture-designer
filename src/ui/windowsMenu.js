import { escapeHtml } from './dom.js';
import { t } from '../i18n.js';
import { selectedCabinetIds } from '../state/selection.js';

// Przyciski na górnym pasku do otwierania okienek po prawej:
//  - „🏠 Przestrzeń” — okienko przestrzeni (przełącza),
//  - „🗄️ Korpusy ▾” — lista korpusów (nazwa, wymiary); klik — zaznacza korpus i otwiera jego okienko; na dole „+ Korpus”.
export function initWindowsMenu(toolbar, store, ui, { openSpace }) {
  const anchor = toolbar.querySelector('.add-menu') ?? toolbar.querySelector('.group');
  const group = document.createElement('div');
  group.className = 'group windows-group';
  group.innerHTML = `
    <button type="button" class="win-btn" data-win-space title="${t('Okienko przestrzeni: wymiary pokoju, ściany, skosy, kolory, przeszkody')}">${t('🏠 Przestrzeń')}</button>
    <button type="button" class="win-btn" data-map-toggle title="${t('Pokaż / ukryj mapkę zabudowy')}">${t('🗺️ Mapka')}</button>
    <button type="button" class="win-btn" data-win-open="materials" title="${t('Materiały projektu: płyty, blaty, okleiny (okienko po prawej)')}">${t('🎨 Materiały')}</button>
    <button type="button" class="win-btn" data-win-open="notes" title="${t('Notatki projektu (okienko po prawej)')}">${t('📝 Notatki')}</button>
    <details class="win-menu">
      <summary class="win-btn" title="${t('Lista obiektów — klik otwiera okienko obiektu')}">${t('🗂️ Obiekty ▾')}</summary>
      <div class="win-menu-list"></div>
    </details>`;
  anchor?.after(group);
  const spaceBtn = group.querySelector('[data-win-space]');
  const menu = group.querySelector('.win-menu');
  const list = group.querySelector('.win-menu-list');
  spaceBtn.addEventListener('click', () => openSpace(!ui.get().spaceOpen));
  const sync = () => spaceBtn.classList.toggle('active', !!ui.get().spaceOpen);
  ui.subscribe(sync);
  sync();
  const TRIM_GROUPS = [
    ['countertop', t('Blaty na szafkach')],
    ['topBlend', t('Blendy górne')],
    ['plinth', t('Blendy dolne')],
  ];
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    const p = store.get();
    const st = ui.get();
    const sel = selectedCabinetIds(st);
    const picked = new Set(st.selectedBlends ?? []);
    const item = (attr, id, name, sub, active) =>
      `<button type="button" ${attr}="${id}" class="${active ? 'active' : ''}"><b>${escapeHtml(name)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</button>`;
    const group = (title, items, add = '') => (items.length || add ? `<div class="win-group">${title}</div>${items.join('')}${add}` : '');
    const dims = (o) => `${Math.round(o.width)} × ${Math.round(o.height ?? 0)} × ${Math.round(o.depth)} mm`;
    list.innerHTML = [
      group(t('Korpusy'), p.furniture.map((c) => item('data-win-cab', c.id, c.name, dims(c), sel.has(c.id))), `<button type="button" class="win-add" data-win-add>${t('+ Korpus')}</button>`),
      ...TRIM_GROUPS.map(([type, title]) => group(title, p.trims.filter((t) => t.type === type).map((t) => item('data-win-trim', t.id, t.name, '', picked.has(`trim:${t.id}`))))),
      group(t('Samodzielne blaty i półki'), (p.boards ?? []).map((b) => item('data-win-board', b.id, b.name, `${b.width} × ${b.depth} mm`, picked.has(`board:${b.id}`)))),
      group(t('Przeszkody'), p.space.obstacles.map((o) => item('data-win-obstacle', o.id, o.name || t('Przeszkoda'), dims(o), st.selectedObstacle === o.id))),
      group(t('Dekoracje'), (p.decorations ?? []).map((d) => item('data-win-decor', d.id, d.name, '', picked.has(`decor:${d.id}`)))),
    ].join('');
  });
  const select = (patch) => ({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null, spaceOpen: false, ...patch });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    menu.open = false;
    if (b.dataset.winCab) ui.set(select({ selectedId: b.dataset.winCab, selectedIds: [b.dataset.winCab] }), { reveal: true });
    else if (b.dataset.winTrim) ui.set(select({ selectedBlends: [`trim:${b.dataset.winTrim}`] }));
    else if (b.dataset.winBoard) ui.set(select({ selectedBlends: [`board:${b.dataset.winBoard}`] }));
    else if (b.dataset.winObstacle) ui.set(select({ selectedObstacle: b.dataset.winObstacle }));
    else if (b.dataset.winDecor) ui.set(select({ selectedBlends: [`decor:${b.dataset.winDecor}`] }));
    else if (b.dataset.winAdd !== undefined) document.querySelector('#furniture-panel [data-action="add-cabinet"]')?.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}
