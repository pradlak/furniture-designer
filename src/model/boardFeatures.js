// Frezy krawędzi i otwory w płytach poziomych: blatach (na szafkach i samodzielnych) i półkach.
//
// Krawędzie płyty (patrząc z góry): front — przód (od strony pokoju), back — tył, left, right.
// Profil krawędzi: { profile, size } — size w mm (rozmiar fazki / promień zaokrąglenia).
// Otwory: okrągłe { shape: 'circle', x, y, d } albo prostokątne { shape: 'rect', x, y, w, h, r };
//   x — od lewej krawędzi do środka otworu, y — od przedniej krawędzi do środka otworu (mm, z góry),
//   w — wymiar wzdłuż szerokości płyty, h — w głąb płyty, r — promień zaokrąglenia narożników.
import { t } from '../i18n.js';

export const EDGE_KEYS = ['front', 'back', 'left', 'right'];
export const EDGE_NAMES = { front: t('przód'), back: t('tył'), left: t('lewa'), right: t('prawa') };

export const EDGE_PROFILES = [
  // label — krótka nazwa na liście wyboru, name — do opisu na liście formatek
  { key: 'none', label: t('Prosta'), name: t('prosta'), sizes: [] },
  { key: 'chamfer', label: t('Fazka 45°'), name: t('fazka'), sizes: [2, 3, 5] },
  { key: 'round', label: t('Zaokrąglenie góra'), name: t('zaokrąglenie z góry'), sizes: [2, 3, 5, 10] },
  { key: 'roundBoth', label: t('Zaokr. góra i dół'), name: t('zaokrąglenie z góry i z dołu'), sizes: [2, 3, 5, 10] },
  { key: 'halfRound', label: t('Półokrągła'), name: t('półokrągła (pełne zaokrąglenie)'), sizes: [] },
  { key: 'ogee', label: t('Ozdobna (esownica)'), name: t('profil ozdobny (esownica)'), sizes: [6, 10] },
];
export const profileInfo = (key) => EDGE_PROFILES.find((p) => p.key === key) ?? EDGE_PROFILES[0];

export const defaultEdges = () => Object.fromEntries(EDGE_KEYS.map((k) => [k, { profile: 'none', size: 0 }]));

// Gotowe otwory (najczęstsze wymiary) — można je potem zmienić.
export const HOLE_PRESETS = [
  // name — krótka nazwa zapisywana przy otworze (do opisu na liście formatek)
  { key: 'socket', label: t('Puszka gniazdka Ø60'), name: t('gniazdko'), shape: 'circle', d: 60 },
  { key: 'cable60', label: t('Przepust kablowy Ø60'), name: t('przepust kablowy'), shape: 'circle', d: 60 },
  { key: 'cable80', label: t('Przepust kablowy Ø80'), name: t('przepust kablowy'), shape: 'circle', d: 80 },
  { key: 'tap', label: t('Otwór pod kran Ø35'), name: t('kran'), shape: 'circle', d: 35 },
  { key: 'sink', label: t('Zlew (wycięcie 780 × 480)'), name: t('zlew'), shape: 'rect', w: 780, h: 480, r: 10 },
  { key: 'hob', label: t('Płyta grzewcza (wycięcie 560 × 490)'), name: t('płyta grzewcza'), shape: 'rect', w: 560, h: 490, r: 5 },
  { key: 'induction', label: t('Płyta indukcyjna (wycięcie 560 × 490, z płytą)'), name: t('płyta indukcyjna'), shape: 'rect', w: 560, h: 490, r: 5, fill: 'induction' },
  { key: 'gas', label: t('Płyta gazowa (wycięcie 560 × 480, z płytą)'), name: t('płyta gazowa'), shape: 'rect', w: 560, h: 480, r: 5, fill: 'gas' },
  { key: 'circle', label: t('Okrągły (własny)'), shape: 'circle', d: 50 },
  { key: 'rect', label: t('Prostokątny (własny)'), shape: 'rect', w: 200, h: 100, r: 0 },
];

export const HOLE_LIMITS = { min: 5, max: 3000 };

// Wypełnienie otworu prostokątnego (tylko wygląd w 3D i opis): płyta grzewcza leżąca na blacie nad wycięciem.
export const HOLE_FILLS = [
  { key: null, label: t('puste (bez płyty)') },
  { key: 'induction', label: t('płyta indukcyjna'), name: t('płyta indukcyjna') },
  { key: 'gas', label: t('płyta gazowa'), name: t('płyta gazowa') },
];

// Położenie otworu (jak uchwytu na froncie): pos — null (własne: x, y wpisane ręcznie) albo dwie litery:
// rząd f / c / b (przód / środek / tył) i kolumna l / c / r (lewa / środek / prawa), np. 'fl' — lewy przedni róg.
// gx, gy — przy krawędzi: odstęp od krawędzi płyty do krawędzi otworu; przy środku: przesunięcie od środka.
// Takie otwory przeliczają się przy każdej zmianie wymiarów płyty (np. blat wydłużony — otwór zostaje w rogu).
export const HOLE_POSITIONS = [
  { key: null, label: t('Własne (x, y)') },
  { key: 'fl', label: t('Lewy przedni róg') },
  { key: 'fc', label: t('Przód — środek') },
  { key: 'fr', label: t('Prawy przedni róg') },
  { key: 'cl', label: t('Lewa — środek') },
  { key: 'cc', label: t('Środek płyty') },
  { key: 'cr', label: t('Prawa — środek') },
  { key: 'bl', label: t('Lewy tylny róg') },
  { key: 'bc', label: t('Tył — środek') },
  { key: 'br', label: t('Prawy tylny róg') },
];
export const HOLE_EDGE_GAP = 50; // domyślny odstęp otworu od krawędzi
const halfSize = (h) => (h.shape === 'circle' ? [h.d / 2, h.d / 2] : [h.w / 2, h.h / 2]);

// Otwór z wyliczonym środkiem (x, y) dla płyty width × depth — przy położeniu „własne” bez zmian.
export function resolveHole(h, width, depth) {
  if (!h?.pos || !(width > 0) || !(depth > 0)) return h;
  const [hw, hd] = halfSize(h);
  const [row, col] = h.pos;
  const gx = h.gx ?? 0;
  const gy = h.gy ?? 0;
  const x = col === 'l' ? gx + hw : col === 'r' ? width - gx - hw : width / 2 + gx;
  const y = row === 'f' ? gy + hd : row === 'b' ? depth - gy - hd : depth / 2 + gy;
  return { ...h, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}
export const resolveHoles = (holes, width, depth) => (holes ?? []).map((h) => resolveHole(h, width, depth));

// Zmiana położenia (pos): odstępy — przy krawędzi zostają (albo domyślne 50 mm, gdy wcześniej był środek),
// przy środku — 0 (dokładnie na środku).
export function setHolePosition(h, pos) {
  if (!pos) return { ...h, pos: null };
  const edgeOrCenter = (oldAxis, newAxis, gap) => (newAxis === 'c' ? 0 : oldAxis && oldAxis !== 'c' ? (gap ?? HOLE_EDGE_GAP) : HOLE_EDGE_GAP);
  return { ...h, pos, gx: edgeOrCenter(h.pos?.[1], pos[1], h.gx), gy: edgeOrCenter(h.pos?.[0], pos[0], h.gy) };
}

// Przesunięcie otworu o d mm w osi 'x' (w prawo) albo 'y' (w głąb) — strzałki na klawiaturze. Otwór
// z położeniem zmienia odstęp od swojej krawędzi (zostaje zakotwiczony), własny — x / y.
export function moveHole(h, axis, d) {
  if (!h.pos) return { ...h, [axis]: h[axis] + d };
  const anchor = axis === 'x' ? h.pos[1] : h.pos[0];
  const key = axis === 'x' ? 'gx' : 'gy';
  const sign = anchor === 'r' || anchor === 'b' ? -1 : 1;
  return { ...h, [key]: (h[key] ?? 0) + sign * d };
}

// Wsunięcie krawędzi (o ile krawędź jest „ścięta” do środka płyty) na wysokości h (0 — spód, t — wierzch)
// dla profilu krawędzi. Używane do rysowania profilu w 3D (płyta z warstw) i do opisu.
export function edgeInset(edge, h, t) {
  const p = edge?.profile ?? 'none';
  const s = Math.max(0, Math.min(edge?.size ?? 0, t / 2));
  const arc = (dist, R) => (dist >= R ? 0 : R - Math.sqrt(Math.max(0, R * R - (R - dist) ** 2)));
  const fromTop = t - h;
  switch (p) {
    case 'chamfer':
      return fromTop < s ? s - fromTop : 0;
    case 'round':
      return arc(fromTop, s);
    case 'roundBoth':
      return Math.max(arc(fromTop, s), arc(h, s));
    case 'halfRound':
      return Math.max(arc(fromTop, t / 2), arc(h, t / 2));
    case 'ogee': {
      // esownica: wklęsły łuk przy wierzchu przechodzący w wypukły — uproszczony profil rozmiaru s
      if (fromTop >= s) return 0;
      const u = fromTop / s; // 0 (wierzch) … 1
      return s * (0.5 + 0.5 * Math.cos(Math.PI * u)) * 0.9;
    }
    default:
      return 0;
  }
}

// Wysokości (od spodu), na których profil krawędzi się zmienia — granice warstw do rysowania.
export function profileBreaks(edges, t) {
  const hs = new Set([0, t]);
  for (const e of Object.values(edges ?? {})) {
    if (!e || e.profile === 'none') continue;
    const s = e.profile === 'halfRound' ? t / 2 : Math.min(e.size ?? 0, t / 2);
    if (!(s > 0)) continue;
    const steps = e.profile === 'chamfer' ? 3 : 5;
    const top = e.profile !== 'roundBoth' && e.profile !== 'halfRound';
    for (let i = 0; i <= steps; i++) {
      const d = (s * i) / steps;
      hs.add(t - d);
      if (!top) hs.add(d);
    }
  }
  return [...hs].filter((h) => h >= 0 && h <= t).sort((a, b) => a - b);
}

export function normalizeEdges(raw) {
  const out = defaultEdges();
  for (const k of EDGE_KEYS) {
    const e = raw?.[k];
    const info = EDGE_PROFILES.find((p) => p.key === e?.profile);
    if (!info || info.key === 'none') continue;
    const size = Number(e.size);
    out[k] = { profile: info.key, size: Number.isFinite(size) && size > 0 ? Math.min(size, 50) : (info.sizes[0] ?? 0) };
  }
  return out;
}

export function normalizeHoles(raw) {
  if (!Array.isArray(raw)) return [];
  const n = (v, def, min = -HOLE_LIMITS.max, max = HOLE_LIMITS.max) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
  };
  return raw
    .filter((h) => h && (h.shape === 'circle' || h.shape === 'rect'))
    .slice(0, 50)
    .map((h) => {
      const hole =
        h.shape === 'circle'
          ? { shape: 'circle', label: typeof h.label === 'string' ? h.label.slice(0, 60) : '', x: n(h.x, 100), y: n(h.y, 100), d: n(h.d, 50, HOLE_LIMITS.min) }
          : {
              shape: 'rect',
              label: typeof h.label === 'string' ? h.label.slice(0, 60) : '',
              x: n(h.x, 200),
              y: n(h.y, 200),
              w: n(h.w, 200, HOLE_LIMITS.min),
              h: n(h.h, 100, HOLE_LIMITS.min),
              r: n(h.r, 0, 0, 500),
              fill: HOLE_FILLS.some((f) => f.key && f.key === h.fill) ? h.fill : null,
            };
      // położenie (róg / środek krawędzi z odstępem) — tylko poprawne klucze; bez niego — własne x, y
      if (HOLE_POSITIONS.some((p) => p.key && p.key === h.pos)) Object.assign(hole, { pos: h.pos, gx: n(h.gx, 0), gy: n(h.gy, 0) });
      return hole;
    });
}

// Nowy otwór z gotowego wzoru — na środku płyty o wymiarach width × depth.
export function createHole(presetKey, width, depth) {
  const p = HOLE_PRESETS.find((x) => x.key === presetKey) ?? HOLE_PRESETS[0];
  const base = { shape: p.shape, label: p.name ?? '', x: Math.round(width / 2), y: Math.round(depth / 2) };
  return p.shape === 'circle' ? { ...base, d: p.d } : { ...base, w: p.w, h: p.h, r: p.r, fill: p.fill ?? null };
}

// Czy otwór mieści się w płycie (z zapasem 10 mm od krawędzi).
export function holeFits(hole0, width, depth, margin = 10) {
  const hole = resolveHole(hole0, width, depth);
  const [hw, hd] = halfSize(hole);
  return hole.x - hw >= margin && hole.x + hw <= width - margin && hole.y - hd >= margin && hole.y + hd <= depth - margin;
}

const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Opis frezów krawędzi do listy formatek, np. „frez krawędzi: przód — zaokrąglenie z góry R5; lewa — fazka 3 mm”.
export function describeEdges(edges) {
  const parts = EDGE_KEYS.filter((k) => edges?.[k] && edges[k].profile !== 'none').map((k) => {
    const e = edges[k];
    const info = profileInfo(e.profile);
    const name = info.name;
    const size = e.profile === 'halfRound' ? '' : e.profile === 'chamfer' ? ` ${fmt(e.size)} mm` : ` R${fmt(e.size)}`;
    return `${EDGE_NAMES[k]} — ${name}${size}`;
  });
  return parts.length ? t('frez krawędzi: {list}', { list: parts.join('; ') }) : '';
}

// Opis otworów, np. „otwory: Ø60 (x 300; y 50), wycięcie 780 × 480 R10 (x 900; y 300) — środek od lewej i przedniej krawędzi”.
// width, depth — wymiary płyty (do otworów z położeniem: róg, środek krawędzi).
export function describeHoles(holes, width, depth) {
  if (!holes?.length) return '';
  const list = resolveHoles(holes, width, depth).map((h) => {
    const what = h.shape === 'circle' ? `Ø${fmt(h.d)}` : t('wycięcie {w} × {h}', { w: fmt(h.w), h: fmt(h.h) }) + (h.r ? ` R${fmt(h.r)}` : '');
    const fillName = HOLE_FILLS.find((f) => f.key === h.fill)?.name;
    const fill = fillName && fillName !== h.label ? ` — ${fillName}` : ''; // (bez powtórzenia, gdy nazwa otworu to już nazwa płyty)
    return `${h.label ? `${h.label}: ` : ''}${what}${fill} (x ${fmt(h.x)}; y ${fmt(h.y)})`;
  });
  return t('otwory: {list} — środek w mm od lewej i od przedniej krawędzi, patrząc z góry', { list: list.join(', ') });
}
