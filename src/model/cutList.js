import { cabinetPanels, cabinetLegs, panelCutSize, describeCuts, describeMilling, describeHandle, describeHinges, hingesFor } from './furniture.js';
import { projectSolids, panelEdgeSet, trimEdgeSet, edgeCounts, TRIM_THICKNESS_AXIS, EDGE_LABELS } from './edges.js';
import { trimSegments, trimAllowance, TRIM_TYPES } from './trims.js';
import { trimMaterial } from './materials.js';
import { buildXlsx } from './xlsx.js';
import { describeEdges, describeHoles } from './boardFeatures.js';
import { boardBox, boardMaterial } from './boards.js';

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
// filter — zawężenie eksportu (okienko „Formatki”); brak pola = bez ograniczenia:
//   cabinetIds: Set — tylko te korpusy (i blendy dolne / górne / blaty obejmujące choć jeden z nich),
//   boards: false — bez samodzielnych blatów i półek,
//   materials: Set — tylko te materiały (nazwy jak na liście formatek, z kolorem, np. „Płyta biała 18 — dąb”).
// Krawędzie do oklejenia liczone są zawsze dla całego projektu (sąsiednie meble zasłaniają krawędzie).
export function buildCutList(project, parts = ALL_PARTS, filter = {}) {
  return mergeRows(collectRows(project, parts, filter));
}

// Pozycja „Samodzielne blaty i półki” na liście mebli (okienko „Formatki”) — w cabinetIds elementów.
export const BOARDS_KEY = '__boards';

// Pojedyncze elementy (bez łączenia), każdy z tym, skąd pochodzi — do zależności w okienku „Formatki”:
// [{ category (klucz z CUT_LIST_PARTS), cabinetIds (korpusy, których dotyczy; samodzielna płyta — [BOARDS_KEY]),
//    material (nazwa), materialType }].
export function cutListItems(project) {
  return collectRows(project, ALL_PARTS, {}).map(({ category, cabinetIds, material, materialType }) => ({ category, cabinetIds, material, materialType }));
}

function collectRows(project, parts, filter) {
  const rows = [];
  const solids = projectSolids(project);
  const { cabinetIds, boards: withBoards = true, materials } = filter;
  // milling — opis frezów frontu (uchwytowy / dekoracyjny), dopisywany do kolumny cięć
  // cabIds — korpusy, których dotyczy element (do zależności w okienku „Formatki”)
  const add = (category, name, owner, material, cut, edgeSet, milling, cabIds) => {
    if (!parts.has(category)) return;
    if (materials && !materials.has(material.name)) return;
    rows.push({
      category,
      cabinetIds: cabIds,
      name,
      owner,
      material: material.name,
      materialType: material.type, // np. chipboard — płyta meblowa (do eksportu na meble.pl)
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
    if (cabinetIds && !cabinetIds.has(c.id)) continue;
    for (const p of cabinetPanels(c, project).filter((x) => x.valid)) {
      const set = panelEdgeSet(p, c, project, solids);
      const work = [describeMilling(p), describeHandle(p), describeHinges(p)].filter(Boolean).join('; '); // frezy i otwory frontu
      add(p.group, p.name, c.name, p.material, panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, set) }), set, work, [c.id]);
    }
  }

  for (const t of project.trims ?? []) {
    if (!parts.has(t.type === 'countertop' ? 'countertop' : 'blend')) continue;
    if (cabinetIds && !t.cabinetIds.some((id) => cabinetIds.has(id))) continue;
    const material = trimMaterial(t, project);
    const a = trimAllowance(t, project);
    const segments = trimSegments(t, project);
    segments.forEach((seg, i) => {
      const box = { ...seg, allowanceMin: i === 0 ? a.min : 0, allowanceMax: i === segments.length - 1 ? a.max : 0 };
      const set = trimEdgeSet(t, seg, i, solids);
      const cut = panelCutSize({ ...box, material, edges: edgeCounts(box, TRIM_THICKNESS_AXIS[t.type], set) });
      // blat: frezy krawędzi i otwory (zlew, płyta grzewcza, przepusty…)
      const work = t.type === 'countertop' ? [describeEdges(t.edges), describeHoles(t.holes, seg.width, seg.depth)].filter(Boolean).join('; ') : '';
      add(t.type === 'countertop' ? 'countertop' : 'blend', t.name || TRIM_TYPES[t.type].label, 'wspólne', material, cut, set, work, t.cabinetIds);
    });
  }

  // Samodzielne płyty (blaty, półki) — z frezami krawędzi i otworami.
  for (const b of withBoards ? (project.boards ?? []) : []) {
    const material = boardMaterial(b, project);
    const box = boardBox(b, project);
    const cut = panelCutSize({ ...box, material, edges: { l: 0, w: 0 } });
    const work = [describeEdges(b.edges), describeHoles(b.holes, box.width, box.depth)].filter(Boolean).join('; ');
    add(b.kind === 'worktop' ? 'countertop' : 'body', b.name, b.kind === 'worktop' ? 'blat samodzielny' : 'półka samodzielna', material, cut, [], work, [BOARDS_KEY]);
  }
  return rows;
}

// Łączenie jednakowych formatek (nazwy i meble zbieramy w jedną kolumnę).
function mergeRows(rows) {
  const merged = new Map();
  for (const r of rows) {
    const key = [r.material, r.thickness, r.length, r.width, r.edgesL, r.edgesW, r.band, r.allowance, r.edgeNames, r.shape].join('|');
    const m = merged.get(key);
    if (m) {
      m.qty += 1;
      if (!m.names.includes(r.name)) m.names.push(r.name);
      if (!m.owners.includes(r.owner)) m.owners.push(r.owner);
    } else {
      const { category: _category, cabinetIds: _cabinetIds, ...row } = r;
      merged.set(key, { ...row, qty: 1, names: [r.name], owners: [r.owner] });
    }
  }
  return [...merged.values()].sort(
    (a, b) => a.material.localeCompare(b.material, 'pl') || b.length - a.length || b.width - a.width,
  );
}

// Akcesoria (nóżki, zawiasy, prowadnice, uchwyty) — osobno, bo to nie formatki.
// cabinetIds (Set) — tylko akcesoria tych korpusów; brak — wszystkich.
export function buildAccessories(project, cabinetIds) {
  const legs = new Map();
  let hinges = 0;
  let slides = 0;
  const handles = new Map(); // nazwa uchwytu (z rozstawem) → ilość
  for (const c of project.furniture) {
    if (cabinetIds && !cabinetIds.has(c.id)) continue;
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
export function cutListRows(project, parts = ALL_PARTS, filter = {}) {
  return buildCutList(project, parts, filter).map((r, i) => ({
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
// options: { parts — rodzaje płyt (domyślnie wszystkie), accessories — czy dołączyć akcesoria (domyślnie tak),
//            filter — które meble i materiały (patrz buildCutList) }.
export function cutListCsv(project, { parts = ALL_PARTS, accessories: withAccessories = true, filter = {} } = {}) {
  const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''));
  const cell = (v) => {
    const s = num(v).replace(/(\d)\.(\d)/g, '$1,$2');
    return /[\t"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (cells) => cells.map(cell).join('\t');
  const lines = [row(CUT_LIST_COLUMNS.map((c) => c.title))];
  const rows = cutListRows(project, parts, filter);
  for (const r of rows) lines.push(row(CUT_LIST_COLUMNS.map((c) => r[c.key])));
  if (!rows.length) lines.pop(); // same akcesoria — bez pustej tabeli formatek
  const accessories = withAccessories ? buildAccessories(project, filter.cabinetIds) : [];
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
export function cutListXlsx(project, { parts = ALL_PARTS, accessories: withAccessories = true, filter = {} } = {}) {
  const header = CUT_LIST_COLUMNS.map((c) => c.title);
  const rows = cutListRows(project, parts, filter).map((r) => CUT_LIST_COLUMNS.map((c) => r[c.key]));
  const sheets = rows.length ? [{ name: 'Formatki', header, rows, widths: CUT_LIST_COLUMNS.map((c) => c.width) }] : [];
  const accessories = withAccessories ? buildAccessories(project, filter.cabinetIds) : [];
  if (accessories.length) {
    sheets.push({ name: 'Akcesoria', header: ['Akcesoria', 'Ilość [szt.]'], rows: accessories.map((a) => [a.name, a.qty]), widths: [50, 12] });
  }
  sheets.push({ name: 'Objaśnienia', header: ['Objaśnienia'], rows: CUT_LIST_NOTES.map((n) => [n]), widths: [140] });
  return buildXlsx(sheets);
}

// --- Eksport do rozkroju na meble.pl (https://www.meble.pl/rozkroj,plyty-meblowe) ---
// Format jak w pliku eksportowanym przez sam meble.pl („pobierz CSV z obecnego rozkroju”): CSV ze
// średnikami (także na końcu każdego wiersza), UTF-8, grubość z dwoma miejscami po kropce (np. 3.00),
// kolumny: Nazwa; Szerokość; Oklejanie szerokości; Wysokość; Oklejanie wysokości; Grubość płyty;
// Ilość sztuk; Słoje. Oklejanie (zapis jak w PRO100): „=” — obie krawędzie tego wymiaru,
// „-” — jedna, puste — bez okleiny. Słoje: 0 — bez znaczenia, 1 — wzdłuż wysokości, 2 / puste — wzdłuż szerokości.
// Płyty meblowe (laminowane) — rozkrój „Płyty meblowe”, i HDF (plecy) — rozkrój „Płyty budowlane”
// (ten sam format pliku). Każdy materiał (dekor) w osobnym pliku, bo jedno zamówienie rozkroju to jedna płyta.
// Fronty i blendy z MDF lakierowanego oraz blaty meble.pl tnie inaczej — nie trafiają do plików.
// Wymiary: gotowej formatki (z okleiną) — Szerokość = krótszy bok, Wysokość = dłuższy bok;
// słoje: płyta meblowa — wzdłuż dłuższego boku (1), żeby dekor drewnopodobny szedł wzdłuż elementu;
// HDF — bez znaczenia (0).
export const MEBLEPL_LIMITS = { minLong: 240, minShort: 100, maxLong: 2500, maxShort: 1200 };

// Gdzie na meble.pl wczytać plik danego rodzaju płyty.
export const MEBLEPL_CUTTING = {
  chipboard: { label: 'Płyty meblowe', url: 'https://www.meble.pl/rozkroj,plyty-meblowe' },
  hdf: { label: 'Płyty budowlane (HDF)', url: 'https://www.meble.pl/rozkroj,plyty' },
};

// → [{ material, type, csv: Uint8Array, count, outOfRange: [opis formatki] }] — po jednym na materiał.
export function cutListMeblePl(project, { parts = ALL_PARTS, filter = {} } = {}) {
  const band = (n) => (n >= 2 ? '=' : n === 1 ? '-' : '');
  const clean = (s) => String(s).replace(/[;\r\n"]/g, ' ').trim();
  const byMaterial = new Map();
  for (const r of buildCutList(project, parts, filter).filter((x) => x.materialType in MEBLEPL_CUTTING)) {
    if (!byMaterial.has(r.material)) byMaterial.set(r.material, []);
    byMaterial.get(r.material).push(r);
  }
  const header =
    'Nazwa (nie wpływa na rozkrój);Szerokość;Oklejanie szerokości;Wysokość;Oklejanie wysokości;Grubość płyty;Ilość sztuk;' +
    'Słoje [0 = bez znaczenia / 1 = po drugim wymiarze (po wysokości) / 2 lub puste = po pierwszym wymiarze (po szerokości)];';
  return [...byMaterial.entries()].map(([material, rows]) => {
    const outOfRange = [];
    const lines = rows.map((r) => {
      const name = clean(`${r.names.join(', ')} (${r.owners.join(', ')})`);
      const short = Math.round(r.width);
      const long = Math.round(r.length);
      const { minLong, minShort, maxLong, maxShort } = MEBLEPL_LIMITS;
      if (long < minLong || short < minShort || long > maxLong || short > maxShort) {
        outOfRange.push(`${r.names.join(', ')}: ${long} × ${short} mm`);
      }
      // edgesW — krawędzie krótkie (o długości szerokości), edgesL — długie (o długości wysokości)
      const grain = r.materialType === 'hdf' ? 0 : 1;
      return [name, short, band(r.edgesW), long, band(r.edgesL), r.thickness.toFixed(2), r.qty, grain, ''].join(';');
    });
    const csv = new TextEncoder().encode([header, ...lines].join('\r\n') + '\r\n');
    return { material, type: rows[0].materialType, csv, count: rows.reduce((s, r) => s + r.qty, 0), outOfRange };
  });
}
