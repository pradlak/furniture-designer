import {
  DEFAULT_THICKNESS,
  legHeight,
  trimCabinets,
  trimFront,
  frontSpan,
  plinthHeight,
  boxCorners,
  boxesOverlap,
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
//             front = wysokość korpusu − blenda − szczelina.

export const TRIM_TYPES = {
  plinth: { label: 'Blenda dolna' },
  topBlend: { label: 'Blenda górna' },
};

export const TRIM_DEFAULTS = {
  plinth: { height: null, gap: 5, setback: 20 }, // height: null = automatyczna
  topBlend: { height: 60, gap: 3 },
};

export function createTrim(type, cabinetIds, project) {
  const first = project.furniture.find((c) => c.id === cabinetIds[0]);
  const count = (project.trims ?? []).filter((t) => t.type === type).length;
  return {
    id: newId(),
    type,
    name: `${TRIM_TYPES[type].label} ${count + 1}`,
    cabinetIds: [...cabinetIds],
    thickness: first?.thickness ?? DEFAULT_THICKNESS,
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

// Bryła blendy (prostopadłościan w układzie przestrzeni) albo null, gdy nie da się jej wyznaczyć.
export function trimBox(trim, project) {
  const cabs = trimCabinets(trim, project);
  if (!cabs.length) return null;
  const spans = cabs.map(frontSpan);
  const x = Math.min(...spans.map((s) => s[0]));
  const width = Math.max(...spans.map((s) => s[1])) - x;
  const front = trimFront(trim, project);

  if (trim.type === 'plinth') {
    return {
      x,
      y: Math.min(...cabs.map((c) => c.y)),
      z: front - trim.setback - trim.thickness,
      width,
      height: plinthHeight(trim, project),
      depth: trim.thickness,
    };
  }
  // blenda górna: tylko na szerokość korpusów (bez listew), przed frontem korpusu
  const left = Math.min(...cabs.map((c) => c.x));
  const right = Math.max(...cabs.map((c) => c.x + c.width));
  const top = Math.max(...cabs.map((c) => c.y + legHeight(c) + c.height));
  return { x: left, y: top - trim.height, z: front, width: right - left, height: trim.height, depth: trim.thickness };
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
  } else {
    if (differ((c) => c.y + legHeight(c) + c.height)) {
      issues.push('Górne krawędzie objętych korpusów nie są w jednej linii.');
    }
    if (cabs.some((c) => c.height - trim.height - trim.gap <= 0)) issues.push('Blenda jest wyższa niż korpus.');
  }
  if (differ((c) => c.z + c.depth)) issues.push('Fronty objętych korpusów nie są w jednej linii.');

  const box = trimBox(trim, project);
  if (box && box.height > 0) {
    if (!boxCorners(box).every((p) => isPointInside(p, project.space))) issues.push('Wychodzi poza przestrzeń.');
    const hit = project.space.obstacles.filter((o) => boxesOverlap(box, o)).map((o) => o.name);
    if (hit.length) issues.push(`Koliduje z: ${hit.join(', ')}.`);
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
    cabinetIds: Array.isArray(raw.cabinetIds) ? raw.cabinetIds.filter((id) => cabinetIds.includes(id)) : [],
    thickness: num(raw.thickness, DEFAULT_THICKNESS, 1, 100),
  };
  if (raw.type === 'plinth') {
    trim.height = raw.height == null ? null : num(raw.height, null, 1, 2000);
    trim.gap = num(raw.gap, def.gap, 0, 500);
    trim.setback = num(raw.setback, def.setback, -500, 5000);
  } else {
    trim.height = num(raw.height, def.height, 1, 2000);
    trim.gap = num(raw.gap, def.gap, 0, 100);
  }
  return trim;
}
