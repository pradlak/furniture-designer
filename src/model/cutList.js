import { cabinetPanels, cabinetLegs, panelCutSize, describeCuts, describeMilling, describeHandle, hingesFor } from './furniture.js';
import { projectSolids, panelEdgeSet, trimEdgeSet, edgeCounts, TRIM_THICKNESS_AXIS, EDGE_LABELS } from './edges.js';
import { trimSegments, trimAllowance, TRIM_TYPES } from './trims.js';
import { trimMaterial } from './materials.js';
import { buildXlsx } from './xlsx.js';

// Lista formatek do rozkroju: wszystkie płyty projektu (korpusy, blendy boczne, blendy dolne i górne,
// blaty). Jednakowe formatki (ten sam materiał, wymiary, obrzeże i zapas) łączone są w jeden wiersz.
// Wymiary w mm: gotowy element (z obrzeżem) i do cięcia (pomniejszony o obrzeże).

const round = (v) => Math.round(v * 10) / 10;

// Co można wyeksportować (okienko „Formatki”): rodzaje płyt i akcesoria.
//  body — korpusy (boki, wieńce, półki, wzmocnienia, plecy z płyty), hdf — plecy HDF, front — fronty,
//  blend — blendy (boczne, panele boczne, cokoły boczne, blendy dolne i górne), countertop — blaty.
export const CUT_LIST_PARTS = [
  { key: 'body', label: 'Korpusy', hint: 'boki, wieńce, półki, wzmocnienia' },
  { key: 'hdf', label: 'Plecy HDF' },
  { key: 'front', label: 'Fronty', hint: 'drzwi, szuflady — z frezami i otworami pod uchwyty' },
  { key: 'blend', label: 'Blendy', hint: 'boczne, panele boczne, dolne, górne' },
  { key: 'countertop', label: 'Blaty' },
];
export const ALL_PARTS = new Set(CUT_LIST_PARTS.map((p) => p.key));

// parts — które rodzaje płyt (klucze z CUT_LIST_PARTS); domyślnie wszystkie.
export function buildCutList(project, parts = ALL_PARTS) {
  const rows = [];
  const solids = projectSolids(project);
  // milling — opis frezów frontu (uchwytowy / dekoracyjny), dopisywany do kolumny cięć
  const add = (category, name, owner, material, cut, edgeSet, milling = '') => {
    if (!parts.has(category)) return;
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
      // skośne cięcia (płyty pod skos), np. „ścięty róg 470 × 560 mm …”, i frezy frontów
      shape: [describeCuts(cut), milling].filter(Boolean).join('; '),
    });
  };

  for (const c of project.furniture) {
    for (const p of cabinetPanels(c, project).filter((x) => x.valid)) {
      const set = panelEdgeSet(p, c, project, solids);
      const work = [describeMilling(p), describeHandle(p)].filter(Boolean).join('; '); // frezy i otwory frontu
      add(p.group, p.name, c.name, p.material, panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, set) }), set, work);
    }
  }

  for (const t of project.trims ?? []) {
    if (!parts.has(t.type === 'countertop' ? 'countertop' : 'blend')) continue;
    const material = trimMaterial(t, project);
    const a = trimAllowance(t, project);
    const segments = trimSegments(t, project);
    segments.forEach((seg, i) => {
      const box = { ...seg, allowanceMin: i === 0 ? a.min : 0, allowanceMax: i === segments.length - 1 ? a.max : 0 };
      const set = trimEdgeSet(t, seg, i, solids);
      const cut = panelCutSize({ ...box, material, edges: edgeCounts(box, TRIM_THICKNESS_AXIS[t.type], set) });
      add(t.type === 'countertop' ? 'countertop' : 'blend', t.name || TRIM_TYPES[t.type].label, 'wspólne', material, cut, set);
    });
  }

  // Łączenie jednakowych formatek (nazwy i meble zbieramy w jedną kolumnę).
  const merged = new Map();
  for (const r of rows) {
    const key = [r.material, r.thickness, r.length, r.width, r.edgesL, r.edgesW, r.band, r.allowance, r.edgeNames, r.shape].join('|');
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

// Akcesoria (nóżki, zawiasy, prowadnice, uchwyty) — osobno, bo to nie formatki.
export function buildAccessories(project) {
  const legs = new Map();
  let hinges = 0;
  let slides = 0;
  const handles = new Map(); // nazwa uchwytu (z rozstawem) → ilość
  for (const c of project.furniture) {
    for (const l of cabinetLegs(c, project)) legs.set(l.height, (legs.get(l.height) ?? 0) + 1);
    const fronts = cabinetPanels(c, project).filter((p) => p.valid && p.key.startsWith('front-'));
    const type = c.fronts?.type;
    if (type === 'door' || type === 'doubleDoor') hinges += fronts.reduce((s, p) => s + hingesFor(p.height), 0);
    if (type === 'drawers') slides += fronts.length;
    // uchwyty: według rodzaju i rozstawu (front z frezem uchwytowym nie ma uchwytu)
    for (const p of fronts) {
      if (!p.handle) continue;
      const name = p.handle.type === 'knob' ? 'Gałka meblowa' : `Uchwyt meblowy, rozstaw ${p.handle.spacing} mm`;
      handles.set(name, (handles.get(name) ?? 0) + 1);
    }
  }
  return [
    ...[...legs.entries()].map(([height, qty]) => ({ name: `Nóżka meblowa ${height} mm`, qty })),
    ...(hinges ? [{ name: 'Zawias puszkowy (do frontów nakładanych)', qty: hinges }] : []),
    ...(slides ? [{ name: 'Prowadnice do szuflad (komplet na szufladę)', qty: slides }] : []),
    ...[...handles.entries()].map(([name, qty]) => ({ name, qty })),
  ];
}

// Tabela formatek dla ludzi (wspólna dla CSV i XLSX): kolumny z jednostkami w nagłówkach,
// najpierw to, co potrzebne przy zamawianiu cięcia (materiał, wymiary do cięcia, ilość, okleina).
// Liczby zostają liczbami (w XLSX — prawdziwe liczby, w CSV — z przecinkiem dziesiętnym).
export const CUT_LIST_COLUMNS = [
  { key: 'lp', title: 'Lp.', width: 5 },
  { key: 'material', title: 'Materiał', width: 30 },
  { key: 'thickness', title: 'Grubość [mm]', width: 9 },
  { key: 'cutLength', title: 'Długość do cięcia [mm]', width: 12 },
  { key: 'cutWidth', title: 'Szerokość do cięcia [mm]', width: 12 },
  { key: 'qty', title: 'Ilość [szt.]', width: 8 },
  { key: 'edgesL', title: 'Okleina na długości [szt.]', width: 12 },
  { key: 'edgesW', title: 'Okleina na szerokości [szt.]', width: 12 },
  { key: 'band', title: 'Grubość okleiny [mm]', width: 10 },
  { key: 'edgeNames', title: 'Oklejone krawędzie', width: 30 },
  { key: 'length', title: 'Długość gotowa [mm]', width: 11 },
  { key: 'width', title: 'Szerokość gotowa [mm]', width: 11 },
  { key: 'allowance', title: 'Zapas na docięcie [mm] (wliczony)', width: 13 },
  { key: 'names', title: 'Element', width: 34 },
  { key: 'owners', title: 'Mebel', width: 20 },
  { key: 'shape', title: 'Obróbka (cięcia skośne, frezy, otwory)', width: 60 },
];

export const CUT_LIST_NOTES = [
  'Wymiary w mm.',
  '„Do cięcia” — wymiar formatki do zamówienia (pomniejszony o grubość okleiny); „gotowa” — wymiar po oklejeniu.',
  'Okleina na długości / szerokości — ile krawędzi danego boku trzeba okleić (0, 1 albo 2).',
  'Płyty pod skos: wymiar to prostokąt, z którego wycina się formatkę; „ścięty róg A × B” — odcinany trójkąt, A wzdłuż długości, B wzdłuż szerokości.',
  'Otwory pod uchwyty: współrzędne (poziomo; pionowo) środków otworów w mm od lewego dolnego narożnika frontu, patrząc na front od przodu.',
];

// Wiersze tabeli formatek: obiekty z kluczami jak w CUT_LIST_COLUMNS (puste komórki — '').
export function cutListRows(project, parts = ALL_PARTS) {
  return buildCutList(project, parts).map((r, i) => ({
    lp: i + 1,
    material: r.material,
    thickness: r.thickness,
    cutLength: r.cutLength,
    cutWidth: r.cutWidth,
    qty: r.qty,
    edgesL: r.edgesL,
    edgesW: r.edgesW,
    band: r.band || '',
    edgeNames: r.edgeNames,
    length: r.length,
    width: r.width,
    allowance: r.allowance || '',
    names: r.names.join(', '),
    owners: r.owners.join(', '),
    shape: r.shape,
  }));
}

// CSV: kolumny oddzielone tabulatorami (w Notatniku widać kolumny), przecinek dziesiętny.
// Kodowanie UTF-16 LE z BOM — Excel otwiera taki plik od razu w kolumnach (niezależnie od ustawień
// regionalnych) i z polskimi znakami. Zwraca Uint8Array gotowy do zapisu.
// options: { parts — rodzaje płyt (domyślnie wszystkie), accessories — czy dołączyć akcesoria (domyślnie tak) }.
export function cutListCsv(project, { parts = ALL_PARTS, accessories: withAccessories = true } = {}) {
  const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''));
  const cell = (v) => {
    const s = num(v).replace(/(\d)\.(\d)/g, '$1,$2');
    return /[\t"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (cells) => cells.map(cell).join('\t');
  const lines = [row(CUT_LIST_COLUMNS.map((c) => c.title))];
  const rows = cutListRows(project, parts);
  for (const r of rows) lines.push(row(CUT_LIST_COLUMNS.map((c) => r[c.key])));
  if (!rows.length) lines.pop(); // same akcesoria — bez pustej tabeli formatek
  const accessories = withAccessories ? buildAccessories(project) : [];
  if (accessories.length) {
    if (lines.length) lines.push('');
    lines.push(row(['Akcesoria', 'Ilość [szt.]']), ...accessories.map((a) => row([a.name, a.qty])));
  }
  lines.push('', ...CUT_LIST_NOTES.map((n) => row([n])));
  return utf16le('\uFEFF' + lines.join('\r\n'));
}

function utf16le(text) {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >> 8;
  }
  return bytes;
}

// XLSX: arkusze „Formatki” (z pogrubionym, zamrożonym nagłówkiem i szerokimi kolumnami),
// „Akcesoria” i „Objaśnienia”. Zwraca Uint8Array (plik .xlsx). options — jak w cutListCsv.
export function cutListXlsx(project, { parts = ALL_PARTS, accessories: withAccessories = true } = {}) {
  const header = CUT_LIST_COLUMNS.map((c) => c.title);
  const rows = cutListRows(project, parts).map((r) => CUT_LIST_COLUMNS.map((c) => r[c.key]));
  const sheets = rows.length ? [{ name: 'Formatki', header, rows, widths: CUT_LIST_COLUMNS.map((c) => c.width) }] : [];
  const accessories = withAccessories ? buildAccessories(project) : [];
  if (accessories.length) {
    sheets.push({ name: 'Akcesoria', header: ['Akcesoria', 'Ilość [szt.]'], rows: accessories.map((a) => [a.name, a.qty]), widths: [50, 12] });
  }
  sheets.push({ name: 'Objaśnienia', header: ['Objaśnienia'], rows: CUT_LIST_NOTES.map((n) => [n]), widths: [140] });
  return buildXlsx(sheets);
}
