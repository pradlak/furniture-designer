import { escapeHtml } from './dom.js';

// Informacja dla użytkownika, gdy zmienia się rozmiar korpusu „przy okazji” innej zmiany — np. odstęp
// od tylnej ściany zmniejsza głębokość, nóżki z „zachowaj wysokość” zmniejszają wysokość, łańcuszek
// zmienia inne korpusy, luz do sufitu albo blenda boczna zmniejszają korpus.
//
// Obserwujemy projekt: po każdej zmianie porównujemy wymiary korpusów z poprzednimi. Nie informujemy
// o wymiarze, który użytkownik właśnie sam wpisuje (to samo pole tego samego korpusu), ani o pełnej
// podmianie projektu (nowy, import, cofnij / ponów). Zmiany z krótkiego czasu (pisanie w polu)
// zbieramy w jeden komunikat: „Korpus 2: głębokość 560 → 540 mm (−20)”.

const FIELDS = { width: 'szerokość', height: 'wysokość', depth: 'głębokość' };
const QUIET_MS = 700; // komunikat po tylu ms bez kolejnych zmian
const SHOW_MS = 7000; // tyle widać komunikat

export function initSizeNotices(store) {
  const box = document.createElement('div');
  box.className = 'notices';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);

  // Pole, które użytkownik właśnie zmienia (ustawiane na czas obsługi zdarzenia input) —
  // jego własna zmiana nie wymaga komunikatu.
  let editing = null;
  document.addEventListener(
    'input',
    (e) => {
      const field = e.target.dataset?.f;
      const id = e.target.closest?.('[data-kind="cabinet"]')?.dataset.id;
      editing = field && id ? `${id}:${field}` : null;
      queueMicrotask(() => (editing = null)); // po obsłudze zdarzenia
    },
    true,
  );

  let prev = store.get();
  const pending = new Map(); // `${id}:${pole}` → { name, field, from, to }
  let timer = null;

  store.subscribe((project, meta) => {
    const before = prev;
    prev = project;
    if (meta.replace) {
      pending.clear();
      return;
    }
    const old = new Map(before.furniture.map((c) => [c.id, c]));
    for (const c of project.furniture) {
      const o = old.get(c.id);
      if (!o) continue; // nowy korpus
      for (const field of Object.keys(FIELDS)) {
        if (Math.abs(o[field] - c[field]) < 0.05) continue;
        const key = `${c.id}:${field}`;
        if (key === editing) continue;
        const entry = pending.get(key);
        pending.set(key, { name: c.name, field, from: entry ? entry.from : o[field], to: c[field] });
      }
    }
    if (!pending.size) return;
    clearTimeout(timer);
    timer = setTimeout(flush, QUIET_MS);
  });

  function flush() {
    const lines = [...pending.values()].filter((e) => Math.abs(e.from - e.to) >= 0.05);
    pending.clear();
    if (!lines.length) return;
    const note = document.createElement('div');
    note.className = 'notice';
    note.innerHTML = `
      <button type="button" class="notice-close" title="Zamknij">×</button>
      <b>Zmieniono rozmiar ${lines.length === 1 ? 'korpusu' : 'korpusów'}</b>
      <ul>${lines.map((e) => `<li>${escapeHtml(e.name)}: ${FIELDS[e.field]} ${num(e.from)} → ${num(e.to)} mm (${sign(e.to - e.from)})</li>`).join('')}</ul>`;
    note.querySelector('.notice-close').addEventListener('click', () => note.remove());
    box.appendChild(note);
    setTimeout(() => note.remove(), SHOW_MS);
  }
}

const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const sign = (d) => (d > 0 ? `+${num(d)}` : `−${num(-d)}`);
