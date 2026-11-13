import { CABINET_LIMITS, cabinetBounds, createCabinet, maxCabinetHeight } from './furniture.js';
import { rowOf } from './trims.js';

// Automatyczny układ korpusów w rzędzie — żeby projektowanie było jak najprostsze:
//  - pierwszy korpus zajmuje całą szerokość wnęki,
//  - kolejny korpus: jeśli z prawej jest wolne miejsce — wypełnia je; jeśli nie —
//    rząd dzieli się na nowo (nowy korpus dostaje średnią szerokość, reszta zmniejsza się
//    proporcjonalnie; przy równych korpusach to po prostu podział po równo),
//  - blenda / panel boczny dodane do korpusu w pełnym rzędzie — korpusy zwężają się
//    proporcjonalnie, żeby zrobić im miejsce (rząd dalej zajmuje to samo miejsce).

// Najmniejsza wolna przestrzeń, którą nowy korpus wypełnia zamiast dzielić rząd.
export const MIN_FREE_FOR_NEW = 200;
const EPS = 0.5;

const byId = (project, id) => project.furniture.find((c) => c.id === id);

// Domyślna (największa) wysokość nowego korpusu — jak w createCabinet.
export const DEFAULT_MAX_HEIGHT = 2000;

// Najwyższy korpus, jaki mieści się w danym miejscu pod sufitem i skosami (z blendami po bokach),
// ale nie wyższy niż DEFAULT_MAX_HEIGHT. Pod skosem z tyłu — wysokość z przodu (górę docina skośna góra).
function fittedHeight(cabinet, project) {
  return Math.max(CABINET_LIMITS.sizeMin, Math.min(DEFAULT_MAX_HEIGHT, availableHeight(cabinet, project)));
}

// Największa wysokość, jaka mieści się w danym miejscu (do sufitu / skosu), bez domyślnego maksimum.
function availableHeight(cabinet, project) {
  const b = cabinetBounds(cabinet, project);
  return Math.max(CABINET_LIMITS.sizeMin, Math.floor(maxCabinetHeight(cabinet, project, b.x, b.width)));
}

// Czy korpus ma wysokość „automatyczną”: 'max' — sięga sufitu / skosu (np. po „Dopasuj do wnęki”),
// 'cap' — ma domyślną wysokość (2000 mm albo mniej, gdy tyle nie ma miejsca), false — wysokość wpisana
// ręcznie (np. szafka dolna 720 mm albo szafa 2440 mm). Korpusy automatyczne po zmianie układu znów
// dopasowują się do miejsca; pozostałe zachowują swoją wysokość — chyba że przestałyby się mieścić.
function isFittedHeight(cabinet, project) {
  // najpierw domyślna wysokość: korpus pod skosem ma ją równą pełnej (np. 1000 mm przy ściance kolankowej)
  // i po zmianie układu ma dalej dostawać domyślną (do 2000 mm), a nie od razu do sufitu
  if (Math.abs(cabinet.height - fittedHeight(cabinet, project)) <= 1) return 'cap';
  if (Math.abs(cabinet.height - availableHeight(cabinet, project)) <= 1) return 'max';
  return false;
}

function adjustHeight(cabinet, project, fitted) {
  const available = availableHeight(cabinet, project);
  const height = fitted === 'max' ? available : fitted ? fittedHeight(cabinet, project) : Math.min(cabinet.height, available);
  return { ...cabinet, height };
}

// Lewa i prawa krawędź rzędu (z blendami i panelami bocznymi).
function rowExtent(project, ids) {
  const bounds = ids.map((id) => cabinetBounds(byId(project, id), project));
  return [Math.min(...bounds.map((b) => b.x)), Math.max(...bounds.map((b) => b.x + b.width))];
}

// Inne meble i przeszkody na wysokości i w głębokości rzędu.
function blockersAround(project, ids) {
  const bounds = ids.map((id) => cabinetBounds(byId(project, id), project));
  const y0 = Math.min(...bounds.map((b) => b.y));
  const y1 = Math.max(...bounds.map((b) => b.y + b.height));
  const z0 = Math.min(...bounds.map((b) => b.z));
  const z1 = Math.max(...bounds.map((b) => b.z + b.depth));
  return [
    ...project.furniture.filter((c) => !ids.includes(c.id)).map((c) => cabinetBounds(c, project)),
    ...project.space.obstacles,
  ].filter((o) => o.y < y1 - EPS && o.y + o.height > y0 + EPS && o.z < z1 - EPS && o.z + o.depth > z0 + EPS);
}

// Czy rząd jest „pełny”: z obu stron dochodzi do ściany (krawędzi przestrzeni) albo innego elementu.
function rowIsFull(project, ids) {
  const [left, right] = rowExtent(project, ids);
  const others = blockersAround(project, ids);
  const leftShut = left <= EPS || others.some((o) => Math.abs(o.x + o.width - left) <= EPS);
  const rightShut = right >= project.space.width - EPS || others.some((o) => Math.abs(o.x - right) <= EPS);
  return leftShut && rightShut;
}

// Czy któryś korpus rzędu wychodzi w bok poza przestrzeń albo nachodzi na inny mebel / przeszkodę.
function rowCollides(project, ids) {
  const overlapX = (a, b) => a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS;
  const [left, right] = rowExtent(project, ids);
  if (left < -EPS || right > project.space.width + EPS) return true;
  const boxes = ids.map((id) => cabinetBounds(byId(project, id), project));
  // między sobą
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlapX(boxes[i], boxes[j])) return true;
  const others = blockersAround(project, ids);
  return boxes.some((b) => others.some((o) => overlapX(b, o)));
}

// Rozkłada korpusy rzędu (od lewej) w przedziale [left, right]: szerokości proporcjonalne do `shares`,
// blendy i panele boczne zachowują swoje wymiary. Zwraca nowy projekt albo null, gdy korpusy
// byłyby za wąskie. Korpusy z wysokością automatyczną dopasowują się do skosu w nowym miejscu
// (`fitted` — opcjonalnie: id → czy wysokość automatyczna; domyślnie sprawdzane przed zmianą).
export function distributeRow(project, ids, [left, right], shares, fitted = {}) {
  const cabs = ids.map((id) => byId(project, id)).sort((a, b) => a.x - b.x);
  const isFitted = Object.fromEntries(cabs.map((c) => [c.id, fitted[c.id] ?? isFittedHeight(c, project)]));
  const extras = cabs.map((c) => {
    const b = cabinetBounds(c, project);
    return [c.x - b.x, b.x + b.width - (c.x + c.width)];
  });
  const available = right - left - extras.reduce((s, [l, r]) => s + l + r, 0);
  const weights = cabs.map((c) => shares[c.id] ?? c.width);
  const total = weights.reduce((s, w) => s + w, 0);
  // Pełne milimetry; resztę z zaokrągleń dostaje ostatni korpus.
  const widths = weights.map((w) => Math.floor((available * w) / total));
  widths[widths.length - 1] += Math.round(available - widths.reduce((s, w) => s + w, 0));
  if (widths.some((w) => w < CABINET_LIMITS.sizeMin)) return null;

  const placed = new Map();
  let cursor = left;
  cabs.forEach((c, i) => {
    const x = cursor + extras[i][0];
    placed.set(c.id, { ...c, x, width: widths[i] });
    cursor = x + widths[i] + extras[i][1];
  });
  const moved = { ...project, furniture: project.furniture.map((c) => placed.get(c.id) ?? c) };
  // Wysokości liczymy dopiero po rozstawieniu (blendy automatyczne zależą od sąsiadów).
  return {
    ...moved,
    furniture: moved.furniture.map((c) => (placed.has(c.id) ? adjustHeight(c, moved, isFitted[c.id]) : c)),
  };
}

// Najbardziej wysunięty w prawo korpus (po krawędzi z blendami).
function rightmostCabinet(project) {
  const right = (c) => {
    const b = cabinetBounds(c, project);
    return b.x + b.width;
  };
  return project.furniture.reduce((a, c) => (right(c) > right(a) ? c : a));
}

// Dodaje nowy korpus według zasad z nagłówka. Zwraca { project, cabinet }.
export function addCabinetToLayout(project) {
  const { space } = project;

  // Pierwszy korpus — na całą szerokość wnęki.
  if (!project.furniture.length) {
    const c = { ...createCabinet(project), x: 0, width: space.width };
    const cabinet = { ...c, height: fittedHeight(c, project) };
    return { project: { ...project, furniture: [cabinet] }, cabinet };
  }

  // Kolejny — wygląda jak sąsiad z lewej (wysokość, głębokość, nóżki, materiały, konstrukcja).
  const last = rightmostCabinet(project);
  const lastBounds = cabinetBounds(last, project);
  const base = createCabinet(project);
  const template = {
    ...base,
    y: last.y,
    z: last.z,
    height: last.height,
    depth: last.depth,
    backGap: last.backGap,
    legs: { ...last.legs },
    materialId: last.materialId,
    blendMaterialId: last.blendMaterialId,
    backType: last.backType,
    bottomJoint: last.bottomJoint,
    topJoint: last.topJoint,
    topType: last.topType,
    railWidth: last.railWidth,
  };
  // Nowy korpus obejmują te same blendy wspólne (blenda dolna, górna, blat) co sąsiad.
  const withTrims = (p, cabinet) => ({
    ...p,
    trims: p.trims.map((t) => (t.cabinetIds.includes(last.id) ? { ...t, cabinetIds: [...t.cabinetIds, cabinet.id] } : t)),
  });

  // Jest wolne miejsce z prawej — nowy korpus je wypełnia.
  const free = space.width - (lastBounds.x + lastBounds.width);
  const lastFitted = isFittedHeight(last, project);
  if (free >= MIN_FREE_FOR_NEW) {
    const placedCab = { ...template, x: lastBounds.x + lastBounds.width, width: free };
    const next = { ...project, furniture: [...project.furniture, placedCab] };
    const cabinet = adjustHeight(placedCab, next, lastFitted); // dopasowanie do skosu w nowym miejscu
    return {
      project: withTrims({ ...project, furniture: [...project.furniture, cabinet] }, cabinet),
      cabinet,
    };
  }

  // Brak miejsca — dzielimy rząd na nowo. Nowy korpus staje na prawym końcu i przejmuje
  // prawą blendę / panel sąsiada (ta zostaje przy ścianie).
  const row = rowOf(last.id, project);
  const extent = rowExtent(project, row);
  const shares = Object.fromEntries(row.map((id) => [id, byId(project, id).width]));
  const cabinet = {
    ...template,
    x: lastBounds.x + lastBounds.width,
    width: last.width,
    sideBlends: { left: { ...base.sideBlends.left }, right: { ...last.sideBlends.right } },
  };
  shares[cabinet.id] = row.reduce((s, id) => s + shares[id], 0) / row.length;
  const lastWithout = { ...last, sideBlends: { ...last.sideBlends, right: { ...base.sideBlends.right } } };
  let next = {
    ...project,
    furniture: [...project.furniture.map((c) => (c.id === last.id ? lastWithout : c)), cabinet],
  };
  // Które korpusy mają wysokość automatyczną — sprawdzamy przed zmianą; nowy jak sąsiad.
  const fitted = Object.fromEntries(row.map((id) => [id, isFittedHeight(byId(project, id), project)]));
  fitted[cabinet.id] = lastFitted;
  next = distributeRow(withTrims(next, cabinet), [...row, cabinet.id], extent, shares, fitted);
  if (next) return { project: next, cabinet: byId(next, cabinet.id) };

  // Korpusy byłyby za wąskie — zwykły korpus w lewym narożniku (użytkownik ustawi go sam).
  return { project: { ...project, furniture: [...project.furniture, base] }, cabinet: base };
}

// Zmiana korpusu, po której korpus z wysokością automatyczną dopasowuje się na nowo do miejsca
// (np. włączenie / wyłączenie skośnej góry albo zmiana luzu do skosu).
export function updateCabinetRefit(project, cabinetId, fn) {
  const before = byId(project, cabinetId);
  const fitted = isFittedHeight(before, project);
  const changed = fn(before);
  const next = { ...project, furniture: project.furniture.map((c) => (c.id === cabinetId ? changed : c)) };
  const refit = adjustHeight(changed, next, fitted);
  return { ...next, furniture: next.furniture.map((c) => (c.id === cabinetId ? refit : c)) };
}

// Dodanie albo usunięcie nóżek (enabled; przy dodaniu — o wysokości legHeight) w korpusach `cabinetIds`.
// mode: 'shift' — korpus zostaje, cała zabudowa jest wyższa / niższa o nóżki (o ile mieści się pod
//                 sufitem — inaczej korpus zniża się tyle, ile trzeba),
//       'keep'  — zabudowa zachowuje wysokość: korpus jest niższy / wyższy o wysokość nóżek.
// Przy dodaniu wybór zapamiętujemy (legs.mode). Przy usuwaniu korpus z zapamiętanym wyborem
// używa go (wraca do stanu sprzed dodania nóżek); `mode` dotyczy tylko korpusów bez zapamiętanego wyboru.
export function setLegs(project, cabinetIds, enabled, legHeight, mode) {
  const ids = new Set(cabinetIds);
  let next = project;
  for (const c of project.furniture) {
    if (!ids.has(c.id)) continue;
    const oldLegs = c.legs?.enabled ? c.legs.height : 0;
    const { mode: remembered, ...rest } = c.legs ?? {};
    const cabMode = !enabled && c.legs?.enabled && remembered ? remembered : (mode ?? 'keep');
    const legs = enabled ? { ...rest, enabled: true, height: legHeight, mode: cabMode } : { ...rest, enabled: false };
    const changed = { ...c, legs };
    const delta = (enabled ? legHeight : 0) - oldLegs;
    const wanted = cabMode === 'keep' ? c.height - delta : c.height;
    const height = Math.max(CABINET_LIMITS.sizeMin, Math.min(wanted, availableHeight(changed, next)));
    next = { ...next, furniture: next.furniture.map((x) => (x.id === c.id ? { ...changed, height } : x)) };
  }
  return next;
}

// Zmiana luzu do sufitu korpusu: luz uwzględniamy tylko wtedy, gdy jest taka potrzeba.
// Korpus, który sięga sufitu / skosu, dalej do niego dochodzi (z nowym luzem). Niższy korpus
// zostaje, jaki jest — zmniejsza się tylko wtedy, gdy z nowym luzem przestałby się mieścić
// (np. korpus 2400 mm w pokoju 2500 mm ma już 100 mm luzu — wpisanie 10 mm go nie zmienia).
export function updateCabinetCeilingGap(project, cabinetId, fn) {
  const before = byId(project, cabinetId);
  const atTop = before.height >= availableHeight(before, project) - 1;
  const changed = fn(before);
  const next = { ...project, furniture: project.furniture.map((c) => (c.id === cabinetId ? changed : c)) };
  const available = availableHeight(changed, next);
  const height = atTop ? available : Math.min(changed.height, available);
  return { ...next, furniture: next.furniture.map((c) => (c.id === cabinetId ? { ...changed, height } : c)) };
}

// Zmiana przestrzeni (np. skosu: luz, ścianka kolankowa, długość, strona; dodanie / usunięcie skosu):
// korpusy z wysokością automatyczną dopasowują się do nowego kształtu. Pozostałych nie zmieniamy
// (żeby chwilowe wartości podczas wpisywania nie zmniejszały ich na stałe).
export function updateSpaceRefit(project, fn) {
  // id → rodzaj wysokości automatycznej ('max' — do sufitu / skosu, 'cap' — domyślna)
  const fitted = new Map(project.furniture.map((c) => [c.id, isFittedHeight(c, project)]).filter(([, f]) => f));
  const next = { ...project, space: fn(project.space) };
  return {
    ...next,
    furniture: next.furniture.map((c) => (fitted.has(c.id) ? adjustHeight(c, next, fitted.get(c.id)) : c)),
  };
}

// Zmiana korpusu, która może zmienić jego szerokość z blendami (blenda / panel boczny).
// Jeśli rząd był pełny albo po zmianie korpusy nachodzą na siebie / wychodzą poza wnękę —
// korpusy rzędu zwężają się (lub poszerzają) proporcjonalnie, a rząd zajmuje to samo miejsce co przed zmianą.
export function updateCabinetKeepingRow(project, cabinetId, fn) {
  const row = rowOf(cabinetId, project);
  const extent = rowExtent(project, row);
  const wasFull = rowIsFull(project, row);
  const next = { ...project, furniture: project.furniture.map((c) => (c.id === cabinetId ? fn(c) : c)) };
  if (!wasFull && !rowCollides(next, row)) return next;
  const shares = Object.fromEntries(row.map((id) => [id, byId(project, id).width]));
  const fitted = Object.fromEntries(row.map((id) => [id, isFittedHeight(byId(project, id), project)]));
  return distributeRow(next, row, extent, shares, fitted) ?? next;
}
