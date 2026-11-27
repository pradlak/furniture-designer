import { t } from '../i18n.js';
// Karta zaznaczonego obiektu (korpus, blat, blenda wspólna, występ ściany / okap) pokazywana jako okienko po prawej
// stronie widoku 3D (jak inspektor półki): ta sama karta z panelu po lewej dostaje klasę .in-inspector i jest
// „przypięta” (position: fixed) nad widokiem — wszystkie pola i przyciski działają jak w panelu. W panelu po lewej
// zostają krótkie karty (nazwa, przyciski, podsumowanie).
// Położenie okienka — zmienne CSS ustawiane z prostokąta widoku 3D (initInspectorBox).

export function markInspectorCard(root, selector, id) {
  root.querySelectorAll('.in-inspector').forEach((el) => {
    if (!id || !el.matches(selector) || el.dataset.id !== id) el.classList.remove('in-inspector');
  });
  if (!id) return null;
  const card = root.querySelector(`${selector}[data-id="${id}"]`);
  if (card) {
    card.classList.add('in-inspector');
    const head = card.querySelector('.item-head');
    if (head && !head.querySelector('[data-insp-close]')) {
      head.insertAdjacentHTML('beforeend', `<button type="button" class="insp-close" data-insp-close title="${t('Zamknij okienko (obiekt zostaje)')}" aria-label="${t('Zamknij okienko')}">✕</button>`);
    }
  }
  return card;
}

// onClose — po kliknięciu ✕ w okienku (main.js: odznaczenie obiektu)
export function initInspectorBox(viewport, onClose) {
  document.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest?.('[data-insp-close]')) return;
      e.stopPropagation();
      onClose?.();
    },
    true,
  );
  const set = () => {
    const r = viewport.getBoundingClientRect();
    const s = document.documentElement.style;
    s.setProperty('--insp-top', `${Math.round(r.top + 52)}px`);
    s.setProperty('--insp-right', `${Math.round(window.innerWidth - r.right + 12)}px`);
    s.setProperty('--insp-h', `${Math.max(200, Math.round(r.height - 66))}px`);
  };
  set();
  window.addEventListener('resize', set);
  window.addEventListener('scroll', set, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(set).observe(viewport);
}
