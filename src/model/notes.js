import { newId } from './furniture.js';

// Notatki projektu (project.notes) — dowolny tekst użytkownika: pomysły, rzeczy do sprawdzenia, ustalenia
// z klientem, wymiary do zmierzenia. Zapisują się razem z projektem (autozapis, plik JSON, konto).
//
// note: { id, text, cabinetId (null — cały projekt; inaczej korpus, którego dotyczy), done, createdAt (ms) }
export const NOTE_MAX_LENGTH = 5000;

export function createNote(overrides = {}) {
  return { id: newId(), text: '', cabinetId: null, done: false, createdAt: Date.now(), ...overrides };
}

// cabinetIds — identyfikatory korpusów w projekcie: notatka usuniętego korpusu wraca do „cały projekt”.
export function normalizeNote(raw = {}, cabinetIds = []) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    text: String(raw.text ?? '').slice(0, NOTE_MAX_LENGTH),
    cabinetId: cabinetIds.includes(raw.cabinetId) ? raw.cabinetId : null,
    done: raw.done === true,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}
