import { createDefaultSpace, normalizeSpace } from './space.js';
import { normalizeCabinet } from './furniture.js';
import { normalizeTrim, createTrim } from './trims.js';
import { defaultMaterials, normalizeMaterials } from './materials.js';
import { normalizeBoard } from './boards.js';
import { normalizeDecoration } from './decorations.js';
import { normalizeNote } from './notes.js';
import { t } from '../i18n.js';

// Projekt = przestrzeń + materiały + meble + blendy wspólne + notatki + ustawienia widoku.
export const PROJECT_VERSION = 5;
const STORAGE_KEY = 'furnitureDesigner.project';

// Widoczność w 3D: ściany i całe grupy elementów (blaty; blendy — wspólne i boczne; fronty).
// Wysokość siedziska (mm): typowo 42–48 cm — linia w widoku 3D i dopasowanie wysokości korpusu (np. ławka, siedzisko).
export const SEAT_HEIGHT = { default: 450, min: 300, max: 800 };

export function createDefaultView() {
  // openFronts — drzwi otwarte i szuflady wysunięte (tylko widok); seatLine — pozioma linia wysokości siedziska
  return { showWalls: true, showCountertops: true, showBlends: true, showFronts: true, openFronts: false, showDims: true, seatLine: false, seatHeight: SEAT_HEIGHT.default };
}

export function createDefaultProject() {
  return {
    version: PROJECT_VERSION,
    space: createDefaultSpace(),
    materials: defaultMaterials(),
    furniture: [],
    trims: [],
    boards: [], // samodzielne blaty i półki (model/boards.js)
    decorations: [], // dekoracje — tylko wygląd (model/decorations.js)
    notes: [], // notatki użytkownika (model/notes.js)
    view: createDefaultView(),
  };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || !raw.space) {
    throw new Error(t('To nie jest prawidłowy plik projektu.'));
  }
  const rawFurniture = Array.isArray(raw.furniture) ? raw.furniture : [];
  const furniture = rawFurniture.map(normalizeCabinet);
  const ids = furniture.map((c) => c.id);
  const project = {
    version: PROJECT_VERSION,
    space: normalizeSpace(raw.space),
    materials: normalizeMaterials(raw.materials),
    furniture,
    trims: (Array.isArray(raw.trims) ? raw.trims : []).map((t) => normalizeTrim(t, ids)).filter(Boolean),
    boards: (Array.isArray(raw.boards) ? raw.boards : []).map(normalizeBoard),
    decorations: (Array.isArray(raw.decorations) ? raw.decorations : []).map(normalizeDecoration),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map((n) => normalizeNote(n, ids)).filter(Boolean),
    view: {
      showWalls: raw.view?.showWalls !== false,
      showCountertops: raw.view?.showCountertops !== false,
      showBlends: raw.view?.showBlends !== false,
      showFronts: raw.view?.showFronts !== false,
      openFronts: raw.view?.openFronts === true,
      showDims: raw.view?.showDims !== false,
      seatLine: raw.view?.seatLine === true,
      seatHeight: Number.isFinite(Number(raw.view?.seatHeight)) ? Math.min(SEAT_HEIGHT.max, Math.max(SEAT_HEIGHT.min, Number(raw.view.seatHeight))) : SEAT_HEIGHT.default,
    },
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
