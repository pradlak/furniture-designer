import { escapeHtml } from './dom.js';
import { settingsFieldsHtml, bindSettingsFields } from './settingsDialog.js';
import { GOOGLE_ICON } from './projectsDialog.js';

// Awatar w prawym górnym rogu i menu pod nim.
//  - zalogowany: zdjęcie z Google (albo inicjały); w menu: imię i e-mail, Moje projekty, Moje materiały,
//    ustawienia (kolor zaznaczenia, jednostki — zapamiętane na koncie), Wyloguj;
//  - niezalogowany: szara ikonka; w menu: „Zaloguj przez Google”, wyszarzone Moje projekty / Moje materiały
//    i ustawienia (zapamiętane w tej przeglądarce).
// Gdy serwer nie obsługuje logowania (np. sama strona na localhoście) — awatar jest ukryty, a ustawienia
// zostają pod kołem zębatym na pasku.
const PERSON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export function createUserMenu(root, account, { onProjects, onMaterials, onLogout }) {
  root.innerHTML = `
    <button type="button" class="avatar-btn" aria-haspopup="true" aria-expanded="false"></button>
    <div class="user-menu" role="menu" hidden>
      <div class="user-menu-head">
        <span class="avatar avatar-lg"></span>
        <div class="user-menu-who"><b class="user-name"></b><small class="user-email"></small></div>
      </div>
      <a class="google-login user-menu-login" href="${account.loginUrl}">${GOOGLE_ICON}<span>Zaloguj przez Google</span></a>
      <button type="button" class="user-menu-item" data-um="projects">☁ Moje projekty</button>
      <button type="button" class="user-menu-item" data-um="materials">🎨 Moje materiały</button>
      <p class="user-menu-note">Po zalogowaniu zapiszesz projekty i materiały na koncie i otworzysz je na każdym urządzeniu.</p>
      <div class="user-menu-settings">
        <div class="user-menu-title">Ustawienia <small class="settings-where"></small></div>
        ${settingsFieldsHtml({ compact: true })}
        <button type="button" class="link-button" data-settings="reset">Przywróć domyślne</button>
      </div>
      <button type="button" class="user-menu-item" data-um="logout">↩ Wyloguj</button>
    </div>`;
  const btn = root.querySelector('.avatar-btn');
  const menu = root.querySelector('.user-menu');
  bindSettingsFields(menu);

  const initials = (u) =>
    (u.name || u.email || '?')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  // Zdjęcie z Google (bez wysyłania adresu naszej strony — referrerpolicy), a gdy się nie wczyta — inicjały.
  function setAvatar(el, u) {
    if (!u) {
      el.innerHTML = `<span class="avatar-guest">${PERSON_ICON}</span>`;
      return;
    }
    const fallback = () => (el.innerHTML = `<span class="avatar-initials">${escapeHtml(initials(u))}</span>`);
    if (!u.picture) return fallback();
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', fallback);
    img.src = u.picture;
    el.replaceChildren(img);
  }

  const open = (yes) => {
    menu.hidden = !yes;
    btn.setAttribute('aria-expanded', String(yes));
  };
  btn.addEventListener('click', () => open(menu.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !root.contains(e.target)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) open(false);
  });
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-um]');
    if (!item || item.disabled) return;
    open(false);
    if (item.dataset.um === 'projects') onProjects();
    else if (item.dataset.um === 'materials') onMaterials();
    else if (item.dataset.um === 'logout') await onLogout();
  });

  let shownKey = null;
  function sync(s) {
    const available = s.loaded && (s.user || s.loginAvailable);
    root.hidden = !available;
    document.body.classList.toggle('has-user-menu', !!available); // koło zębate na pasku niepotrzebne
    if (!available) return open(false);
    const u = s.user;
    const key = u ? `${u.picture}|${u.name}|${u.email}` : 'guest';
    if (key === shownKey) return;
    shownKey = key;
    root.classList.toggle('guest', !u);
    setAvatar(btn, u);
    setAvatar(menu.querySelector('.avatar-lg'), u);
    btn.title = u ? `${u.name || u.email} — konto i ustawienia` : 'Zaloguj się · ustawienia';
    menu.querySelector('.user-name').textContent = u ? u.name || u.email : 'Nie jesteś zalogowany';
    menu.querySelector('.user-email').textContent = u ? (u.name ? u.email : '') : 'Logowanie przez konto Google';
    menu.querySelector('.user-menu-login').hidden = !!u;
    menu.querySelector('.user-menu-note').hidden = !!u;
    menu.querySelector('[data-um="logout"]').hidden = !u;
    for (const b of menu.querySelectorAll('[data-um="projects"], [data-um="materials"]')) {
      b.disabled = !u;
      b.title = u ? '' : 'Dostępne po zalogowaniu';
    }
    menu.querySelector('.settings-where').textContent = u ? '(zapamiętane na koncie)' : '(zapamiętane w tej przeglądarce)';
  }
  account.onChange(sync);
  sync(account.get());
}
