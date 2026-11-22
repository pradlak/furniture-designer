// Systemy szuflad (metalowe boki + docinane samemu dno i plecy z płyty) — rejestr firm i modeli.
// Na razie ATM Futura (katalog „System szuflad FUTURA”). Kolejny system: nowy wpis w DRAWER_SYSTEMS — reszta
// (wybór w okienku szuflady, wymiary dna i pleców, formatki, akcesoria, podgląd 3D) działa sama.
//
// Wzory (dla systemu): LW — szerokość wewnętrzna korpusu (między bokami), NL — długość prowadnic,
//   dno: szerokość LW − bottom.widthOffset, długość NL − bottom.lengthOffset;
//   plecy: szerokość LW − back.widthOffset, wysokość — back.height modelu;
//   płyta: boardThickness mm; minimalna głębokość korpusu: NL + depthMargin.
// Szuflada przy szufladzie: part.system = { key, model, length (null — auto), color, edges? }.
// edges — obrzeże dna i pleców: { back: ['top', …], bottom: [] } (strony jak na szkicu: top / bottom / left / right);
//   bez edges — domyślnie DEFAULT_EDGES (plecy oklejone od góry — widoczna krawędź).
export const PIECE_SIDES = ['top', 'bottom', 'left', 'right'];
export const DEFAULT_EDGES = { back: ['top'], bottom: [] };
const normEdges = (v, def) => (Array.isArray(v) ? PIECE_SIDES.filter((k) => v.includes(k)) : [...def]);

export const DRAWER_SYSTEMS = [
  {
    key: 'atm-futura',
    brand: 'ATM',
    name: 'Futura',
    boardThickness: 16,
    bottom: { widthOffset: 75, lengthOffset: 24 },
    back: { widthOffset: 87 },
    depthMargin: 3, // LT = NL + 3 (głębokość korpusu co najmniej)
    // Prowadnice na bokach korpusu (katalog: „Wewnętrzna przestrzeń korpusu” i „Schemat wierceń”):
    //  axis — oś otworów prowadnicy nad spodem szuflady (dla najniższej szuflady: nad wierzchem wieńca dolnego, min. 34 mm),
    //  frontHole — pierwszy otwór od przedniej krawędzi korpusu (37 mm), prowadnica zaczyna się przy krawędzi korpusu.
    //  Spód szuflady: front nakładany — wierzch wieńca przy froncie na dole korpusu (front + grubość wieńca),
    //  szuflada wewnętrzna — czoło stoi na wieńcu (spód czoła − luz).
    rail: { axis: 34, frontHole: 37 },
    lengths: [300, 350, 400, 450, 500, 550],
    colors: [
      { key: 'P1', label: 'biały P1' },
      { key: 'P32', label: 'antracyt P32' },
    ],
    // sideH — wysokość boku, backH — wysokość pleców (do docięcia), minSpace — min. wolna wysokość w korpusie
    models: [
      { key: 'PK-1600', label: 'niska H90', sideH: 90, backH: 84, minSpace: 112 },
      { key: 'PK-1601', label: 'średnia H122', sideH: 122, backH: 116, minSpace: 144 },
      { key: 'PK-1602', label: 'wysoka H172', sideH: 172, backH: 167, minSpace: 194 },
      { key: 'PK-1603', label: 'bardzo wysoka H203', sideH: 203, backH: 199, minSpace: 230 },
    ],
    loadKg: 40,
  },
];

export const drawerSystem = (key) => DRAWER_SYSTEMS.find((s) => s.key === key) ?? null;
export const systemLabel = (s) => (s ? `${s.brand} ${s.name}` : '');

export function normalizeDrawerSystem(raw) {
  const s = drawerSystem(raw?.key);
  if (!s) return null;
  const model = s.models.some((m) => m.key === raw.model) ? raw.model : s.models[0].key;
  const length = s.lengths.includes(Number(raw.length)) ? Number(raw.length) : null;
  const color = s.colors.some((c) => c.key === raw.color) ? raw.color : s.colors[0].key;
  const out = { key: s.key, model, length, color };
  if (raw.edges && typeof raw.edges === 'object') out.edges = { back: normEdges(raw.edges.back, DEFAULT_EDGES.back), bottom: normEdges(raw.edges.bottom, DEFAULT_EDGES.bottom) };
  return out;
}

// Model dobrany do wysokości frontu szuflady: najwyższy, który się mieści (min. wolna wysokość).
export function suggestModel(system, frontHeight) {
  const fit = system.models.filter((m) => m.minSpace <= frontHeight + 20);
  return (fit.length ? fit[fit.length - 1] : system.models[0]).key;
}

// Wymiary szuflady w systemie: LW (szer. wewn. korpusu), LT (głębokość dostępna) → prowadnice, dno, plecy.
// → { system, model, color, NL, autoLength, bottom: { width, length, thickness }, back: { width, height, thickness },
//     sideH, warnings: [] } albo null
export function drawerSystemBox(sel, { LW, LT, height }) {
  const s = drawerSystem(sel?.key);
  if (!s) return null;
  const model = s.models.find((m) => m.key === sel.model) ?? s.models[0];
  const fitting = s.lengths.filter((l) => l + s.depthMargin <= LT);
  const autoLength = fitting.length ? fitting[fitting.length - 1] : s.lengths[0];
  const NL = sel.length ?? autoLength;
  const warnings = [];
  if (NL + s.depthMargin > LT) warnings.push(`Prowadnice ${NL} mm wymagają głębokości korpusu co najmniej ${NL + s.depthMargin} mm (jest ${Math.round(LT)} mm).`);
  if (height != null && height + 20 < model.minSpace) warnings.push(`Szuflada ${model.key} potrzebuje co najmniej ${model.minSpace} mm wolnej wysokości (front ma ${Math.round(height)} mm).`);
  return {
    system: s,
    model,
    color: s.colors.find((c) => c.key === sel.color) ?? s.colors[0],
    NL,
    autoLength,
    sideH: model.sideH,
    bottom: { width: Math.round(LW - s.bottom.widthOffset), length: NL - s.bottom.lengthOffset, thickness: s.boardThickness, edges: normEdges(sel.edges?.bottom, DEFAULT_EDGES.bottom) },
    back: { width: Math.round(LW - s.back.widthOffset), height: model.backH, thickness: s.boardThickness, edges: normEdges(sel.edges?.back, DEFAULT_EDGES.back) },
    warnings,
  };
}
