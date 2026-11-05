import { trimMaterial } from './materials.js';
import {
  legHeight,
  trimCabinets,
  trimFront,
  frontSpan,
  fillerAllowance,
  plinthHeight,
  boxCorners,
  boxesOverlap,
  cabinetBounds,
  cabinetContext,
  newId,
} from './furniture.js';
import { isPointInside } from './space.js';

// Blendy wspólne — płyty, które mogą obejmować kilka korpusów:
//  plinth   — blenda dolna: zasłania nóżki, stoi na podłodze, cofnięta od frontu;
//             wysokość ręczna albo automatyczna: nóżki − szczelina (np. 80 − 5 = 75 mm), żeby gładko
//             wchodziła pod korpus; bez nóżek — 80 mm;
//             długość: od lewej do prawej krawędzi objętych korpusów razem z listwami przy ścianie
//             (panele boczne są na zewnątrz, więc blenda dochodzi do nich),
//  topBlend — blenda górna: pas w płaszczyźnie frontu (przed korpusem) przy jego górnej krawędzi,
//             kończy się równo z górą i bokami korpusów; front pod nią jest niższy:
//             front = wysokość korpusu − blenda − szczelina,
//  countertop — blat: leży na korpusach, z tyłu od pleców, z przodu wysunięty o overhang (30 mm);
//             domyślnie maksymalnie szeroki — do ścian albo sąsiednich mebli / przeszkód;
//             x, length (długość) i depth (głębokość) mogą być ustawione ręcznie (null = automatycznie).

export const TRIM_TYPES = {
  plinth: { label: 'Blenda dolna' },
  topBlend: { label: 'Blenda górna' },
  countertop: { label: 'Blat' },
};

export const TRIM_DEFAULTS = {
  // height: null = automatyczna; allowanceLeft/Right — zapas na docięcie na końcach
  plinth: { height: null, gap: 5, setback: 20, allowanceLeft: 0, allowanceRight: 0 },
  topBlend: { height: 60, gap: 3 },
  // includeFront — wysunięcie liczone od frontu (front ma grubość blendy górnej / materiału blend)
  countertop: { overhang: 30, includeFront: true, x: null, length: null, depth: null },
};

// Pola, które mogą być automatyczne (null) — wyświetlamy wtedy wartość wyliczoną (z trimBox).
export const AUTO_FIELDS = { plinth: ['height'], topBlend: [], countertop: ['x', 'length', 'depth'] };
const AUTO_FROM_BOX = { height: 'height', x: 'x', length: 'width', depth: 'depth' };
export function trimFieldValue(trim, field, project) {
  if (trim[field] != null || !AUTO_FIELDS[trim.type]?.includes(field)) return trim[field];
  return trimBox(trim, project)?.[AUTO_FROM_BOX[field]] ?? '';
}

export function createTrim(type, cabinetIds, project) {
  const first = project.furniture.find((c) => c.id === cabinetIds[0]);
  const count = (project.trims ?? []).filter((t) => t.type === type).length;
  return {
    id: newId(),
    type,
    name: `${TRIM_TYPES[type].label} ${count + 1}`,
    cabinetIds: [...cabinetIds],
    materialId:
      type === 'countertop'
        ? (project.materials?.find((m) => m.type === 'worktop')?.id ?? null)
        : (first?.blendMaterialId ?? project.materials?.find((m) => m.type === 'mdf')?.id ?? null),
    ...TRIM_DEFAULTS[type],
  };
}

// Korpus + sąsiedzi stojący z nim w jednym rzędzie (stykają się bokami, ta sama linia frontu
// i ta sama wysokość posadowienia) — propozycja, co ma objąć nowa blenda.
export function rowOf(cabinetId, project) {
  const same = (a, b) => Math.abs(a - b) < 0.5;
  const row = new Set([cabinetId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of project.furniture) {
      if (row.has(c.id)) continue;
      const touches = project.furniture.some((r) => {
        if (!row.has(r.id)) return false;
        const [rl, rr] = frontSpan(r);
        const [cl, cr] = frontSpan(c);
        return (same(rr, cl) || same(cr, rl)) && same(r.z + r.depth, c.z + c.depth) && same(r.y, c.y);
      });
      if (touches) {
        row.add(c.id);
        grew = true;
      }
    }
  }
  return project.furniture.filter((c) => row.has(c.id)).map((c) => c.id);
}

// Zapas na docięcie blendy dolnej na końcach: własny + zapas listwy przy ścianie skrajnego korpusu
// (listwa i blenda są od siebie zależne — wydłużają się razem). Nie liczy się do kolizji.
export function trimAllowance(trim, project) {
  const none = { min: 0, max: 0 };
  if (trim.type !== 'plinth') return none;
  const cabs = trimCabinets(trim, project);
  if (!cabs.length) return none;
  const leftmost = cabs.reduce((a, c) => (frontSpan(c)[0] < frontSpan(a)[0] ? c : a));
  const rightmost = cabs.reduce((a, c) => (frontSpan(c)[1] > frontSpan(a)[1] ? c : a));
  return {
    min: (trim.allowanceLeft ?? 0) + fillerAllowance(leftmost, 'left'),
    max: (trim.allowanceRight ?? 0) + fillerAllowance(rightmost, 'right'),
  };
}

// Bryła blendy (prostopadłościan w układzie przestrzeni) albo null, gdy nie da się jej wyznaczyć.
export function trimBox(trim, project) {
  const cabs = trimCabinets(trim, project);
  if (!cabs.length) return null;
  const spans = cabs.map(frontSpan);
  const x = Math.min(...spans.map((s) => s[0]));
  const width = Math.max(...spans.map((s) => s[1])) - x;
  const front = trimFront(trim, project);
  const thickness = trimMaterial(trim, project).thickness;

  if (trim.type === 'plinth') {
    return {
      x,
      y: Math.min(...cabs.map((c) => c.y)),
      z: front - trim.setback - thickness,
      width,
      height: plinthHeight(trim, project),
      depth: thickness,
    };
  }
  if (trim.type === 'countertop') return countertopBox(trim, project, cabs, front, thickness);

  // blenda górna: tylko na szerokość korpusów (bez listew), przed frontem korpusu
  const left = Math.min(...cabs.map((c) => c.x));
  const right = Math.max(...cabs.map((c) => c.x + c.width));
  const top = Math.max(...cabs.map((c) => c.y + legHeight(c) + c.height));
  return { x: left, y: top - trim.height, z: front, width: right - left, height: trim.height, depth: thickness };
}

// O ile blat wystaje przed korpus: wysunięcie + (opcjonalnie) grubość frontu,
// np. 30 + 18 = 48 mm. Przy kilku korpusach — najgrubszy front.
export function countertopOverhang(trim, project) {
  if (!trim.includeFront) return trim.overhang;
  const cabs = trimCabinets(trim, project);
  const front = cabs.length ? Math.max(...cabs.map((c) => cabinetContext(c, project).frontThickness)) : 0;
  return trim.overhang + front;
}

// Blat: na korpusach; automatycznie od ściany do ściany (albo do sąsiedniego mebla / przeszkody).
function countertopBox(trim, project, cabs, front, thickness) {
  const bounds = cabs.map((c) => cabinetBounds(c, project));
  const rowLeft = Math.min(...bounds.map((b) => b.x));
  const rowRight = Math.max(...bounds.map((b) => b.x + b.width));
  const top = Math.max(...cabs.map((c) => c.y + legHeight(c) + c.height));
  const back = Math.min(...cabs.map((c) => c.z));
  const depth = trim.depth ?? front + countertopOverhang(trim, project) - back;

  // Co ogranicza blat na boki: inne meble i przeszkody na wysokości blatu i w jego głębokości.
  const inBand = (o) => o.y < top + thickness && o.y + o.height > top && o.z < back + depth && o.z + o.depth > back;
  const others = [
    ...project.furniture.filter((c) => !trim.cabinetIds.includes(c.id)).map((c) => cabinetBounds(c, project)),
    ...project.space.obstacles,
  ].filter(inBand);
  const { walls, width: spaceWidth } = project.space;
  let left = walls.left ? 0 : rowLeft;
  let right = walls.right ? spaceWidth : rowRight;
  for (const o of others) {
    if (o.x + o.width <= rowLeft + 0.01) left = Math.max(left, o.x + o.width);
    if (o.x >= rowRight - 0.01) right = Math.min(right, o.x);
  }

  const x = trim.x ?? left;
  return { x, y: top, z: back, width: trim.length ?? right - x, height: thickness, depth };
}

// Wysokość frontu pod blendą górną (dla każdego objętego korpusu).
export function frontHeightsUnder(trim, project) {
  return trimCabinets(trim, project).map((c) => ({ cabinet: c, height: c.height - trim.height - trim.gap }));
}

export function trimIssues(trim, project) {
  const cabs = trimCabinets(trim, project);
  if (!cabs.length) return ['Nie obejmuje żadnego korpusu.'];
  const issues = [];
  const differ = (f) => new Set(cabs.map(f)).size > 1;

  if (trim.type === 'plinth') {
    const h = plinthHeight(trim, project);
    if (cabs.some((c) => !legHeight(c))) issues.push('Nie wszystkie objęte korpusy mają nóżki — blenda zachodzi na korpus.');
    else if (differ(legHeight)) issues.push('Objęte korpusy mają różną wysokość nóżek.');
    else if (h > Math.min(...cabs.map(legHeight))) issues.push('Blenda jest wyższa niż nóżki — nie zmieści się pod korpusem.');
    if (h <= 0) issues.push('Wysokość blendy musi być większa od zera.');
  } else if (trim.type === 'topBlend') {
    if (differ((c) => c.y + legHeight(c) + c.height)) {
      issues.push('Górne krawędzie objętych korpusów nie są w jednej linii.');
    }
    if (cabs.some((c) => c.height - trim.height - trim.gap <= 0)) issues.push('Blenda jest wyższa niż korpus.');
  }
  if (trim.type === 'countertop' && differ((c) => c.y + legHeight(c) + c.height)) {
    issues.push('Górne krawędzie objętych korpusów nie są w jednej linii — blat leży na najwyższym.');
  }
  if (differ((c) => c.z + c.depth)) issues.push('Fronty objętych korpusów nie są w jednej linii.');

  const box = trimBox(trim, project);
  if (box && box.height > 0) {
    if (!boxCorners(box).every((p) => isPointInside(p, project.space))) issues.push('Wychodzi poza przestrzeń.');
    const hit = project.space.obstacles.filter((o) => boxesOverlap(box, o)).map((o) => o.name);
    if (hit.length) issues.push(`Koliduje z: ${hit.join(', ')}.`);
    if (trim.type === 'countertop') {
      const hitCabs = project.furniture
        .filter((c) => !trim.cabinetIds.includes(c.id) && boxesOverlap(box, cabinetBounds(c, project)))
        .map((c) => c.name);
      if (hitCabs.length) issues.push(`Nachodzi na: ${hitCabs.join(', ')}.`);
    }
  }
  return issues;
}

export function normalizeTrim(raw = {}, cabinetIds) {
  if (raw.type === 'cornice') raw = { ...raw, type: 'topBlend' }; // dawny „cokół górny”
  if (!TRIM_TYPES[raw.type]) return null;
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const def = TRIM_DEFAULTS[raw.type];
  const trim = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    type: raw.type,
    name: typeof raw.name === 'string' ? raw.name : TRIM_TYPES[raw.type].label,
    hidden: raw.hidden === true,
    cabinetIds: Array.isArray(raw.cabinetIds) ? raw.cabinetIds.filter((id) => cabinetIds.includes(id)) : [],
    materialId: typeof raw.materialId === 'string' ? raw.materialId : null,
  };
  if (raw.type === 'plinth') {
    trim.height = raw.height == null ? null : num(raw.height, null, 1, 2000);
    trim.gap = num(raw.gap, def.gap, 0, 500);
    trim.setback = num(raw.setback, def.setback, -500, 5000);
    trim.allowanceLeft = num(raw.allowanceLeft, 0, 0, 500);
    trim.allowanceRight = num(raw.allowanceRight, 0, 0, 500);
  } else if (raw.type === 'topBlend') {
    trim.height = num(raw.height, def.height, 1, 2000);
    trim.gap = num(raw.gap, def.gap, 0, 100);
  } else {
    const opt = (v, min, max) => (v == null ? null : num(v, null, min, max));
    trim.overhang = num(raw.overhang, def.overhang, -500, 1000);
    trim.includeFront = raw.includeFront !== false;
    trim.x = opt(raw.x, -20000, 20000);
    trim.length = opt(raw.length, 1, 20000);
    trim.depth = opt(raw.depth, 1, 20000);
  }
  return trim;
}
