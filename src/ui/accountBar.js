import { t } from '../i18n.js';
// Fragment paska narzędzi: stan zapisu projektu na koncie (✓ zapisano / zapisuję… / błąd) — tylko po zalogowaniu.
// Kliknięcie otwiera „Moje projekty” (które są też w menu pod awatarem).
export function createAccountBar(root, account, { onOpen }) {
  root.innerHTML = `
    <button type="button" class="save-status" aria-live="polite"></button>`;
  const status = root.querySelector('.save-status');
  status.addEventListener('click', () => onOpen());

  const TEXT = {
    pending: [t('zapisuję…'), t('Zmiany zapiszą się na koncie za chwilę')],
    saving: [t('zapisuję…'), t('Zapisuję na koncie')],
    saved: [t('✓ zapisano'), t('Projekt jest zapisany na koncie')],
    error: [t('⚠ nie zapisano'), t('Nie udało się zapisać na koncie — spróbuję przy następnej zmianie')],
    conflict: [t('⚠ zmieniony gdzie indziej'), t('Ten projekt zmieniono na innym urządzeniu')],
  };
  function sync(s) {
    root.hidden = !s.loaded || !s.user;
    if (!s.user) {
      status.textContent = '';
      return;
    }
    const [text, title] = s.link ? (TEXT[s.saveStatus] ?? TEXT.saved) : [t('tylko w przeglądarce'), t('Bieżący projekt nie jest zapisany na koncie — kliknij, a potem „Zapisz na koncie”')];
    status.textContent = text;
    status.title = s.saveError ? `${title}: ${s.saveError}` : title;
    status.className = `save-status ${s.saveStatus === 'error' || s.saveStatus === 'conflict' ? 'bad' : s.link ? 'ok' : 'local'}`;
  }
  account.onChange(sync);
  sync(account.get());
}
