// Konto i projekty w chmurze (po stronie przeglądarki): rozmowa z Workerem (/api/me, /api/projects…),
// stan zalogowania i połączenie bieżącego projektu z projektem na koncie (autozapis).
//
// Bieżący projekt może być „połączony” z projektem na koncie: { id, name, updatedAt } w localStorage.
// Wtedy każda zmiana zapisuje się na koncie po chwili (debounce). updatedAt — wersja z serwera, od której
// zaczęto zmiany; gdy na serwerze jest nowsza (zmiana z innego urządzenia), serwer zwraca konflikt.

import { t, isEnglish } from '../i18n.js';

const LINK_KEY = 'furnitureDesigner.cloudLink';
const AUTOSAVE_MS = 2500;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ? t(data.error) : t('Błąd {status}', { status: res.status })), { status: res.status, data });
  return data;
}

export const listProjects = () => api('/api/projects').then((d) => d.projects);
export const getProject = (id) => api(`/api/projects/${id}`);
export const createProject = (name, data) => api('/api/projects', { method: 'POST', body: { name, data } });
export const renameProject = (id, name) => api(`/api/projects/${id}`, { method: 'PUT', body: { name } });
export const deleteProject = (id) => api(`/api/projects/${id}`, { method: 'DELETE' });
// Ustawienia programu zalogowanego użytkownika (kolor zaznaczenia, jednostki) — zapis na koncie.
export const saveUserSettings = (settings) => api('/api/me/settings', { method: 'PUT', body: settings });
// Materiały na koncie (biblioteka użytkownika).
export const listAccountMaterials = () => api('/api/materials').then((d) => d.materials);
export const createAccountMaterial = (data) => api('/api/materials', { method: 'POST', body: { data } });
export const updateAccountMaterial = (id, data) => api(`/api/materials/${id}`, { method: 'PUT', body: { data } });
export const deleteAccountMaterial = (id) => api(`/api/materials/${id}`, { method: 'DELETE' });

function readLink() {
  try {
    const l = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null');
    return l && typeof l.id === 'string' ? l : null;
  } catch {
    return null;
  }
}
function writeLink(link) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    /* bez zapisu — połączenie działa do odświeżenia strony */
  }
}

// Konto: stan (user, loginAvailable, link, saveStatus) + akcje. onChange(fn) — powiadomienia o zmianach stanu.
// store — magazyn projektu (do autozapisu); onConflict(serverUpdatedAt) — zmiana na innym urządzeniu.
export function createAccount(store, { onConflict } = {}) {
  const listeners = new Set();
  let state = { loaded: false, user: null, loginAvailable: false, link: readLink(), saveStatus: 'idle', saveError: '' };
  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn(state));
  };

  async function refresh() {
    try {
      const d = await api('/api/me');
      set({ loaded: true, user: d.user, loginAvailable: !!d.loginAvailable });
    } catch {
      // brak serwera (np. sama strona na localhoście) — działamy bez konta
      set({ loaded: true, user: null, loginAvailable: false });
    }
  }

  // --- autozapis połączonego projektu ---
  let timer = null;
  let saving = false;
  let pending = false;
  async function saveNow({ force = false } = {}) {
    const link = state.link;
    if (!state.user || !link) return;
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    set({ saveStatus: 'saving' });
    try {
      const { updatedAt } = await api(`/api/projects/${link.id}`, {
        method: 'PUT',
        body: { data: store.get(), baseUpdatedAt: link.updatedAt, force },
      });
      setLink({ ...state.link, updatedAt });
      set({ saveStatus: 'saved', saveError: '' });
    } catch (err) {
      if (err.status === 409) {
        set({ saveStatus: 'conflict' });
        onConflict?.(err.data?.updatedAt);
      } else if (err.status === 404) {
        setLink(null); // projekt usunięty na koncie (np. z innego urządzenia)
        set({ saveStatus: 'idle', saveError: t('Projektu nie ma już na koncie — zapisuje się tylko w przeglądarce.') });
      } else {
        set({ saveStatus: 'error', saveError: err.message });
      }
    } finally {
      saving = false;
      if (pending) {
        pending = false;
        saveNow();
      }
    }
  }
  const scheduleSave = () => {
    if (!state.user || !state.link || state.saveStatus === 'conflict') return;
    clearTimeout(timer);
    set({ saveStatus: 'pending' });
    timer = setTimeout(() => saveNow(), AUTOSAVE_MS);
  };

  function setLink(link) {
    writeLink(link);
    set({ link });
  }

  return {
    get: () => state,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh,
    loginUrl: isEnglish() ? '/api/auth/google?lang=en' : '/api/auth/google', // po logowaniu — powrót do tej wersji językowej
    async logout() {
      await api('/api/auth/logout', { method: 'POST' });
      clearTimeout(timer);
      setLink(null);
      set({ user: null, saveStatus: 'idle' });
    },
    async deleteAccount() {
      await api('/api/me', { method: 'DELETE' });
      clearTimeout(timer);
      setLink(null);
      set({ user: null, saveStatus: 'idle' });
    },
    // Zmiana projektu w edytorze → autozapis (gdy projekt jest połączony z kontem).
    projectChanged: scheduleSave,
    // Bieżący projekt zastąpiony innym (nowy, import, przykład) — już nie jest połączony z kontem.
    unlink: () => {
      clearTimeout(timer);
      setLink(null);
      set({ saveStatus: 'idle' });
    },
    // Zapis bieżącego projektu na koncie jako nowego (i połączenie z nim).
    async saveAsNew(name) {
      const { id, updatedAt } = await createProject(name, store.get());
      setLink({ id, name, updatedAt });
      set({ saveStatus: 'saved', saveError: '' });
      return id;
    },
    // Otwarcie projektu z konta: zwraca dane projektu i łączy z nim edytor.
    async open(id) {
      const p = await getProject(id);
      setLink({ id: p.id, name: p.name, updatedAt: p.updatedAt });
      set({ saveStatus: 'saved', saveError: '' });
      return p;
    },
    renamedLinked(name) {
      if (state.link) setLink({ ...state.link, name });
    },
    // Konflikt: zapisz moją wersję (nadpisz tę z konta) albo wczytaj wersję z konta.
    overwrite: () => saveNow({ force: true }),
    saveNow,
  };
}
