import { duplicateCabinet } from '../model/placement.js';
import { removeFronts } from '../model/furniture.js';
import { moveHole } from '../model/boardFeatures.js';

// Skróty klawiszowe (nie działają podczas pisania w polach formularza):
//   Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) — cofnij / ponów
//   dla zaznaczonego korpusu:
//   strzałki ←/→ — X, ↑/↓ — Z (do tyłu / do przodu), PgUp/PgDn — Y; krok 10 mm, z Shift 100 mm
//   Ctrl+D — duplikuj, Delete — usuń (zaznaczone fronty — tylko fronty), Esc — odznacz
export function initShortcuts(store, ui) {
  const moveSelected = (axis, delta) => {
    const id = ui.get().selectedId;
    store.set((p) => ({
      ...p,
      furniture: p.furniture.map((c) => (c.id === id ? { ...c, [axis]: c[axis] + delta } : c)),
    }));
  };

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      store.redo();
      return;
    }

    if (key === 'escape') {
      ui.set({ ...ui.get(), selectedId: null, selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null });
      return;
    }
    // zaznaczony otwór blatu / półki: Delete — usuń, strzałki — przesuń (10 mm, z Shift 100 mm; ↑ — w głąb)
    const hole = ui.get().selectedHole;
    if (hole) {
      const updateHoles = (fn) =>
        store.set((p) => {
          const list = hole.kind === 'trim' ? 'trims' : 'boards';
          return { ...p, [list]: (p[list] ?? []).map((o) => (o.id === hole.id ? { ...o, holes: fn(o.holes ?? []) } : o)) };
        });
      const step = e.shiftKey ? 100 : 10;
      const arrows = { arrowleft: ['x', -step], arrowright: ['x', step], arrowup: ['y', step], arrowdown: ['y', -step] };
      if (key === 'delete') {
        e.preventDefault();
        updateHoles((hs) => hs.filter((_, i) => i !== hole.index));
        ui.set({ ...ui.get(), selectedHole: null });
      } else if (arrows[key] && !ctrl) {
        e.preventDefault();
        const [axis, d] = arrows[key];
        updateHoles((hs) => hs.map((h, i) => (i === hole.index ? moveHole(h, axis, d) : h))); // w rogu — zmienia odstęp
      }
      return;
    }
    const id = ui.get().selectedId;
    if (!id) return;
    const step = e.shiftKey ? 100 : 10;
    const moves = {
      arrowleft: ['x', -step],
      arrowright: ['x', step],
      arrowup: ['z', -step],
      arrowdown: ['z', step],
      pageup: ['y', step],
      pagedown: ['y', -step],
    };

    if (moves[key] && !ctrl) {
      e.preventDefault();
      moveSelected(...moves[key]);
    } else if (ctrl && key === 'd') {
      e.preventDefault();
      const copy = duplicateCabinet(store.get(), id);
      store.set((p) => ({ ...p, furniture: [...p.furniture, copy] }));
      ui.set({ ...ui.get(), selectedId: copy.id }, { reveal: true });
    } else if (key === 'delete') {
      e.preventDefault();
      const fronts = ui.get().selectedFronts ?? [];
      if (fronts.length) {
        // zaznaczone fronty (także z kilku korpusów) — usuwamy tylko je, korpusy zostają
        const byCabinet = new Map();
        for (const f of fronts) {
          const [cabId, key] = f.split(':');
          byCabinet.set(cabId, [...(byCabinet.get(cabId) ?? []), key]);
        }
        store.set((p) => ({
          ...p,
          furniture: p.furniture.map((c) => (byCabinet.has(c.id) ? removeFronts(c, byCabinet.get(c.id)) : c)),
        }));
        ui.set({ ...ui.get(), selectedFronts: [] });
      } else if ((ui.get().selectedBlends ?? []).length) {
        // zaznaczona blenda — Delete nie usuwa całego korpusu (blendę usuwa się w zakładce „Blendy”)
      } else {
        store.set((p) => ({ ...p, furniture: p.furniture.filter((c) => c.id !== id) }));
      }
    }
  });
}
