import { escapeHtml } from './dom.js';
import { t, tn } from '../i18n.js';
import { cabinetProblems } from '../model/furniture.js';
import { trimIssues } from '../model/trims.js';
import { boardIssues } from '../model/boards.js';

// Przycisk „Problemy” na górnym pasku: wszystkie błędy (czerwone — korpus świeci się w 3D) i ostrzeżenia
// (pomarańczowe — tylko zalecenia, bez podświetlania) w jednym miejscu. Klik w pozycję — zaznacza obiekt
// i otwiera jego okienko.
const ICONS = {
  // czerwone kółko z wykrzyknikiem
  err: `<svg viewBox="0 0 24 24" width="20" height="20" aria-label="${t('Błędy')}"><circle cx="12" cy="12" r="11" fill="#dc2626"/><rect x="10.6" y="5.5" width="2.8" height="8.5" rx="1.4" fill="#fff"/><circle cx="12" cy="17.6" r="1.7" fill="#fff"/></svg>`,
  // pomarańczowy trójkąt ostrzegawczy z wykrzyknikiem
  warn: `<svg viewBox="0 0 24 24" width="20" height="20" aria-label="${t('Ostrzeżenia')}"><path d="M12 2.2 23 21.5H1Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.2" stroke-linejoin="round"/><rect x="10.8" y="8.5" width="2.4" height="7" rx="1.2" fill="#111827"/><circle cx="12" cy="18.3" r="1.4" fill="#111827"/></svg>`,
  // brak problemów
  ok: `<svg viewBox="0 0 24 24" width="20" height="20" aria-label="${t('Brak problemów')}"><circle cx="12" cy="12" r="11" fill="none" stroke="#16a34a" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export function initProblemsMenu(toolbar, store, ui) {
  const anchor = toolbar.querySelector('.windows-group') ?? toolbar.querySelector('.group');
  const menu = document.createElement('details');
  menu.className = 'win-menu problems-menu';
  menu.innerHTML = `
    <summary class="win-btn" title="${t('Błędy i ostrzeżenia projektu — klik w pozycję otwiera okienko obiektu')}"></summary>
    <div class="win-menu-list problems-list"></div>`;
  (anchor?.querySelector('.win-menu') ?? anchor)?.after(menu);
  const summary = menu.querySelector('summary');
  const list = menu.querySelector('.problems-list');

  // [{ level: 'error' | 'warning', text, name, target: { kind, id } }]
  const collect = () => {
    const p = store.get();
    const out = [];
    for (const c of p.furniture) {
      const { errors, warnings } = cabinetProblems(c, p);
      errors.forEach((text) => out.push({ level: 'error', text, name: c.name, target: { kind: 'cabinet', id: c.id } }));
      warnings.forEach((text) => out.push({ level: 'warning', text, name: c.name, target: { kind: 'cabinet', id: c.id } }));
    }
    for (const t of p.trims ?? []) trimIssues(t, p).forEach((text) => out.push({ level: 'error', text, name: t.name, target: { kind: 'trim', id: t.id } }));
    for (const b of p.boards ?? []) (boardIssues(b, p) ?? []).forEach((text) => out.push({ level: 'error', text, name: b.name, target: { kind: 'board', id: b.id } }));
    return out;
  };

  let items = [];
  const render = () => {
    const errors = items.filter((i) => i.level === 'error');
    const warnings = items.filter((i) => i.level === 'warning');
    // sama ikonka: błędy — czerwony wykrzyknik, same ostrzeżenia — pomarańczowy trójkąt (jak znak ostrzegawczy),
    // nic — zielony „✓”; liczby — w podpowiedzi
    const level = errors.length ? 'err' : warnings.length ? 'warn' : 'ok';
    // liczba w prawym dolnym rogu ikonki: błędów (gdy są), inaczej ostrzeżeń
    const count = errors.length || warnings.length;
    const sig = `${level}:${count}`;
    if (summary.dataset.level !== sig) {
      summary.innerHTML = ICONS[level] + (count ? `<span class="pb-count">${count > 99 ? '99+' : count}</span>` : '');
      summary.dataset.level = sig;
    }
    const plural = (n, one, few, many) => `${n} ${tn(n, one, few, many)}`;
    summary.title = !items.length
      ? t('Brak błędów i ostrzeżeń')
      : [errors.length && plural(errors.length, 'błąd', 'błędy', 'błędów'), warnings.length && plural(warnings.length, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń')].filter(Boolean).join(', ') + t(' — kliknij, żeby zobaczyć listę');
    summary.className = `win-btn pb-icon pb-${level}`;
    if (!menu.open) return;
    const row = (it, i) =>
      `<button type="button" data-pb="${i}" class="pb-${it.level}"><b>${it.level === 'error' ? '⚠' : 'ⓘ'} ${escapeHtml(it.name || t('obiekt'))}</b><small>${escapeHtml(it.text)}</small></button>`;
    const group = (title, arr) => (arr.length ? `<div class="win-group">${title} (${arr.length})</div>${arr.map((it) => row(it, items.indexOf(it))).join('')}` : '');
    list.innerHTML = items.length
      ? group(t('Błędy'), errors) + group(t('Ostrzeżenia'), warnings)
      : `<div class="pb-none">${t('✓ Wszystko w porządku — brak błędów i ostrzeżeń.')}</div>`;
  };
  // przeliczane raz na klatkę (zmiany projektu przychodzą seriami, np. przy przeciąganiu)
  let pending = false;
  const refresh = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      items = collect();
      render();
    });
  };
  store.subscribe(refresh);
  menu.addEventListener('toggle', () => {
    if (menu.open) {
      items = collect();
      render();
    }
  });
  const select = (patch) => ({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null, selectedHinge: null, spaceOpen: false, panelWin: null, ...patch });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pb]');
    if (!b) return;
    const it = items[Number(b.dataset.pb)];
    if (!it) return;
    menu.open = false;
    const { kind, id } = it.target;
    if (kind === 'cabinet') ui.set(select({ selectedId: id, selectedIds: [id] }), { reveal: true });
    else if (kind === 'trim') ui.set(select({ selectedBlends: [`trim:${id}`] }));
    else if (kind === 'board') ui.set(select({ selectedBlends: [`board:${id}`] }));
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  refresh();
}
