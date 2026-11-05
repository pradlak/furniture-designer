import { createDefaultSpace, normalizeSpace } from './space.js';
import { normalizeCabinet } from './furniture.js';

// Projekt = przestrzeń + meble + ustawienia widoku.
export const PROJECT_VERSION = 3;
const STORAGE_KEY = 'furnitureDesigner.project';

export function createDefaultView() {
  return { showWalls: true };
}

export function createDefaultProject() {
  return { version: PROJECT_VERSION, space: createDefaultSpace(), furniture: [], view: createDefaultView() };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || !raw.space) {
    throw new Error('To nie jest prawidłowy plik projektu.');
  }
  return {
    version: PROJECT_VERSION,
    space: normalizeSpace(raw.space),
    furniture: Array.isArray(raw.furniture) ? raw.furniture.map(normalizeCabinet) : [],
    view: { showWalls: raw.view?.showWalls !== false },
  };
}

export function loadProject() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? normalizeProject(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

export function saveProject(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // brak dostępu do localStorage (np. tryb prywatny) — ignorujemy
  }
}
