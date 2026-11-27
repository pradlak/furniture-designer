// Zamówienie elementów z MDF lakierowanego (np. w smartfronty.pl): fronty (z otworami pod uchwyty
// i zawiasy, frezami) i blendy. Takich elementów meble.pl nie wytnie w rozkroju płyt — zamawia się je
// osobno, wpisując wymiary ręcznie i dołączając rysunki z otworami.
//
// mdfOrderItems(project) → pozycje (jednakowe złączone, z numerem rysunku F1, F2… / B1, B2…),
// mdfOrderXlsx(project) → plik Excel z listą, mdfDrawingSvg(item) → rysunek elementu (SVG, wymiary w mm)
// — tylko obrys, wymiary i otwory (materiał, kolor i frezy wybiera się u producenta frontów).

import { cabinetPanels, HINGE_CUP } from './furniture.js';
import { trimSegments, TRIM_TYPES } from './trims.js';
import { trimMaterial } from './materials.js';
import { TRIM_THICKNESS_AXIS } from './edges.js';
import { describeDecor } from './decor.js';
import { buildXlsx } from './xlsx.js';
import { t } from '../i18n.js';

const r1 = (v) => Math.round(v * 10) / 10;

// Wymiary lica płyty (szerokość × wysokość, patrząc na lico) dla osi grubości.
function faceSize(box, axis) {
  if (axis === 'x') return [box.depth, box.height];
  if (axis === 'y') return [box.width, box.depth];
  return [box.width, box.height];
}

// Frez uchwytowy — opis krawędzi.
const GROOVE = { yMax: t('górna krawędź'), yMin: t('dolna krawędź'), xMin: t('lewa krawędź'), xMax: t('prawa krawędź') };

export function mdfOrderItems(project) {
  const rows = [];
  for (const c of project.furniture) {
    for (const p of cabinetPanels(c, project)) {
      if (!p.valid || p.material?.type !== 'mdf' || (p.group !== 'front' && p.group !== 'blend')) continue;
      const [w, h] = faceSize(p, p.thicknessAxis);
      const isFront = p.group === 'front';
      const rel = (pt) => ({ x: r1(pt.x - p.x), y: r1(pt.y - p.y) });
      rows.push({
        kind: isFront ? 'front' : 'blend',
        name: p.name,
        owner: c.name,
        width: r1(w),
        height: r1(h),
        thickness: r1(p.material.thickness),
        material: p.material.name,
        color: p.material.colorName ?? null,
        decor: isFront && p.milling?.decor && p.milling.decor !== 'none' ? p.milling : null,
        groove: isFront ? (p.milling?.groove ?? null) : null,
        handle: isFront && p.handle ? { type: p.handle.type, spacing: p.handle.spacing, d: p.handle.hole, holes: p.handle.holes.map(rel) } : null,
        hinges: isFront ? (p.hinges ?? []).map(rel) : [],
        hingeSide: p.opening?.hinge ?? null,
      });
    }
  }
  for (const tr of project.trims ?? []) {
    if (tr.type === 'countertop') continue;
    const material = trimMaterial(tr, project);
    if (material.type !== 'mdf') continue;
    for (const seg of trimSegments(tr, project)) {
      const [w, h] = faceSize(seg, TRIM_THICKNESS_AXIS[tr.type]);
      rows.push({
        kind: 'blend',
        name: tr.name || TRIM_TYPES[tr.type].label,
        owner: t('wspólne'),
        width: r1(w),
        height: r1(h),
        thickness: r1(material.thickness),
        material: material.name,
        color: material.colorName ?? null,
        decor: null,
        groove: null,
        handle: null,
        hinges: [],
        hingeSide: null,
      });
    }
  }

  // Jednakowe elementy (wymiary, kolor, frezy, otwory) — jedna pozycja z ilością i jednym rysunkiem.
  const merged = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.kind, r.width, r.height, r.thickness, r.material, r.decor, r.groove, r.handle, r.hinges]);
    const m = merged.get(key);
    if (m) {
      m.qty += 1;
      if (!m.names.includes(r.name)) m.names.push(r.name);
      if (!m.owners.includes(r.owner)) m.owners.push(r.owner);
    } else merged.set(key, { ...r, qty: 1, names: [r.name], owners: [r.owner] });
  }
  const items = [...merged.values()].sort((a, b) => (a.kind === b.kind ? b.height - a.height || b.width - a.width : a.kind === 'front' ? -1 : 1));
  let f = 0;
  let b = 0;
  for (const it of items) it.no = it.kind === 'front' ? `F${++f}` : `B${++b}`;
  return items;
}

// Opisy do Excela i rysunków.
// (bez przedrostka „frez dekoracyjny: ” — w kolumnie o tej nazwie)
const stripPrefix = (s, prefix) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);
export const describeItemDecor = (it) => (it.decor ? stripPrefix(describeDecor(it.decor), t('frez dekoracyjny: {name}', { name: '' })) : '');
export const describeItemGroove = (it) => (it.groove ? t('frez uchwytowy: {edge}', { edge: GROOVE[it.groove] ?? it.groove }) : '');
export function describeItemHandle(it) {
  if (!it.handle) return '';
  const what = it.handle.type === 'knob' ? t('gałka') : t('uchwyt, rozstaw {s} mm', { s: it.handle.spacing });
  return t('{what}: {n} × Ø{d} przelotowe — {list}', { what, n: it.handle.holes.length, d: it.handle.d, list: it.handle.holes.map((p) => `(${p.x}; ${p.y})`).join(', ') });
}
// Zawiasy: tylko wysokości (od dolnej krawędzi) i strona — odległość puszki od krawędzi frontu jest
// standardowa dla zawiasu (wierci ją producent frontów), więc jej nie podajemy.
export function describeItemHinges(it) {
  if (!it.hinges.length) return '';
  const { diameter, depth } = HINGE_CUP;
  const opts = { n: it.hinges.length, d: diameter, depth, list: it.hinges.map((p) => p.y).join(', ') };
  return it.hingeSide === 'right'
    ? t('{n} × Ø{d} gł. {depth} od tyłu, przy prawej krawędzi (patrząc od przodu), odległość od krawędzi standardowa — wysokości od dołu: {list}', opts)
    : t('{n} × Ø{d} gł. {depth} od tyłu, przy lewej krawędzi (patrząc od przodu), odległość od krawędzi standardowa — wysokości od dołu: {list}', opts);
}

export const MDF_ORDER_NOTES = [
  t('Wymiary w mm. Szerokość × wysokość — patrząc na lico (od przodu).'),
  t('Współrzędne otworów (x; y) — środki otworów, w mm od lewego dolnego narożnika frontu, patrząc na front od przodu.'),
  t('Zawiasy: puszka Ø{d} mm, głębokość {depth} mm, wiercona od tyłu frontu; podane są wysokości środków od dolnej krawędzi, odległość od krawędzi bocznej — standardowa dla zawiasu.', { d: HINGE_CUP.diameter, depth: HINGE_CUP.depth }),
  t('Otwory pod uchwyty — przelotowe, wiercone od przodu.'),
  t('Do każdej pozycji jest rysunek — plik PNG z rodzajem, numerem i wymiarami w nazwie, np. front_F1_395x717.png, blenda_B1_40x2390.png.'),
];

export function mdfOrderXlsx(project) {
  const items = mdfOrderItems(project);
  const header = [
    t('Nr rysunku'), t('Rodzaj'), t('Szerokość [mm]'), t('Wysokość [mm]'), t('Grubość [mm]'), t('Ilość [szt.]'), t('Kolor'),
    t('Frez dekoracyjny'), t('Frez uchwytowy'), t('Otwory pod uchwyt'), t('Otwory pod zawiasy'), t('Element'), t('Mebel'),
  ];
  const rows = items.map((it) => [
    it.no, it.kind === 'front' ? t('front') : t('blenda'), it.width, it.height, it.thickness, it.qty, it.color ?? '',
    describeItemDecor(it), stripPrefix(describeItemGroove(it), t('frez uchwytowy: {edge}', { edge: '' })), describeItemHandle(it), describeItemHinges(it),
    it.names.join(', '), it.owners.join(', '),
  ]);
  return buildXlsx([
    { name: t('Fronty i blendy MDF'), header, rows, widths: [9, 9, 11, 11, 10, 9, 16, 34, 18, 48, 60, 34, 22] },
    { name: t('Objaśnienia'), header: [t('Objaśnienia')], rows: MDF_ORDER_NOTES.map((n) => [n]), widths: [140] },
  ]);
}

// --- Rysunek elementu (SVG) ---
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v) => String(r1(v)).replace('.', ',');

export function mdfDrawingSvg(it) {
  const W = it.width;
  const H = it.height;
  const s = Math.min(560 / W, 760 / H, 1.2); // px na mm
  const fw = W * s;
  const fh = H * s;
  const ox = 120; // lewy margines (wymiar wysokości)
  const oy = 80; // górny margines (nagłówek)
  const holes = [
    ...(it.handle?.holes ?? []).map((p, i) => ({ ...p, id: `U${i + 1}`, d: it.handle.d, kind: 'handle' })),
    ...it.hinges.map((p, i) => ({ ...p, id: `Z${i + 1}`, d: HINGE_CUP.diameter, kind: 'hinge' })),
  ];
  const tableTop = oy + fh + 90;
  const lineH = 22;
  const notes = [
    t('Widok od przodu (od lica). Wymiary w mm; współrzędne środków otworów od lewego dolnego narożnika.'),
    it.hinges.length ? t('Z — otwory pod zawiasy: Ø{d} mm, gł. {depth} mm, wiercone OD TYŁU (linia przerywana);', { d: HINGE_CUP.diameter, depth: HINGE_CUP.depth }) : '',
    it.hinges.length ? t('podana jest wysokość środka od dolnej krawędzi, odległość od krawędzi bocznej — standardowa dla zawiasu.') : '',
    it.handle ? t('U — otwory pod uchwyt: Ø{d} mm, przelotowe.', { d: it.handle.d }) : '',
  ].filter(Boolean);
  const totalW = Math.max(ox + fw + 200, 760);
  const totalH = tableTop + (holes.length + 1) * lineH + notes.length * lineH + 40;
  const X = (x) => ox + x * s;
  const Y = (y) => oy + fh - y * s;

  const parts = [];
  // nagłówek
  const title = `${it.no} — ${it.kind === 'front' ? t('front') : t('blenda')} ${num(W)} × ${num(H)} × ${num(it.thickness)} mm — ` + t('{n} szt.', { n: it.qty });
  // bez materiału, koloru i frezów — wybiera się je u producenta frontów; rysunek pokazuje tylko wymiary i otwory
  parts.push(`<text x="24" y="40" class="t1">${esc(title)}</text>`);
  // front
  parts.push(`<rect x="${X(0)}" y="${Y(H)}" width="${fw}" height="${fh}" class="front"/>`);
  // otwory
  for (const h of holes) {
    const r = Math.max(3, (h.d / 2) * s);
    parts.push(`<circle cx="${X(h.x)}" cy="${Y(h.y)}" r="${r}" class="${h.kind === 'hinge' ? 'hinge' : 'hole'}"/>`);
    parts.push(`<text x="${X(h.x) + r + 4}" y="${Y(h.y) + 5}" class="lbl">${h.id}</text>`);
  }
  // wymiary całkowite
  const dimY = oy + fh + 40;
  parts.push(`<line x1="${X(0)}" y1="${dimY}" x2="${X(W)}" y2="${dimY}" class="dim"/>`);
  parts.push(`<line x1="${X(0)}" y1="${oy + fh + 6}" x2="${X(0)}" y2="${dimY + 8}" class="ext"/><line x1="${X(W)}" y1="${oy + fh + 6}" x2="${X(W)}" y2="${dimY + 8}" class="ext"/>`);
  parts.push(`<text x="${X(W / 2)}" y="${dimY - 8}" class="dimt" text-anchor="middle">${num(W)}</text>`);
  const dimX = ox - 40;
  parts.push(`<line x1="${dimX}" y1="${Y(0)}" x2="${dimX}" y2="${Y(H)}" class="dim"/>`);
  parts.push(`<line x1="${ox - 6}" y1="${Y(0)}" x2="${dimX - 8}" y2="${Y(0)}" class="ext"/><line x1="${ox - 6}" y1="${Y(H)}" x2="${dimX - 8}" y2="${Y(H)}" class="ext"/>`);
  parts.push(`<text x="${dimX - 10}" y="${Y(H / 2)}" class="dimt" text-anchor="middle" transform="rotate(-90 ${dimX - 10} ${Y(H / 2)})">${num(H)}</text>`);
  // tabela otworów i uwagi
  let ty = tableTop;
  if (holes.length) {
    parts.push(`<text x="24" y="${ty}" class="t2b">${t('Otwory (środek: x; y od lewego dolnego narożnika):')}</text>`);
    for (const h of holes) {
      ty += lineH;
      const hv = { id: h.id, x: num(h.x), y: num(h.y), d: h.d, cup: HINGE_CUP.diameter, depth: HINGE_CUP.depth };
      const line =
        h.kind === 'hinge'
          ? it.hingeSide === 'right'
            ? t('{id}: y = {y} — zawias Ø{cup} gł. {depth} od tyłu, krawędź prawa, odległość od krawędzi standardowa', hv)
            : t('{id}: y = {y} — zawias Ø{cup} gł. {depth} od tyłu, krawędź lewa, odległość od krawędzi standardowa', hv)
          : t('{id}: x = {x}, y = {y} — uchwyt Ø{d} przelotowy', hv);
      parts.push(`<text x="40" y="${ty}" class="t2">${esc(line)}</text>`);
    }
    ty += lineH;
  } else {
    parts.push(`<text x="24" y="${ty}" class="t2">${t('Bez otworów.')}</text>`);
    ty += lineH;
  }
  for (const n of notes) {
    ty += lineH;
    parts.push(`<text x="24" y="${ty}" class="t3">${esc(n)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
<style>
  text { font-family: Arial, Helvetica, sans-serif; fill: #111827; }
  .t1 { font-size: 22px; font-weight: 700; } .t2 { font-size: 16px; } .t2b { font-size: 16px; font-weight: 700; } .t3 { font-size: 14px; fill: #4b5563; }
  .lbl { font-size: 14px; font-weight: 700; fill: #b91c1c; } .dimt { font-size: 16px; }
  .front { fill: #f3f4f6; stroke: #111827; stroke-width: 2; }
  .hole { fill: #111827; } .hinge { fill: none; stroke: #b91c1c; stroke-width: 2; stroke-dasharray: 5 3; }
  .dim { stroke: #111827; stroke-width: 1; } .ext { stroke: #6b7280; stroke-width: 0.8; }
</style>
<rect width="100%" height="100%" fill="#ffffff"/>
${parts.join('\n')}
</svg>`;
}
