import { createDefaultSpace, normalizeSpace } from './space.js';
import { normalizeCabinet } from './furniture.js';
import { normalizeTrim, createTrim } from './trims.js';

// Projekt = przestrzeń + meble + blendy wspólne + ustawienia widoku.
export const PROJECT_VERSION = 4;
const STORAGE_KEY = 'furnitureDesigner.project';

export function createDefaultView() {
  return { showWalls: true };
}

export function createDefaultProject() {
  return { version: PROJECT_VERSION, space: createDefaultSpace(), furniture: [], trims: [], view: createDefaultView() };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || !raw.space) {
    throw new Error('To nie jest prawidłowy plik projektu.');
  }
  const rawFurniture = Array.isArray(raw.furniture) ? raw.furniture : [];
  const furniture = rawFurniture.map(normalizeCabinet);
  const ids = furniture.map((c) => c.id);
  const project = {
    version: PROJECT_VERSION,
    space: normalizeSpace(raw.space),
    furniture,
    trims: (Array.isArray(raw.trims) ? raw.trims : []).map((t) => normalizeTrim(t, ids)).filter(Boolean),
    view: { showWalls: raw.view?.showWalls !== false },
  };

  // Zgodność wstecz: blenda dolna była kiedyś opcją pojedynczego korpusu.
  rawFurniture.forEach((rc, i) => {
    if (!rc?.plinth?.enabled) return;
    const trim = createTrim('plinth', [furniture[i].id], project);
    project.trims.push({ ...trim, setback: Number(rc.plinth.setback) || 0, gap: 0 });
  });
  return project;
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
