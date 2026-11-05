const STORAGE_KEY = 'furnitureDesigner.activeTab';

// Zakładki: przycisk z data-tab="<id>" pokazuje element o danym id i ukrywa pozostałe.
export function initTabs(nav) {
  const buttons = [...nav.querySelectorAll('[data-tab]')];

  const activate = (id) => {
    if (!buttons.some((b) => b.dataset.tab === id)) return;
    for (const b of buttons) {
      b.classList.toggle('active', b.dataset.tab === id);
      document.getElementById(b.dataset.tab).hidden = b.dataset.tab !== id;
    }
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignorujemy
    }
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

  return { activate };
}
