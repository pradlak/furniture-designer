// Fragment paska narzędzi: stan zapisu projektu na koncie (✓ zapisano / zapisuję… / błąd) — tylko po zalogowaniu.
// Kliknięcie otwiera „Moje projekty” (które są też w menu pod awatarem).
export function createAccountBar(root, account, { onOpen }) {
  root.innerHTML = `
    <button type="button" class="save-status" aria-live="polite"></button>`;
  const status = root.querySelector('.save-status');
  status.addEventListener('click', () => onOpen());

  const TEXT = {
    pending: ['zapisuję…', 'Zmiany zapiszą się na koncie za chwilę'],
    saving: ['zapisuję…', 'Zapisuję na koncie'],
    saved: ['✓ zapisano', 'Projekt jest zapisany na koncie'],
    error: ['⚠ nie zapisano', 'Nie udało się zapisać na koncie — spróbuję przy następnej zmianie'],
    conflict: ['⚠ zmieniony gdzie indziej', 'Ten projekt zmieniono na innym urządzeniu'],
  };
  function sync(s) {
    root.hidden = !s.loaded || !s.user;
    if (!s.user) {
      status.textContent = '';
      return;
    }
    const [text, title] = s.link ? (TEXT[s.saveStatus] ?? TEXT.saved) : ['tylko w przeglądarce', 'Bieżący projekt nie jest zapisany na koncie — „Moje projekty” → „Zapisz na koncie”'];
    status.textContent = text;
    status.title = s.saveError ? `${title}: ${s.saveError}` : title;
    status.className = `save-status ${s.saveStatus === 'error' || s.saveStatus === 'conflict' ? 'bad' : s.link ? 'ok' : 'local'}`;
  }
  account.onChange(sync);
  sync(account.get());
}
