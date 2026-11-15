// Frezy krawędzi i otwory w płytach poziomych: blatach (na szafkach i samodzielnych) i półkach.
//
// Krawędzie płyty (patrząc z góry): front — przód (od strony pokoju), back — tył, left, right.
// Profil krawędzi: { profile, size } — size w mm (rozmiar fazki / promień zaokrąglenia).
// Otwory: okrągłe { shape: 'circle', x, y, d } albo prostokątne { shape: 'rect', x, y, w, h, r };
//   x — od lewej krawędzi do środka otworu, y — od przedniej krawędzi do środka otworu (mm, z góry),
//   w — wymiar wzdłuż szerokości płyty, h — w głąb płyty, r — promień zaokrąglenia narożników.

export const EDGE_KEYS = ['front', 'back', 'left', 'right'];
export const EDGE_NAMES = { front: 'przód', back: 'tył', left: 'lewa', right: 'prawa' };

export const EDGE_PROFILES = [
  // label — krótka nazwa na liście wyboru, name — do opisu na liście formatek
  { key: 'none', label: 'Prosta', name: 'prosta', sizes: [] },
  { key: 'chamfer', label: 'Fazka 45°', name: 'fazka', sizes: [2, 3, 5] },
  { key: 'round', label: 'Zaokrąglenie góra', name: 'zaokrąglenie z góry', sizes: [2, 3, 5, 10] },
  { key: 'roundBoth', label: 'Zaokr. góra i dół', name: 'zaokrąglenie z góry i z dołu', sizes: [2, 3, 5, 10] },
  { key: 'halfRound', label: 'Półokrągła', name: 'półokrągła (pełne zaokrąglenie)', sizes: [] },
  { key: 'ogee', label: 'Ozdobna (esownica)', name: 'profil ozdobny (esownica)', sizes: [6, 10] },
];
export const profileInfo = (key) => EDGE_PROFILES.find((p) => p.key === key) ?? EDGE_PROFILES[0];

export const defaultEdges = () => Object.fromEntries(EDGE_KEYS.map((k) => [k, { profile: 'none', size: 0 }]));

// Gotowe otwory (najczęstsze wymiary) — można je potem zmienić.
export const HOLE_PRESETS = [
  // name — krótka nazwa zapisywana przy otworze (do opisu na liście formatek)
  { key: 'socket', label: 'Puszka gniazdka Ø60', name: 'gniazdko', shape: 'circle', d: 60 },
  { key: 'cable60', label: 'Przepust kablowy Ø60', name: 'przepust kablowy', shape: 'circle', d: 60 },
  { key: 'cable80', label: 'Przepust kablowy Ø80', name: 'przepust kablowy', shape: 'circle', d: 80 },
  { key: 'tap', label: 'Otwór pod kran Ø35', name: 'kran', shape: 'circle', d: 35 },
  { key: 'sink', label: 'Zlew (wycięcie 780 × 480)', name: 'zlew', shape: 'rect', w: 780, h: 480, r: 10 },
  { key: 'hob', label: 'Płyta grzewcza (wycięcie 560 × 490)', name: 'płyta grzewcza', shape: 'rect', w: 560, h: 490, r: 5 },
  { key: 'circle', label: 'Okrągły (własny)', shape: 'circle', d: 50 },
  { key: 'rect', label: 'Prostokątny (własny)', shape: 'rect', w: 200, h: 100, r: 0 },
];

export const HOLE_LIMITS = { min: 5, max: 3000 };

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
    .map((h) =>
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
          },
    );
}

// Nowy otwór z gotowego wzoru — na środku płyty o wymiarach width × depth.
export function createHole(presetKey, width, depth) {
  const p = HOLE_PRESETS.find((x) => x.key === presetKey) ?? HOLE_PRESETS[0];
  const base = { shape: p.shape, label: p.name ?? '', x: Math.round(width / 2), y: Math.round(depth / 2) };
  return p.shape === 'circle' ? { ...base, d: p.d } : { ...base, w: p.w, h: p.h, r: p.r };
}

// Czy otwór mieści się w płycie (z zapasem 10 mm od krawędzi).
export function holeFits(hole, width, depth, margin = 10) {
  const [hw, hd] = hole.shape === 'circle' ? [hole.d / 2, hole.d / 2] : [hole.w / 2, hole.h / 2];
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
  return parts.length ? `frez krawędzi: ${parts.join('; ')}` : '';
}

// Opis otworów, np. „otwory: Ø60 (x 300; y 50), wycięcie 780 × 480 R10 (x 900; y 300) — środek od lewej i przedniej krawędzi”.
export function describeHoles(holes) {
  if (!holes?.length) return '';
  const list = holes.map((h) => {
    const what = h.shape === 'circle' ? `Ø${fmt(h.d)}` : `wycięcie ${fmt(h.w)} × ${fmt(h.h)}${h.r ? ` R${fmt(h.r)}` : ''}`;
    return `${h.label ? `${h.label}: ` : ''}${what} (x ${fmt(h.x)}; y ${fmt(h.y)})`;
  });
  return `otwory: ${list.join(', ')} — środek w mm od lewej i od przedniej krawędzi, patrząc z góry`;
}
