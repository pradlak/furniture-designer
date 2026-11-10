import { createDefaultProject } from './project.js';
import { createSlope, LIMITS } from './space.js';

// Szablony przestrzeni dla nowego projektu. Każdy ma pola do uzupełnienia (z wartościami domyślnymi)
// i buduje z nich przestrzeń. Wymiary w mm.
//  niche — wnęka / pomieszczenie prostokątne,
//  attic — zabudowa poddasza: ścianka kolankowa z tyłu, skos opadający w stronę tylnej ściany.

const dims = (w, h, d) => [
  { key: 'width', label: 'Szerokość', unit: 'mm', value: w, min: LIMITS.spaceMin, max: LIMITS.spaceMax },
  { key: 'height', label: 'Wysokość', unit: 'mm', value: h, min: LIMITS.spaceMin, max: LIMITS.spaceMax },
  { key: 'depth', label: 'Głębokość', unit: 'mm', value: d, min: LIMITS.spaceMin, max: LIMITS.spaceMax },
];

export const SPACE_TEMPLATES = [
  {
    key: 'niche',
    label: 'Wnęka prostokątna',
    description: 'Wnęka albo pomieszczenie bez skosów — np. szafa między ścianami.',
    name: 'Wnęka',
    fields: dims(2000, 2500, 600),
  },
  {
    key: 'attic',
    label: 'Poddasze ze skosem',
    description: 'Zabudowa pod skosem: z tyłu ścianka kolankowa, nad nią skos opadający w stronę tylnej ściany. Korpusy dostaną skośną górę.',
    name: 'Poddasze',
    fields: [
      ...dims(3000, 2500, 1200),
      { key: 'kneeHeight', label: 'Ścianka kolankowa', unit: 'mm', value: 1000, min: 0, max: LIMITS.spaceMax },
      { key: 'angle', label: 'Kąt skosu', unit: '°', value: 45, min: 1, max: 89, step: 0.5 },
    ],
  },
];

// Sprawdza wartości pól szablonu; zwraca listę problemów (pusta = można tworzyć).
export function templateIssues(template, values) {
  const issues = [];
  for (const f of template.fields) {
    const v = values[f.key];
    if (!Number.isFinite(v) || v < f.min || v > f.max) issues.push(`${f.label}: od ${f.min} do ${f.max} ${f.unit}.`);
  }
  if (template.key === 'attic' && values.kneeHeight >= values.height) {
    issues.push('Ścianka kolankowa musi być niższa niż wysokość pomieszczenia.');
  }
  return issues;
}

// Nowy projekt z szablonu (materiały domyślne, bez mebli).
export function createProjectFromTemplate(key, values) {
  const template = SPACE_TEMPLATES.find((t) => t.key === key);
  const project = createDefaultProject();
  const space = {
    ...project.space,
    name: template.name,
    width: values.width,
    height: values.height,
    depth: values.depth,
  };
  if (key === 'attic') {
    // Długość skosu w poziomie z kąta: wysokość skosu / tg(kąt), np. (2500 − 1000) / tg 45° = 1500 mm.
    const rise = values.height - values.kneeHeight;
    const run = Math.max(1, Math.round(rise / Math.tan((values.angle * Math.PI) / 180)));
    space.slopes = [createSlope(space, { side: 'back', kneeHeight: values.kneeHeight, run })];
  }
  return { ...project, space };
}
