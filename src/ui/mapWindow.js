// Okienko mapki zabudowy: domyślnie w lewym górnym rogu widoku 3D; przesuwane za nagłówek (położenie zapamiętane),
// ukrywane ✕ albo przyciskiem „🗺️ Mapka” na górnym pasku (stan zapamiętany). Okienko jest rysowane w panelu mebli
// (ui/furniturePanel.js) i „przypięte” do ekranu (position: fixed) — tu tylko położenie i widoczność.
const KEY_POS = 'furnitureDesigner.mapPos';
const KEY_HIDDEN = 'furnitureDesigner.mapHidden';
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // ignorujemy
  }
};

export function initMapWindow(viewport) {
  let off = { x: 0, y: 0 };
  try {
    off = { ...off, ...JSON.parse(read(KEY_POS) ?? '{}') };
  } catch {
    // domyślne
  }
  const root = document.documentElement;
  const place = () => {
    const r = viewport.getBoundingClientRect();
    root.style.setProperty('--map-left', `${Math.round(r.left + 12 + off.x)}px`);
    root.style.setProperty('--map-top', `${Math.round(r.top + 12 + off.y)}px`);
  };
  place();
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(viewport);
  const setHidden = (hidden) => {
    root.classList.toggle('map-hidden', hidden);
    write(KEY_HIDDEN, hidden ? '1' : '0');
    document.querySelectorAll('[data-map-toggle]').forEach((b) => b.classList.toggle('active', !hidden));
  };
  setHidden(read(KEY_HIDDEN) === '1');
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-map-close]')) setHidden(true);
    else if (e.target.closest?.('[data-map-toggle]')) setHidden(!root.classList.contains('map-hidden'));
  });
  // przesuwanie za nagłówek
  document.addEventListener('pointerdown', (e) => {
    const head = e.target.closest?.('.map-window-head');
    if (!head || e.target.closest('button')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    const move = (ev) => {
      off = { x: start.ox + ev.clientX - start.x, y: start.oy + ev.clientY - start.y };
      place();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      write(KEY_POS, JSON.stringify(off));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  // dwuklik w nagłówek — z powrotem w lewy górny róg
  document.addEventListener('dblclick', (e) => {
    if (!e.target.closest?.('.map-window-head')) return;
    off = { x: 0, y: 0 };
    place();
    write(KEY_POS, JSON.stringify(off));
  });
}
