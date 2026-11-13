import { LIMITS, isPointInside, slopePlanes, DEFAULT_SLOPE_GAP, DEFAULT_CEILING_GAP } from './space.js';
import { cabinetMaterials, trimMaterial } from './materials.js';
import { boxSolid, clipSolid, isClippedBy, solidBounds, extentAlong, solidsOverlap, vertices, outline2d } from './solid.js';

// Mebel (na razie: prosty korpus) — wymiary w mm, w układzie współrzędnych przestrzeni.
// Pozycja (x, y, z) to narożnik lewy‑dolny‑tylny całego mebla (z = odległość pleców od tylnej ściany).
// Jeśli mebel ma nóżki, korpus zaczyna się na wysokości y + wysokość nóżek;
// `height` to zawsze wysokość samego korpusu (bez nóżek).

export const BOARD_THICKNESSES = [12, 16, 18, 22, 25, 28, 36];

export const LEG_DIAMETER = 40;
export const LEG_INSET = 50; // odległość osi nóżki od krawędzi korpusu
export const LEG_HEIGHTS = [50, 80, 100, 120, 150];
export const LEG_LIMITS = { min: 10, max: 500 };

export const BACK_TYPES = [
  { key: 'hdf', label: 'HDF (nakładane)' },
  { key: 'board', label: 'Z płyty (wpuszczane)' },
  { key: 'none', label: 'Brak' },
];

// Sposób łączenia wieńca z bokami.
//  inset   — wieniec między bokami, boki na całą wysokość,
//  overlay — wieniec na całą szerokość korpusu; boki stoją na wieńcu dolnym / wieniec górny leży na bokach.
export const JOINT_TYPES = {
  bottom: [
    { key: 'inset', label: 'Między bokami' },
    { key: 'overlay', label: 'Pod bokami (boki stoją na wieńcu)' },
  ],
  top: [
    { key: 'inset', label: 'Między bokami' },
    { key: 'overlay', label: 'Na bokach (leży na bokach)' },
  ],
};

// Góra korpusu: pełny wieniec albo dwa trawersy (poprzeczki pod blat) o zadanej szerokości.
export const TOP_TYPES = [
  { key: 'full', label: 'Pełny wieniec' },
  { key: 'rails', label: 'Dwa trawersy (pod blat)' },
];
export const DEFAULT_RAIL_WIDTH = 120;

// Poprzeczki usztywniające: pionowe listwy z płyty tuż przed plecami, między bokami.
// Mieszczą się w korpusie — nie zmieniają wymiarów mebla.
// „Równo rozłożone” (even) — domyślne: wszystkie takie poprzeczki dzielą wnętrze na równe części
// i rozstawiają się na nowo po dodaniu / usunięciu poprzeczki albo zmianie wysokości korpusu.
export const STIFFENER_POSITIONS = [
  { key: 'even', label: 'Tył – równo rozłożone' },
  { key: 'backTop', label: 'Tył – pod górą' },
  { key: 'backBottom', label: 'Tył – nad dołem' },
  { key: 'backAt', label: 'Tył – na wysokości…' },
];
export const DEFAULT_STIFFENER_HEIGHT = 100;

export function createStiffener(cabinet) {
  return { id: newId(), position: 'even', height: DEFAULT_STIFFENER_HEIGHT, y: Math.round(cabinet.height / 2) };
}

export const stiffenerKey = (s) => `stiff-${s.id}`;

// Fronty (nakładane — płyty przed korpusem): drzwi pojedyncze, drzwi podwójne albo szuflady.
// Szczelina `gap` — między frontami i na obwodzie (po połowie przy krawędziach korpusu, żeby
// sąsiednie korpusy miały między frontami pełną szczelinę). Pod blendą górną front kończy się
// szczelinę pod blendą. Szuflady — na razie same fronty (bez skrzynek), równej wysokości.
export const FRONT_TYPES = [
  { key: 'none', label: 'Brak' },
  { key: 'door', label: 'Drzwi pojedyncze' },
  { key: 'doubleDoor', label: 'Drzwi podwójne' },
  { key: 'drawers', label: 'Szuflady' },
];
export const FRONT_LIMITS = { drawersMax: 10, gapMax: 20 };
export const DEFAULT_FRONT_GAP = 3;

// Frez uchwytowy (uchwyt wyfrezowany w krawędzi frontu — zamiast uchwytu przykręcanego):
// krawędź górna, dolna albo krawędź otwierania drzwi (przeciwna do zawiasów; w szufladach — górna).
export const HANDLE_GROOVES = [
  { key: 'none', label: 'Brak (uchwyt przykręcany)' },
  { key: 'top', label: 'Górna krawędź' },
  { key: 'bottom', label: 'Dolna krawędź' },
  { key: 'opening', label: 'Krawędź otwierania' },
];
export const HANDLE_GROOVE_SIZE = 20; // mm — szerokość frezu od krawędzi (do widoku)

// Frez dekoracyjny lica frontu: ramka (margines od krawędzi) albo poziome rowki (rozstaw).
export const FRONT_DECORS = [
  { key: 'none', label: 'Brak' },
  { key: 'frame', label: 'Ramka' },
  { key: 'lines', label: 'Poziome rowki' },
];
export const DECOR_LIMITS = { min: 10, max: 500 };

// Uchwyty: listwowy (dwa otwory w rozstawie) albo gałka (jeden otwór). W drzwiach — pionowo przy
// krawędzi otwierania, w szufladach — poziomo na środku szerokości. Położenie na wysokości frontu:
// góra / środek / dół; edgeOffset — odległość osi otworów od krawędzi (otwierania w drzwiach,
// górnej / dolnej przy położeniu „góra” / „dół”).
export const HANDLE_TYPES = [
  { key: 'none', label: 'Brak' },
  { key: 'bar', label: 'Uchwyt listwowy (2 otwory)' },
  { key: 'knob', label: 'Gałka (1 otwór)' },
];
export const HANDLE_POSITIONS = [
  { key: 'top', label: 'Góra' },
  { key: 'center', label: 'Środek' },
  { key: 'bottom', label: 'Dół' },
];
// Standardowe rozstawy otworów uchwytów meblowych (mm).
export const HANDLE_SPACINGS = [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 416, 448, 480, 512, 640, 800];
export const HANDLE_LIMITS = { spacingMin: 16, spacingMax: 2000, holeMin: 2, holeMax: 20, offsetMin: 10, offsetMax: 1000 };
export const defaultHandle = () => ({ type: 'bar', spacing: 128, hole: 5, position: 'center', edgeOffset: 40 });

export const defaultFronts = () => ({
  type: 'none',
  drawers: 3,
  hingeSide: 'left',
  gap: DEFAULT_FRONT_GAP,
  groove: 'none',
  decor: 'none',
  decorMargin: 60, // ramka: odległość frezu od krawędzi frontu
  decorSpacing: 100, // rowki: odstęp między rowkami
  handle: defaultHandle(),
});

// Uchwyt na froncie (panel — płyta frontu w układzie przestrzeni): otwory { x, y } na licu frontu,
// kierunek (vertical / horizontal) i czy mieści się na froncie (z zapasem 10 mm od krawędzi).
function placeHandle(panel, spec) {
  const { x, y, width: w, height: h } = panel;
  const hinge = panel.opening?.hinge; // drzwi: zawiasy po lewej → uchwyt przy prawej krawędzi
  const vertical = !!hinge;
  const off = spec.edgeOffset;
  const half = spec.type === 'bar' ? spec.spacing / 2 : 0;
  // środek uchwytu
  let cx;
  let cy;
  if (vertical) {
    cx = hinge === 'left' ? x + w - off : x + off;
    cy = { top: y + h - off - half, center: y + h / 2, bottom: y + off + half }[spec.position];
  } else {
    cx = x + w / 2;
    cy = { top: y + h - off, center: y + h / 2, bottom: y + off }[spec.position];
  }
  const holes =
    spec.type === 'knob'
      ? [{ x: cx, y: cy }]
      : vertical
        ? [{ x: cx, y: cy - half }, { x: cx, y: cy + half }]
        : [{ x: cx - half, y: cy }, { x: cx + half, y: cy }];
  const margin = 10;
  const fits = holes.every((p) => p.x >= x + margin && p.x <= x + w - margin && p.y >= y + margin && p.y <= y + h - margin);
  return { type: spec.type, spacing: spec.spacing, hole: spec.hole, vertical, holes, fits };
}

// Opis otworów pod uchwyt do listy formatek: współrzędne od lewego dolnego narożnika frontu (patrząc od przodu),
// np. „otwory pod uchwyt (rozstaw 128 mm): 2 × Ø5 mm — (623; 935), (623; 1063) mm od lewego dolnego narożnika”.
export function describeHandle(panel) {
  const hd = panel.handle;
  if (!hd) return '';
  const r = (v) => Math.round(v * 10) / 10;
  const pts = hd.holes.map((p) => `(${r(p.x - panel.x)}; ${r(p.y - panel.y)})`).join(', ');
  const what = hd.type === 'knob' ? 'otwór pod gałkę' : `otwory pod uchwyt (rozstaw ${hd.spacing} mm)`;
  return `${what}: ${hd.holes.length} × Ø${hd.hole} mm — ${pts} mm od lewego dolnego narożnika`;
}

// Krawędź frontu (jak w obrzeżu: xMin / xMax / yMin / yMax), na której jest frez uchwytowy.
function grooveEdge(groove, frontKind) {
  if (groove === 'top') return 'yMax';
  if (groove === 'bottom') return 'yMin';
  if (groove !== 'opening') return null;
  // krawędź otwierania: drzwi z zawiasami po lewej — prawa krawędź; szuflady — górna
  return { doorLeftHinge: 'xMax', doorRightHinge: 'xMin', drawer: 'yMax' }[frontKind];
}

// Opis frezów frontu do listy formatek, np. „frez uchwytowy: górna krawędź; frez dekoracyjny: ramka 60 mm”.
export function describeMilling(panel) {
  const m = panel.milling;
  if (!m) return '';
  const edge = { yMax: 'górna krawędź', yMin: 'dolna krawędź', xMin: 'lewa krawędź', xMax: 'prawa krawędź' }[m.groove];
  return [
    edge && `frez uchwytowy: ${edge}`,
    m.decor === 'frame' && `frez dekoracyjny: ramka ${m.decorMargin} mm od krawędzi`,
    m.decor === 'lines' && `frez dekoracyjny: poziome rowki co ${m.decorSpacing} mm`,
  ]
    .filter(Boolean)
    .join('; ');
}
export const frontKey = (i) => `front-${i}`;

// Usunięcie jednego frontu (zaznaczonego w widoku 3D): drzwi pojedyncze — korpus bez frontu;
// jedno skrzydło drzwi podwójnych — zostają drzwi pojedyncze z zawiasami po stronie pozostałego skrzydła;
// szuflada — o jedną szufladę mniej (ostatnia — korpus bez frontu).
export function removeFront(cabinet, key) {
  const fr = cabinet.fronts ?? defaultFronts();
  const index = Number(String(key).split('-')[1]);
  if (fr.type === 'drawers' && (fr.drawers ?? 1) > 1) return { ...cabinet, fronts: { ...fr, drawers: fr.drawers - 1 } };
  if (fr.type === 'doubleDoor') return { ...cabinet, fronts: { ...fr, type: 'door', hingeSide: index === 0 ? 'right' : 'left' } };
  return { ...cabinet, fronts: { ...fr, type: 'none' } };
}

// Usunięcie kilku frontów jednego korpusu naraz (np. zaznaczonych z Ctrl): szuflady — o tyle mniej,
// jedno skrzydło drzwi podwójnych — jak removeFront, wszystkie fronty — korpus bez frontu.
export function removeFronts(cabinet, keys) {
  const fr = cabinet.fronts ?? defaultFronts();
  const n = new Set(keys).size;
  if (fr.type === 'drawers' && (fr.drawers ?? 1) > n) return { ...cabinet, fronts: { ...fr, drawers: fr.drawers - n } };
  if (fr.type === 'doubleDoor' && n === 1) return removeFront(cabinet, keys[0]);
  return { ...cabinet, fronts: { ...fr, type: 'none' } };
}

// Liczba zawiasów puszkowych na drzwi o danej wysokości (typowe zalecenia producentów).
export const hingesFor = (height) => (height <= 900 ? 2 : height <= 1600 ? 3 : height <= 2000 ? 4 : 5);

// Półki: position 'even' — równo rozłożone (domyślnie), 'at' — na wysokości y (od dołu korpusu);
// depth: null = pełna głębokość wnętrza (od pleców do przodu), liczba — półka płytsza (skrócona od przodu).
export function createShelf(cabinet) {
  return { id: newId(), position: 'even', y: Math.round(cabinet.height / 2), depth: null };
}
export const shelfKey = (s) => `shelf-${s.id}`;

// Ręczna zmiana wysokości jednej półki: pozostałe półki zostają dokładnie tam, gdzie są
// (równo rozłożone są „zamrażane” na swoich wysokościach), a zmieniana dostaje wysokość y.
export function setShelfY(cabinet, shelfId, y, project) {
  const frozen = new Map(cabinet.shelves.map((s) => [s.id, Math.round(shelfPlacement(cabinet, s, project).y)]));
  return {
    ...cabinet,
    shelves: cabinet.shelves.map((s) =>
      s.id === shelfId ? { ...s, position: 'at', y } : s.position === 'even' ? { ...s, position: 'at', y: frozen.get(s.id) } : s,
    ),
  };
}

// Wszystkie półki korpusu z powrotem równo rozłożone.
export const spreadShelvesEvenly = (cabinet) => ({
  ...cabinet,
  shelves: cabinet.shelves.map((s) => ({ ...s, position: 'even' })),
});

// Nowa półka: gdy wszystkie półki są równo rozłożone — też równo (rozkład przelicza się dla wszystkich);
// gdy są ustawione ręcznie — w środku największego prześwitu (pozostałe się nie ruszają).
export function addShelf(cabinet, project) {
  const shelf = createShelf(cabinet);
  const shelves = cabinet.shelves ?? [];
  if (shelves.every((s) => s.position === 'even')) return { ...cabinet, shelves: [...shelves, shelf] };
  const panels = cabinetPanels(cabinet, project);
  const base = cabinet.y + legHeight(cabinet);
  const bottom = panels.find((p) => p.key === 'bottom');
  const tops = panels.filter((p) => ['top', 'topSlope', 'railFront', 'railBack'].includes(p.key));
  const t = panels.find((p) => p.key.startsWith('shelf-'))?.height ?? 18;
  // zajęte pasy: wieniec dolny, półki, wieniec górny
  const bands = [
    [-Infinity, bottom ? bottom.y + bottom.height - base : 0],
    ...panels.filter((p) => p.key.startsWith('shelf-')).map((p) => [p.y - base, p.y - base + p.height]),
    [tops.length ? Math.min(...tops.map((p) => p.y - base)) : cabinet.height, Infinity],
  ].sort((a, b) => a[0] - b[0]);
  let best = null;
  for (let i = 0; i < bands.length - 1; i++) {
    const [from, to] = [bands[i][1], bands[i + 1][0]];
    if (to - from > t && (!best || to - from > best[1] - best[0])) best = [from, to];
  }
  const y = best ? Math.round((best[0] + best[1] - t) / 2) : shelf.y;
  return { ...cabinet, shelves: [...shelves, { ...shelf, position: 'at', y }] };
}

// Położenie (spód półki od dołu korpusu, bez nóżek) i głębokość półki — tak, jak ją rozmieszcza cabinetPanels.
export function shelfPlacement(cabinet, shelf, project) {
  const panel = cabinetPanels(cabinet, project).find((p) => p.key === shelfKey(shelf));
  if (!panel) return { y: shelf.y ?? 0, depth: shelf.depth ?? cabinet.depth };
  const y = panel.y - cabinet.y - legHeight(cabinet);
  // głębokość z modelu (przycięcie pod skos nie zmienia ustawionej głębokości)
  const base = cabinet.shelves.find((s) => s.id === shelf.id);
  return { y, depth: base?.depth ?? panel.depth };
}

// Wysokość spodu poprzeczki od dołu korpusu (bez nóżek) — tak, jak ją rozmieszcza cabinetPanels.
export function stiffenerY(cabinet, st, project) {
  const panel = cabinetPanels(cabinet, project).find((p) => p.key === stiffenerKey(st));
  return panel ? panel.y - cabinet.y - legHeight(cabinet) : (st.y ?? 0);
}
const stiffenerName = (s) =>
  `Poprzeczka ${{ backTop: 'tylna górna', backBottom: 'tylna dolna', backAt: 'tylna', even: 'tylna' }[s.position]}`;

// Blendy boczne (osobno dla lewej i prawej strony).
//  plinth — cokół boczny: płyta pod korpusem w płaszczyźnie boku, zasłania nóżki z boku,
//  full   — panel boczny na pełną wysokość (od podłogi do góry korpusu), przy boku korpusu,
//  filler — blenda boczna: pas w płaszczyźnie frontu przy boku (wypełnia szczelinę do ściany);
//           opcjonalnie (wallPanel) z panelem na pełną wysokość po zewnętrznej stronie blendy,
//           przylegającym do ściany: korpus → blenda boczna → panel → ściana.
export const SIDE_BLEND_TYPES = [
  { key: 'none', label: 'Brak' },
  { key: 'plinth', label: 'Cokół boczny (pod korpusem)' },
  { key: 'full', label: 'Panel na pełną wysokość' },
  { key: 'filler', label: 'Blenda boczna' },
];

// Elementy korpusu. `thicknessAxis` — oś, wzdłuż której mierzymy grubość płyty
// (dla listwy przy ścianie grubość jest w osi Z — patrz cabinetPanels).
export const PANEL_DEFS = [
  { key: 'left', name: 'Bok lewy', thicknessAxis: 'x' },
  { key: 'right', name: 'Bok prawy', thicknessAxis: 'x' },
  { key: 'bottom', name: 'Wieniec dolny', thicknessAxis: 'y' },
  { key: 'top', name: 'Wieniec górny', thicknessAxis: 'y' },
  { key: 'topSlope', name: 'Wieniec górny skośny', thicknessAxis: 'y' },
  { key: 'railFront', name: 'Trawers przedni', thicknessAxis: 'y' },
  { key: 'railBack', name: 'Trawers tylny', thicknessAxis: 'y' },
  { key: 'back', name: 'Plecy', thicknessAxis: 'z' },
  { key: 'blendLeft', name: 'Blenda lewa', thicknessAxis: 'x' },
  { key: 'blendRight', name: 'Blenda prawa', thicknessAxis: 'x' },
  { key: 'wallPanelLeft', name: 'Panel lewy (przy ścianie)', thicknessAxis: 'x' },
  { key: 'wallPanelRight', name: 'Panel prawy (przy ścianie)', thicknessAxis: 'x' },
];

// Ręczne zmiany elementu: wymiary (sx, sy, sz) i przesunięcia (dx, dy, dz) w osiach X/Y/Z.
// Element jest domyślnie powiązany z korpusem: jego wymiary (poza grubością) wynikają z wymiarów
// korpusu, a ich zmiana zmienia korpus (patrz resizePanelLinked). Flaga `free` odłącza element —
// wtedy ręczne wymiary dotyczą tylko jego.
export const OVERRIDE_KEYS = ['sx', 'sy', 'sz', 'dx', 'dy', 'dz'];

const AXIS_PROP = { x: 'width', y: 'height', z: 'depth' };

export const CABINET_LIMITS = { sizeMin: 50, sizeMax: LIMITS.spaceMax };

export function defaultAccessories() {
  return {
    legs: { enabled: false, height: 80 },
    sideBlends: {
      left: { ...defaultSideBlend() },
      right: { ...defaultSideBlend() },
    },
  };
}

// flushFront — panel boczny / listwa wysunięte do linii frontu (o grubość blendy górnej / frontu),
// extend     — ręczne wysunięcie do przodu, gdy flushFront jest wyłączone.
function defaultSideBlend() {
  // allowance — zapas na docięcie listwy (w stronę ściany); nie liczy się do kolizji
  // hidden — blendy tej strony ukryte w widoku 3D
  // width: null = automatycznie (wypełnia wolne miejsce do ściany / sąsiada — patrz sideBlendWidth)
  // wallPanelDepth — głębokość panelu przy ścianie liczona od frontu (null = pełna głębokość korpusu);
  //                  zwykle widać tylko jego przód, więc nie ma sensu ciąć go na całą głębokość
  return {
    type: 'none',
    width: null,
    wallPanel: false,
    wallPanelDepth: DEFAULT_WALL_PANEL_DEPTH,
    // fullPanelDepth — to samo dla panelu na pełną wysokość; domyślnie pełna głębokość (bok zwykle widać cały)
    fullPanelDepth: null,
    flushFront: false,
    extend: 0,
    allowance: 0,
    hidden: false,
    // toCeiling — blenda / panel górą do sufitu albo skosu (docięta pod kąt skosu), gdy korpus
    // sam sięga sufitu lub skosu; wyłączone — wysokość korpusu.
    toCeiling: true,
  };
}

// O ile panel boczny danej strony wystaje przed korpus.
export function sidePanelExtension(cabinet, side, project) {
  const sb = cabinet.sideBlends?.[side];
  if (!sb) return 0;
  return sb.flushFront ? cabinetContext(cabinet, project).frontThickness : (sb.extend ?? 0);
}

// Góra korpusu pod skos (skos przy tylnej albo przedniej ścianie): korpus stojący pod skosem
// dostaje skośną górę — boki, plecy i blendy są docięte równolegle do skosu, a wieniec górny
// leży pod kątem. `gap` — luz montażowy między korpusem a skosem (mm, prostopadle do skosu);
// null = luz ustawiony przy skosie (Przestrzeń → skos), liczba = wyjątek dla tego korpusu.
export const SLOPE_TOP_GAP = DEFAULT_SLOPE_GAP;
export const defaultSlopeTop = () => ({ enabled: true, gap: null });
const gapFor = (cabinet, plane) => cabinet.slopeTop?.gap ?? plane.gap ?? SLOPE_TOP_GAP;

// Luz do skosu, który obowiązuje korpus (do wyświetlenia): własny albo ze skosu w głąb.
export function slopeTopGap(cabinet, project) {
  const plane = slopePlanes(project.space).find((pl) => pl.side === 'back' || pl.side === 'front');
  return plane ? gapFor(cabinet, plane) : (cabinet.slopeTop?.gap ?? SLOPE_TOP_GAP);
}

// Płaszczyzna, pod którą dopasowujemy górę korpusu: normal · p <= outer (normal jednostkowy),
// albo null, gdy korpus nie sięga skosu (albo skośna góra jest wyłączona).
// Na razie tylko skosy biegnące w głąb (przy tylnej / przedniej ścianie).
export function slopeTopPlane(cabinet, project) {
  if (!project?.space || cabinet.slopeTop?.enabled === false) return null;
  const top = cabinet.y + legHeight(cabinet) + cabinet.height;
  for (const pl of slopePlanes(project.space)) {
    if (pl.side !== 'back' && pl.side !== 'front') continue;
    const l = Math.hypot(...pl.normal);
    const normal = pl.normal.map((v) => v / l);
    const outer = pl.offset / l - gapFor(cabinet, pl);
    const cuts = [cabinet.z, cabinet.z + cabinet.depth].some((z) => normal[1] * top + normal[2] * z > outer + 0.01);
    if (cuts) return { normal, outer, side: pl.side };
  }
  return null;
}

// Największa wysokość korpusu (bez nóżek) w danym miejscu: pod sufitem i skosami.
// Skos w głąb (tył / przód) przy włączonej skośnej górze ogranicza tylko najwyższy punkt
// korpusu (resztę załatwia skośna góra), pozostałe skosy — najniższy.
// Luz do sufitu, który obowiązuje korpus: własny (wyjątek) albo z przestrzeni.
export function ceilingGapFor(cabinet, project) {
  return cabinet.ceilingGap ?? project?.space?.ceilingGap ?? DEFAULT_CEILING_GAP;
}

export function maxCabinetHeight(cabinet, project, x = cabinet.x, w = cabinet.width) {
  const { space } = project;
  const slanted = cabinet.slopeTop?.enabled !== false;
  let top = space.height - ceilingGapFor(cabinet, project);
  for (const pl of slopePlanes(space)) {
    const { normal: [a, b, c], offset, side } = pl;
    const tops = [x, x + w].flatMap((px) => [cabinet.z, cabinet.z + cabinet.depth].map((pz) => (offset - a * px - c * pz) / b));
    if (slanted && (side === 'back' || side === 'front')) {
      top = Math.min(top, Math.max(...tops) - (gapFor(cabinet, pl) * Math.hypot(a, b, c)) / b);
    } else top = Math.min(top, Math.min(...tops));
  }
  return top - cabinet.y - legHeight(cabinet);
}

// Czy korpus sięga sufitu albo skosu (wtedy jego blendy mogą iść „do sufitu / skosu”).
export function cabinetReachesTop(cabinet, project) {
  return !!project?.space && cabinet.height >= maxCabinetHeight(cabinet, project) - 1;
}

// Skosy przestrzeni jako płaszczyzny docinające (z luzem korpusu): [normal jednostkowy, offset],
// część bryły z normal · p > offset jest odcinana.
export function ceilingClipPlanes(cabinet, project) {
  return slopePlanes(project.space).map((pl) => {
    const l = Math.hypot(...pl.normal);
    return [pl.normal.map((v) => v / l), pl.offset / l - gapFor(cabinet, pl)];
  });
}

// Prostopadłościan przycięty płaszczyznami (np. blenda do skosu): zwraca obrys z bryłą
// (solid, frame — układ płyty z grubością w osi thicknessAxis) albo sam prostopadłościan, gdy nic nie odcięto.
export function clipBox(box, planes, thicknessAxis) {
  let solid = boxSolid(box);
  let clipped = false;
  for (const [n, off] of planes) {
    if (!solid.length || !isClippedBy(solid, n, off)) continue;
    solid = clipSolid(solid, n, off);
    clipped = true;
  }
  if (!clipped) return box;
  if (!solid.length) return { ...box, height: 0 };
  const [a, b] = FACE_AXES_OF[thicknessAxis];
  const V = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  return { ...box, ...solidBounds(solid), solid, frame: { u: V[a], v: V[b], w: V[thicknessAxis] } };
}

// Czy blenda górna idzie do sufitu / skosu: opcja włączona i wszystkie objęte korpusy sięgają sufitu lub skosu.
export function topBlendToCeiling(trim, project) {
  const cabs = trimCabinets(trim, project);
  return trim.type === 'topBlend' && trim.toCeiling !== false && cabs.length > 0 && cabs.every((c) => cabinetReachesTop(c, project));
}

// Położenie blendy górnej: pas na szerokość objętych korpusów, w płaszczyźnie frontów, przy górnej
// krawędzi korpusów. Przy „do sufitu / skosu” blenda zachowuje wysokość, ale podnosi się tak, żeby
// górą dochodziła do sufitu albo skosu; wtedy clipPlanes — skosy, którymi trzeba ją dociąć.
export function topBlendPlacement(trim, project) {
  const cabs = trimCabinets(trim, project);
  const left = Math.min(...cabs.map((c) => c.x));
  const right = Math.max(...cabs.map((c) => c.x + c.width));
  const top = Math.max(...cabs.map((c) => c.y + legHeight(c) + c.height));
  const thickness = trimMaterial(trim, project).thickness;
  const box = { x: left, y: top - trim.height, z: trimFront(trim, project), width: right - left, height: trim.height, depth: thickness };
  if (!topBlendToCeiling(trim, project)) return { box, clipPlanes: null };
  const planes = ceilingClipPlanes(cabs[0], project);
  const ceiling = Math.min(project.space.height - ceilingGapFor(cabs[0], project), ...planes.map(([n, off]) => planeTopOver(n, off, box)));
  return { box: { ...box, y: Math.max(box.y, ceiling - trim.height) }, clipPlanes: planes };
}

// Najwyższe miejsce pod płaszczyzną (normal · p <= off) nad paskiem blendy: skos w głąb (tył / przód)
// sięga najwyżej przy jednej z powierzchni blendy (resztę docina cięcie pod kątem), skos z boku —
// ogranicza najniższy punkt na długości blendy.
function planeTopOver([a, b, c], off, box) {
  const at = (x, z) => (off - a * x - c * z) / b;
  const xs = [box.x, box.x + box.width];
  const zs = [box.z, box.z + box.depth];
  const alongDepth = Math.abs(a) < 1e-9;
  return alongDepth ? Math.max(...zs.map((z) => at(box.x, z))) : Math.min(...xs.map((x) => Math.max(...zs.map((z) => at(x, z)))));
}

// Wycinek bryły (albo prostopadłościanu) w przedziale X [x0, x1] — np. odcinek blendy między panelami.
export function sliceX(box, x0, x1) {
  if (!box.solid) return { ...box, x: x0, width: x1 - x0 };
  const solid = clipSolid(clipSolid(box.solid, [-1, 0, 0], -x0), [1, 0, 0], x1);
  return solid.length ? { ...box, ...solidBounds(solid), solid } : { ...box, x: x0, width: 0 };
}

export function createCabinet(project, overrides = {}) {
  const { space, furniture } = project;
  const width = Math.min(800, space.width);
  const depth = Math.min(560, space.depth);

  // Stawiamy obok ostatniego mebla, jeśli się zmieści; inaczej w lewym narożniku.
  const rightmost = Math.max(0, ...furniture.map((c) => c.x + c.width));
  const x = rightmost + width <= space.width ? rightmost : 0;
  const draft = { x, y: 0, z: 0, width, depth, legs: { enabled: false }, slopeTop: defaultSlopeTop() };
  const height = Math.min(2000, Math.floor(maxCabinetHeight(draft, project)));

  return {
    id: newId(),
    name: `Korpus ${furniture.length + 1}`,
    x,
    y: 0,
    z: 0,
    width,
    height: Math.max(CABINET_LIMITS.sizeMin, height),
    depth,
    materialId: project.materials?.find((m) => m.type === 'chipboard')?.id ?? null,
    blendMaterialId: project.materials?.find((m) => m.type === 'mdf')?.id ?? null,
    frontMaterialId: project.materials?.find((m) => m.type === 'mdf')?.id ?? null,
    fronts: defaultFronts(),
    backType: 'hdf',
    bottomJoint: 'inset',
    topJoint: 'inset',
    topType: 'full',
    railWidth: DEFAULT_RAIL_WIDTH,
    stiffeners: [],
    shelves: [],
    backGap: 0, // odstęp pleców od tylnej ściany (np. na rury) — patrz setBackGap
    slopeTop: defaultSlopeTop(),
    ceilingGap: null, // luz do sufitu — z przestrzeni (patrz ceilingGapFor)
    ...defaultAccessories(),
    panelOverrides: {},
    ...overrides,
  };
}

export const legHeight = (cabinet) => (cabinet.legs?.enabled ? cabinet.legs.height : 0);

// --- blendy wspólne (blenda dolna, blenda górna) — patrz model/trims.js ---
// Tu tylko to, czego potrzebuje sam korpus, żeby się do nich dopasować.

export const trimCabinets = (trim, project) =>
  project.furniture.filter((c) => trim.cabinetIds.includes(c.id));

// Linia frontu blendy: najbardziej wysunięty front objętych korpusów.
export const trimFront = (trim, project) =>
  Math.max(...trimCabinets(trim, project).map((c) => c.z + c.depth));

// Wysokość blendy dolnej: ręczna (trim.height) albo automatyczna — nóżki − szczelina,
// a gdy objęte korpusy nie mają nóżek — PLINTH_DEFAULT_HEIGHT.
export const PLINTH_DEFAULT_HEIGHT = 80;
export function plinthHeight(trim, project) {
  if (trim.height != null) return trim.height;
  const cabs = trimCabinets(trim, project);
  const L = cabs.length ? Math.min(...cabs.map(legHeight)) : 0;
  return L > 0 ? L - trim.gap : PLINTH_DEFAULT_HEIGHT;
}

// Szerokość pasów frontu przy bokach korpusu (listwy przy ścianie) — blendy i cokoły je obejmują.
export function frontSpan(cabinet, project) {
  const w = (side) => sideBlendWidth(cabinet, side, project);
  return [cabinet.x - w('left'), cabinet.x + cabinet.width + w('right')];
}

// Szerokość blendy bocznej (0, gdy po tej stronie nie ma blendy). Ręczna — albo automatyczna:
// wypełnia wolne miejsce od boku korpusu do ściany / sąsiedniego mebla / przeszkody,
// pomniejszone o panel przy ścianie. Gdy po tej stronie nie ma ściany ani sąsiada — DEFAULT_FILLER_WIDTH.
// Nowo dodana blenda boczna dostaje DEFAULT_FILLER_WIDTH jako szerokość ręczną (patrz setSideBlendField).
export const DEFAULT_FILLER_WIDTH = 40;
export const DEFAULT_WALL_PANEL_DEPTH = 60;
export function sideBlendWidth(cabinet, side, project) {
  const sb = cabinet.sideBlends?.[side];
  if (sb?.type !== 'filler') return 0;
  if (sb.width != null) return sb.width;
  const gap = sideGap(cabinet, side, project);
  if (gap == null) return DEFAULT_FILLER_WIDTH;
  const mats = cabinetMaterials(cabinet, project);
  const key = side === 'left' ? 'wallPanelLeft' : 'wallPanelRight';
  const panel = sb.wallPanel ? (cabinet.panelOverrides?.[key]?.sx ?? mats.blend.thickness) : 0;
  return gap - panel;
}

// Wolne miejsce od boku korpusu do najbliższej przeszkody po danej stronie (w pasie frontu,
// na wysokości korpusu) albo null, gdy nic tam nie ma. Sąsiednie meble liczymy z ich panelami
// bocznymi, ale bez ich blend bocznych (żeby dwie automatyczne blendy nie zależały od siebie).
function sideGap(cabinet, side, project) {
  if (!project) return null;
  const { space } = project;
  const L = legHeight(cabinet);
  const t = cabinetMaterials(cabinet, project).blend.thickness;
  const zFront = cabinet.z + cabinet.depth + sidePanelExtension(cabinet, side, project);
  const y0 = cabinet.y + L;
  const y1 = y0 + cabinet.height;
  const inBand = (o) => o.y < y1 && o.y + o.height > y0 && o.z < zFront && o.z + o.depth > zFront - t;

  const neighbour = (c) => {
    const panel = (s) => (c.sideBlends?.[s]?.type === 'full' ? cabinetMaterials(c, project).blend.thickness : 0);
    const x = c.x - panel('left');
    const ext = Math.max(sidePanelExtension(c, 'left', project), sidePanelExtension(c, 'right', project));
    return { x, y: c.y, z: c.z, width: c.width + panel('left') + panel('right'), height: legHeight(c) + c.height, depth: c.depth + ext };
  };
  const others = [
    ...project.furniture.filter((c) => c.id !== cabinet.id).map(neighbour),
    ...space.obstacles,
  ].filter(inBand);

  if (side === 'left') {
    let limit = space.walls.left ? 0 : null;
    for (const o of others) {
      if (o.x + o.width <= cabinet.x + 0.01) limit = Math.max(limit ?? -Infinity, o.x + o.width);
    }
    return limit == null ? null : cabinet.x - limit;
  }
  let limit = space.walls.right ? space.width : null;
  for (const o of others) {
    if (o.x >= cabinet.x + cabinet.width - 0.01) limit = Math.min(limit ?? Infinity, o.x);
  }
  return limit == null ? null : limit - (cabinet.x + cabinet.width);
}

// Zmiana pola blendy bocznej, np. setSideBlendField(c, 'sideBlends.left.type', 'filler').
// Wybranie blendy bocznej ustawia jej szerokość na DEFAULT_FILLER_WIDTH (zamiast automatycznej),
// żeby korpusy w pełnym rzędzie mogły zrobić jej miejsce (patrz model/layout.js).
export function setSideBlendField(cabinet, path, value) {
  const next = setPath(cabinet, path, value);
  const [, side, field] = path.split('.');
  const wasFiller = cabinet.sideBlends?.[side]?.type === 'filler';
  if (field === 'type' && value === 'filler' && !wasFiller) {
    return setPath(next, `sideBlends.${side}.width`, DEFAULT_FILLER_WIDTH);
  }
  return next;
}

// Zapas na docięcie listwy przy ścianie po danej stronie korpusu (0, gdy nie ma listwy).
export function fillerAllowance(cabinet, side) {
  const sb = cabinet.sideBlends?.[side];
  return sb?.type === 'filler' ? (sb.allowance ?? 0) : 0;
}

// Jak blendy wspólne wpływają na korpus:
//  plinthBack   — tylna krawędź blendy dolnej (względem korpusu): do niej sięgają cokoły boczne,
//                 a przednie nóżki stoją za nią,
//  plinthHeight — wysokość blendy dolnej (cokół boczny ma taką samą).
export function cabinetContext(cabinet, project) {
  const trims = project?.trims ?? [];
  const plinth = trims.find((t) => t.type === 'plinth' && t.cabinetIds.includes(cabinet.id));
  const L = legHeight(cabinet);
  // Grubość warstwy frontu: fronty korpusu, jeśli są; inaczej blenda górna, jeśli obejmuje korpus;
  // inaczej zakładamy front z materiału blend korpusu.
  const topBlend = trims.find((t) => t.type === 'topBlend' && t.cabinetIds.includes(cabinet.id));
  const mats = cabinetMaterials(cabinet, project);
  const hasFronts = (cabinet.fronts?.type ?? 'none') !== 'none';
  const frontThickness = hasFronts
    ? mats.front.thickness
    : topBlend
      ? trimMaterial(topBlend, project).thickness
      : mats.blend.thickness;
  // Blenda górna nad frontami: front kończy się szczeliną pod nią (wysokość blendy liczona od góry korpusu).
  const ctx = {
    plinthBack: null,
    plinthHeight: null,
    frontThickness,
    // spód blendy górnej względem korpusu (bez nóżek) — fronty kończą się szczelinę niżej
    topBlendBottom: topBlend ? topBlendPlacement(topBlend, project).box.y - cabinet.y - L : null,
    topBlendGap: topBlend?.gap ?? 0,
  };
  if (plinth && L > 0) {
    ctx.plinthBack = trimFront(plinth, project) - plinth.setback - trimMaterial(plinth, project).thickness - cabinet.z;
    ctx.plinthHeight = plinthHeight(plinth, project);
  }
  return ctx;
}

// Zmiana odstępu od tylnej ściany: front zostaje na miejscu, plecy przesuwają się,
// więc korpus robi się płytszy (albo głębszy). Blat liczy się od ściany, więc się nie zmienia.
export function setBackGap(cabinet, gap) {
  const delta = gap - (cabinet.backGap ?? 0);
  const depth = cabinet.depth - delta;
  if (depth < CABINET_LIMITS.sizeMin) return null;
  return { ...cabinet, backGap: gap, z: cabinet.z + delta, depth };
}

// Największa wysokość, jaką może mieć bryła o podstawie (x, z, w, d) stojąca na wysokości y0,
// żeby nie wyjść ponad sufit ani przez skosy.
export function maxHeightAt(space, x, z, w, d, y0 = 0) {
  let top = space.height;
  for (const { normal: [a, b, c], offset } of slopePlanes(space)) {
    for (const px of [x, x + w])
      for (const pz of [z, z + d]) top = Math.min(top, (offset - a * px - c * pz) / b);
  }
  return top - y0;
}

// Wypełnia całą wnękę razem z blendami bocznymi; wysokość korpusu obniżona o nóżki
// i tak, żeby mebel zmieścił się pod skosami.
export function fitCabinetToSpace(cabinet, project) {
  const { space } = project;
  // Ile elementy (np. panele boczne, listwy) wystają poza korpus z każdej strony.
  const b = cabinetBounds(cabinet, project);
  const extraL = cabinet.x - b.x;
  const extraR = b.x + b.width - (cabinet.x + cabinet.width);
  const extraBack = cabinet.z - b.z;
  const extraFront = b.z + b.depth - (cabinet.z + cabinet.depth);
  const { sizeMin } = CABINET_LIMITS;
  const fitted = {
    ...cabinet,
    x: extraL,
    y: 0,
    z: extraBack + (cabinet.backGap ?? 0),
    width: Math.max(sizeMin, space.width - extraL - extraR),
    depth: Math.max(sizeMin, space.depth - extraBack - extraFront - (cabinet.backGap ?? 0)),
  };
  // Wysokość pod sufitem i skosami (z nóżkami; przy skośnej górze — w najwyższym miejscu).
  const height = Math.floor(maxCabinetHeight(fitted, project, 0, space.width));
  return { ...fitted, height: Math.max(sizeMin, height) };
}

// Rozkład mebla na płyty. Każda płyta: prostopadłościan w układzie przestrzeni.
//  - boki i wieńce łączone zgodnie z bottomJoint / topJoint (patrz JOINT_TYPES),
//  - plecy: HDF nakładany z tyłu na cały korpus albo płyta wpuszczona między boki i wieńce,
//  - blendy boczne (patrz SIDE_BLEND_TYPES), dopasowane do blendy dolnej
//    obejmujących korpus (te są osobnymi elementami projektu — model/trims.js).
// Grubość każdego elementu może być zmieniona ręcznie — sąsiednie elementy się do niej dopasowują.
// Pozostałe ręczne zmiany (wymiary, przesunięcia) nakładane są na końcu.
// `project` jest potrzebny tylko do dopasowania do blend wspólnych (może go nie być).
export function cabinetPanels(cabinet, project) {
  const { width: W, height: H, depth: D, backType } = cabinet;
  const ctx = cabinetContext(cabinet, project);
  const ov = cabinet.panelOverrides ?? {};
  const mats = cabinetMaterials(cabinet, project);
  const thickAt = (key, axis, fallback = mats.body.thickness) => ov[key]?.[`s${axis}`] ?? fallback;
  const thick = (key, fallback) => thickAt(key, PANEL_DEFS.find((p) => p.key === key).thicknessAxis, fallback);

  const L = legHeight(cabinet);
  const tL = thick('left');
  const tR = thick('right');
  const tB = thick('bottom');
  // Skośna góra pod skos (patrz slopeTopPlane) — wtedy zawsze pełny wieniec (bez trawersów).
  const slant = slopeTopPlane(cabinet, project);
  const rails = cabinet.topType === 'rails' && !slant;
  const tT = thick(rails ? 'railFront' : 'top');

  // Połączenia wieńców z bokami: zakres boków w pionie i wieńców w poziomie.
  const bottomOverlay = cabinet.bottomJoint === 'overlay';
  const topOverlay = cabinet.topJoint === 'overlay';
  const sideY0 = bottomOverlay ? tB : 0;
  const sideH = (topOverlay ? H - tT : H) - sideY0;
  const span = (overlay) => (overlay ? [0, W] : [tL, W - tL - tR]); // [x, szerokość] wieńca

  // Domyślne bryły: [x, y, z, sx, sy, sz] względem narożnika korpusu (y = 0 na spodzie korpusu).
  const base = {};
  let zTop; // zakres głębokości wieńca górnego (do rozmieszczenia trawersów)
  let zInner; // przednia powierzchnia pleców — tu stoją poprzeczki usztywniające
  const [bx, bw] = span(bottomOverlay);
  const [tx, tw] = span(topOverlay);
  if (backType === 'board') {
    const tK = thick('back');
    zInner = tK;
    base.left = [0, sideY0, 0, tL, sideH, D];
    base.right = [W - tR, sideY0, 0, tR, sideH, D];
    // Plecy siedzą między wieńcami (w pionie), więc wieńce mają pełną głębokość.
    base.bottom = [bx, 0, 0, bw, tB, D];
    base.top = [tx, H - tT, 0, tw, tT, D];
    zTop = [0, D];
    base.back = [tL, tB, 0, W - tL - tR, H - tB - tT, tK];
  } else {
    const b = backType === 'hdf' ? thick('back', mats.hdf.thickness) : 0;
    zInner = b;
    base.left = [0, sideY0, b, tL, sideH, D - b];
    base.right = [W - tR, sideY0, b, tR, sideH, D - b];
    base.bottom = [bx, 0, b, bw, tB, D - b];
    base.top = [tx, H - tT, b, tw, tT, D - b];
    zTop = [b, D];
    if (b) base.back = [0, 0, 0, W, H, b];
  }
  // Płaszczyzny skosu w układzie przestrzeni: zewnętrzna (góra korpusu) i wewnętrzna
  // (spód skośnego wieńca). Wysokość płaszczyzny (bez nóżek, względem korpusu) w danym z korpusu.
  const inner = slant ? slant.outer - tT : null;
  const planeTopAt = (offset, zLocal) =>
    (offset - slant.normal[2] * (cabinet.z + zLocal)) / slant.normal[1] - cabinet.y - L;

  // Półki — między bokami, od pleców do przodu (głębokość skraca półkę od przodu).
  // „Równo rozłożone” dzielą wnętrze (od wieńca dolnego do górnego) na równe prześwity:
  // jedna — dwa równe prześwity, dwie — trzy itd. Pod skośną górą liczymy wnętrze z przodu,
  // a półki sięgające skosu są docinane pod jego kąt.
  const shelves = cabinet.shelves ?? [];
  const shelfT = (s) => thickAt(shelfKey(s), 'y');
  const evenShelves = shelves.filter((s) => s.position === 'even');
  const innerTop = slant ? Math.min(H - tT, planeTopAt(inner, D)) : H - tT;
  const clear = (innerTop - tB - evenShelves.reduce((sum, s) => sum + shelfT(s), 0)) / (evenShelves.length + 1);
  let evenY = tB;
  const evenPos = new Map();
  for (const s of evenShelves) {
    evenY += clear;
    evenPos.set(s.id, Math.round(evenY)); // pełne milimetry
    evenY += shelfT(s);
  }
  const shelfDefs = [];
  const occupied = []; // zajęte pasy wysokości przy plecach: [od, do] — półki, potem poprzeczki
  for (const s of shelves) {
    const key = shelfKey(s);
    const depth = Math.min(s.depth ?? D - zInner, D - zInner);
    const y = s.position === 'even' ? evenPos.get(s.id) : s.y;
    base[key] = [tL, y, zInner, W - tL - tR, shelfT(s), depth];
    shelfDefs.push({ key, name: 'Półka', thicknessAxis: 'y', shelf: s });
    occupied.push([y, y + shelfT(s)]);
  }

  // Poprzeczki usztywniające — między bokami, tuż przed plecami (grubość w osi Z).
  // „Równo rozłożone” dzielą wnętrze korpusu (od wieńca dolnego do górnego) na równe części:
  // jedna — na środku, dwie — na 1/3 i 2/3 wysokości itd. (środek poprzeczki na linii podziału).
  // Poprzeczka nie może nachodzić na półkę (półki sięgają pleców) ani na inną poprzeczkę —
  // wtedy przesuwa się najbliżej, jak się da: tuż nad albo tuż pod przeszkodę.
  const stiffDefs = [];
  const evenIds = (cabinet.stiffeners ?? []).filter((s) => s.position === 'even').map((s) => s.id);
  for (const st of cabinet.stiffeners ?? []) {
    const key = stiffenerKey(st);
    const t = thickAt(key, 'z');
    const h = st.height;
    // Pod skośną górą „tylna górna” siedzi tuż pod skośnym wieńcem.
    const topLimit = slant ? Math.min(H - tT, planeTopAt(inner, zInner), planeTopAt(inner, zInner + t)) : H - tT;
    const k = evenIds.indexOf(st.id);
    // (zaokrąglone do pełnego milimetra)
    const even = k >= 0 ? Math.round(tB + ((topLimit - tB) * (k + 1)) / (evenIds.length + 1) - h / 2) : null;
    const wanted = { backTop: topLimit - h, backBottom: tB, backAt: st.y, even }[st.position];
    const y = freeSpot(wanted, h, tB, topLimit, occupied);
    occupied.push([y, y + h]);
    base[key] = [tL, y, zInner, W - tL - tR, h, t];
    stiffDefs.push({ key, name: stiffenerName(st), thicknessAxis: 'z', stiffener: st });
  }

  // Trawersy zamiast pełnego wieńca: przedni przy froncie, tylny przy plecach.
  if (rails) {
    const [z0, z1] = zTop;
    const w = cabinet.railWidth;
    const tBack = thickAt('railBack', 'y', tT);
    base.railFront = [tx, H - tT, z1 - w, tw, tT, w];
    base.railBack = [tx, H - tBack, z0, tw, tBack, w];
    delete base.top;
  }
  // Skośny wieniec: między bokami, na całej głębokości wieńca — bryła przycinana niżej
  // do pasa między płaszczyzną zewnętrzną i wewnętrzną.
  if (slant) base.topSlope = [tx, 0, zTop[0], tw, H, zTop[1] - zTop[0]];

  // Korpus stoi na nóżkach.
  for (const k of Object.keys(base)) base[k][1] += L;

  // --- blendy ---
  const blends = cabinet.sideBlends ?? {};
  const blendKey = { left: 'blendLeft', right: 'blendRight' };
  const wallPanelKey = { left: 'wallPanelLeft', right: 'wallPanelRight' };
  const thicknessAxis = {}; // dla elementów, w których oś grubości zależy od wariantu
  const allowance = {}; // zapas na docięcie wzdłuż osi X: { min, max } (tylko do formatki i podglądu)
  const fillerWidth = (side) => sideBlendWidth(cabinet, side, project);
  // Panele boczne sięgają od podłogi do góry korpusu.
  const fullHeight = L + H;
  // Blendy „do sufitu / skosu”: gdy korpus sam sięga sufitu lub skosu, blenda i panele boczne
  // idą w górę do sufitu, a potem są docinane skosami (z luzem) — patrz ceilingClips niżej.
  const reaches = cabinetReachesTop(cabinet, project);
  const toCeiling = (side) => reaches && blends[side]?.toCeiling !== false;
  // sufit (z luzem) względem korpusu
  const ceilingTop = project?.space ? project.space.height - ceilingGapFor(cabinet, project) - cabinet.y : null;
  const ceilingKeys = new Set();

  for (const side of ['left', 'right']) {
    const key = blendKey[side];
    const type = blends[side]?.type;
    if (type === 'plinth' && L > 0) {
      // Cokół boczny: tej samej wysokości co blenda dolna, sięga do jej tylnej krawędzi.
      const t = thickAt(key, 'x', mats.blend.thickness);
      base[key] = [side === 'left' ? 0 : W - t, 0, 0, t, ctx.plinthHeight ?? L, ctx.plinthBack ?? D];
    } else if (type === 'full') {
      const t = thickAt(key, 'x', mats.blend.thickness);
      // Może być skrócony od tyłu — przednia krawędź zostaje na linii frontu.
      const fullDepth = D + sidePanelExtension(cabinet, side, project);
      const pd = Math.min(blends[side].fullPanelDepth ?? fullDepth, fullDepth);
      base[key] = [side === 'left' ? -t : W, 0, fullDepth - pd, t, toCeiling(side) ? ceilingTop : fullHeight, pd];
      if (toCeiling(side)) ceilingKeys.add(key);
    } else if (type === 'filler') {
      // Listwa: przednia krawędź na linii frontu korpusu, albo wysunięta (do linii frontu / ręcznie).
      const t = thickAt(key, 'z', mats.blend.thickness);
      const w = fillerWidth(side);
      const ext = sidePanelExtension(cabinet, side, project);
      thicknessAxis[key] = 'z';
      base[key] = [side === 'left' ? -w : W, L, D + ext - t, w, toCeiling(side) ? ceilingTop - L : H, t];
      if (toCeiling(side)) ceilingKeys.add(key);
      const a = fillerAllowance(cabinet, side);
      if (a) allowance[key] = side === 'left' ? { min: a, max: 0 } : { min: 0, max: a };

      // Panel przy ścianie — za listwą, od podłogi do góry, na całą głębokość (wysunięty razem z listwą).
      if (blends[side].wallPanel) {
        const pk = wallPanelKey[side];
        const tp = thickAt(pk, 'x', mats.blend.thickness);
        // Skrócony od tyłu — przednia krawędź zostaje na linii frontu (D + ext).
        const fullDepth = D + ext;
        const pd = Math.min(blends[side].wallPanelDepth ?? fullDepth, fullDepth);
        base[pk] = [side === 'left' ? -w - tp : W + w, 0, fullDepth - pd, tp, toCeiling(side) ? ceilingTop : fullHeight, pd];
        if (toCeiling(side)) ceilingKeys.add(pk);
      }
    }
  }

  // --- fronty (nakładane, przed korpusem) ---
  const frontDefs = [];
  const fr = cabinet.fronts ?? defaultFronts();
  if (fr.type !== 'none') {
    const g = fr.gap ?? DEFAULT_FRONT_GAP;
    const t = mats.front.thickness;
    const x0 = g / 2;
    const x1 = W - g / 2;
    const y0 = L + g / 2;
    const y1 = ctx.topBlendBottom != null ? L + ctx.topBlendBottom - ctx.topBlendGap : L + H - g / 2;
    // kind — do frezu uchwytowego na krawędzi otwierania: drzwi z zawiasami po lewej / prawej, szuflada
    const add = (name, x, y, w, h, kind) => {
      const key = frontKey(frontDefs.length);
      base[key] = [x, y, D, w, h, t];
      const milling = {
        groove: grooveEdge(fr.groove ?? 'none', kind),
        decor: fr.decor ?? 'none',
        decorMargin: fr.decorMargin ?? 60,
        decorSpacing: fr.decorSpacing ?? 100,
      };
      const hasMilling = milling.groove || milling.decor !== 'none';
      // jak się otwiera (do widoku „otwarte”): drzwi — obrót na zawiasach po lewej / prawej, szuflada — wysunięcie
      const opening = kind === 'drawer' ? { drawer: true } : { hinge: kind === 'doorRightHinge' ? 'right' : 'left' };
      // uchwyt — tylko gdy front nie ma frezu uchwytowego
      const hs = fr.handle ?? defaultHandle();
      const handleSpec = hs.type !== 'none' && !milling.groove ? hs : null;
      frontDefs.push({ key, name, thicknessAxis: 'z', milling: hasMilling ? milling : null, opening, handleSpec });
    };
    if (fr.type === 'door') {
      const kind = fr.hingeSide === 'right' ? 'doorRightHinge' : 'doorLeftHinge';
      add(`Front drzwi (zawiasy ${fr.hingeSide === 'right' ? 'prawe' : 'lewe'})`, x0, y0, x1 - x0, y1 - y0, kind);
    } else if (fr.type === 'doubleDoor') {
      const w = (x1 - x0 - g) / 2;
      // drzwi podwójne otwierają się na środku: lewe mają zawiasy po lewej, prawe — po prawej
      add('Front drzwi lewy', x0, y0, w, y1 - y0, 'doorLeftHinge');
      add('Front drzwi prawy', x0 + w + g, y0, w, y1 - y0, 'doorRightHinge');
    } else if (fr.type === 'drawers') {
      const n = Math.max(1, Math.min(FRONT_LIMITS.drawersMax, fr.drawers ?? 1));
      const h = (y1 - y0 - (n - 1) * g) / n;
      // numeracja od góry: szuflada 1 — najwyżej
      for (let i = 0; i < n; i++) add(`Front szuflady ${i + 1}`, x0, y1 - (i + 1) * h - i * g, x1 - x0, h, 'drawer');
    }
  }

  // Którą płaszczyzną skosu przycinamy płytę: wieniec płaski, plecy wpuszczane, poprzeczki
  // i boki pod wieńcem nakładanym — wewnętrzną (są pod skośnym wieńcem); reszta — zewnętrzną.
  const clipOffset = (key) => {
    if (key === 'top' || key === 'bottom' || key.startsWith('stiff-') || key.startsWith('shelf-')) return inner;
    if (key === 'left' || key === 'right') return topOverlay ? inner : slant.outer;
    if (key === 'back') return backType === 'board' ? inner : slant.outer;
    return slant.outer;
  };
  const AXIS_VEC = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  // Skosy przestrzeni (z luzem) — docinają blendy idące do sufitu: [normal, offset].
  const ceilingClips = ceilingKeys.size ? ceilingClipPlanes(cabinet, project) : [];

  const panels = [];
  for (const def of [...PANEL_DEFS, ...stiffDefs, ...shelfDefs, ...frontDefs]) {
    if (!base[def.key]) continue;
    const axis = thicknessAxis[def.key] ?? def.thicknessAxis;
    const [x, y, z, sx, sy, sz] = base[def.key];
    // Skośny wieniec ma kształt wyliczany ze skosu — ręczne wymiary go nie dotyczą.
    const o = def.key === 'topSlope' ? { hidden: ov.topSlope?.hidden } : (ov[def.key] ?? {});
    // Ręczny wymiar obowiązuje zawsze dla grubości; dla pozostałych osi — tylko w elemencie niezależnym.
    const size = (a, auto) => (a === axis || o.free ? (o[`s${a}`] ?? auto) : auto);
    const overridden = OVERRIDE_KEYS.filter((k) => o[k] != null && (k[0] === 'd' || k[1] === axis || o.free));
    const side = { blendLeft: 'left', blendRight: 'right' }[def.key] ?? null;
    const group = def.key.startsWith('front-')
      ? 'front'
      : BLEND_KEYS.includes(def.key)
        ? 'blend'
        : def.key === 'back' && backType === 'hdf'
          ? 'hdf'
          : 'body';
    const material = mats[group];
    const panel = {
      key: def.key,
      name: def.name,
      kind: group === 'hdf' ? 'hdf' : 'board',
      group,
      material,
      color: material.color,
      thicknessAxis: axis,
      side,
      blendType: side ? blends[side].type : null,
      x: cabinet.x + x + (o.dx ?? 0),
      y: cabinet.y + y + (o.dy ?? 0),
      z: cabinet.z + z + (o.dz ?? 0),
      width: size('x', sx),
      height: size('y', sy),
      depth: size('z', sz),
      free: !!o.free,
      // zapas na docięcie (mm) po stronie mniejszego / większego X — poza wymiarem nominalnym
      allowanceMin: allowance[def.key]?.min ?? 0,
      allowanceMax: allowance[def.key]?.max ?? 0,
      // ukryta tylko w widoku 3D: sama płyta, cała strona blend bocznych albo wszystkie fronty korpusu
      hidden: !!o.hidden || !!blends[BLEND_SIDE[def.key]]?.hidden || (def.key.startsWith('front-') && fr.hidden === true),
      overridden,
      // frezy frontu (uchwytowy, dekoracyjny) — patrz describeMilling
      milling: def.milling ?? null,
      // otwieranie frontu w widoku: { hinge: 'left' | 'right' } albo { drawer: true }
      opening: def.opening ?? null,
    };
    panel.valid = panel.width > 0 && panel.height > 0 && panel.depth > 0;
    // uchwyt frontu (otwory na licu) — liczony z gotowego położenia płyty
    if (def.handleSpec && panel.valid) panel.handle = placeHandle(panel, def.handleSpec);

    // Płaszczyzny, które docinają płytę: skośna góra korpusu i (dla blend do sufitu) skosy przestrzeni.
    const clips = [];
    if (slant && def.key !== 'topSlope') clips.push([slant.normal, clipOffset(def.key)]);
    if (ceilingKeys.has(def.key)) clips.push(...ceilingClips);

    if (panel.valid && (clips.length || (slant && def.key === 'topSlope'))) {
      let solid = boxSolid(panel);
      let frame = null;
      let clipped = false;
      if (def.key === 'topSlope') {
        // Pas między płaszczyznami: góra na skosie, spód o grubość wieńca niżej.
        const n = slant.normal;
        solid = clipSolid(clipSolid(solid, n, slant.outer), n.map((v) => -v), -inner);
        frame = { u: [1, 0, 0], v: [0, n[2], -n[1]], w: n };
        clipped = true;
      } else {
        for (const [n, off] of clips) {
          if (!solid.length || !isClippedBy(solid, n, off)) continue;
          solid = clipSolid(solid, n, off);
          clipped = true;
        }
      }
      // płyta w całości pod skosem — zostaje prostopadłościanem
      if (clipped) {
        // Wieniec płaski lub skośny może zniknąć (cały korpus pod skosem / poniżej) — wtedy go pomijamy.
        if (!solid.length && (def.key === 'top' || def.key === 'topSlope')) continue;
        if (solid.length) {
          Object.assign(panel, solidBounds(solid));
          const [a, b] = FACE_AXES_OF[axis];
          panel.solid = solid;
          panel.frame = frame ?? { u: AXIS_VEC[a], v: AXIS_VEC[b], w: AXIS_VEC[axis] };
        } else panel.valid = false;
      }
    }
    panels.push(panel);
  }
  return panels;
}

const FACE_AXES_OF = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

// Najbliższe miejsce (spód elementu o wysokości h) dla `wanted`, w którym element nie nachodzi
// na zajęte pasy [od, do] i mieści się w [min, max − h]. Gdy nigdzie się nie mieści — `wanted`.
function freeSpot(wanted, h, min, max, occupied) {
  const fits = (y) => y >= min - 0.01 && y + h <= max + 0.01 && occupied.every(([a, b]) => y + h <= a + 0.01 || y >= b - 0.01);
  const candidates = [wanted, ...occupied.flatMap(([a, b]) => [b, a - h]), min, max - h];
  let best = null;
  for (const y of candidates) {
    if (fits(y) && (best === null || Math.abs(y - wanted) < Math.abs(best - wanted))) best = y;
  }
  return best ?? wanted;
}

// Bryła płyty (skośnie docięta albo prostopadłościan).
export const panelSolid = (p) => p.solid ?? boxSolid(p);
export const panelVertices = (p) => (p.solid ? vertices(p.solid) : boxCorners(p));

// Prawdziwe nachodzenie płyt (z uwzględnieniem skośnych cięć).
export function panelsOverlap(a, b) {
  if (!a.solid && !b.solid) return boxesOverlap(a, b);
  return boxesOverlap(a, b) && solidsOverlap(panelSolid(a), panelSolid(b));
}

// Skośne cięcia płyty — do opisu formatki: przy każdym ściętym rogu długość cięcia
// wzdłuż długości i szerokości formatki oraz kąt, np. { alongLength: 470, alongWidth: 560, angle: 40 }.
export function panelShapeCuts(panel) {
  if (!panel.solid) return [];
  const { u, v } = panel.frame;
  const lengthFirst = extentAlong(panel.solid, u) >= extentAlong(panel.solid, v);
  const hull = outline2d(panel.solid, u, v);
  const cuts = [];
  for (let i = 0; i < hull.length; i++) {
    const [p, q] = [hull[i], hull[(i + 1) % hull.length]];
    const du = Math.abs(q[0] - p[0]);
    const dv = Math.abs(q[1] - p[1]);
    if (du < 1 || dv < 1) continue; // krawędź prosta (albo pomijalnie mały skos)
    const [alongLength, alongWidth] = lengthFirst ? [du, dv] : [dv, du];
    cuts.push({ alongLength, alongWidth, angle: (Math.atan2(Math.min(du, dv), Math.max(du, dv)) * 180) / Math.PI });
  }
  return cuts;
}

// Krawędzie cięte skośnie w poprzek grubości (np. końce skośnego wieńca, górna krawędź pleców
// z płyty pod skośnym wieńcem): kąt cięcia względem prostopadłego. Pomijamy cienkie płyty (HDF).
export function panelBevels(panel) {
  if (!panel.solid) return [];
  const { u, v, w } = panel.frame;
  const angles = [];
  for (const axis of [u, v]) {
    for (const [a, b] of pairs(outline2d(panel.solid, axis, w))) {
      const da = Math.abs(b[0] - a[0]);
      const dw = Math.abs(b[1] - a[1]);
      if (da < 3 || dw < 3) continue;
      const angle = Math.round((Math.atan2(da, dw) * 180) / Math.PI * 10) / 10;
      if (!angles.includes(angle)) angles.push(angle);
    }
  }
  return angles;
}

const pairs = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);

// Nóżki: 4 w narożnikach (oś LEG_INSET mm od krawędzi), przy szerokich korpusach dodatkowa para
// pośrodku. Przednie nóżki stoją za blendą dolną.
export function cabinetLegs(cabinet, project) {
  const L = legHeight(cabinet);
  if (!L) return [];
  const { width: W, depth: D } = cabinet;
  const frontLimit = Math.min(D, cabinetContext(cabinet, project).plinthBack ?? D);

  const xs = W > 1000 ? [LEG_INSET, W / 2, W - LEG_INSET] : [LEG_INSET, W - LEG_INSET];
  const zBack = LEG_INSET;
  const zFront = frontLimit - LEG_INSET;
  const zs = zFront > zBack ? [zBack, zFront] : [frontLimit / 2];

  return xs.flatMap((x) =>
    zs.map((z) => ({ x: cabinet.x + x, y: cabinet.y, z: cabinet.z + z, diameter: LEG_DIAMETER, height: L })),
  );
}

// Ścieżka w obiekcie korpusu, której dotyczy zmiana wymiaru powiązanego elementu w danej osi.
function linkedTarget(panel, axis, cabinet) {
  if (axis === 'z' && panel.key.startsWith('shelf-')) {
    const i = (cabinet.shelves ?? []).findIndex((s) => shelfKey(s) === panel.key);
    return `shelves.${i}.depth`;
  }
  if (axis === 'y' && panel.key.startsWith('stiff-')) {
    const i = (cabinet.stiffeners ?? []).findIndex((st) => stiffenerKey(st) === panel.key);
    return `stiffeners.${i}.height`;
  }
  if (axis === 'z' && (panel.key === 'railFront' || panel.key === 'railBack')) return 'railWidth';
  if (axis === 'y' && panel.blendType === 'plinth') return 'legs.height';
  if (axis === 'z' && panel.blendType === 'full') return `sideBlends.${panel.side}.fullPanelDepth`;
  if (axis === 'z' && (panel.key === 'wallPanelLeft' || panel.key === 'wallPanelRight')) {
    return `sideBlends.${BLEND_SIDE[panel.key]}.wallPanelDepth`;
  }
  if (axis === 'x' && panel.blendType === 'filler') return `sideBlends.${panel.side}.width`;
  return AXIS_PROP[axis];
}

const LINKED_LIMITS = {
  railWidth: [10, CABINET_LIMITS.sizeMax],
  'legs.height': [LEG_LIMITS.min, LEG_LIMITS.max],
  'sideBlends.left.width': [1, CABINET_LIMITS.sizeMax],
  'sideBlends.right.width': [1, CABINET_LIMITS.sizeMax],
};

// Zmiana wymiaru elementu powiązanego (oś inna niż grubość) przekłada się na wymiar korpusu
// (albo wysokość nóżek / szerokość listwy), dzięki czemu pozostałe elementy dopasowują się same.
// Np. szerokość boku (Z) → głębokość korpusu, długość wieńca (X) → szerokość korpusu,
// wysokość cokołu bocznego (Y) → wysokość nóżek.
// Zwraca nowy korpus albo null, jeśli wartość wyszłaby poza dozwolony zakres.
export function resizePanelLinked(cabinet, key, axis, value, project) {
  const panel = cabinetPanels(cabinet, project).find((p) => p.key === key);
  if (!panel) return null;
  const path = linkedTarget(panel, axis, cabinet);
  const next = (getPath(cabinet, path) ?? panel[AXIS_PROP[axis]]) + (value - panel[AXIS_PROP[axis]]);
  const [min, max] =
    LINKED_LIMITS[path] ??
    (path.startsWith('stiffeners.') || path.startsWith('shelves.') ? [1, CABINET_LIMITS.sizeMax] : [CABINET_LIMITS.sizeMin, CABINET_LIMITS.sizeMax]);
  if (next < min || next > max) return null;
  return setPath(cabinet, path, next);
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// Niemutująca zmiana zagnieżdżonego pola, np. setPath(c, 'legs.height', 120).
export function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  const next = rest.length ? setPath(obj?.[head] ?? {}, rest.join('.'), value) : value;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...obj, [head]: next };
}

// Strona korpusu, do której należy element blendy bocznej.
const BLEND_SIDE = { blendLeft: 'left', wallPanelLeft: 'left', blendRight: 'right', wallPanelRight: 'right' };

// Elementy z materiału blend (pozostałe — z materiału korpusu, plecy HDF — z HDF).
const BLEND_KEYS = ['blendLeft', 'blendRight', 'wallPanelLeft', 'wallPanelRight'];

// Wymiary formatki: długość × szerokość × grubość (dwa większe wymiary + najmniejszy)
// oraz wymiar do cięcia — pomniejszony o obrzeże: taśma na długiej krawędzi zmniejsza szerokość,
// na krótkiej — długość. Obrzeże ma tylko materiał z ustawioną grubością obrzeża.
// `panel.edges` = { l, w } — liczba oklejonych krawędzi długich i krótkich (patrz model/edges.js).
// Płyta docięta skośnie (panel.solid): wymiary formatki to prostokąt, z którego się ją wycina
// (mierzony w układzie płyty — np. skośny wieniec ma długość wzdłuż skosu), plus `cuts` — ścięte rogi.
export function panelCutSize(panel) {
  // Zapas na docięcie wydłuża formatkę w osi X.
  const extra = (panel.allowanceMin ?? 0) + (panel.allowanceMax ?? 0);
  const sizes = panel.solid
    ? ['u', 'v', 'w'].map((k) => extentAlong(panel.solid, panel.frame[k]) + (panel.frame[k][0] === 1 ? extra : 0))
    : [panel.width + extra, panel.height, panel.depth];
  const [thickness, width, length] = sizes.sort((a, b) => a - b);
  const band = panel.material?.edgeBanding ?? 0;
  const edges = band ? (panel.edges ?? { l: 0, w: 0 }) : { l: 0, w: 0 };
  return {
    length,
    width,
    thickness,
    band,
    edges,
    allowance: extra,
    cutLength: length - edges.w * band,
    cutWidth: width - edges.l * band,
    cuts: panelShapeCuts(panel),
    bevels: panelBevels(panel),
  };
}

// Opis skośnych cięć formatki, np. „ścięty róg 470 × 560 mm (dł. × szer.), kąt 40°; krawędź cięta pod kątem 41°”.
export function describeCuts({ cuts = [], bevels = [] }) {
  const r = (v) => Math.round(v * 10) / 10;
  return [
    ...cuts.map((c) => `ścięty róg ${r(c.alongLength)} × ${r(c.alongWidth)} mm (dł. × szer.), kąt ${r(c.angle)}°`),
    ...bevels.map((a) => `krawędź cięta pod kątem ${a}°`),
  ].join('; ');
}

// Prostopadłościan obejmujący wszystkie płyty i nóżki mebla.
export function cabinetBounds(cabinet, project) {
  const boxes = [
    ...cabinetPanels(cabinet, project).filter((p) => p.valid),
    ...cabinetLegs(cabinet, project).map((l) => ({
      x: l.x - l.diameter / 2,
      y: l.y,
      z: l.z - l.diameter / 2,
      width: l.diameter,
      height: l.height,
      depth: l.diameter,
    })),
  ];
  if (!boxes.length) return cabinet;
  const min = (f) => Math.min(...boxes.map(f));
  const max = (f) => Math.max(...boxes.map(f));
  const x = min((p) => p.x);
  const y = min((p) => p.y);
  const z = min((p) => p.z);
  return {
    x,
    y,
    z,
    width: max((p) => p.x + p.width) - x,
    height: max((p) => p.y + p.height) - y,
    depth: max((p) => p.z + p.depth) - z,
  };
}

// Lista problemów z korpusem (pusta = wszystko w porządku).
export function cabinetIssues(cabinet, project) {
  const { space, furniture } = project;
  const issues = [];
  const panels = cabinetPanels(cabinet, project);

  // Blenda boczna automatyczna bez miejsca (korpus stoi przy ścianie / sąsiedzie) — osobny komunikat.
  const noRoom = ['left', 'right'].filter(
    (side) => cabinet.sideBlends?.[side]?.type === 'filler' && sideBlendWidth(cabinet, side, project) <= 0,
  );
  for (const side of noRoom) {
    issues.push(`Brak miejsca na blendę boczną ${side === 'left' ? 'lewą' : 'prawą'} — korpus stoi przy ścianie lub sąsiednim elemencie.`);
  }
  const noRoomKeys = noRoom.map((s) => (s === 'left' ? 'blendLeft' : 'blendRight'));
  const invalid = panels.filter((p) => !p.valid && !noRoomKeys.includes(p.key)).map((p) => p.name);
  if (invalid.length) issues.push(`Za mały korpus albo za grube płyty: ${invalid.join(', ')}.`);

  const valid = panels.filter((p) => p.valid);
  const overlapping = [];
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++)
      if (panelsOverlap(valid[i], valid[j])) overlapping.push(`${valid[i].name} i ${valid[j].name}`);
  if (overlapping.length) issues.push(`Elementy nachodzą na siebie: ${overlapping.join('; ')}.`);
  const noRoomHandles = valid.filter((p) => p.handle && !p.handle.fits).map((p) => p.name);
  if (noRoomHandles.length) {
    issues.push(`Uchwyt nie mieści się na froncie (za duży rozstaw albo odległość od krawędzi): ${noRoomHandles.join(', ')}.`);
  }

  const bounds = cabinetBounds(cabinet, project);
  // Sprawdzamy narożniki płyt (płyty docięte pod skos mają skośne krawędzie) i nóżek.
  const legBoxes = cabinetLegs(cabinet, project).map((l) => ({
    x: l.x - l.diameter / 2, y: l.y, z: l.z - l.diameter / 2, width: l.diameter, height: l.height, depth: l.diameter,
  }));
  const corners = [...valid.flatMap(panelVertices), ...legBoxes.flatMap(boxCorners)];
  if (!corners.every((p) => isPointInside(p, space))) {
    issues.push(
      slopePlanes(space).length
        ? 'Wychodzi poza przestrzeń (sprawdź też skosy).'
        : 'Wychodzi poza przestrzeń.',
    );
  }
  const hitObstacles = space.obstacles.filter((o) => boxesOverlap(bounds, o)).map((o) => o.name || 'przeszkoda');
  if (hitObstacles.length) issues.push(`Koliduje z: ${hitObstacles.join(', ')}.`);

  const hitCabinets = furniture
    .filter((c) => c.id !== cabinet.id && boxesOverlap(bounds, cabinetBounds(c, project)))
    .map((c) => c.name || 'mebel');
  if (hitCabinets.length) issues.push(`Nachodzi na: ${hitCabinets.join(', ')}.`);

  return issues;
}

export function boxCorners(b) {
  const pts = [];
  for (const x of [b.x, b.x + b.width])
    for (const y of [b.y, b.y + b.height]) for (const z of [b.z, b.z + b.depth]) pts.push([x, y, z]);
  return pts;
}

// Prawdziwe nachodzenie (samo stykanie się ścianami nie jest kolizją).
export function boxesOverlap(a, b, eps = 0.01) {
  return (
    a.x < b.x + b.width - eps &&
    b.x < a.x + a.width - eps &&
    a.y < b.y + b.height - eps &&
    b.y < a.y + a.height - eps &&
    a.z < b.z + b.depth - eps &&
    b.z < a.z + a.depth - eps
  );
}

export function normalizeCabinet(raw = {}) {
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const { sizeMin, sizeMax } = CABINET_LIMITS;
  const def = defaultAccessories();

  const stiffeners = (Array.isArray(raw.stiffeners) ? raw.stiffeners : []).map((st) => ({
    id: typeof st?.id === 'string' && st.id ? st.id : newId(),
    position: STIFFENER_POSITIONS.some((p) => p.key === st?.position) ? st.position : 'backTop',
    height: num(st?.height, DEFAULT_STIFFENER_HEIGHT, 1, sizeMax),
    y: num(st?.y, 0, -sizeMax, sizeMax),
  }));

  const shelves = (Array.isArray(raw.shelves) ? raw.shelves : []).map((s) => ({
    id: typeof s?.id === 'string' && s.id ? s.id : newId(),
    position: s?.position === 'at' ? 'at' : 'even',
    y: num(s?.y, 0, -sizeMax, sizeMax),
    depth: s?.depth == null ? null : num(s.depth, null, 1, sizeMax),
  }));

  const panelOverrides = {};
  const frontKeys = Array.from({ length: FRONT_LIMITS.drawersMax }, (_, i) => frontKey(i));
  for (const key of [...PANEL_DEFS.map((d) => d.key), ...stiffeners.map(stiffenerKey), ...shelves.map(shelfKey), ...frontKeys]) {
    const src = raw.panelOverrides?.[key];
    if (!src || typeof src !== 'object') continue;
    const o = {};
    for (const k of OVERRIDE_KEYS) {
      if (src[k] !== null && Number.isFinite(Number(src[k]))) o[k] = num(src[k], 0, -sizeMax, sizeMax);
    }
    if (src.free === true) o.free = true;
    if (src.hidden === true) o.hidden = true;
    // Ręcznie wybrane oklejone krawędzie (np. ['zMax', 'yMax']); dawny zapis liczbowy pomijamy —
    // takie płyty wracają do obrzeża automatycznego (na krawędziach widocznych).
    if (Array.isArray(src.edgeSet)) {
      o.edgeSet = src.edgeSet.filter((k) => ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'].includes(k));
    }
    if (Object.keys(o).length) panelOverrides[key] = o;
  }

  const sideBlend = (src = {}, d) => ({
    type: SIDE_BLEND_TYPES.some((t) => t.key === src.type) ? src.type : d.type,
    width: src.width == null ? null : num(src.width, DEFAULT_FILLER_WIDTH, 1, sizeMax),
    wallPanel: src.wallPanel === true,
    // starsze projekty nie miały tego pola — ich panele zostają pełnej głębokości
    wallPanelDepth: src.wallPanelDepth == null ? null : num(src.wallPanelDepth, DEFAULT_WALL_PANEL_DEPTH, 1, sizeMax),
    fullPanelDepth: src.fullPanelDepth == null ? null : num(src.fullPanelDepth, 1, 1, sizeMax),
    flushFront: src.flushFront === true,
    extend: num(src.extend, 0, 0, 500),
    allowance: num(src.allowance, 0, 0, 500),
    hidden: src.hidden === true,
    toCeiling: src.toCeiling !== false,
  });

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name : 'Korpus',
    hidden: raw.hidden === true,
    x: num(raw.x, 0, -sizeMax, sizeMax),
    y: num(raw.y, 0, -sizeMax, sizeMax),
    z: num(raw.z, 0, -sizeMax, sizeMax),
    width: num(raw.width, 800, sizeMin, sizeMax),
    height: num(raw.height, 2000, sizeMin, sizeMax),
    depth: num(raw.depth, 560, sizeMin, sizeMax),
    backType: BACK_TYPES.some((b) => b.key === raw.backType) ? raw.backType : 'hdf',
    bottomJoint: raw.bottomJoint === 'overlay' ? 'overlay' : 'inset',
    topJoint: raw.topJoint === 'overlay' ? 'overlay' : 'inset',
    topType: raw.topType === 'rails' ? 'rails' : 'full',
    railWidth: num(raw.railWidth, DEFAULT_RAIL_WIDTH, 10, sizeMax),
    stiffeners,
    shelves,
    backGap: num(raw.backGap, 0, 0, sizeMax),
    // luz do sufitu: null — z przestrzeni, liczba — wyjątek dla tego korpusu
    ceilingGap: raw.ceilingGap == null ? null : num(raw.ceilingGap, null, 0, 500),
    slopeTop: {
      enabled: raw.slopeTop?.enabled !== false,
      gap: raw.slopeTop?.gap == null ? null : num(raw.slopeTop.gap, null, 0, 500),
    },
    materialId: typeof raw.materialId === 'string' ? raw.materialId : null,
    blendMaterialId: typeof raw.blendMaterialId === 'string' ? raw.blendMaterialId : null,
    // starsze projekty nie miały frontów — materiał frontów jak blendy
    frontMaterialId:
      typeof raw.frontMaterialId === 'string'
        ? raw.frontMaterialId
        : typeof raw.blendMaterialId === 'string'
          ? raw.blendMaterialId
          : null,
    fronts: {
      type: FRONT_TYPES.some((t) => t.key === raw.fronts?.type) ? raw.fronts.type : 'none',
      drawers: Math.round(num(raw.fronts?.drawers, 3, 1, FRONT_LIMITS.drawersMax)),
      hingeSide: raw.fronts?.hingeSide === 'right' ? 'right' : 'left',
      gap: num(raw.fronts?.gap, DEFAULT_FRONT_GAP, 0, FRONT_LIMITS.gapMax),
      groove: HANDLE_GROOVES.some((g) => g.key === raw.fronts?.groove) ? raw.fronts.groove : 'none',
      decor: FRONT_DECORS.some((d) => d.key === raw.fronts?.decor) ? raw.fronts.decor : 'none',
      decorMargin: num(raw.fronts?.decorMargin, 60, DECOR_LIMITS.min, DECOR_LIMITS.max),
      decorSpacing: num(raw.fronts?.decorSpacing, 100, DECOR_LIMITS.min, DECOR_LIMITS.max),
      hidden: raw.fronts?.hidden === true, // fronty tego korpusu ukryte w widoku 3D
      handle: (() => {
        const h = raw.fronts?.handle ?? {};
        const d = defaultHandle();
        return {
          type: HANDLE_TYPES.some((t) => t.key === h.type) ? h.type : d.type,
          spacing: num(h.spacing, d.spacing, HANDLE_LIMITS.spacingMin, HANDLE_LIMITS.spacingMax),
          hole: num(h.hole, d.hole, HANDLE_LIMITS.holeMin, HANDLE_LIMITS.holeMax),
          position: HANDLE_POSITIONS.some((p) => p.key === h.position) ? h.position : d.position,
          edgeOffset: num(h.edgeOffset, d.edgeOffset, HANDLE_LIMITS.offsetMin, HANDLE_LIMITS.offsetMax),
        };
      })(),
    },
    legs: {
      enabled: raw.legs?.enabled === true,
      height: num(raw.legs?.height, def.legs.height, LEG_LIMITS.min, LEG_LIMITS.max),
      // jak dodano nóżki: 'keep' — zabudowa zachowała wysokość, 'shift' — podniosła się (patrz setLegs);
      // brak — nie wiadomo (np. starszy projekt), przy usuwaniu pytamy
      ...(raw.legs?.enabled === true && ['keep', 'shift'].includes(raw.legs?.mode) ? { mode: raw.legs.mode } : {}),
    },
    sideBlends: {
      left: sideBlend(raw.sideBlends?.left, def.sideBlends.left),
      right: sideBlend(raw.sideBlends?.right, def.sideBlends.right),
    },
    panelOverrides,
  };
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
