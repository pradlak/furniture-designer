import { cabinetPanels, cabinetLegs, panelCutSize } from './furniture.js';
import { projectSolids, panelEdgeSet, trimEdgeSet, edgeCounts, TRIM_THICKNESS_AXIS, EDGE_LABELS } from './edges.js';
import { trimSegments, trimAllowance, TRIM_TYPES } from './trims.js';
import { trimMaterial } from './materials.js';

// Lista formatek do rozkroju: wszystkie płyty projektu (korpusy, blendy boczne, blendy dolne i górne,
// blaty). Jednakowe formatki (ten sam materiał, wymiary, obrzeże i zapas) łączone są w jeden wiersz.
// Wymiary w mm: gotowy element (z obrzeżem) i do cięcia (pomniejszony o obrzeże).

const round = (v) => Math.round(v * 10) / 10;

export function buildCutList(project) {
  const rows = [];
  const solids = projectSolids(project);
  const add = (name, owner, material, cut, edgeSet) => {
    rows.push({
      name,
      owner,
      material: material.name,
      thickness: round(cut.thickness),
      length: round(cut.length),
      width: round(cut.width),
      cutLength: round(cut.cutLength),
      cutWidth: round(cut.cutWidth),
      edgesL: cut.band ? cut.edges.l : 0,
      edgesW: cut.band ? cut.edges.w : 0,
      band: cut.band,
      allowance: round(cut.allowance ?? 0),
      edgeNames: cut.band ? edgeSet.map((k) => EDGE_LABELS[k]).join(', ') : '',
    });
  };

  for (const c of project.furniture) {
    for (const p of cabinetPanels(c, project).filter((x) => x.valid)) {
      const set = panelEdgeSet(p, c, project, solids);
      add(p.name, c.name, p.material, panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, set) }), set);
    }
  }

  for (const t of project.trims ?? []) {
    const material = trimMaterial(t, project);
    const a = trimAllowance(t, project);
    const segments = trimSegments(t, project);
    segments.forEach((seg, i) => {
      const box = { ...seg, allowanceMin: i === 0 ? a.min : 0, allowanceMax: i === segments.length - 1 ? a.max : 0 };
      const set = trimEdgeSet(t, seg, i, solids);
      const cut = panelCutSize({ ...box, material, edges: edgeCounts(box, TRIM_THICKNESS_AXIS[t.type], set) });
      add(t.name || TRIM_TYPES[t.type].label, 'wspólne', material, cut, set);
    });
  }

  // Łączenie jednakowych formatek (nazwy i meble zbieramy w jedną kolumnę).
  const merged = new Map();
  for (const r of rows) {
    const key = [r.material, r.thickness, r.length, r.width, r.edgesL, r.edgesW, r.band, r.allowance, r.edgeNames].join('|');
    const m = merged.get(key);
    if (m) {
      m.qty += 1;
      if (!m.names.includes(r.name)) m.names.push(r.name);
      if (!m.owners.includes(r.owner)) m.owners.push(r.owner);
    } else {
      merged.set(key, { ...r, qty: 1, names: [r.name], owners: [r.owner] });
    }
  }
  return [...merged.values()].sort(
    (a, b) => a.material.localeCompare(b.material, 'pl') || b.length - a.length || b.width - a.width,
  );
}

// Akcesoria (na razie nóżki) — osobno, bo to nie formatki.
export function buildAccessories(project) {
  const legs = new Map();
  for (const c of project.furniture) {
    for (const l of cabinetLegs(c, project)) legs.set(l.height, (legs.get(l.height) ?? 0) + 1);
  }
  return [...legs.entries()].map(([height, qty]) => ({ name: `Nóżka meblowa ${height} mm`, qty }));
}

// CSV dla Excela: separator średnik, przecinek dziesiętny, BOM (polskie znaki).
export function cutListCsv(project) {
  const num = (v) => String(v).replace('.', ',');
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'Lp.',
    'Element',
    'Mebel',
    'Materiał',
    'Grubość',
    'Długość',
    'Szerokość',
    'Ilość',
    'Długość do cięcia',
    'Szerokość do cięcia',
    'Obrzeże dł. (szt.)',
    'Obrzeże kr. (szt.)',
    'Grubość obrzeża',
    'Oklejone krawędzie',
    'Zapas na docięcie',
  ];
  const lines = [header.join(';')];
  buildCutList(project).forEach((r, i) => {
    lines.push(
      [
        i + 1,
        r.names.join(', '),
        r.owners.join(', '),
        r.material,
        num(r.thickness),
        num(r.length),
        num(r.width),
        r.qty,
        num(r.cutLength),
        num(r.cutWidth),
        r.edgesL,
        r.edgesW,
        r.band ? num(r.band) : '',
        r.edgeNames,
        r.allowance ? `${num(r.allowance)} (wliczony)` : '',
      ]
        .map(cell)
        .join(';'),
    );
  });
  const accessories = buildAccessories(project);
  if (accessories.length) {
    lines.push('', 'Akcesoria;Ilość', ...accessories.map((a) => `${cell(a.name)};${a.qty}`));
  }
  lines.push('', 'Wymiary w mm. Długość i szerokość — gotowy element (z obrzeżem); „do cięcia” — pomniejszone o obrzeże.');
  return '﻿' + lines.join('\r\n');
}
