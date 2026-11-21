import { escapeHtml } from './dom.js';

// Małe menu z akcjami dla klikniętego elementu w widoku 3D (np. frontu): pokazuje się przy kursorze,
// znika po wybraniu akcji, kliknięciu obok, Esc albo przewinięciu.
// items: [{ label, icon?, run }] albo [{ label, icon?, submenu: () => ({ title, items }) }] — podlista
// (np. kolory) pokazuje się w tym samym miejscu zamiast menu. icon — tekst albo HTML (np. kółko koloru).
// [{ label, info: true }] — wiersz tylko z informacją (nie do kliknięcia), np. wymiary płyty.
// run może zwrócić { title, items } — menu zostaje otwarte z nową zawartością (np. po przełączeniu obrzeża).
// [{ label, input: true, value, unit?, min?, max?, placeholder?, onChange(value | null) }] — pole liczbowe (np. wymiar);
// zmiana zatwierdzana Enterem albo po wyjściu z pola; onChange może zwrócić { title, items } (menu zostaje otwarte).
export function createContextMenu(container) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  container.appendChild(menu);
  let actions = [];
  let at = { x: 0, y: 0 }; // miejsce otwarcia (dla podlisty)

  const hide = () => {
    menu.hidden = true;
    actions = [];
  };

  function show(clientX, clientY, title, items) {
    actions = items;
    at = { x: clientX, y: clientY };
    menu.innerHTML =
      (title ? `<div class="context-menu-title">${escapeHtml(title)}</div>` : '') +
      items
        .map(
          (it, i) =>
            it.input
              ? `<label class="context-menu-input"><span>${escapeHtml(it.label)}</span><input type="number" step="1" data-menu-input="${i}" value="${it.value ?? ''}" ${it.min != null ? `min="${it.min}"` : ''} ${it.max != null ? `max="${it.max}"` : ''} placeholder="${escapeHtml(it.placeholder ?? '')}" />${it.unit ? `<small>${escapeHtml(it.unit)}</small>` : ''}</label>`
              : it.info
              ? `<div class="context-menu-info">${it.icon ? `<span class="context-menu-icon">${it.icon}</span>` : ''}<span>${escapeHtml(it.label)}</span></div>`
              : `<button type="button" role="menuitem" data-menu-item="${i}">${it.icon ? `<span class="context-menu-icon">${it.icon}</span>` : ''}${escapeHtml(it.label)}${it.submenu ? '<span class="context-menu-more">›</span>' : ''}</button>`,
        )
        .join('');
    menu.hidden = false;
    // przy kursorze, ale w granicach widoku
    const box = container.getBoundingClientRect();
    const x = Math.min(clientX - box.left + 6, box.width - menu.offsetWidth - 6);
    const y = Math.min(clientY - box.top + 6, box.height - menu.offsetHeight - 6);
    menu.style.left = `${Math.max(6, x)}px`;
    menu.style.top = `${Math.max(6, y)}px`;
    (menu.querySelector('input') ?? menu.querySelector('button'))?.focus({ preventScroll: true });
  }

  menu.addEventListener('pointerdown', (e) => e.stopPropagation()); // kliknięcie w menu nie trafia do sceny
  menu.addEventListener('click', (e) => {
    const i = e.target.closest('[data-menu-item]')?.dataset.menuItem;
    if (i == null) return;
    const action = actions[Number(i)];
    if (action?.submenu) {
      const sub = action.submenu();
      show(at.x, at.y, sub.title, sub.items);
      return;
    }
    hide();
    const next = action?.run();
    if (next?.items) show(at.x, at.y, next.title, next.items);
  });
  // pole liczbowe: zatwierdzenie (Enter / wyjście z pola) — onChange; puste — null
  const commit = (input) => {
    const action = actions[Number(input.dataset.menuInput)];
    if (!action?.onChange || input.value === String(action.value ?? '')) return;
    const v = input.value.trim() === '' ? null : Number(input.value);
    if (v != null && !Number.isFinite(v)) return;
    const next = action.onChange(v);
    if (next?.items) {
      const focused = input.dataset.menuInput;
      show(at.x, at.y, next.title, next.items);
      menu.querySelector(`[data-menu-input="${Number(focused) + 1}"]`)?.focus({ preventScroll: true });
    }
  };
  menu.addEventListener('change', (e) => e.target.dataset?.menuInput != null && commit(e.target));
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset?.menuInput != null) {
      e.preventDefault();
      commit(e.target);
    }
  });
  // zamykanie: klik poza menu, Esc, kółko myszy (obrót / przybliżenie widoku)
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) hide();
  });
  container.addEventListener('wheel', hide, { passive: true });

  return { show, hide, isOpen: () => !menu.hidden };
}
