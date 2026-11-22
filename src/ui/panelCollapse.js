// Zwijany lewy panel: zwinięty — wąski pasek z ikonkami zakładek (widok 3D prawie na cały ekran); klik w ikonkę
// wysuwa panel z tą zakładką, klik w aktywną zakładkę albo « — chowa go. Stan zapamiętany w przeglądarce
// (domyślnie zwinięty). Okienka obiektów po prawej działają niezależnie od panelu.
const STORAGE_KEY = 'furnitureDesigner.panelCollapsed';

export function initPanelCollapse(panel, tabs) {
  const nav = panel?.querySelector('.tabs');
  if (!nav) return { expand: () => {}, collapse: () => {}, isCollapsed: () => true }; // (bez lewego panelu)
  let collapsed = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved != null) collapsed = saved === '1';
  } catch {
    // ignorujemy
  }
  const set = (value) => {
    collapsed = value;
    panel.classList.toggle('collapsed', collapsed);
    // przycisk zwijania / rozwijania: zwinięty — „»” (rozwiń), rozwinięty — „«” (zwiń)
    const btn = nav.querySelector('.tabs-collapse');
    if (btn) {
      btn.innerHTML = collapsed ? '<span aria-hidden="true">»</span>' : '<span aria-hidden="true">«</span><span class="tabs-collapse-label">Zwiń</span>';
      btn.title = collapsed ? 'Rozwiń panel' : 'Zwiń panel (więcej miejsca na widok 3D)';
      btn.setAttribute('aria-label', btn.title);
    }
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignorujemy
    }
  };
  set(collapsed);
  // faza przechwytywania — przed przełączeniem zakładki (ui/tabs.js)
  nav.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('.tabs-collapse')) {
        set(!collapsed);
        return;
      }
      const tab = e.target.closest('[data-tab]')?.dataset.tab;
      if (!tab) return;
      if (collapsed) set(false);
      else if (tab === tabs.active()) {
        set(true);
        e.stopPropagation();
      }
    },
    true,
  );
  return { expand: () => set(false), collapse: () => set(true), isCollapsed: () => collapsed };
}
