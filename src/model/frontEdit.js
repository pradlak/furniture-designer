import {
  cabinetPanels,
  frontParts,
  setFrontParts,
  frontSlots,
  doorSpan,
  legHeight,
  newId,
  FRONT_PART_MIN,
  FIRST_DRAWER_HEIGHT,
  DEFAULT_FRONT_GAP_V,
} from './furniture.js';

// Edycja układu frontów (wnętrze: szuflady i wolne przestrzenie; drzwi przykrywające wybrane części) — z panelu
// i z widoku 3D. Model: fronts.parts / fronts.doors (patrz frontParts w model/furniture.js). Wszystkie funkcje
// zwracają nowy korpus.

const gvOf = (c) => c.fronts?.gapV ?? DEFAULT_FRONT_GAP_V;
const stateOf = (c) => {
  const st = frontParts(c.fronts);
  return { parts: st.parts.map((p) => ({ ...p })), doors: st.doors.map((d) => ({ ...d, covers: [...d.covers] })) };
};
export const doorOf = (st, partId) => st.doors.findIndex((d) => d.covers.includes(partId));
// rzeczywiste zakresy części (mm, od dołu korpusu) i obszar frontów
const geometry = (cabinet, project) => {
  const panels = cabinetPanels(cabinet, project);
  return { panels, ranges: panels.partRanges ?? [], area: panels.frontArea };
};
const heightOf = (ranges, i) => (ranges[i] ? ranges[i][1] - ranges[i][0] : 0);

// --- panel: części wnętrza ---

// Rodzaj części z listy w panelu: 'drawer' (szuflada z frontem), 'innerDrawer' (szuflada wewnętrzna — czoło w korpusie,
// bez frontu; drzwi dodaje się osobno i wybiera, co przykrywają), 'space' (wolna przestrzeń). Szuflada z frontem
// przykryta drzwiami wychodzi spod nich (front i drzwi by się nakładały).
export function setPartKind(cabinet, index, kind, project) {
  let c = setPartField(cabinet, index, 'type', kind, project);
  const st = stateOf(c);
  if (kind === 'drawer' && st.parts[index] && doorOf(st, st.parts[index].id) >= 0) c = uncoverPart(c, index, project);
  return c;
}
// (szuflada z frontem przykryta drzwiami — w praktyce wewnętrzna)
export const partKindOf = (st, p) => (p.type === 'drawer' && doorOf(st, p.id) >= 0 ? 'innerDrawer' : p.type);
export const isDrawerPart = (p) => p?.type === 'drawer' || p?.type === 'innerDrawer';

// Nowa część: szuflada — na dole (pierwsza ma FIRST_DRAWER_HEIGHT mm, kolejne jak ostatnia wpisana albo automatycznie),
// wolna przestrzeń — na górze (automatycznie).
export function addPart(cabinet, type, project) {
  const st = stateOf(cabinet);
  if (type === 'drawer' || type === 'innerDrawer') {
    const drawers = st.parts.filter(isDrawerPart);
    const height = drawers.length === 0 ? FIRST_DRAWER_HEIGHT : drawers.every((p) => p.height != null) ? drawers[0].height : null;
    st.parts.unshift({ id: newId(), type, height });
  } else st.parts.push({ id: newId(), type, height: null });
  return setFrontParts(cabinet, st, project);
}

export function setPartField(cabinet, index, field, value, project) {
  const st = stateOf(cabinet);
  if (!st.parts[index]) return cabinet;
  st.parts[index] = { ...st.parts[index], [field]: value };
  return setFrontParts(cabinet, st, project);
}

export function removePart(cabinet, index, project) {
  const st = stateOf(cabinet);
  const [gone] = st.parts.splice(index, 1);
  if (gone) st.doors.forEach((d) => (d.covers = d.covers.filter((id) => id !== gone.id)));
  return setFrontParts(cabinet, st, project);
}

// Przestawienie części (przeciąganie ⠿, „Przenieś wyżej / niżej”): z from na to (indeksy od dołu).
export function movePart(cabinet, from, to, project) {
  const st = stateOf(cabinet);
  if (from === to || !st.parts[from] || to < 0 || to >= st.parts.length) return cabinet;
  const [p] = st.parts.splice(from, 1);
  st.parts.splice(to, 0, p);
  return setFrontParts(cabinet, st, project);
}

// --- panel: drzwi ---

// Nowe drzwi: przykrywają wolne przestrzenie nieprzykryte drzwiami (ciągły zakres od góry), a gdy ich nie ma —
// nową wolną przestrzeń na górze.
export function addDoor(cabinet, type, project) {
  const st = stateOf(cabinet);
  const free = (i) => st.parts[i] && doorOf(st, st.parts[i].id) < 0;
  let i = st.parts.length - 1;
  while (i >= 0 && !(free(i) && st.parts[i].type === 'space')) i--;
  const covers = [];
  while (i >= 0 && free(i) && st.parts[i].type === 'space') covers.unshift(st.parts[i--].id);
  if (!covers.length) {
    const id = newId();
    st.parts.push({ id, type: 'space', height: null });
    covers.push(id);
  }
  st.doors.push({ id: newId(), type, hingeSide: 'left', covers });
  return setFrontParts(cabinet, st, project);
}

export function setDoorField(cabinet, j, field, value, project) {
  const st = stateOf(cabinet);
  if (!st.doors[j]) return cabinet;
  st.doors[j] = { ...st.doors[j], [field]: value };
  return setFrontParts(cabinet, st, project);
}

export function removeDoor(cabinet, j, project) {
  const st = stateOf(cabinet);
  st.doors.splice(j, 1);
  return setFrontParts(cabinet, st, project);
}

// Pola „Przykrywa” drzwi j: dla każdej części { checked, enabled } — drzwi przykrywają ciągły zakres, więc zmieniać
// można tylko skrajne części zakresu (odznaczyć) i sąsiednie (zaznaczyć, gdy nie należą do innych drzwi).
export function doorCoverOptions(st, j) {
  const d = st.doors[j];
  const span = d && doorSpan(d, st.parts);
  return st.parts.map((p, i) => {
    const checked = !!d?.covers.includes(p.id);
    if (!span) return { checked, enabled: false };
    const [lo, hi] = span;
    const enabled = checked ? (i === lo || i === hi) && lo !== hi : (i === lo - 1 || i === hi + 1) && doorOf(st, p.id) < 0;
    return { checked, enabled };
  });
}
export function toggleDoorCover(cabinet, j, index, project) {
  const st = stateOf(cabinet);
  const opt = doorCoverOptions(st, j)[index];
  if (!opt?.enabled) return cabinet;
  const id = st.parts[index].id;
  const d = st.doors[j];
  d.covers = opt.checked ? d.covers.filter((x) => x !== id) : [...d.covers, id];
  return setFrontParts(cabinet, st, project);
}

// Wysokość drzwi (jak wysokość frontu szuflady): zmienia się przykryta wolna przestrzeń (najwyższa) — albo najwyższa
// przykryta część; null — ta część wraca do wysokości automatycznej.
export function setDoorHeight(cabinet, j, H, project) {
  const st = stateOf(cabinet);
  const d = st.doors[j];
  const span = d && doorSpan(d, st.parts);
  if (!span) return cabinet;
  const [lo, hi] = span;
  let k = hi;
  while (k >= lo && st.parts[k].type !== 'space') k--;
  if (k < lo) k = hi;
  if (H == null) st.parts[k].height = null;
  else {
    const { ranges } = geometry(cabinet, project);
    let others = 0;
    for (let i = lo; i <= hi; i++) if (i !== k) others += st.parts[i].height ?? heightOf(ranges, i);
    st.parts[k].height = Math.max(FRONT_PART_MIN, Math.round(H - others - (hi - lo) * gvOf(cabinet)));
    // pozostałe przykryte części zostają, jak są (zamrożone na obecnych wysokościach)
    for (let i = lo; i <= hi; i++) if (i !== k && st.parts[i].height == null) st.parts[i].height = Math.round(heightOf(ranges, i));
  }
  return setFrontParts(cabinet, st, project);
}

// Szuflada nieprzykryta → przykryta nowymi drzwiami (szuflada wewnętrzna) albo dołączona do sąsiednich drzwi.
export function coverWithDoor(cabinet, index, project) {
  const st = stateOf(cabinet);
  const p = st.parts[index];
  if (!p || doorOf(st, p.id) >= 0) return cabinet;
  const near = [index + 1, index - 1].map((i) => st.parts[i] && doorOf(st, st.parts[i].id)).find((j) => j != null && j >= 0);
  if (near != null) st.doors[near].covers.push(p.id);
  else {
    // nowe drzwi: szuflada i nieprzykryte wolne przestrzenie nad nią; gdy ich nie ma — nowa wolna przestrzeń (na resztę
    // wysokości) nad szufladą, żeby drzwi były wyższe od szuflady (miejsce na zawiasy)
    const covers = [p.id];
    let k = index + 1;
    while (st.parts[k] && st.parts[k].type === 'space' && doorOf(st, st.parts[k].id) < 0) covers.push(st.parts[k++].id);
    if (covers.length === 1) {
      const space = { id: newId(), type: 'space', height: null };
      st.parts.splice(index + 1, 0, space);
      covers.push(space.id);
    }
    st.doors.push({ id: newId(), type: 'door', hingeSide: 'left', covers });
  }
  return setFrontParts(cabinet, st, project);
}
// Szuflada przykryta → z własnym frontem: skrajna — wychodzi spod drzwi, ze środka — przenosi się tuż pod drzwi.
export function uncoverPart(cabinet, index, project) {
  const st = stateOf(cabinet);
  const p = st.parts[index];
  const j = p ? doorOf(st, p.id) : -1;
  if (j < 0) return cabinet;
  const [lo, hi] = doorSpan(st.doors[j], st.parts);
  const d = st.doors[j];
  if (index !== lo && index !== hi) {
    // ze środka drzwi — szuflada przenosi się tuż pod drzwi (drzwi zostają w całości)
    st.parts.splice(index, 1);
    st.parts.splice(lo, 0, p);
  }
  d.covers = d.covers.filter((id) => id !== p.id);
  return setFrontParts(cabinet, st, project);
}
export function canUncover(st, index) {
  const p = st.parts[index];
  const j = p ? doorOf(st, p.id) : -1;
  return j >= 0; // (ze środka drzwi — szuflada przenosi się pod drzwi)
}

// --- usuwanie frontów (zaznaczonych w widoku 3D; klucze front-N i idrawer-N) ---
// drzwi — znikają (przykryte części zostają: szuflady dostają własne fronty); jedno skrzydło drzwi podwójnych —
// zostają drzwi pojedyncze z zawiasami po stronie pozostałego skrzydła; szuflada — znika z wnętrza.
export function removeFronts(cabinet, keys) {
  const st = stateOf(cabinet);
  const { fronts, inner } = frontSlots(st);
  const hits = [...new Set(keys)]
    .map((k) => (k.startsWith('idrawer-') ? inner[Number(k.split('-')[1])] : k.startsWith('front-') ? fronts[Number(k.split('-')[1])] : null))
    .filter(Boolean);
  const dropDoors = new Set();
  const dropParts = new Set();
  for (let j = 0; j < st.doors.length; j++) {
    const mine = hits.filter((h) => h.door === j && h.part !== undefined && h.index === undefined);
    if (!mine.length) continue;
    const wings = mine.filter((h) => h.part === 'left' || h.part === 'right');
    if (mine.some((h) => h.part === 'door') || wings.length === 2) dropDoors.add(j);
    else if (wings.length === 1) Object.assign(st.doors[j], { type: 'door', hingeSide: wings[0].part === 'left' ? 'right' : 'left' });
  }
  hits.filter((h) => h.index !== undefined).forEach((h) => dropParts.add(st.parts[h.index].id));
  const next = {
    parts: st.parts.filter((p) => !dropParts.has(p.id)),
    doors: st.doors.filter((_, j) => !dropDoors.has(j)).map((d) => ({ ...d, covers: d.covers.filter((id) => !dropParts.has(id)) })),
  };
  return setFrontParts(cabinet, next);
}
export const removeFront = (cabinet, key) => removeFronts(cabinet, [key]);

// --- widok 3D: granice i przesuwanie szuflad ---

// Granice między częściami wnętrza (kółka / belki do przeciągania): [{ kind: 'part', index — granica nad częścią
// index, y }] — y: środek szczeliny (mm, w układzie przestrzeni).
export function frontBoundaries(cabinet, project) {
  const { ranges } = geometry(cabinet, project);
  const base = cabinet.y + legHeight(cabinet);
  const out = [];
  for (let i = 0; i + 1 < ranges.length; i++) out.push({ kind: 'part', index: i, y: base + (ranges[i][1] + ranges[i + 1][0]) / 2 });
  return out;
}

const panelOfKey = (panels, key) => panels.find((x) => x.key === key && x.valid && x.part != null);

// Uchwyt zmiany wysokości jednej (zaznaczonej) szuflady: różnicę przejmują części automatyczne nad nią ('up', uchwyt
// na górnej krawędzi) albo pod nią ('down', na dolnej); bez nich — null (wtedy zwykłe granice).
export function drawerResizeHandle(cabinet, project, key) {
  const { panels } = geometry(cabinet, project);
  const p = panelOfKey(panels, key);
  if (!p) return null;
  const st = stateOf(cabinet);
  const i = p.part;
  if (!isDrawerPart(st.parts[i])) return null;
  const gv = gvOf(cabinet);
  const auto = (j) => st.parts[j].height == null;
  const mode = st.parts.some((_, j) => j > i && auto(j)) ? 'up' : st.parts.some((_, j) => j < i && auto(j)) ? 'down' : null;
  if (!mode) return null;
  const edge = mode === 'up' ? 'top' : 'bottom';
  return { kind: 'drawerSize', index: i, mode, edge, y: edge === 'top' ? p.y + p.height + gv / 2 : p.y - gv / 2 };
}

// Uchwyt przesuwania zaznaczonej szuflady (środek frontu / czoła).
export function drawerMoveHandle(cabinet, project, key) {
  const { panels } = geometry(cabinet, project);
  const p = panelOfKey(panels, key);
  if (!p || !isDrawerPart(stateOf(cabinet).parts[p.part])) return null;
  return { kind: 'drawerMove', index: p.part, y: p.y + p.height / 2, x: p.x + p.width * 0.25 };
}

// Przeciągnięcie granicy / uchwytu o d mm (w górę +); wysokości liczone od stanu z początku przeciągania (base).
// → { cabinet, a, b } (a, b — wysokości do podpowiedzi)
export function moveFrontBoundary(base, project, b, d) {
  if (b.kind === 'drawerSize') return resizeOneDrawer(base, project, b, d);
  if (b.kind === 'drawerMove') return moveOneDrawer(base, project, b, d);
  const { ranges } = geometry(base, project);
  const st = stateOf(base);
  const i = b.index;
  if (!st.parts[i] || !st.parts[i + 1]) return null;
  const hA = heightOf(ranges, i);
  const hB = heightOf(ranges, i + 1);
  const a = Math.round(Math.min(hA + hB - FRONT_PART_MIN, Math.max(FRONT_PART_MIN, hA + d)));
  st.parts[i].height = a;
  // część nad granicą automatyczna (np. wolna przestrzeń na resztę) — zostaje automatyczna
  if (st.parts[i + 1].height != null) st.parts[i + 1].height = Math.round(hA + hB - a);
  return { cabinet: setFrontParts(base, st, project), a, b: Math.round(hA + hB - a) };
}

function resizeOneDrawer(base, project, b, d) {
  const { ranges } = geometry(base, project);
  const st = stateOf(base);
  const i = b.index;
  const grow = b.edge === 'top' ? d : -d;
  const side = (j) => (b.mode === 'up' ? j > i : j < i);
  const room = st.parts.reduce((sum, p, j) => (side(j) && p.height == null ? sum + heightOf(ranges, j) - FRONT_PART_MIN : sum), 0);
  const cur = heightOf(ranges, i);
  const h = Math.round(Math.max(FRONT_PART_MIN, Math.min(cur + Math.max(0, room), cur + grow)));
  // części po drugiej stronie zostają (zamrożone na obecnych wysokościach); różnicę biorą automatyczne po stronie mode
  st.parts.forEach((p, j) => {
    if (!side(j) && j !== i && p.height == null) p.height = Math.round(heightOf(ranges, j));
  });
  st.parts[i].height = h;
  return { cabinet: setFrontParts(base, st, project), a: h, b: null };
}

// Przesunięcie całej szuflady bez zmiany wysokości: za nią powstaje (albo rośnie) wolna przestrzeń, po drugiej stronie
// oddaje miejsce najbliższa wolna przestrzeń (szuflady po drodze przesuwają się razem z nią). Szuflada za drzwiami —
// nowe wolne przestrzenie obok niej należą do tych samych drzwi.
function moveOneDrawer(base, project, b, d) {
  const { ranges, area } = geometry(base, project);
  const st = stateOf(base);
  const i = b.index;
  const me = st.parts[i];
  if (!me || !area) return null;
  const gv = gvOf(base);
  const step = Math.abs(Math.round(d));
  const bottomOfMe = () => Math.round((ranges[i]?.[0] ?? 0) - area[0]);
  if (!step) return { cabinet: base, a: bottomOfMe() };
  const wasAuto = new Set(st.parts.filter((p) => p.height == null).map((p) => p.id));
  st.parts.forEach((p, j) => (p.height = Math.round(heightOf(ranges, j)))); // wszystko na obecnych wysokościach
  const up = d > 0;
  const myDoor = doorOf(st, me.id);
  // wolne miejsce: wolne przestrzenie po stronie ruchu (i nad ostatnią częścią przy ruchu w górę)
  const used = st.parts.reduce((a, p) => a + p.height, 0) + (st.parts.length - 1) * gv;
  const topFree = up ? Math.max(0, area[1] - area[0] - used) : 0;
  const donors = up ? st.parts.slice(i + 1) : st.parts.slice(0, i).reverse();
  const available = donors.filter((p) => p.type === 'space').reduce((a, p) => a + p.height, 0) + topFree;
  const move = Math.min(step, available);
  if (move <= 0) return null;
  // za szufladą: sąsiednia wolna przestrzeń rośnie albo powstaje nowa (z szczeliną)
  const behind = up ? i - 1 : i + 1;
  if (st.parts[behind]?.type === 'space') st.parts[behind].height += move;
  else {
    if (move <= gv) return null;
    const space = { id: newId(), type: 'space', height: move - gv };
    st.parts.splice(up ? i : i + 1, 0, space);
    if (myDoor >= 0) st.doors[myDoor].covers.push(space.id);
  }
  // po drugiej stronie: zabieramy z najbliższych wolnych przestrzeni (a dopiero potem z wolnego miejsca na górze)
  let need = move;
  const myIndex = st.parts.indexOf(me);
  const order = up ? st.parts.slice(myIndex + 1) : st.parts.slice(0, myIndex).reverse();
  const touched = new Set();
  for (const p of order) {
    if (need <= 0) break;
    if (p.type !== 'space') continue;
    const take = Math.min(need, p.height);
    p.height -= take;
    touched.add(p.id);
    need -= take;
  }
  st.parts = st.parts.filter((p) => !(p.type === 'space' && p.height < 1));
  // jedna z części, które były automatyczne i nie zmieniły się, wraca do automatycznej (dopełnia resztę wysokości)
  const autoBack = st.parts.findIndex((p) => wasAuto.has(p.id) && !touched.has(p.id) && p.id !== me.id);
  if (autoBack >= 0) st.parts[autoBack].height = null;
  const cabinet = setFrontParts(base, st, project);
  const g = geometry(cabinet, project);
  const k = frontParts(cabinet.fronts).parts.findIndex((p) => p.id === me.id);
  return { cabinet, a: g.ranges[k] && g.area ? Math.round(g.ranges[k][0] - g.area[0]) : null };
}
