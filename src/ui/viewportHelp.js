// Okienko ze skrótami w rogu widoku 3D: przycisk ✕ je chowa, a mały przycisk „⌨ Skróty” pokazuje z powrotem.
// Wybór zapamiętujemy w przeglądarce (localStorage).
import { t } from '../i18n.js';

const STORAGE_KEY = 'furnitureDesigner.helpHidden';

export function initViewportHelp(viewport) {
  const help = viewport?.querySelector('.viewport-help');
  if (!help) return;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'viewport-help-close';
  close.title = t('Ukryj skróty');
  close.setAttribute('aria-label', t('Ukryj skróty'));
  close.textContent = '✕';
  help.prepend(close);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'viewport-help-open';
  open.title = t('Pokaż skróty myszy i klawiatury');
  open.textContent = t('⌨ Skróty');
  viewport.appendChild(open);

  const set = (hidden) => {
    help.hidden = hidden;
    open.hidden = !hidden;
    try {
      localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
    } catch {
      // bez zapamiętania (np. tryb prywatny)
    }
  };
  close.addEventListener('click', () => set(true));
  open.addEventListener('click', () => set(false));

  let hidden = false;
  try {
    hidden = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // ignorujemy
  }
  help.hidden = hidden;
  open.hidden = !hidden;
}
