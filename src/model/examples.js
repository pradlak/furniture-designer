import { createExampleProject } from './example.js';
import { createProjectFromTemplate, SPACE_TEMPLATES } from './templates.js';
import { addCabinetToLayout, updateCabinetKeepingRow } from './layout.js';
import { addShelf, setShelfY, setSideBlendField, defaultHandle } from './furniture.js';
import { createTrim } from './trims.js';

// Galeria przykładowych projektów (do wczytania z ekranu powitalnego / okienka „Nowy projekt”).
// Każdy przykład budujemy tymi samymi funkcjami, których używa program — więc wygląda tak,
// jakby użytkownik sam go narysował (układ rzędu, skośna góra, blendy, półki).

const templateDefaults = (key) => Object.fromEntries(SPACE_TEMPLATES.find((t) => t.key === key).fields.map((f) => [f.key, f.value]));

// Przestrzeń z szablonu z poprawionymi wartościami, np. wnęka 2400 × 2500 × 650.
const spaceFrom = (key, values, name) => {
  const p = createProjectFromTemplate(key, { ...templateDefaults(key), ...values });
  return { ...p, space: { ...p.space, name } };
};

// Rząd n korpusów: pierwszy dostaje `first` (np. wysokość, głębokość, nóżki), kolejne go kopiują
// i dzielą miejsce po równo (patrz addCabinetToLayout).
function row(project, n, first = {}) {
  let p = addCabinetToLayout(project).project;
  p = { ...p, furniture: p.furniture.map((c) => ({ ...c, ...first })) };
  for (let i = 1; i < n; i++) p = addCabinetToLayout(p).project;
  return p;
}

// Zmiana i-tego korpusu.
const edit = (p, i, fn) => ({ ...p, furniture: p.furniture.map((c, j) => (j === i ? fn(c, p) : c)) });
const editAll = (p, fn) => ({ ...p, furniture: p.furniture.map((c) => fn(c, p)) });
const fronts = (c, patch) => ({ ...c, fronts: { ...c.fronts, ...patch } });
const shelves = (n) => (c, p) => {
  let cab = c;
  for (let i = 0; i < n; i++) cab = addShelf(cab, p);
  return cab;
};
const named = (p, names) => ({ ...p, furniture: p.furniture.map((c, i) => ({ ...c, name: names[i] ?? c.name })) });

// 1. Kuchnia: szafki dolne na nóżkach, blenda boczna z panelem przy ścianie, panel boczny, cokół, blat.
function kitchen() {
  let p = createExampleProject();
  p = { ...p, space: { ...p.space, name: 'Przykład: szafki kuchenne' } };
  p = edit(p, 0, (c) => fronts(c, { type: 'doubleDoor', handle: { ...defaultHandle(), spacing: 160, position: 'top' } }));
  p = edit(p, 1, (c) => fronts(c, { type: 'drawers', drawers: 3, handle: { ...defaultHandle(), spacing: 160, position: 'center' } }));
  p = editAll(p, shelves(1));
  // szafka z szufladami nie potrzebuje półki
  p = edit(p, 1, (c) => ({ ...c, shelves: [] }));
  return p;
}

// 2. Szafa we wnęce: trzy korpusy do sufitu na nóżkach z blendą dolną, blendy boczne przy ścianach,
//    blenda górna, drzwi podwójne z frezem ramką, półki.
function wardrobe() {
  let p = spaceFrom('niche', { width: 2400, height: 2500, depth: 650 }, 'Przykład: szafa we wnęce');
  // nóżki 100 mm + korpus 2390 mm = do sufitu z luzem 10 mm (blenda górna zostaje przy suficie)
  p = row(p, 3, { height: 2390, depth: 600, legs: { enabled: true, height: 100 } });
  // blendy boczne przy ścianach — korpusy zwężają się, żeby zrobić im miejsce
  p = updateCabinetKeepingRow(p, p.furniture[0].id, (c) => setSideBlendField(c, 'sideBlends.left.type', 'filler'));
  p = updateCabinetKeepingRow(p, p.furniture[2].id, (c) => setSideBlendField(c, 'sideBlends.right.type', 'filler'));
  p = editAll(p, (c) =>
    fronts(c, { type: 'doubleDoor', decor: 'frame', decorMargin: 70, handle: { ...defaultHandle(), spacing: 320, position: 'center' } }),
  );
  // skrajne — półki; środkowa — jedna półka wysoko (pod nią miejsce na drążek)
  p = edit(p, 0, shelves(5));
  p = edit(p, 2, shelves(5));
  p = edit(p, 1, (c, prj) => {
    const cab = addShelf(c, prj);
    return setShelfY(cab, cab.shelves[0].id, 1900, prj);
  });
  const ids = p.furniture.map((c) => c.id);
  p = { ...p, trims: [createTrim('topBlend', ids, p)] };
  p = { ...p, trims: [...p.trims, createTrim('plinth', ids, p)] }; // blenda dolna — zasłania nóżki
  return named(p, ['Szafa lewa', 'Szafa środkowa', 'Szafa prawa']);
}

// 3. Zabudowa poddasza: skos 45° z tyłu, trzy korpusy ze skośną górą, drzwi, półki.
function attic() {
  let p = spaceFrom('attic', { width: 3000, height: 2500, depth: 1200, kneeHeight: 1000, angle: 45 }, 'Przykład: zabudowa poddasza');
  p = row(p, 3, { depth: 560 });
  p = editAll(p, (c) => fronts(c, { type: 'doubleDoor', handle: { ...defaultHandle(), spacing: 128, position: 'center' } }));
  p = editAll(p, shelves(2));
  return named(p, ['Szafka lewa', 'Szafka środkowa', 'Szafka prawa']);
}

// 4. Regał na książki: dwa otwarte korpusy (bez frontów) z półkami.
function bookcase() {
  let p = spaceFrom('niche', { width: 1800, height: 2500, depth: 400 }, 'Przykład: regał na książki');
  p = row(p, 2, { height: 2000, depth: 300 });
  p = editAll(p, shelves(5));
  return named(p, ['Regał lewy', 'Regał prawy']);
}

// 5. Komoda: szuflady i drzwi, na nóżkach, z blatem.
function chest() {
  let p = spaceFrom('niche', { width: 1600, height: 2500, depth: 600 }, 'Przykład: komoda');
  p = row(p, 2, { height: 800, depth: 450, legs: { enabled: true, height: 100 } });
  p = edit(p, 0, (c) => fronts(c, { type: 'drawers', drawers: 4, handle: { ...defaultHandle(), spacing: 160, position: 'center' } }));
  p = edit(p, 1, (c) => fronts(c, { type: 'doubleDoor', handle: { ...defaultHandle(), type: 'knob', position: 'top', edgeOffset: 50 } }));
  p = edit(p, 1, shelves(1));
  const ids = p.furniture.map((c) => c.id);
  p = { ...p, trims: [createTrim('countertop', ids, p)] };
  return named(p, ['Komoda — szuflady', 'Komoda — drzwi']);
}

export const EXAMPLES = [
  { key: 'kitchen', label: 'Szafki kuchenne', description: 'Szafki dolne na nóżkach z blatem, cokołem, drzwiami i szufladami', create: kitchen },
  {
    key: 'wardrobe',
    label: 'Szafa we wnęce',
    description: 'Trzy korpusy do sufitu na nóżkach, drzwi z frezem ramką, półki, blendy boczne, górna i dolna',
    create: wardrobe,
  },
  { key: 'attic', label: 'Zabudowa poddasza', description: 'Korpusy ze skośną górą pod skosem 45°, drzwi i półki', create: attic },
  { key: 'bookcase', label: 'Regał na książki', description: 'Otwarte korpusy z półkami, bez frontów', create: bookcase },
  { key: 'chest', label: 'Komoda', description: 'Szuflady i drzwi na nóżkach, z blatem', create: chest },
];
