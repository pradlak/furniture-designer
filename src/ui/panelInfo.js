import { cabinetPanels, panelCutSize, describeCuts, describeMilling, describeHandle, describeHinges } from '../model/furniture.js';
import { panelEdgeSet, isManualEdgeSet, edgeKeys, edgeCounts, EDGE_LABELS } from '../model/edges.js';

// Menu „wymiary i obrzeże” jednej płyty korpusu (bok, wieniec, półka, front, blenda boczna…) — w widoku 3D
// po prawym kliknięciu: wymiary gotowe i do cięcia, materiał, które krawędzie są oklejone (z długością
// każdej krawędzi) i przełączniki obrzeża (ręczny wybór, jak w karcie korpusu; ↺ — z powrotem automatycznie).
// → { title, items } dla ui/contextMenu.js albo null, gdy płyty nie ma.

const DIM = { x: 'width', y: 'height', z: 'depth' };
const r = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Długość krawędzi: biegnie wzdłuż osi lica innej niż jej własna (np. przód boku — wzdłuż wysokości).
function edgeLength(panel, key) {
  const along = ['x', 'y', 'z'].find((a) => a !== panel.thicknessAxis && a !== key[0]);
  return panel[DIM[along]];
}

export function panelInfoMenu(store, cabinetId, panelKey) {
  const project = store.get();
  const cabinet = project.furniture.find((c) => c.id === cabinetId);
  const panel = cabinet && cabinetPanels(cabinet, project).find((p) => p.key === panelKey);
  if (!panel) return null;
  const title = `${cabinet.name} · ${panel.name}`;
  if (!panel.valid) return { title, items: [{ info: true, icon: '⚠', label: 'Błędne wymiary płyty — popraw je w karcie korpusu.' }] };

  const edgeSet = panelEdgeSet(panel, cabinet, project);
  const s = panelCutSize({ ...panel, edges: edgeCounts(panel, panel.thicknessAxis, edgeSet) });
  const manual = isManualEdgeSet(panel, cabinet);
  const items = [
    { info: true, icon: '▭', label: `Materiał: ${panel.material.name}` },
    { info: true, icon: '📐', label: `Wymiar gotowy: ${r(s.length)} × ${r(s.width)} × ${r(s.thickness)} mm` },
  ];
  if (s.band && (s.edges.l || s.edges.w)) {
    items.push({ info: true, icon: '✂', label: `Do cięcia: ${r(s.cutLength)} × ${r(s.cutWidth)} mm (bez obrzeża)` });
  }
  if (s.allowance) items.push({ info: true, icon: '⚠', label: `Zapas na docięcie +${r(s.allowance)} mm (wliczony)` });
  const work = [describeCuts(s), describeMilling(panel), describeHandle(panel), describeHinges(panel)].filter(Boolean).join('; ');
  if (work) items.push({ info: true, icon: '⚙', label: work });

  if (!s.band) {
    items.push({
      info: true,
      icon: '▤',
      label:
        panel.material.type === 'mdf' || panel.material.type === 'hdf'
          ? 'Obrzeże: brak — tego materiału się nie okleja.'
          : 'Obrzeże: brak — materiał ma grubość obrzeża 0 (można ją ustawić w zakładce „Materiały”).',
    });
    return { title, items };
  }
  items.push({
    info: true,
    icon: '▤',
    label:
      `Obrzeże ${r(s.band)} mm (${manual ? 'wybrane ręcznie' : 'automatycznie — widoczne krawędzie'}): ` +
      (edgeSet.length ? edgeSet.map((k) => EDGE_LABELS[k]).join(', ') : 'brak') +
      (edgeSet.length ? ` · na długości ${s.edges.l}, na szerokości ${s.edges.w}` : ''),
  });

  // Przełączniki krawędzi — menu zostaje otwarte, z odświeżonymi wymiarami.
  const reopen = () => panelInfoMenu(store, cabinetId, panelKey);
  const setEdges = (fn) =>
    store.set((p) => ({
      ...p,
      furniture: p.furniture.map((c) => {
        if (c.id !== cabinetId) return c;
        const o = fn({ ...c.panelOverrides?.[panelKey] }, c, p);
        return { ...c, panelOverrides: { ...c.panelOverrides, [panelKey]: o } };
      }),
    }));
  for (const key of edgeKeys(panel.thicknessAxis)) {
    const on = edgeSet.includes(key);
    items.push({
      icon: on ? '☑' : '☐',
      label: `${EDGE_LABELS[key]} — ${r(edgeLength(panel, key))} mm`,
      run: () => {
        setEdges((o, c, p) => {
          const pn = cabinetPanels(c, p).find((x) => x.key === panelKey);
          const current = panelEdgeSet(pn, c, p);
          return { ...o, edgeSet: on ? current.filter((k) => k !== key) : [...new Set([...current, key])] };
        });
        return reopen();
      },
    });
  }
  if (manual) {
    items.push({
      icon: '↺',
      label: 'Obrzeże automatycznie (widoczne krawędzie)',
      run: () => {
        setEdges(({ edgeSet: _removed, ...o }) => o);
        return reopen();
      },
    });
  }
  return { title, items };
}
