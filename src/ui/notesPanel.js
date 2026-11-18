import { escapeHtml, setIfNotFocused } from './dom.js';
import { createNote, NOTE_MAX_LENGTH } from '../model/notes.js';

// Zakładka „Notatki”: lista notatek projektu — dodawanie, edycja tekstu, „dotyczy” (cały projekt albo korpus),
// odhaczanie jako zrobione, usuwanie. Notatki są częścią projektu (cofnij / ponów, autozapis, eksport, konto).
// onShowCabinet(id) — zaznacza korpus, którego dotyczy notatka, i pokazuje jego kartę.
export function createNotesPanel(root, store, { onShowCabinet, onCountChange } = {}) {
  const update = (id, fn) => store.set((p) => ({ ...p, notes: (p.notes ?? []).map((n) => (n.id === id ? fn(n) : n)) }));
  let renderedKey = null;
  // Przebudowa listy tylko przy zmianie zestawu notatek albo korpusów (żeby nie gubić kursora w polu tekstowym).
  const structureKey = (p) => (p.notes ?? []).map((n) => n.id).join('|') + '#' + p.furniture.map((c) => `${c.id}:${c.name}`).join('|');

  const dateText = (ms) => {
    try {
      return new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  function card(n, project) {
    const options = [
      `<option value="">Cały projekt</option>`,
      ...project.furniture.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`),
    ].join('');
    return `
      <div class="item note" data-kind="note" data-id="${n.id}">
        <textarea data-note-text rows="3" maxlength="${NOTE_MAX_LENGTH}" placeholder="Treść notatki…" aria-label="Treść notatki"></textarea>
        <div class="note-meta">
          <label class="check small"><input type="checkbox" data-note-done /> zrobione</label>
          <label class="note-target"><span>Dotyczy:</span> <select data-note-cabinet>${options}</select></label>
          <button type="button" class="icon" data-note-show title="Pokaż korpus">⌖</button>
          <span class="note-date">${escapeHtml(dateText(n.createdAt))}</span>
          <button type="button" class="danger" data-note-remove title="Usuń notatkę">✕</button>
        </div>
      </div>`;
  }

  function render(project) {
    const notes = project.notes ?? [];
    root.innerHTML = `
      <p class="hint">Notatki do projektu — pomysły, rzeczy do zmierzenia albo sprawdzenia, ustalenia. Zapisują się
        razem z projektem (także w pliku z „Eksportuj” i na koncie). Notatkę można przypiąć do korpusu.</p>
      <div class="add-row notes-add"><button type="button" data-note-add>+ Notatka</button></div>
      <div class="items">${notes.length ? notes.map((n) => card(n, project)).join('') : '<p class="empty">Brak notatek.</p>'}</div>`;
    renderedKey = structureKey(project);
    sync(project);
  }

  function sync(project) {
    const notes = project.notes ?? [];
    for (const n of notes) {
      const el = root.querySelector(`[data-kind="note"][data-id="${n.id}"]`);
      if (!el) continue;
      // korpus usunięty — notatka dotyczy wtedy całego projektu (przy wczytaniu poprawia to normalizeNote)
      const cabinetId = project.furniture.some((c) => c.id === n.cabinetId) ? n.cabinetId : null;
      setIfNotFocused(el.querySelector('[data-note-text]'), n.text);
      el.querySelector('[data-note-done]').checked = n.done;
      el.querySelector('[data-note-cabinet]').value = cabinetId ?? '';
      el.querySelector('[data-note-show]').hidden = !cabinetId;
      el.classList.toggle('done', n.done);
    }
    onCountChange?.(notes.filter((n) => !n.done).length);
  }

  root.addEventListener('input', (e) => {
    const id = e.target.closest('[data-kind="note"]')?.dataset.id;
    if (!id) return;
    if (e.target.matches('[data-note-text]')) update(id, (n) => ({ ...n, text: e.target.value }));
    else if (e.target.matches('[data-note-done]')) update(id, (n) => ({ ...n, done: e.target.checked }));
    else if (e.target.matches('[data-note-cabinet]')) update(id, (n) => ({ ...n, cabinetId: e.target.value || null }));
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-note-add]')) {
      addNote();
      return;
    }
    const id = e.target.closest('[data-kind="note"]')?.dataset.id;
    if (!id) return;
    const note = store.get().notes?.find((n) => n.id === id);
    if (e.target.closest('[data-note-remove]')) {
      if (note?.text.trim() && !confirm('Usunąć tę notatkę?')) return;
      store.set((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }));
      return;
    }
    if (e.target.closest('[data-note-show]') && store.get().furniture.some((c) => c.id === note?.cabinetId)) onShowCabinet?.(note.cabinetId);
  });

  // Nowa notatka na górze listy, od razu z kursorem w polu tekstowym.
  function addNote(cabinetId = null) {
    const note = createNote({ cabinetId });
    store.set((p) => ({ ...p, notes: [note, ...(p.notes ?? [])] }));
    root.querySelector(`[data-kind="note"][data-id="${note.id}"] [data-note-text]`)?.focus();
  }

  render(store.get());
  return {
    addNote,
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else sync(project);
    },
  };
}
