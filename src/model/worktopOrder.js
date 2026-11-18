// Blaty i płyty z otworami (np. do zamówienia docięcia blatu z wycięciami pod zlew i płytę grzewczą):
// lista w Excelu i rysunek każdej płyty — widok z góry z wymiarami, otworami / wycięciami i frezami krawędzi.
// Obejmuje blaty na szafkach (project.trims, type 'countertop') i samodzielne blaty i półki (project.boards).
//
// worktopItems(project) → pozycje (T1, T2… — blaty na szafkach, P1, P2… — samodzielne płyty),
// worktopXlsx(project) → plik Excel, worktopDrawingSvg(item) → rysunek (SVG, wymiary w mm).

import { trimSegments } from './trims.js';
import { trimMaterial } from './materials.js';
import { boardBox, boardMaterial, BOARD_KINDS } from './boards.js';
import { EDGE_KEYS, EDGE_NAMES, profileInfo, resolveHoles } from './boardFeatures.js';
import { buildXlsx } from './xlsx.js';

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => String(r1(v)).replace('.', ',');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function worktopItems(project) {
  const items = [];
  const cabName = new Map(project.furniture.map((c) => [c.id, c.name]));
  (project.trims ?? [])
    .filter((t) => t.type === 'countertop')
    .forEach((t) => {
      const box = trimSegments(t, project)[0];
      if (!box) return;
      const m = trimMaterial(t, project);
      items.push({
        no: `T${items.filter((i) => i.no.startsWith('T')).length + 1}`,
        kind: 'blat',
        name: t.name || 'Blat',
        width: r1(box.width),
        depth: r1(box.depth),
        thickness: m.thickness,
        material: m.name, // z kolorem / dekorem (withColor)
        edges: t.edges,
        holes: resolveHoles(t.holes, box.width, box.depth),
        owners: t.cabinetIds.map((id) => cabName.get(id)).filter(Boolean),
      });
    });
  (project.boards ?? []).forEach((b, i) => {
    const box = boardBox(b, project);
    const m = boardMaterial(b, project);
    items.push({
      no: `P${i + 1}`,
      kind: (BOARD_KINDS.find((k) => k.key === b.kind)?.label ?? 'płyta').toLowerCase(),
      name: b.name,
      width: r1(box.width),
      depth: r1(box.depth),
      thickness: m.thickness,
      material: m.name,
      edges: b.edges,
      holes: resolveHoles(b.holes, box.width, box.depth),
      owners: [],
    });
  });
  return items;
}

// Frez krawędzi, np. „przód — zaokrąglenie z góry R5” (pusty przy krawędzi prostej).
function edgeText(key, e) {
  if (!e || e.profile === 'none') return '';
  const info = profileInfo(e.profile);
  const size = e.profile === 'halfRound' ? '' : e.profile === 'chamfer' ? ` ${num(e.size)} mm` : ` R${num(e.size)}`;
  return `${EDGE_NAMES[key]} — ${info.name}${size}`;
}
const edgesText = (edges) => EDGE_KEYS.map((k) => edgeText(k, edges?.[k])).filter(Boolean).join('; ');

// Otwór: opis i odległości krawędzi otworu od lewej i przedniej krawędzi płyty.
function holeInfo(h, i) {
  const [hw, hd] = h.shape === 'circle' ? [h.d / 2, h.d / 2] : [h.w / 2, h.h / 2];
  const what = h.shape === 'circle' ? `Ø${num(h.d)}` : `wycięcie ${num(h.w)} × ${num(h.h)}${h.r ? ` R${num(h.r)}` : ''}`;
  return { id: `O${i + 1}`, what, label: h.label, left: h.x - hw, front: h.y - hd };
}
const holesText = (holes) =>
  holes
    .map((h, i) => {
      const o = holeInfo(h, i);
      return `${o.id}${o.label ? ` (${o.label})` : ''}: ${o.what}, środek x ${num(h.x)} / y ${num(h.y)}`;
    })
    .join('; ');

export const WORKTOP_NOTES = [
  'Wymiary w mm. Widok z góry: długość — wzdłuż przedniej krawędzi (od lewej), głębokość — od przodu do tyłu.',
  'Otwory: środek (x; y) — x od lewej krawędzi, y od przedniej krawędzi płyty, patrząc z góry.',
  'Dla wycięć podana jest też odległość krawędzi wycięcia od lewej i od przedniej krawędzi płyty.',
  'Wycięcia pod zlew i płytę grzewczą — sprawdź z instrukcją montażu konkretnego urządzenia.',
  'Do każdej pozycji jest rysunek — plik PNG z numerem i wymiarami w nazwie, np. blat_T1_2400x600.png.',
];

export function worktopXlsx(project) {
  const items = worktopItems(project);
  const header = ['Nr rysunku', 'Rodzaj', 'Nazwa', 'Długość [mm]', 'Głębokość [mm]', 'Grubość [mm]', 'Materiał / dekor', 'Frezy krawędzi', 'Otwory i wycięcia', 'Na korpusach'];
  const rows = items.map((it) => [
    it.no, it.kind, it.name, it.width, it.depth, it.thickness, it.material, edgesText(it.edges), holesText(it.holes), it.owners.join(', '),
  ]);
  return buildXlsx([
    { name: 'Blaty i płyty', header, rows, widths: [9, 12, 22, 12, 13, 11, 28, 46, 80, 26] },
    { name: 'Objaśnienia', header: ['Objaśnienia'], rows: WORKTOP_NOTES.map((n) => [n]), widths: [140] },
  ]);
}

// --- Rysunek płyty (SVG): widok z góry, przód na dole ---
export function worktopDrawingSvg(it) {
  const W = it.width;
  const D = it.depth;
  const s = Math.min(1000 / W, 520 / D, 1.2); // px na mm
  const pw = W * s;
  const pd = D * s;
  const ox = 110; // lewy margines (wymiar głębokości)
  const oy = 110; // górny margines (nagłówek, „TYŁ”)
  const X = (x) => ox + x * s;
  const Y = (y) => oy + pd - y * s; // y od przedniej krawędzi — przód na dole rysunku
  const holes = it.holes.map((h, i) => ({ ...h, ...holeInfo(h, i) }));
  const edges = EDGE_KEYS.map((k) => ({ k, text: edgeText(k, it.edges?.[k]) })).filter((e) => e.text);
  const lineH = 22;
  const tableTop = oy + pd + 100;
  const totalW = Math.max(ox + pw + 120, 820);
  const totalH = tableTop + (holes.length + edges.length + 3) * lineH + WORKTOP_NOTES.length * lineH + 40;

  const parts = [];
  parts.push(`<text x="24" y="40" class="t1">${esc(`${it.no} — ${it.kind} ${num(W)} × ${num(D)} × ${num(it.thickness)} mm`)}</text>`);
  parts.push(`<text x="24" y="66" class="t3">${esc([it.name, it.material, it.owners.length ? `na: ${it.owners.join(', ')}` : ''].filter(Boolean).join(' · '))}</text>`);
  parts.push(`<text x="${X(W / 2)}" y="${oy - 10}" class="side" text-anchor="middle">TYŁ (ściana)</text>`);
  parts.push(`<text x="${X(W / 2)}" y="${oy + pd + 22}" class="side" text-anchor="middle">PRZÓD</text>`);
  // płyta
  parts.push(`<rect x="${X(0)}" y="${Y(D)}" width="${pw}" height="${pd}" class="plate"/>`);
  // frezy krawędzi — pogrubiona niebieska krawędź
  const edgeLine = { front: [0, 0, W, 0], back: [0, D, W, D], left: [0, 0, 0, D], right: [W, 0, W, D] };
  for (const e of edges) {
    const [x1, y1, x2, y2] = edgeLine[e.k];
    parts.push(`<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" class="edge"/>`);
  }
  // otwory i wycięcia
  for (const h of holes) {
    if (h.shape === 'circle') {
      // podpis obok otworu (nad małym otworem przy krawędzi nachodziłby na krawędź płyty)
      const r = Math.max(3, (h.d / 2) * s);
      parts.push(`<circle cx="${X(h.x)}" cy="${Y(h.y)}" r="${r}" class="hole"/>`);
      parts.push(`<text x="${X(h.x) + r + 4}" y="${Y(h.y) + 5}" class="lbl">${h.id}</text>`);
      continue;
    } else {
      const r = Math.min(h.r ?? 0, h.w / 2, h.h / 2) * s;
      parts.push(`<rect x="${X(h.x - h.w / 2)}" y="${Y(h.y + h.h / 2)}" width="${h.w * s}" height="${h.h * s}" rx="${r}" class="hole"/>`);
      // krzyżyk w środku wycięcia
      parts.push(`<line x1="${X(h.x) - 6}" y1="${Y(h.y)}" x2="${X(h.x) + 6}" y2="${Y(h.y)}" class="cross"/><line x1="${X(h.x)}" y1="${Y(h.y) - 6}" x2="${X(h.x)}" y2="${Y(h.y) + 6}" class="cross"/>`);
    }
    parts.push(`<text x="${X(h.x)}" y="${Y(h.y) - 10}" class="lbl" text-anchor="middle">${h.id}</text>`);
  }
  // wymiary całkowite
  const dimY = oy + pd + 50;
  parts.push(`<line x1="${X(0)}" y1="${dimY}" x2="${X(W)}" y2="${dimY}" class="dim"/>`);
  parts.push(`<line x1="${X(0)}" y1="${oy + pd + 30}" x2="${X(0)}" y2="${dimY + 8}" class="ext"/><line x1="${X(W)}" y1="${oy + pd + 30}" x2="${X(W)}" y2="${dimY + 8}" class="ext"/>`);
  parts.push(`<text x="${X(W / 2)}" y="${dimY - 8}" class="dimt" text-anchor="middle">${num(W)}</text>`);
  const dimX = ox - 40;
  parts.push(`<line x1="${dimX}" y1="${Y(0)}" x2="${dimX}" y2="${Y(D)}" class="dim"/>`);
  parts.push(`<line x1="${ox - 6}" y1="${Y(0)}" x2="${dimX - 8}" y2="${Y(0)}" class="ext"/><line x1="${ox - 6}" y1="${Y(D)}" x2="${dimX - 8}" y2="${Y(D)}" class="ext"/>`);
  parts.push(`<text x="${dimX - 10}" y="${Y(D / 2)}" class="dimt" text-anchor="middle" transform="rotate(-90 ${dimX - 10} ${Y(D / 2)})">${num(D)}</text>`);

  // tabela: otwory, frezy, uwagi
  let ty = tableTop;
  if (holes.length) {
    parts.push(`<text x="24" y="${ty}" class="t2b">Otwory i wycięcia (środek: x od lewej, y od przedniej krawędzi):</text>`);
    for (const h of holes) {
      ty += lineH;
      const edgesOf = h.shape === 'rect' ? ` — krawędź wycięcia ${num(h.left)} od lewej, ${num(h.front)} od przodu` : '';
      parts.push(`<text x="40" y="${ty}" class="t2">${esc(`${h.id}${h.label ? ` (${h.label})` : ''}: ${h.what}, x = ${num(h.x)}, y = ${num(h.y)}${edgesOf}`)}</text>`);
    }
  } else parts.push(`<text x="24" y="${ty}" class="t2">Bez otworów.</text>`);
  ty += lineH * 1.5;
  if (edges.length) {
    parts.push(`<text x="24" y="${ty}" class="t2b">Frezy krawędzi (na rysunku — niebieska krawędź):</text>`);
    for (const e of edges) {
      ty += lineH;
      parts.push(`<text x="40" y="${ty}" class="t2">${esc(e.text)}</text>`);
    }
    ty += lineH * 0.5;
  }
  for (const n of WORKTOP_NOTES.slice(0, 4)) {
    ty += lineH;
    parts.push(`<text x="24" y="${ty}" class="t3">${esc(n)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
<style>
  text { font-family: Arial, Helvetica, sans-serif; fill: #111827; }
  .t1 { font-size: 22px; font-weight: 700; } .t2 { font-size: 16px; } .t2b { font-size: 16px; font-weight: 700; } .t3 { font-size: 14px; fill: #4b5563; }
  .side { font-size: 13px; fill: #6b7280; letter-spacing: 1px; }
  .lbl { font-size: 14px; font-weight: 700; fill: #b91c1c; } .dimt { font-size: 16px; }
  .plate { fill: #f3efe6; stroke: #111827; stroke-width: 2; }
  .edge { stroke: #2563eb; stroke-width: 5; stroke-linecap: round; }
  .hole { fill: #ffffff; stroke: #111827; stroke-width: 1.5; } .cross { stroke: #6b7280; stroke-width: 1; }
  .dim { stroke: #111827; stroke-width: 1; } .ext { stroke: #6b7280; stroke-width: 0.8; }
</style>
<rect width="100%" height="100%" fill="#ffffff"/>
${parts.join('\n')}
</svg>`;
}
