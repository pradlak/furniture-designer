import { cabinetPanels } from './furniture.js';
import { trimSegments } from './trims.js';

// Obrzeże (taśma na krawędziach płyty) — które krawędzie są oklejone.
//
// Krawędź płyty nazywamy po stronie, na którą jest zwrócona: xMin/xMax (lewa/prawa), yMin/yMax (dół/góra),
// zMin/zMax (tył/przód). Płyta ma 4 krawędzie — po dwie w każdej z osi jej powierzchni (oś grubości
// to nie krawędź, tylko lico).
//
// Domyślnie oklejamy tylko krawędzie WIDOCZNE: sprawdzamy cienki pasek tuż za krawędzią — jeśli jest
// w większości zasłonięty (inna płyta, blenda, blat, przeszkoda, ściana), krawędź jest niewidoczna.
// Krawędzie zwrócone w dół domyślnie nie są oklejane (zwykle ich nie widać).

const DIM = { x: 'width', y: 'height', z: 'depth' };
const FACE_AXES = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

export const EDGE_LABELS = { xMin: 'lewa', xMax: 'prawa', yMin: 'dół', yMax: 'góra', zMin: 'tył', zMax: 'przód' };
export const TRIM_THICKNESS_AXIS = { plinth: 'z', topBlend: 'z', countertop: 'y' };

// Krawędzie płyty o danej osi grubości, w kolejności do wyświetlania (przód/góra najpierw).
const ORDER = ['zMax', 'yMax', 'zMin', 'yMin', 'xMin', 'xMax'];
export const edgeKeys = (thicknessAxis) =>
  ORDER.filter((k) => FACE_AXES[thicknessAxis].includes(k[0]));

const PROBE = 1; // mm — grubość paska sprawdzanego za krawędzią
const COVERED = 0.9; // krawędź zasłonięta w ≥ 90% = niewidoczna

function overlapVolume(a, b) {
  let v = 1;
  for (const ax of ['x', 'y', 'z']) {
    const d = DIM[ax];
    const lo = Math.max(a[ax], b[ax]);
    const hi = Math.min(a[ax] + a[d], b[ax] + b[d]);
    if (hi <= lo) return 0;
    v *= hi - lo;
  }
  return v;
}

// Cienki pasek tuż za krawędzią (na zewnątrz płyty).
function probeBox(box, key) {
  const ax = key[0];
  const d = DIM[ax];
  const p = { x: box.x, y: box.y, z: box.z, width: box.width, height: box.height, depth: box.depth };
  p[ax] = key.endsWith('Max') ? box[ax] + box[d] : box[ax] - PROBE;
  p[d] = PROBE;
  return p;
}

// Istniejące ściany przestrzeni jako bryły „za” granicami wnęki.
function wallSlabs(space) {
  const B = 1e6;
  const { width: W, height: H, walls } = space;
  const slabs = [];
  if (walls.back) slabs.push({ x: -B, y: -B, z: -B, width: 2 * B, height: 2 * B, depth: B });
  if (walls.floor) slabs.push({ x: -B, y: -B, z: -B, width: 2 * B, height: B, depth: 2 * B });
  if (walls.ceiling) slabs.push({ x: -B, y: H, z: -B, width: 2 * B, height: B, depth: 2 * B });
  if (walls.left) slabs.push({ x: -B, y: -B, z: -B, width: B, height: 2 * B, depth: 2 * B });
  if (walls.right) slabs.push({ x: W, y: -B, z: -B, width: B, height: 2 * B, depth: 2 * B });
  return slabs;
}

// Wszystkie bryły projektu, które mogą zasłaniać krawędzie (liczone raz na odświeżenie).
export function projectSolids(project) {
  const solids = [];
  for (const c of project.furniture) {
    for (const p of cabinetPanels(c, project)) if (p.valid) solids.push({ ...p, id: `${c.id}:${p.key}` });
  }
  for (const t of project.trims ?? []) {
    trimSegments(t, project).forEach((s, i) => solids.push({ ...s, id: `trim:${t.id}:${i}` }));
  }
  project.space.obstacles.forEach((o) => solids.push({ ...o, id: `obstacle:${o.id}` }));
  wallSlabs(project.space).forEach((w, i) => solids.push({ ...w, id: `wall:${i}` }));
  return solids;
}

// Widoczne krawędzie bryły (do domyślnego obrzeża).
export function visibleEdges(box, thicknessAxis, selfId, solids) {
  return edgeKeys(thicknessAxis).filter((key) => {
    if (key === 'yMin') return false; // krawędzie od spodu — domyślnie bez obrzeża
    const probe = probeBox(box, key);
    const volume = probe.width * probe.height * probe.depth;
    if (volume <= 0) return false;
    let covered = 0;
    for (const s of solids) if (s.id !== selfId) covered += overlapVolume(probe, s);
    return covered / volume < COVERED;
  });
}

// Oklejone krawędzie płyty korpusu: ręczny wybór (panelOverrides[key].edgeSet) albo widoczne.
// Poprzeczki usztywniające są w środku korpusu — domyślnie bez obrzeża.
export function panelEdgeSet(panel, cabinet, project, solids) {
  const manual = cabinet.panelOverrides?.[panel.key]?.edgeSet;
  if (Array.isArray(manual)) return manual;
  if (panel.key.startsWith('stiff-')) return [];
  // Półka: oklejamy tylko przód (boki stykają się z bokami korpusu, tył — z plecami / jest niewidoczny).
  if (panel.key.startsWith('shelf-')) return ['zMax'];
  // Front: widoczny ze wszystkich stron — oklejamy wszystkie cztery krawędzie.
  if (panel.key.startsWith('front-')) return ['xMin', 'xMax', 'yMin', 'yMax'];
  const edges = visibleEdges(panel, panel.thicknessAxis, `${cabinet.id}:${panel.key}`, solids ?? projectSolids(project));
  // Panel przy ścianie: tylna krawędź jest schowana między ścianą a blendą boczną.
  if (panel.key === 'wallPanelLeft' || panel.key === 'wallPanelRight') return edges.filter((k) => k !== 'zMin');
  return edges;
}

export const isManualEdgeSet = (panel, cabinet) => Array.isArray(cabinet.panelOverrides?.[panel.key]?.edgeSet);

// Oklejone krawędzie odcinka blendy wspólnej / blatu (zawsze widoczne krawędzie).
export function trimEdgeSet(trim, segment, index, solids) {
  return visibleEdges(segment, TRIM_THICKNESS_AXIS[trim.type], `trim:${trim.id}:${index}`, solids);
}

// Liczba oklejonych krawędzi długich (l) i krótkich (w) — do wymiaru formatki do cięcia.
// Krawędź biegnie wzdłuż drugiej osi powierzchni; jest „długa”, jeśli ta oś jest dłuższa.
export function edgeCounts(box, thicknessAxis, keys) {
  const [a, b] = FACE_AXES[thicknessAxis];
  const size = (ax) => box[DIM[ax]] + (ax === 'x' ? (box.allowanceMin ?? 0) + (box.allowanceMax ?? 0) : 0);
  let l = 0;
  let w = 0;
  for (const k of keys) {
    const ax = k[0];
    const along = ax === a ? b : a;
    if (size(along) >= size(ax)) l += 1;
    else w += 1;
  }
  return { l, w };
}

export const VALID_EDGE_KEYS = Object.keys(EDGE_LABELS);
