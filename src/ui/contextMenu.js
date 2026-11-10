import { escapeHtml } from './dom.js';

// Małe menu z akcjami dla klikniętego elementu w widoku 3D (np. frontu): pokazuje się przy kursorze,
// znika po wybraniu akcji, kliknięciu obok, Esc albo przewinięciu.
// items: [{ label, icon?, run }]
export function createContextMenu(container) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  container.appendChild(menu);
  let actions = [];

  const hide = () => {
    menu.hidden = true;
    actions = [];
  };

  function show(clientX, clientY, title, items) {
    actions = items;
    menu.innerHTML =
      (title ? `<div class="context-menu-title">${escapeHtml(title)}</div>` : '') +
      items
        .map(
          (it, i) =>
            `<button type="button" role="menuitem" data-menu-item="${i}">${it.icon ? `<span class="context-menu-icon">${it.icon}</span>` : ''}${escapeHtml(it.label)}</button>`,
        )
        .join('');
    menu.hidden = false;
    // przy kursorze, ale w granicach widoku
    const box = container.getBoundingClientRect();
    const x = Math.min(clientX - box.left + 6, box.width - menu.offsetWidth - 6);
    const y = Math.min(clientY - box.top + 6, box.height - menu.offsetHeight - 6);
    menu.style.left = `${Math.max(6, x)}px`;
    menu.style.top = `${Math.max(6, y)}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  menu.addEventListener('pointerdown', (e) => e.stopPropagation()); // kliknięcie w menu nie trafia do sceny
  menu.addEventListener('click', (e) => {
    const i = e.target.closest('[data-menu-item]')?.dataset.menuItem;
    if (i == null) return;
    const action = actions[Number(i)];
    hide();
    action?.run();
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
