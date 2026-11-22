const STORAGE_KEY = 'furnitureDesigner.activeTab';

// Zakładki: przycisk z data-tab="<id>" pokazuje element o danym id i ukrywa pozostałe.
export function initTabs(nav) {
  if (!nav) return { activate: () => {}, onChange: () => {}, active: () => null }; // (bez zakładek)
  const buttons = [...nav.querySelectorAll('[data-tab]')];

  // Zakładki są przyklejone u góry panelu; ich wysokość (przy wąskim panelu — dwa rzędy) trafia do zmiennej CSS
  // --tabs-h, żeby inne przyklejone elementy (mapka zabudowy) stawały tuż pod nimi.
  const panel = nav.closest('.panel');
  const syncHeight = () => panel?.style.setProperty('--tabs-h', `${nav.offsetHeight}px`);
  syncHeight();
  if (panel && typeof ResizeObserver !== 'undefined') new ResizeObserver(syncHeight).observe(nav);

  const listeners = [];
  let current = null;
  const activate = (id) => {
    if (id === 'trims-panel') id = 'worktops-panel'; // (dawne zakładki — teraz okienka po prawej)
    if (!buttons.some((b) => b.dataset.tab === id)) return;
    const changed = id !== current;
    current = id;
    for (const b of buttons) {
      b.classList.toggle('active', b.dataset.tab === id);
      const el = document.getElementById(b.dataset.tab);
      el.hidden = false;
      el.classList.toggle('tab-off', b.dataset.tab !== id); // (okienko obiektu z tej zakładki zostaje widoczne)
    }
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignorujemy
    }
    if (changed) listeners.forEach((fn) => fn(id));
  };

  nav.addEventListener('click', (e) => {
    const tab = e.target.closest?.('[data-tab]')?.dataset.tab;
    if (tab) activate(tab);
  });

  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignorujemy
  }
  const fallback = (buttons.find((b) => b.classList.contains('active')) ?? buttons[0]).dataset.tab;
  activate(saved && buttons.some((b) => b.dataset.tab === saved) ? saved : saved === 'trims-panel' ? 'worktops-panel' : fallback);

  // onChange(fn) — wywoływane po przełączeniu zakładki; active() — id bieżącej zakładki.
  return { activate, onChange: (fn) => listeners.push(fn), active: () => current };
}
