// Biblioteka materiałów projektu (płyty). Każdy element mebla bierze z materiału grubość, kolor
// i obrzeże (taśma oklejająca krawędzie — ABS/PCV, zwykle 0,8–2 mm): grubość i kolor
// (edgeColor: null = taki sam jak płyta).
// Ten moduł nie importuje modelu mebli (żeby uniknąć zależności cyklicznych).

export const MATERIAL_TYPES = [
  { key: 'chipboard', label: 'Płyta meblowa (laminowana)' },
  { key: 'mdf', label: 'MDF lakierowany' },
  { key: 'hdf', label: 'HDF' },
  { key: 'worktop', label: 'Blat' },
  { key: 'other', label: 'Inny' },
];

export const MATERIAL_THICKNESSES = [3, 8, 12, 16, 18, 19, 22, 25, 28, 36, 38, 40];
export const EDGE_BANDING_OPTIONS = [0, 0.4, 0.8, 1, 2];
export const DEFAULT_EDGE_BANDING = 0.8;

// Kolor obrzeża materiału (domyślnie taki sam jak płyta).
export const edgeColorOf = (material) => material.edgeColor ?? material.color;

// Kolor krawędzi BEZ obrzeża: płyta meblowa i HDF mają laminat tylko na licach, a w krawędzi widać
// brązowy rdzeń; MDF lakierowany i blat mają wykończone także krawędzie (kolor płyty).
const CORE_COLORS = { chipboard: '#b48d5e', hdf: '#8b6b47' };
export const coreColorOf = (material) => CORE_COLORS[material.type] ?? material.color;

export function defaultMaterials() {
  return [
    { id: 'mat-white', name: 'Płyta biała 18', type: 'chipboard', thickness: 18, color: '#f2f2ef', edgeBanding: DEFAULT_EDGE_BANDING, edgeColor: null },
    { id: 'mat-mdf-green', name: 'MDF lakierowany zielony 18', type: 'mdf', thickness: 18, color: '#5f7f5c', edgeBanding: 0 },
    { id: 'mat-hdf', name: 'HDF biały 3', type: 'hdf', thickness: 3, color: '#ecebe6', edgeBanding: 0 },
    { ...DEFAULT_WORKTOP },
  ];
}

const DEFAULT_WORKTOP = {
  id: 'mat-worktop',
  name: 'Blat laminowany dąb 38',
  type: 'worktop',
  thickness: 38,
  color: '#b8905e',
  edgeBanding: 0,
};

export function createMaterial() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `mat-${Date.now()}`,
    name: 'Nowy materiał',
    type: 'chipboard',
    thickness: 18,
    color: '#d9d4c7',
    edgeBanding: DEFAULT_EDGE_BANDING,
    edgeColor: null,
  };
}

// Gdy projekt nie ma żadnego materiału danego rodzaju (albo nie ma projektu) — wartości zapasowe.
const FALLBACK = {
  chipboard: { id: null, name: 'Płyta 18', type: 'chipboard', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  mdf: { id: null, name: 'MDF 18', type: 'mdf', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  hdf: { id: null, name: 'HDF 3', type: 'hdf', thickness: 3, color: '#e9e4da', edgeBanding: 0 },
  worktop: { id: null, name: 'Blat 38', type: 'worktop', thickness: 38, color: '#b8905e', edgeBanding: 0 },
};

export const materialById = (project, id) => project?.materials?.find((m) => m.id === id) ?? null;
const firstOfType = (project, type) => project?.materials?.find((m) => m.type === type) ?? null;

// Materiał o podanym id, a jeśli go nie ma (np. usunięty) — pierwszy materiał danego rodzaju.
export function resolveMaterial(project, id, type) {
  return materialById(project, id) ?? firstOfType(project, type) ?? FALLBACK[type];
}

// Materiały korpusu: body — korpus, blend — blendy boczne, front — fronty (domyślnie jak blendy), hdf — plecy HDF.
export function cabinetMaterials(cabinet, project) {
  const body = resolveMaterial(project, cabinet.materialId, 'chipboard');
  const blend = materialById(project, cabinet.blendMaterialId) ?? firstOfType(project, 'mdf') ?? body;
  return {
    body,
    blend,
    front: materialById(project, cabinet.frontMaterialId) ?? blend,
    hdf: resolveMaterial(project, null, 'hdf'),
  };
}

// Materiał blendy wspólnej (dolnej / górnej) albo blatu.
export const trimMaterial = (trim, project) =>
  resolveMaterial(project, trim.materialId, trim.type === 'countertop' ? 'worktop' : 'mdf');

export function normalizeMaterials(raw) {
  if (!Array.isArray(raw) || !raw.length) return defaultMaterials();
  // Starsze projekty nie miały materiału na blat — dokładamy domyślny.
  if (!raw.some((m) => m?.type === 'worktop')) raw = [...raw, { ...DEFAULT_WORKTOP }];
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return raw
    .filter((m) => m && typeof m === 'object')
    .map((m, i) => ({
      id: typeof m.id === 'string' && m.id ? m.id : `mat-${i}-${Date.now()}`,
      name: typeof m.name === 'string' ? m.name : 'Materiał',
      type: MATERIAL_TYPES.some((t) => t.key === m.type) ? m.type : 'other',
      thickness: num(m.thickness, 18, 1, 100),
      color: typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#d9d4c7',
      edgeBanding: num(m.edgeBanding, 0, 0, 5),
      edgeColor: typeof m.edgeColor === 'string' && /^#[0-9a-f]{6}$/i.test(m.edgeColor) ? m.edgeColor : null,
    }));
}
