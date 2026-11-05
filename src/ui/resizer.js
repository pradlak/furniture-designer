const STORAGE_KEY = 'furnitureDesigner.panelWidth';
const MIN_WIDTH = 280;
const MAX_SHARE = 0.7; // maksymalnie 70% szerokości okna

// Uchwyt między lewym panelem a widokiem 3D: przeciąganie zmienia szerokość panelu,
// dwuklik przywraca domyślną. Szerokość jest zapamiętywana w przeglądarce.
export function initPanelResizer(handle, panel) {
  const clamp = (w) => Math.round(Math.min(window.innerWidth * MAX_SHARE, Math.max(MIN_WIDTH, w)));
  const apply = (w) => {
    panel.style.width = w == null ? '' : `${clamp(w)}px`;
  };

  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved) apply(saved);
  } catch {
    // brak dostępu do localStorage — zostaje szerokość domyślna
  }

  const save = (w) => {
    try {
      if (w == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(w));
    } catch {
      // ignorujemy
    }
  };

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    const startX = e.clientX;
    const startW = panel.getBoundingClientRect().width;

    const move = (ev) => apply(startW + ev.clientX - startX);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      save(panel.getBoundingClientRect().width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });

  handle.addEventListener('dblclick', () => {
    apply(null);
    save(null);
  });

  // Po zmniejszeniu okna panel nie może zająć więcej niż pozwala limit.
  window.addEventListener('resize', () => {
    if (panel.style.width) apply(panel.getBoundingClientRect().width);
  });
}
