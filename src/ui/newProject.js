import { SPACE_TEMPLATES, templateIssues, createProjectFromTemplate } from '../model/templates.js';
import { escapeHtml } from './dom.js';
import { PICTURES } from './pictures.js';

// Okienko „Nowy projekt”: wybór szablonu przestrzeni (wnęka prostokątna / poddasze ze skosem)
// z polami wymiarów do poprawienia od razu. Zastępuje bieżący projekt.
// onExamples — otwiera galerię przykładowych projektów (odnośnik w okienku).
export function createNewProjectDialog(store, { onExamples } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome new-project" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <h2 id="new-project-title">Nowy projekt</h2>
      <p class="welcome-note">Wybierz rodzaj przestrzeni i popraw wymiary — wszystko zmienisz też później w zakładce „Przestrzeń”.</p>
      <div class="templates">
        ${SPACE_TEMPLATES.map(
          (t, i) => `
          <label class="template" data-template="${t.key}">
            <span class="template-head">
              <input type="radio" name="space-template" value="${t.key}" ${i === 0 ? 'checked' : ''} />
              <span class="template-sketch">${SKETCHES[t.key] ?? ''}</span>
              <span>
                <b>${escapeHtml(t.label)}</b>
                <small>${escapeHtml(t.description)}</small>
              </span>
            </span>
            <span class="template-fields">
              ${t.fields
                .map(
                  (f) => `
                <span class="field small">
                  <span>${escapeHtml(f.label)} <small>${f.unit}</small></span>
                  <input type="number" data-field="${f.key}" value="${f.value}" min="${f.min}" max="${f.max}" step="${f.step ?? 1}" />
                </span>`,
                )
                .join('')}
            </span>
          </label>`,
        ).join('')}
        <button type="button" class="template template-examples" data-new="examples">
          <span class="template-head">
            <span class="template-arrow">→</span>
            <span class="template-sketch template-picture">${PICTURES.kitchen}</span>
            <span>
              <b>Przykładowe projekty</b>
              <small>Kuchnia, szafa we wnęce, poddasze, regał, komoda — gotowe do obejrzenia i zmian.</small>
            </span>
          </span>
        </button>
      </div>
      <ul class="issues new-project-issues"></ul>
      <p class="warning new-project-replace" hidden>Bieżący projekt zostanie zastąpiony — jeśli chcesz go zachować, najpierw użyj „Eksportuj”.</p>
      <div class="welcome-actions">
        <button type="button" data-new="cancel">Anuluj</button>
        <button type="button" class="primary" data-new="create">Utwórz</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const selected = () => overlay.querySelector('input[name="space-template"]:checked').value;
  const valuesOf = (key) => {
    const card = overlay.querySelector(`[data-template="${key}"]`);
    return Object.fromEntries([...card.querySelectorAll('[data-field]')].map((i) => [i.dataset.field, Number(i.value)]));
  };
  const sync = () => {
    overlay.querySelectorAll('.template').forEach((el) => el.classList.toggle('selected', el.dataset.template === selected()));
    overlay.querySelector('.new-project-issues').innerHTML = '';
  };

  const close = () => (overlay.hidden = true);
  // templateKey — szablon zaznaczony od razu (np. wybrany na ekranie powitalnym)
  const open = (templateKey) => {
    const radio = templateKey && overlay.querySelector(`input[name="space-template"][value="${templateKey}"]`);
    if (radio) radio.checked = true;
    overlay.querySelector('.new-project-replace').hidden = store.get().furniture.length === 0;
    sync();
    overlay.hidden = false;
    overlay.querySelector('[data-new="create"]').focus();
  };

  // Kliknięcie w pole szablonu zaznacza ten szablon.
  overlay.addEventListener('focusin', (e) => {
    const card = e.target.closest('[data-template]');
    if (card && e.target.dataset.field) {
      card.querySelector('input[type="radio"]').checked = true;
      sync();
    }
  });
  overlay.addEventListener('change', sync);
  overlay.addEventListener('click', (e) => {
    // kliknięcie w kartę (obrazek, opis) — akcja karty
    const action = e.target.closest('[data-new]')?.dataset.new;
    if (e.target === overlay || action === 'cancel') close();
    if (action === 'examples') {
      close();
      onExamples?.();
    }
    if (action === 'create') {
      const key = selected();
      const values = valuesOf(key);
      const issues = templateIssues(SPACE_TEMPLATES.find((t) => t.key === key), values);
      if (issues.length) {
        overlay.querySelector('.new-project-issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
        return;
      }
      store.set(createProjectFromTemplate(key, values), { replace: true });
      close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return { open };
}

// Małe szkice przestrzeni (widok z boku).
const SKETCHES = {
  niche: `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M6 4v32h36V4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 4h36" stroke="currentColor" stroke-width="2"/></svg>`,
  attic: `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M6 36V20L24 4h18v32z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 36h36" stroke="currentColor" stroke-width="2"/></svg>`,
};
