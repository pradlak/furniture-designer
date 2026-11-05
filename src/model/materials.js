// Biblioteka materiałów projektu (płyty). Każdy element mebla bierze z materiału grubość, kolor
// i grubość obrzeża (taśmy oklejającej krawędzie — ABS/PCV, zwykle 0,8–2 mm).
// Ten moduł nie importuje modelu mebli (żeby uniknąć zależności cyklicznych).

export const MATERIAL_TYPES = [
  { key: 'chipboard', label: 'Płyta meblowa (laminowana)' },
  { key: 'mdf', label: 'MDF lakierowany' },
  { key: 'hdf', label: 'HDF' },
  { key: 'other', label: 'Inny' },
];

export const MATERIAL_THICKNESSES = [3, 8, 12, 16, 18, 19, 22, 25, 28, 36];
export const EDGE_BANDING_OPTIONS = [0, 0.4, 0.8, 1, 2];

export function defaultMaterials() {
  return [
    { id: 'mat-white', name: 'Płyta biała 18', type: 'chipboard', thickness: 18, color: '#f2f2ef', edgeBanding: 1 },
    { id: 'mat-mdf-green', name: 'MDF lakierowany zielony 18', type: 'mdf', thickness: 18, color: '#5f7f5c', edgeBanding: 0 },
    { id: 'mat-hdf', name: 'HDF biały 3', type: 'hdf', thickness: 3, color: '#ecebe6', edgeBanding: 0 },
  ];
}

export function createMaterial() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `mat-${Date.now()}`,
    name: 'Nowy materiał',
    type: 'chipboard',
    thickness: 18,
    color: '#d9d4c7',
    edgeBanding: 1,
  };
}

// Gdy projekt nie ma żadnego materiału danego rodzaju (albo nie ma projektu) — wartości zapasowe.
const FALLBACK = {
  chipboard: { id: null, name: 'Płyta 18', type: 'chipboard', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  mdf: { id: null, name: 'MDF 18', type: 'mdf', thickness: 18, color: '#d2b48c', edgeBanding: 0 },
  hdf: { id: null, name: 'HDF 3', type: 'hdf', thickness: 3, color: '#e9e4da', edgeBanding: 0 },
};

export const materialById = (project, id) => project?.materials?.find((m) => m.id === id) ?? null;
const firstOfType = (project, type) => project?.materials?.find((m) => m.type === type) ?? null;

// Materiał o podanym id, a jeśli go nie ma (np. usunięty) — pierwszy materiał danego rodzaju.
export function resolveMaterial(project, id, type) {
  return materialById(project, id) ?? firstOfType(project, type) ?? FALLBACK[type];
}

// Materiały korpusu: body — korpus, blend — blendy boczne (i domyślnie fronty), hdf — plecy HDF.
export function cabinetMaterials(cabinet, project) {
  const body = resolveMaterial(project, cabinet.materialId, 'chipboard');
  return {
    body,
    blend: materialById(project, cabinet.blendMaterialId) ?? firstOfType(project, 'mdf') ?? body,
    hdf: resolveMaterial(project, null, 'hdf'),
  };
}

// Materiał blendy wspólnej (dolnej / górnej).
export const trimMaterial = (trim, project) => resolveMaterial(project, trim.materialId, 'mdf');

export function normalizeMaterials(raw) {
  if (!Array.isArray(raw) || !raw.length) return defaultMaterials();
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
    }));
}
