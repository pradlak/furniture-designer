import { escapeHtml } from './dom.js';
import { normalizeProject } from '../model/project.js';
import { listProjects, getProject, createProject, renameProject, deleteProject } from '../state/account.js';

// Okienko „Moje projekty”: logowanie przez Google, lista projektów na koncie (otwórz, zmień nazwę,
// duplikuj, usuń), zapis bieżącego projektu na koncie, wylogowanie i usunięcie konta.
export const GOOGLE_ICON = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

const fmtDate = (ms) =>
  new Date(ms).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function createProjectsDialog(store, account) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="welcome projects-dialog" role="dialog" aria-modal="true" aria-labelledby="projects-title"></div>`;
  document.body.appendChild(overlay);
  const box = overlay.querySelector('.projects-dialog');

  let projects = null; // lista z serwera (null — wczytuję)
  let error = '';
  const close = () => (overlay.hidden = true);
  const defaultName = () => store.get().space?.name || 'Mój projekt';

  async function load() {
    projects = null;
    error = '';
    render();
    try {
      projects = await listProjects();
    } catch (err) {
      projects = [];
      error = err.message;
    }
    render();
  }

  function render() {
    const s = account.get();
    if (!s.user) {
      box.innerHTML = `
        <h2 id="projects-title">Moje projekty</h2>
        <p>Zaloguj się, żeby zapisywać projekty na koncie i wracać do nich na każdym komputerze i telefonie.</p>
        ${
          s.loginAvailable
            ? `<p><a class="google-login" href="${account.loginUrl}">${GOOGLE_ICON}<span>Zaloguj przez Google</span></a></p>
               <p class="welcome-note">Zapisujemy tylko Twój adres e-mail, imię i projekty. Szczegóły:
                 <a href="/polityka-prywatnosci" target="_blank" rel="noopener">polityka prywatności</a>.</p>`
            : '<p class="welcome-note">Logowanie nie jest jeszcze dostępne.</p>'
        }
        <p class="welcome-note">Bez logowania projekt zapisuje się w tej przeglądarce, a „Eksportuj” zapisuje go do pliku.</p>
        <div class="welcome-actions"><button type="button" class="primary" data-pr="close">Zamknij</button></div>`;
      return;
    }
    const link = s.link;
    const current = link
      ? `<div class="projects-current"><div>Otwarty projekt: <b>${escapeHtml(link.name)}</b><br />
           <small>zapisuje się automatycznie na koncie</small></div>
           <button type="button" data-pr="save-copy">Zapisz jako nowy…</button></div>`
      : `<div class="projects-current"><div>Bieżący projekt jest zapisany <b>tylko w tej przeglądarce</b>.</div>
           <button type="button" class="primary" data-pr="save">💾 Zapisz na koncie…</button></div>`;
    const list =
      projects == null
        ? '<p class="welcome-note">Wczytuję projekty…</p>'
        : projects.length
          ? `<ul class="projects-list">${projects
              .map(
                (p) => `
            <li class="${link?.id === p.id ? 'is-open' : ''}">
              <div class="projects-name"><b>${escapeHtml(p.name)}</b>${link?.id === p.id ? ' <span class="projects-badge">otwarty</span>' : ''}
                <br /><small>zmieniony ${fmtDate(p.updatedAt)}</small></div>
              <div class="projects-actions">
                <button type="button" class="primary" data-pr="open" data-id="${p.id}"${link?.id === p.id ? ' disabled' : ''}>Otwórz</button>
                <button type="button" data-pr="rename" data-id="${p.id}" title="Zmień nazwę">✎</button>
                <button type="button" data-pr="duplicate" data-id="${p.id}" title="Duplikuj">⧉</button>
                <button type="button" class="danger" data-pr="delete" data-id="${p.id}" title="Usuń">✕</button>
              </div>
            </li>`,
              )
              .join('')}</ul>`
          : '<p class="welcome-note">Nie masz jeszcze projektów na koncie.</p>';
    box.innerHTML = `
      <h2 id="projects-title">Moje projekty</h2>
      <p class="projects-user">Zalogowano jako <b>${escapeHtml(s.user.name || s.user.email)}</b> (${escapeHtml(s.user.email)})
        · <button type="button" class="link-button" data-pr="logout">Wyloguj</button></p>
      ${current}
      ${error ? `<p class="warning">${escapeHtml(error)}</p>` : ''}
      ${list}
      <div class="welcome-actions projects-footer">
        <button type="button" class="link-button danger-link" data-pr="delete-account">Usuń konto</button>
        <a class="link-button" href="/polityka-prywatnosci" target="_blank" rel="noopener">Polityka prywatności</a>
        <button type="button" class="primary" data-pr="close">Zamknij</button>
      </div>`;
  }

  async function run(action, id) {
    const s = account.get();
    try {
      if (action === 'close') return close();
      if (action === 'logout') {
        await account.logout();
        return render();
      }
      if (action === 'delete-account') {
        if (!confirm('Usunąć konto? Wszystkie projekty zapisane na koncie zostaną trwale usunięte. Projekt otwarty teraz zostanie w tej przeglądarce.')) return;
        await account.deleteAccount();
        alert('Konto zostało usunięte.');
        return render();
      }
      if (action === 'save' || action === 'save-copy') {
        const name = prompt('Nazwa projektu na koncie:', action === 'save-copy' ? `${s.link?.name ?? defaultName()} (kopia)` : defaultName());
        if (name == null) return;
        await account.saveAsNew(name.trim() || defaultName());
        return load();
      }
      const p = projects?.find((x) => x.id === id);
      if (!p) return;
      if (action === 'open') {
        const unsaved = !s.link && store.get().furniture.length > 0;
        if (unsaved && !confirm('Bieżący projekt nie jest zapisany na koncie i zostanie zastąpiony. Otworzyć mimo to? (Możesz go najpierw zapisać przyciskiem „Zapisz na koncie”.)')) return;
        const data = await account.open(p.id);
        store.set(normalizeProject(data.data), { replace: true, cloud: true });
        return close();
      }
      if (action === 'rename') {
        const name = prompt('Nowa nazwa projektu:', p.name);
        if (name == null || !name.trim()) return;
        await renameProject(p.id, name.trim());
        if (s.link?.id === p.id) account.renamedLinked(name.trim());
        return load();
      }
      if (action === 'duplicate') {
        const full = await getProject(p.id);
        await createProject(`${p.name} (kopia)`, full.data);
        return load();
      }
      if (action === 'delete') {
        if (!confirm(`Usunąć projekt „${p.name}” z konta? Tego nie da się cofnąć.`)) return;
        await deleteProject(p.id);
        if (s.link?.id === p.id) account.unlink();
        return load();
      }
    } catch (err) {
      alert(err.message || 'Coś poszło nie tak — spróbuj ponownie.');
    }
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close();
    const btn = e.target.closest('[data-pr]');
    if (btn) run(btn.dataset.pr, btn.dataset.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });
  account.onChange(() => {
    if (!overlay.hidden && projects != null) render();
  });

  return {
    open() {
      overlay.hidden = false;
      if (account.get().user) load();
      else render();
    },
  };
}
