// Frezy dekoracyjne lica frontu (zwykle MDF lakierowany). Każdy wzór to zestaw odcinków (rowków)
// na licu frontu, w układzie frontu: mm, początek w lewym dolnym narożniku, x w prawo, y w górę.
// Z odcinków korzysta widok 3D (rysuje rowki), podgląd w panelu (SVG) i opis do listy formatek.
//
// Parametry (wspólne dla wzorów, każdy wzór używa części z nich — patrz `params`):
//  margin  — odległość frezu od krawędzi frontu,
//  spacing — rozstaw rowków (poziomych / pionowych),
//  gap     — odstęp między liniami ramki podwójnej / potrójnej, ścięcie albo promień narożnika.
import { t } from '../i18n.js';

export const DECOR_LIMITS = { min: 10, max: 500 };
export const DECOR_GAP_LIMITS = { min: 5, max: 200 };
export const DECOR_DEFAULTS = { margin: 60, spacing: 100, gap: 20 };

const P = {
  margin: { field: 'decorMargin', label: t('Odległość od krawędzi') },
  spacing: { field: 'decorSpacing', label: t('Rozstaw rowków') },
  gapFrames: { field: 'decorGap', label: t('Odstęp między liniami') },
  gapChamfer: { field: 'decorGap', label: t('Ścięcie narożnika') },
  gapRadius: { field: 'decorGap', label: t('Promień narożnika') },
};

// key — zapisywany w projekcie; params — pola do ustawienia (kolejność w panelu).
export const FRONT_DECORS = [
  { key: 'none', label: t('Brak'), params: [] },
  { key: 'frame', label: t('Ramka'), params: [P.margin] },
  { key: 'doubleFrame', label: t('Ramka podwójna'), params: [P.margin, P.gapFrames] },
  { key: 'tripleFrame', label: t('Ramka potrójna'), params: [P.margin, P.gapFrames] },
  { key: 'chamferFrame', label: t('Ramka ze ściętymi narożnikami'), params: [P.margin, P.gapChamfer] },
  { key: 'roundFrame', label: t('Ramka z zaokrąglonymi narożnikami'), params: [P.margin, P.gapRadius] },
  { key: 'frameVertical', label: t('Ramka z pionowymi rowkami'), params: [P.margin, P.spacing] },
  { key: 'boards', label: t('Deski (pionowe rowki między poziomymi liniami)'), params: [P.margin, P.spacing] },
  { key: 'archVertical', label: t('Łuk u góry z pionowymi rowkami'), params: [P.margin, P.spacing] },
  { key: 'diamonds', label: t('Ramka z rombami na środku'), params: [P.margin] },
  { key: 'bands', label: t('Linie poziome u góry i u dołu'), params: [P.margin] },
  { key: 'verticalLines', label: t('Pionowe rowki'), params: [P.spacing] },
  { key: 'lines', label: t('Poziome rowki'), params: [P.spacing] },
];

export const decorInfo = (key) => FRONT_DECORS.find((d) => d.key === key) ?? FRONT_DECORS[0];

// Prostokąt jako 4 odcinki.
const rect = (x0, y0, x1, y1) => [
  [x0, y0, x1, y0],
  [x1, y0, x1, y1],
  [x1, y1, x0, y1],
  [x0, y1, x0, y0],
];

// Rowki pionowe w przedziale [x0, x1], co `spacing`, rozłożone symetrycznie (równe pola).
function verticalPositions(x0, x1, spacing) {
  const n = Math.max(1, Math.round((x1 - x0) / spacing));
  return Array.from({ length: n - 1 }, (_, i) => x0 + ((i + 1) * (x1 - x0)) / n);
}

// Łuk (odcinek okręgu) jako łamana: środek (cx, cy), promień r, kąty w radianach.
function arc(cx, cy, r, a0, a1, steps = 12) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + ((a1 - a0) * i) / steps;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
    out.push([cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1)]);
  }
  return out;
}

// Odcinki frezu dla frontu w × h (mm). Pusta lista, gdy wzór się nie mieści.
export function decorSegments(decor, w, h, { margin = DECOR_DEFAULTS.margin, spacing = DECOR_DEFAULTS.spacing, gap = DECOR_DEFAULTS.gap } = {}) {
  const k = margin;
  const [x0, y0, x1, y1] = [k, k, w - k, h - k];
  const fits = (pad = 0) => x1 - x0 > 2 * pad + 10 && y1 - y0 > 2 * pad + 10;
  switch (decor) {
    case 'frame':
      return fits() ? rect(x0, y0, x1, y1) : [];
    case 'doubleFrame':
    case 'tripleFrame': {
      const n = decor === 'doubleFrame' ? 2 : 3;
      const out = [];
      for (let i = 0; i < n; i++) if (fits(i * gap)) out.push(...rect(x0 + i * gap, y0 + i * gap, x1 - i * gap, y1 - i * gap));
      return out;
    }
    case 'chamferFrame': {
      const c = Math.min(gap, (x1 - x0) / 3, (y1 - y0) / 3);
      if (!fits() || c <= 0) return [];
      return [
        [x0 + c, y0, x1 - c, y0],
        [x1 - c, y0, x1, y0 + c],
        [x1, y0 + c, x1, y1 - c],
        [x1, y1 - c, x1 - c, y1],
        [x1 - c, y1, x0 + c, y1],
        [x0 + c, y1, x0, y1 - c],
        [x0, y1 - c, x0, y0 + c],
        [x0, y0 + c, x0 + c, y0],
      ];
    }
    case 'roundFrame': {
      const r = Math.min(gap, (x1 - x0) / 2, (y1 - y0) / 2);
      if (!fits() || r <= 0) return [];
      return [
        [x0 + r, y0, x1 - r, y0],
        ...arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, 6),
        [x1, y0 + r, x1, y1 - r],
        ...arc(x1 - r, y1 - r, r, 0, Math.PI / 2, 6),
        [x1 - r, y1, x0 + r, y1],
        ...arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 6),
        [x0, y1 - r, x0, y0 + r],
        ...arc(x0 + r, y0 + r, r, Math.PI, (3 * Math.PI) / 2, 6),
      ];
    }
    case 'frameVertical':
      if (!fits()) return [];
      return [...rect(x0, y0, x1, y1), ...verticalPositions(x0, x1, spacing).map((x) => [x, y0, x, y1])];
    case 'boards':
      // dwie poziome linie na całą szerokość (u góry i u dołu), między nimi pionowe rowki co `spacing`
      if (h - 2 * k <= 10) return [];
      return [[0, k, w, k], [0, h - k, w, h - k], ...verticalPositions(0, w, spacing).map((x) => [x, k, x, h - k])];
    case 'archVertical': {
      // ramka z łukiem u góry: łuk o cięciwie = szerokość ramki, strzałka ≈ 1/4 szerokości
      if (!fits()) return [];
      const cw = x1 - x0;
      const sag = Math.min(cw / 4, (y1 - y0) / 3);
      const ys = y1 - sag; // początek łuku na bokach
      const R = (cw * cw) / (8 * sag) + sag / 2; // promień okręgu przez końce cięciwy i szczyt
      const cx = (x0 + x1) / 2;
      const cy = y1 - R;
      const half = Math.asin(cw / 2 / R);
      const topAt = (x) => cy + Math.sqrt(Math.max(0, R * R - (x - cx) ** 2)); // wysokość łuku nad x
      return [
        [x0, y0, x1, y0],
        [x1, y0, x1, ys],
        [x0, ys, x0, y0],
        ...arc(cx, cy, R, Math.PI / 2 - half, Math.PI / 2 + half, 16),
        ...verticalPositions(x0, x1, spacing).map((x) => [x, y0, x, topAt(x)]),
      ];
    }
    case 'diamonds': {
      // ramka + trzy romby jeden nad drugim na środku
      if (!fits()) return [];
      const dw = Math.min((x1 - x0) * 0.3, 90);
      const dh = dw * 1.4;
      if ((y1 - y0) < dh * 3.5) return rect(x0, y0, x1, y1);
      const cx = w / 2;
      const out = [...rect(x0, y0, x1, y1)];
      for (const cy of [h / 2 - dh * 1.05, h / 2, h / 2 + dh * 1.05]) {
        out.push([cx, cy - dh / 2, cx + dw / 2, cy], [cx + dw / 2, cy, cx, cy + dh / 2], [cx, cy + dh / 2, cx - dw / 2, cy], [cx - dw / 2, cy, cx, cy - dh / 2]);
      }
      return out;
    }
    case 'bands':
      return h - 2 * k > 10 ? [[0, k, w, k], [0, h - k, w, h - k]] : [];
    case 'verticalLines':
      return verticalPositions(0, w, spacing).map((x) => [x, 0, x, h]);
    case 'lines': {
      const out = [];
      for (let y = spacing; y < h - 5; y += spacing) out.push([0, y, w, y]);
      return out;
    }
    default:
      return [];
  }
}

// Opis frezu do listy formatek, np. „frez dekoracyjny: ramka podwójna, 60 mm od krawędzi, odstęp między liniami 20 mm”.
export function describeDecor(m) {
  if (!m?.decor || m.decor === 'none') return '';
  const info = decorInfo(m.decor);
  const values = { decorMargin: m.decorMargin, decorSpacing: m.decorSpacing, decorGap: m.decorGap };
  const parts = info.params.map((p) => `${p.label.toLowerCase()} ${values[p.field]} mm`);
  return t('frez dekoracyjny: {name}', { name: info.label.toLowerCase() }) + (parts.length ? `, ${parts.join(', ')}` : '');
}

// Mały podgląd wzoru (SVG) — front proporcji w × h przeskalowany do wysokości `size` px.
export function decorPreviewSvg(decor, w, h, opts, size = 64) {
  const s = size / Math.max(w, h);
  const W = w * s;
  const H = h * s;
  const lines = decorSegments(decor, w, h, opts)
    .map(([ax, ay, bx, by]) => `<line x1="${(ax * s).toFixed(1)}" y1="${(H - ay * s).toFixed(1)}" x2="${(bx * s).toFixed(1)}" y2="${(H - by * s).toFixed(1)}"/>`)
    .join('');
  return `<svg class="decor-preview" viewBox="-1 -1 ${(W + 2).toFixed(1)} ${(H + 2).toFixed(1)}" width="${(W + 2).toFixed(0)}" height="${(H + 2).toFixed(0)}" aria-hidden="true">
    <rect x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" rx="1" class="decor-preview-front"/>
    <g class="decor-preview-lines">${lines}</g></svg>`;
}
