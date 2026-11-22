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
  hingeType,
  HINGE_EDGE_MIN,
  HINGE_LIMITS,
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

// Zbiorczo: n szuflad (z frontem albo wewnętrznych) po height mm (null — automatycznie), na dole.
export function addParts(cabinet, type, n, height, project) {
  const st = stateOf(cabinet);
  const count = Math.max(1, Math.min(PART_LIMITS_ADD, Math.round(n)));
  const added = [];
  for (let k = 0; k < count; k++) {
    const p = { id: newId(), type, height: height ?? null };
    st.parts.unshift(p);
    added.push(p.id);
  }
  if (type === 'innerDrawer') joinDoorAbove(st, added);
  return setFrontParts(cabinet, st, project);
}
const PART_LIMITS_ADD = 12;
// Szuflady wewnętrzne dodane na dole: gdy część tuż nad nimi jest za drzwiami — dołączają do tych drzwi (drzwi
// sięgają wtedy do dołu korpusu; szuflada wewnętrzna bez drzwi nie ma sensu).
function joinDoorAbove(st, ids) {
  const above = st.parts[ids.length];
  const j = above ? doorOf(st, above.id) : -1;
  if (j >= 0) st.doors[j].covers.push(...ids);
}

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
    let height = drawers.length === 0 ? FIRST_DRAWER_HEIGHT : drawers.every((p) => p.height != null) ? drawers[0].height : null;
    // gdy z tą wysokością szuflady nie zmieszczą się w korpusie — wszystkie szuflady dzielą miejsce po równo
    const { area } = geometry(cabinet, project);
    if (height != null && area) {
      const fixed = st.parts.reduce((a, p) => a + (p.height ?? 0), 0);
      if (fixed + height + st.parts.length * gvOf(cabinet) > area[1] - area[0]) {
        // brak miejsca — wszystkie szuflady po równo (wysokości automatyczne)
        height = null;
        st.parts.forEach((p) => p.type !== 'space' && (p.height = null));
      }
    }
    const p = { id: newId(), type, height };
    st.parts.unshift(p);
    if (type === 'innerDrawer') joinDoorAbove(st, [p.id]);
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

// Nowe drzwi: przykrywają najwyższą wolną przestrzeń nieprzykrytą drzwiami razem ze wszystkimi sąsiednimi (w górę
// i w dół) nieprzykrytymi wolnymi przestrzeniami i szufladami wewnętrznymi — do szuflady z frontem, innych drzwi
// albo końca korpusu (żeby nad / pod drzwiami nie zostawała szpara, a szuflady wewnętrzne nie zostawały bez drzwi).
// Gdy wolnych przestrzeni nie ma — nową wolną przestrzeń na górze.
export function addDoor(cabinet, type, project) {
  const st = stateOf(cabinet);
  const free = (i) => st.parts[i] && doorOf(st, st.parts[i].id) < 0;
  const coverable = (i) => free(i) && st.parts[i].type !== 'drawer';
  let i = st.parts.length - 1;
  while (i >= 0 && !(free(i) && st.parts[i].type === 'space')) i--;
  const covers = [];
  if (i >= 0) {
    let lo = i;
    let hi = i;
    while (coverable(lo - 1)) lo--;
    while (coverable(hi + 1)) hi++;
    covers.push(...st.parts.slice(lo, hi + 1).map((p) => p.id));
  }
  if (!covers.length) {
    const id = newId();
    st.parts.push({ id, type: 'space', height: null });
    covers.push(id);
  }
  st.doors.push({ id: newId(), type, hingeSide: 'left', covers });
  return setFrontParts(cabinet, st, project);
}

// Drzwi j na całą wysokość: przykrywają też sąsiednie części w dół i w górę (do innych drzwi albo do końca korpusu);
// szuflady z frontem, które znajdą się za drzwiami, stają się wewnętrzne.
const fullSpan = (st, j) => {
  const span = st.doors[j] && doorSpan(st.doors[j], st.parts);
  if (!span) return null;
  let [lo, hi] = span;
  while (lo > 0 && doorOf(st, st.parts[lo - 1].id) < 0) lo--;
  while (hi < st.parts.length - 1 && doorOf(st, st.parts[hi + 1].id) < 0) hi++;
  return { span, lo, hi };
};
export function canDoorGrow(cabinet, j) {
  const f = fullSpan(stateOf(cabinet), j);
  return !!f && (f.lo < f.span[0] || f.hi > f.span[1]);
}
export function doorFullHeight(cabinet, j, project) {
  const st = stateOf(cabinet);
  const f = fullSpan(st, j);
  if (!f) return cabinet;
  const d = st.doors[j];
  for (let i = f.lo; i <= f.hi; i++) {
    const p = st.parts[i];
    if (!d.covers.includes(p.id)) d.covers.push(p.id);
    if (p.type === 'drawer') p.type = 'innerDrawer';
  }
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
    // drzwi z najwyższą częścią sięgają do góry korpusu — żeby były niższe, nad nimi zostaje nowa wolna przestrzeń
    // (automatyczna, nieprzykryta), która zabiera resztę wysokości
    if (hi === st.parts.length - 1 && st.parts.every((p) => p.height != null)) st.parts.push({ id: newId(), type: 'space', height: null });
  }
  return setFrontParts(cabinet, st, project);
}

// Szuflada nieprzykryta → przykryta nowymi drzwiami (szuflada wewnętrzna) albo dołączona do sąsiednich drzwi.
export function coverWithDoor(cabinet, index, project) {
  const st = stateOf(cabinet);
  const p = st.parts[index];
  if (!p || doorOf(st, p.id) >= 0) return cabinet;
  // razem z nią — sąsiednie nieprzykryte szuflady wewnętrzne (pod i nad) i wolne przestrzenie nad nią
  // (szuflady wewnętrzne nie zostają bez drzwi; szuflady z frontem — granica)
  const free = (i) => st.parts[i] && doorOf(st, st.parts[i].id) < 0;
  let lo = index;
  let hi = index;
  while (free(lo - 1) && st.parts[lo - 1].type === 'innerDrawer') lo--;
  while (free(hi + 1) && st.parts[hi + 1].type !== 'drawer') hi++;
  const range = st.parts.slice(lo, hi + 1).map((x) => x.id);
  const near = [hi + 1, lo - 1].map((i) => st.parts[i] && doorOf(st, st.parts[i].id)).find((j) => j != null && j >= 0);
  if (near != null) st.doors[near].covers.push(...range);
  else {
    // nowe drzwi; gdy przykryłyby tylko tę jedną szufladę — nowa wolna przestrzeń (na resztę wysokości) nad nią,
    // żeby drzwi były wyższe od szuflady (miejsce na zawiasy)
    const covers = range;
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

// --- wypełnienie wolnego miejsca szufladą ---
// Wolne miejsce przy szufladzie i: sąsiednie (ciągiem, nad i pod nią) wolne przestrzenie z tymi samymi drzwiami co
// szuflada (albo bez drzwi) oraz niezajęte miejsce nad najwyższą częścią (gdy szuflada nie jest za drzwiami).
// Gdy wpisane wysokości się nie mieszczą (overflow > 0) — gain ujemny: o ile zmniejszyć szufladę, żeby wszystko weszło.
// → { gain (mm, o ile zmieni się szuflada: + rośnie, − maleje), up: [indeksy], down: [indeksy], top (mm) }
export function freeAround(st, ranges, area, gv, i, overflow = 0) {
  const me = st.parts[i];
  const none = { gain: 0, up: [], down: [], top: 0 };
  if (!me || !isDrawerPart(me) || !area) return none;
  if (overflow > 0.5) {
    if (me.height == null) return none; // szuflada automatyczna — przy przepełnieniu i tak ma 0
    const shrink = Math.min(Math.ceil(overflow), me.height - FRONT_PART_MIN);
    return shrink >= 1 ? { gain: -shrink, up: [], down: [], top: 0 } : none;
  }
  const door = doorOf(st, me.id);
  const h = (j) => heightOf(ranges, j);
  const open = (j) => st.parts[j]?.type === 'space' && doorOf(st, st.parts[j].id) === door;
  const up = [];
  const down = [];
  let j = i + 1;
  while (open(j)) up.push(j++);
  let k = i - 1;
  while (open(k)) down.push(k--);
  let top = 0;
  if (j === st.parts.length && door < 0) {
    const last = ranges[st.parts.length - 1];
    top = last ? Math.max(0, area[1] - last[1]) : 0;
  }
  const gain = [...up, ...down].reduce((a, x) => a + h(x) + gv, 0) + top;
  return gain >= 1 ? { gain: Math.round(gain), up, down, top } : none;
}

// Szuflada wypełnia wolne miejsce obok siebie (freeAround): sąsiednie wolne przestrzenie znikają, szuflada rośnie
// o ich wysokość (i niezajęte miejsce na górze). Pozostałe części zostają na swoich wysokościach.
export function fillFreeSpace(cabinet, index, project) {
  const { ranges, area, panels } = geometry(cabinet, project);
  const st = stateOf(cabinet);
  const f = freeAround(st, ranges, area, gvOf(cabinet), index, panels.frontOverflow);
  if (!f.gain) return cabinet;
  const me = st.parts[index];
  if (f.gain < 0) {
    // za duża — zmniejszamy tylko ją (pozostałe wpisane wysokości bez zmian)
    me.height = Math.round(me.height + f.gain);
    return setFrontParts(cabinet, st, project);
  }
  const autos = st.parts.filter((p) => p.height == null);
  st.parts.forEach((p, j) => (p.height = Math.round(heightOf(ranges, j))));
  // jedna część automatyczna (np. szuflada sama w korpusie) zostaje automatyczna — dalej wypełnia korpus
  me.height = Math.round(heightOf(ranges, index) + f.gain);
  if (autos.length === 1 && autos[0] === me) me.height = null;
  const gone = new Set([...f.up, ...f.down].map((j) => st.parts[j].id));
  st.parts = st.parts.filter((p) => !gone.has(p.id));
  st.doors.forEach((d) => (d.covers = d.covers.filter((id) => !gone.has(id))));
  return setFrontParts(cabinet, st, project);
}
export const freeSpaceOf = (cabinet, index, project) => {
  const { ranges, area, panels } = geometry(cabinet, project);
  return freeAround(stateOf(cabinet), ranges, area, gvOf(cabinet), index, panels.frontOverflow).gain;
};
// tekst opcji: „Dopasuj wysokość do miejsca (+294 mm)” / „(−120 mm)”
export const fitLabel = (gain) => `Dopasuj wysokość do miejsca (${gain > 0 ? '+' : '−'}${Math.abs(gain)} mm)`;

// --- zawiasy drzwi (okienko „Zawias”, przeciąganie w 3D) ---
// Zawiasy liczone są na płycie frontu drzwi (panel.hinges, panel.door — indeks drzwi, panel.wing — skrzydło).
// Ustawienia: fronts.doors[j].hinges = { type, pos: { [skrzydło]: [mm od dołu skrzydła] } }.

const hingePanel = (cabinet, key, project) => cabinetPanels(cabinet, project).find((p) => p.key === key && p.hinges?.length && p.door != null);
// obecne położenia zawiasów skrzydła (mm od dołu)
export const hingeYs = (panel) => panel.hinges.map((h) => Math.round((h.y - panel.y) * 10) / 10);
const clampHinge = (panel, v) => {
  const lo = Math.min(HINGE_EDGE_MIN, panel.height / 2);
  return Math.round(Math.min(panel.height - lo, Math.max(lo, v)));
};
function withDoorHinges(cabinet, panel, project, fn) {
  const st = stateOf(cabinet);
  const d = st.doors[panel.door];
  if (!d) return cabinet;
  const hs = { type: d.hinges?.type ?? hingeType().key, ...(d.hinges?.pos ? { pos: { ...d.hinges.pos } } : {}) };
  fn(hs, d);
  if (hs.pos && !Object.keys(hs.pos).length) delete hs.pos;
  d.hinges = hs;
  return setFrontParts(cabinet, st, project);
}

// Rodzaj zawiasów (dla całych drzwi — obu skrzydeł).
export function setHingeType(cabinet, key, type, project) {
  const panel = hingePanel(cabinet, key, project);
  if (!panel) return cabinet;
  return withDoorHinges(cabinet, panel, project, (hs) => (hs.type = hingeType(type).key));
}

// Zawias index skrzydła na wysokość y (mm od dołu drzwi); pozostałe zawiasy zostają na obecnych miejscach.
export function moveHinge(cabinet, key, index, y, project) {
  const panel = hingePanel(cabinet, key, project);
  if (!panel || !panel.hinges[index]) return cabinet;
  const ys = hingeYs(panel);
  ys[index] = clampHinge(panel, y);
  return withDoorHinges(cabinet, panel, project, (hs) => (hs.pos = { ...hs.pos, [panel.wing]: ys }));
}

// Nowy zawias — w środku najdłuższego odstępu między zawiasami (albo między zawiasem a krawędzią drzwi).
// → { cabinet, index } (index — nowego zawiasu, po posortowaniu od dołu)
export function addHinge(cabinet, key, project) {
  const panel = hingePanel(cabinet, key, project);
  if (!panel || panel.hinges.length >= HINGE_LIMITS.max) return { cabinet, index: null };
  const ys = hingeYs(panel).sort((a, b) => a - b);
  const pts = [Math.min(HINGE_EDGE_MIN, panel.height / 2), ...ys, panel.height - Math.min(HINGE_EDGE_MIN, panel.height / 2)];
  let best = 0;
  for (let i = 1; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > pts[best + 1] - pts[best]) best = i;
  const y = clampHinge(panel, (pts[best] + pts[best + 1]) / 2);
  const next = [...ys, y].sort((a, b) => a - b);
  const c = withDoorHinges(cabinet, panel, project, (hs) => (hs.pos = { ...hs.pos, [panel.wing]: next }));
  return { cabinet: c, index: next.indexOf(y) };
}

export function removeHinge(cabinet, key, index, project) {
  const panel = hingePanel(cabinet, key, project);
  if (!panel || panel.hinges.length <= HINGE_LIMITS.min || !panel.hinges[index]) return cabinet;
  const ys = hingeYs(panel).filter((_, i) => i !== index);
  return withDoorHinges(cabinet, panel, project, (hs) => (hs.pos = { ...hs.pos, [panel.wing]: ys }));
}

// Zawiasy skrzydła z powrotem automatyczne (liczba z wysokości drzwi, standardowe położenia).
export function resetHinges(cabinet, key, project) {
  const panel = hingePanel(cabinet, key, project);
  if (!panel) return cabinet;
  return withDoorHinges(cabinet, panel, project, (hs) => {
    if (hs.pos) delete hs.pos[panel.wing];
  });
}
