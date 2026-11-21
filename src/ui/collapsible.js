// Zwijane karty (.item z data-kind i data-id): przycisk ▾/▸ w nagłówku karty ([data-collapse-card])
// zwija kartę do nagłówka i linii podsumowania (.card-sum). Stan przetrwa przebudowę panelu.
export const COLLAPSE_BUTTON = '<button type="button" class="collapse-toggle" data-collapse-card>▾</button>';
// ikonki: zwiń — strzałki do siebie, rozwiń — strzałki od siebie
export const ICON_COLLAPSE = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5 8 6l3.5-3.5M4.5 13.5 8 10l3.5 3.5"/></svg>';
export const ICON_EXPAND = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6 8 2.5 11.5 6M4.5 10 8 13.5l3.5-3.5"/></svg>';
export const COLLAPSE_ALL_BUTTONS = `
  <div class="collapse-all">
    <button type="button" class="icon-btn" data-collapse-all title="Zwiń wszystkie karty do nagłówków" aria-label="Zwiń wszystkie"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5 8 6l3.5-3.5M4.5 13.5 8 10l3.5 3.5"/></svg></button>
    <button type="button" class="icon-btn" data-expand-all title="Rozwiń wszystkie karty" aria-label="Rozwiń wszystkie"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6 8 2.5 11.5 6M4.5 10 8 13.5l3.5-3.5"/></svg></button>
  </div>`;

export function createCardCollapse(root, label = 'kartę') {
  const collapsed = new Set();
  const keyOf = (el) => `${el.dataset.kind}:${el.dataset.id}`;
  const cards = () => [...root.querySelectorAll('.item[data-kind][data-id]')].filter((el) => el.querySelector('[data-collapse-card]'));

  const apply = (el) => {
    const isCollapsed = collapsed.has(keyOf(el));
    el.classList.toggle('collapsed', isCollapsed);
    const btn = el.querySelector('.collapse-toggle');
    if (!btn) return;
    btn.textContent = isCollapsed ? '▸' : '▾';
    btn.title = isCollapsed ? `Rozwiń ${label}` : `Zwiń ${label}`;
    btn.setAttribute('aria-expanded', String(!isCollapsed));
  };
  const set = (els, value) => {
    for (const el of els) value ? collapsed.add(keyOf(el)) : collapsed.delete(keyOf(el));
    els.forEach(apply);
  };

  return {
    applyAll: () => cards().forEach(apply),
    expand: (el) => el && set([el], false),
    // Obsługa kliknięcia; zwraca true, jeśli kliknięcie dotyczyło zwijania.
    handleClick(target) {
      if (target.closest('[data-collapse-all]')) set(cards(), true);
      else if (target.closest('[data-expand-all]')) set(cards(), false);
      else if (target.closest('[data-collapse-card]')) {
        const card = target.closest('.item[data-kind][data-id]');
        if (!card) return false;
        set([card], !collapsed.has(keyOf(card)));
      } else return false;
      return true;
    },
  };
}
