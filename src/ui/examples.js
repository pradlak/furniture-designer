import { EXAMPLES } from '../model/examples.js';
import { PICTURES } from './pictures.js';
import { escapeHtml } from './dom.js';
import { t } from '../i18n.js';

// Okienko „Przykładowe projekty”: karty z obrazkami; kliknięcie wczytuje przykład (zastępuje bieżący projekt).
export function createExamplesDialog(store) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome examples" role="dialog" aria-modal="true" aria-labelledby="examples-title">
      <div class="ui-h2" role="heading" aria-level="2" id="examples-title">${t('Przykładowe projekty')}</div>
      <p class="welcome-note">${t('Wybierz przykład — możesz go potem dowolnie zmieniać: wymiary, korpusy, fronty, półki, materiały.')}</p>
      <div class="welcome-choices examples-grid">
        ${EXAMPLES.map(
          (ex) => `
          <button type="button" class="choice-card" data-example="${ex.key}">
            ${PICTURES[ex.key] ?? ''}
            <b>${escapeHtml(ex.label)}</b>
            <small>${escapeHtml(ex.description)}</small>
          </button>`,
        ).join('')}
      </div>
      <p class="warning examples-replace" hidden>${t('Bieżący projekt zostanie zastąpiony — jeśli chcesz go zachować, najpierw użyj „Eksportuj”.')}</p>
      <div class="welcome-actions">
        <button type="button" data-examples="cancel">${t('Anuluj')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => (overlay.hidden = true);
  const open = () => {
    overlay.querySelector('.examples-replace').hidden = store.get().furniture.length === 0;
    overlay.hidden = false;
    overlay.querySelector('.choice-card')?.focus();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-examples="cancel"]')) {
      close();
      return;
    }
    const key = e.target.closest('[data-example]')?.dataset.example;
    const example = EXAMPLES.find((ex) => ex.key === key);
    if (!example) return;
    store.set(example.create(), { replace: true });
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return { open };
}
