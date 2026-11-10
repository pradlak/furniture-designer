// Zwijane karty (.item z data-kind i data-id): przycisk ▾/▸ w nagłówku karty ([data-collapse-card])
// zwija kartę do nagłówka i linii podsumowania (.card-sum). Stan przetrwa przebudowę panelu.
export const COLLAPSE_BUTTON = '<button type="button" class="collapse-toggle" data-collapse-card>▾</button>';
export const COLLAPSE_ALL_BUTTONS = `
  <div class="collapse-all">
    <button type="button" data-collapse-all title="Zwiń wszystkie karty do nagłówków">▸ Zwiń wszystkie</button>
    <button type="button" data-expand-all title="Rozwiń wszystkie karty">▾ Rozwiń wszystkie</button>
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
