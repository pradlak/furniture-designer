const STORAGE_KEY = 'furnitureDesigner.activeTab';

// Zakładki: przycisk z data-tab="<id>" pokazuje element o danym id i ukrywa pozostałe.
export function initTabs(nav) {
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
    if (!buttons.some((b) => b.dataset.tab === id)) return;
    const changed = id !== current;
    current = id;
    for (const b of buttons) {
      b.classList.toggle('active', b.dataset.tab === id);
      document.getElementById(b.dataset.tab).hidden = b.dataset.tab !== id;
    }
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignorujemy
    }
    if (changed) listeners.forEach((fn) => fn(id));
  };

  nav.addEventListener('click', (e) => {
    if (e.target.dataset.tab) activate(e.target.dataset.tab);
  });

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) activate(saved);
  } catch {
    // ignorujemy
  }

  // onChange(fn) — wywoływane po przełączeniu zakładki; active() — id bieżącej zakładki.
  return { activate, onChange: (fn) => listeners.push(fn), active: () => current };
}
