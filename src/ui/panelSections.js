// Zwijane grupy w panelu po lewej: każdy nagłówek <h3> (bezpośrednio w panelu) razem z treścią do następnego
// nagłówka trafia do <details class="panel-sec"> — w nagłówku tytuł i liczba elementów (karty .item w grupie).
// Stan (otwarta / zwinięta) zapamiętany dla panelu w przeglądarce; domyślnie otwarte grupy z defaultsOpen.
// Wywoływane po każdym przebudowaniu panelu (render) — zdarzenia w panelu są delegowane, więc działają dalej.

const load = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

// options.windows — grupy jako okienka obok (okienko przestrzeni): naraz otwarta jedna, bez zapamiętywania, z ✕ i tytułem
const memory = new Map(); // okienka grup: która otwarta (tylko w tej sesji — przetrwa przebudowę panelu)

export function groupPanelSections(root, storageKey, defaultsOpen = [], { windows = false } = {}) {
  const saved = windows ? (memory.get(storageKey) ?? {}) : (load(storageKey) ?? {});
  const container = root;
  const heads = [...container.children].filter((el) => el.tagName === 'H3');
  for (const h of heads) {
    const title = h.textContent.trim();
    const details = document.createElement('details');
    details.className = 'panel-sec';
    details.dataset.sec = title;
    details.open = saved[title] ?? (defaultsOpen === true || defaultsOpen.includes(title));
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="panel-sec-title"></span><span class="panel-sec-count"></span>`;
    summary.querySelector('.panel-sec-title').textContent = title;
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'panel-sec-body';
    if (windows) {
      body.dataset.title = title;
      body.insertAdjacentHTML('afterbegin', '<button type="button" class="icon tiny section-close" data-sec-close title="Zamknij" aria-label="Zamknij">✕</button>');
    }
    let el = h.nextSibling;
    while (el && !(el.nodeType === 1 && (el.tagName === 'H3' || el.tagName === 'H2'))) {
      const next = el.nextSibling;
      body.appendChild(el);
      el = next;
    }
    details.appendChild(body);
    h.replaceWith(details);
    details.addEventListener('toggle', () => {
      if (windows) {
        // jedna grupa naraz (okienko obok)
        if (details.open) root.querySelectorAll(':scope > details.panel-sec[open]').forEach((d) => d !== details && (d.open = false));
        const state = memory.get(storageKey) ?? {};
        state[title] = details.open;
        memory.set(storageKey, state);
        return;
      }
      const state = load(storageKey) ?? {};
      state[title] = details.open;
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // ignorujemy
      }
    });
  }
  updatePanelSectionCounts(root);
}

// Liczniki w nagłówkach grup (po zmianach w panelu bez przebudowy).
export function updatePanelSectionCounts(root) {
  root.querySelectorAll(':scope > details.panel-sec').forEach((d) => {
    const n = d.querySelectorAll('.panel-sec-body > .items > .item').length;
    d.querySelector('.panel-sec-count').textContent = n ? String(n) : '';
  });
}

// ✕ w okienku grupy (options.windows) — zamyka ją
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-sec-close]');
  if (btn) btn.closest('details.panel-sec').open = false;
});
