import { cabinetPanels, cabinetLegs, legHeight, panelCutSize } from '../model/furniture.js';
import { outline2d } from '../model/solid.js';
import { projectSolids, panelEdgeSet, edgeCounts, EDGE_LABELS } from '../model/edges.js';
import { trimBox } from '../model/trims.js';
import { trimMaterial } from '../model/materials.js';
import { resolveHoles, HOLE_FILLS } from '../model/boardFeatures.js';

// Szkice z wymiarami (SVG) w okienku obiektu po prawej — jak szkic półki (ui/boardInspector.js):
//  - korpus: widok z przodu (fronty: szuflady, drzwi; nóżki) i z boku (głębokość, nóżki),
//  - blat na szafkach: widok z góry z otworami (zlew, płyta grzewcza) i wysunięciem,
//  - blenda dolna / górna: widok z przodu,
//  - przeszkoda / okap / występ ściany: widok z przodu na tle ściany, odległości od podłogi i sufitu.
// Klasy CSS — te same co w szkicu półki (.bi-*), w kontenerze .bi-sketch.

const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// pomocnik rysowania: skala s (px / mm), punkty w px
function canvas() {
  const out = [];
  return {
    out,
    line: (x1, y1, x2, y2, cls = 'bi-dim') => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`),
    rect: (x, y, w, h, cls, extra = '') => out.push(`<rect x="${x}" y="${y}" width="${Math.max(0.5, w)}" height="${Math.max(0.5, h)}" class="${cls}" ${extra}/>`),
    text: (x, y, t, cls = 'bi-txt', anchor = 'middle', rot = 0) =>
      out.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${t}</text>`),
    // wymiar poziomy / pionowy z kreskami na końcach
    dimH(x1, x2, y, label, cls = 'bi-txt') {
      this.line(x1, y, x2, y);
      this.line(x1, y - 3, x1, y + 3);
      this.line(x2, y - 3, x2, y + 3);
      this.text((x1 + x2) / 2, y - 3, label, cls);
    },
    dimV(x, y1, y2, label, side = 'right', cls = 'bi-txt') {
      this.line(x, y1, x, y2);
      this.line(x - 3, y1, x + 3, y1);
      this.line(x - 3, y2, x + 3, y2);
      this.text(side === 'right' ? x + 4 : x - 4, (y1 + y2) / 2 + 3, label, cls, side === 'right' ? 'start' : 'end');
    },
  };
}
const svg = (w, h, body, label) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${label}">${body}</svg>`;

// --- korpus ---
export function cabinetSketch(cabinet, project) {
  const panels = cabinetPanels(cabinet, project).filter((p) => p.valid && !p.hidden);
  const L = legHeight(cabinet);
  const W = cabinet.width;
  const H = cabinet.height;
  const D = cabinet.depth;
  const total = L + H;
  const x0 = cabinet.x;
  const y0 = cabinet.y; // podłoga pod korpusem (z nóżkami)
  // widok z przodu (lewa część) i z boku (prawa część) w jednej skali
  const VW = 300;
  const pad = { l: 40, r: 30, t: 22, b: 30, gap: 46 };
  const s = Math.min((VW - pad.l - pad.r - pad.gap) / (W + D), 230 / total);
  const Hpx = total * s;
  const VH = pad.t + Hpx + pad.b;
  const c = canvas();
  const FX = (x) => pad.l + (x - x0) * s; // widok z przodu: x w przestrzeni → px
  const FY = (y) => pad.t + (y0 + total - y) * s; // y w przestrzeni → px (do góry)
  // podłoga
  c.line(pad.l - 12, FY(y0), VW - 6, FY(y0), 'bi-wall');
  // korpus (bryła)
  c.rect(FX(x0), FY(y0 + total), W * s, H * s, 'bi-board');
  // fronty (z przodu): szuflady z kreską uchwytu, drzwi z oznaczeniem zawiasów
  const fronts = panels.filter((p) => p.key.startsWith('front-')).sort((a, b) => a.y - b.y);
  for (const p of fronts) {
    c.rect(FX(p.x), FY(p.y + p.height), p.width * s, p.height * s, 'bi-front');
    if (p.opening?.drawer) c.line(FX(p.x + p.width * 0.4), FY(p.y + p.height * 0.8), FX(p.x + p.width * 0.6), FY(p.y + p.height * 0.8), 'bi-handle');
    else if (p.opening?.hinge) {
      // trójkąt otwierania (wierzchołek po stronie klamki)
      const hingeLeft = p.opening.hinge === 'left';
      const xa = FX(hingeLeft ? p.x : p.x + p.width);
      const xb = FX(hingeLeft ? p.x + p.width : p.x);
      c.out.push(`<path d="M${xa} ${FY(p.y + p.height)} L${xb} ${FY(p.y + p.height / 2)} L${xa} ${FY(p.y)}" class="bi-open"/>`);
    }
  }
  // nóżki
  for (const l of cabinetLegs(cabinet, project).filter((l, i, a) => a.findIndex((m) => Math.abs(m.x - l.x) < 1) === i)) {
    c.rect(FX(l.x - l.diameter / 2), FY(y0 + L), l.diameter * s, L * s, 'bi-leg');
  }
  // wymiary: szerokość (pod spodem), wysokości (z lewej): nóżki, korpus, razem
  c.dimH(FX(x0), FX(x0 + W), FY(y0) + 16, `szer. ${fmt(W)}`);
  const lx = FX(x0) - 10;
  if (L > 0) {
    c.dimV(lx, FY(y0 + L), FY(y0), fmt(L), 'left', 'bi-small');
    c.dimV(lx, FY(y0 + total), FY(y0 + L), fmt(H), 'left');
    c.dimV(lx - 22, FY(y0 + total), FY(y0), fmt(total), 'left', 'bi-small');
  } else c.dimV(lx, FY(y0 + total), FY(y0), fmt(H), 'left');
  // wysokości frontów — z prawej strony widoku z przodu (gdy jest kilka)
  if (fronts.length > 1) {
    const rx = FX(x0 + W) + 6;
    for (const p of fronts) if (p.height * s >= 9) c.text(rx, (FY(p.y + p.height) + FY(p.y)) / 2 + 3, fmt(p.height), 'bi-small', 'start');
  }
  // widok z boku
  const sx0 = FX(x0 + W) + pad.gap;
  const SX = (z) => sx0 + (z - cabinet.z) * s; // z w przestrzeni (od ściany) → px; ściana z lewej
  c.line(sx0 - 4, FY(y0 + total) - 6, sx0 - 4, FY(y0), 'bi-wall');
  c.rect(SX(cabinet.z), FY(y0 + total), D * s, H * s, 'bi-board');
  const frontDepth = fronts.length ? Math.max(...fronts.map((p) => p.z + p.depth)) : cabinet.z + D;
  if (frontDepth > cabinet.z + D + 0.5) c.rect(SX(cabinet.z + D), FY(y0 + total), (frontDepth - cabinet.z - D) * s, H * s, 'bi-front');
  if (L > 0) for (const z of [...new Set(cabinetLegs(cabinet, project).map((l) => Math.round(l.z)))]) c.rect(SX(z) - 1.5, FY(y0 + L), 3, L * s, 'bi-leg');
  c.dimH(SX(cabinet.z), SX(cabinet.z + D), FY(y0) + 16, `gł. ${fmt(D)}`);
  c.text(sx0 - 4, FY(y0 + total) - 9, 'ściana', 'bi-small', 'start');
  c.text(FX(x0), 12, 'z przodu', 'bi-small', 'start');
  c.text(sx0, 12, 'z boku', 'bi-small', 'start');
  return svg(VW, VH, c.out.join(''), 'Szkic korpusu');
}

// --- blat na szafkach (widok z góry) i blendy (widok z przodu) ---
export function trimSketch(trim, project) {
  const box = trimBox(trim, project);
  if (!box) return '';
  const T = trimMaterial(trim, project).thickness;
  const c = canvas();
  const VW = 300;
  if (trim.type === 'countertop') {
    const pad = { l: 26, r: 40, t: 24, b: 34 };
    const s = (VW - pad.l - pad.r) / box.width;
    const VH = pad.t + box.depth * s + pad.b;
    const X = (u) => pad.l + u * s;
    const Y = (v) => pad.t + v * s; // v — od tylnej krawędzi
    c.line(pad.l - 10, pad.t - 4, X(box.width) + 10, pad.t - 4, 'bi-wall');
    c.text(X(box.width) + 12, pad.t - 1, 'ściana', 'bi-small', 'start');
    c.rect(X(0), Y(0), box.width * s, box.depth * s, 'bi-board');
    // korpusy pod blatem (przerywane)
    for (const id of trim.cabinetIds) {
      const cab = project.furniture.find((x) => x.id === id);
      if (!cab) continue;
      const u = cab.x - box.x;
      const v = cab.z - box.z;
      c.rect(X(u), Y(v), cab.width * s, cab.depth * s, 'bi-under');
    }
    for (const h of resolveHoles(trim.holes, box.width, box.depth)) {
      const cy = Y(box.depth - h.y);
      if (h.shape === 'circle') c.out.push(`<circle cx="${X(h.x)}" cy="${cy}" r="${Math.max(1.5, (h.d / 2) * s)}" class="bi-hole"/>`);
      else {
        c.rect(X(h.x - h.w / 2), cy - (h.h / 2) * s, h.w * s, h.h * s, 'bi-hole', `rx="${(h.r ?? 0) * s}"`);
        const label = h.fill ? HOLE_FILLS.find((f) => f.key === h.fill)?.label : h.label;
        if (label) c.text(X(h.x), cy + 3, label, 'bi-small');
      }
    }
    c.dimH(X(0), X(box.width), Y(box.depth) + 16, `dł. ${fmt(box.width)}`);
    c.dimV(X(box.width) + 14, Y(0), Y(box.depth), `${fmt(box.depth)}`);
    c.text(X(0), VH - 6, `grubość ${fmt(T)} mm · wierzch ${fmt(box.y + box.height)} mm od podłogi`, 'bi-small', 'start');
    return svg(VW, VH, c.out.join(''), 'Szkic blatu');
  }
  // blenda — z przodu
  const pad = { l: 26, r: 46, t: 20, b: 34 };
  const s = Math.min((VW - pad.l - pad.r) / box.width, 60 / Math.max(1, box.height));
  const VH = pad.t + box.height * s + pad.b;
  const X = (u) => pad.l + u * s;
  c.rect(X(0), pad.t, box.width * s, box.height * s, 'bi-front');
  c.dimH(X(0), X(box.width), pad.t + box.height * s + 16, `dł. ${fmt(box.width)}`);
  c.dimV(X(box.width) + 12, pad.t, pad.t + box.height * s, fmt(box.height));
  c.text(X(0), 12, `${trim.type === 'plinth' ? 'blenda dolna' : 'blenda górna'} — z przodu · gr. ${fmt(T)} · od podłogi ${fmt(box.y)}`, 'bi-small', 'start');
  return svg(VW, VH, c.out.join(''), 'Szkic blendy');
}

// --- przeszkoda / okap / występ ściany (z przodu, na tle ściany) ---
export function obstacleSketch(o, space) {
  const c = canvas();
  const VW = 300;
  const pad = { l: 46, r: 46, t: 18, b: 30 };
  // fragment ściany: od lewej do prawej krawędzi przeszkody z zapasem, cała wysokość pokoju
  const margin = Math.max(150, o.width * 0.4);
  const a = Math.max(0, o.x - margin);
  const b = Math.min(space.width, o.x + o.width + margin);
  const s = Math.min((VW - pad.l - pad.r) / (b - a), 240 / space.height);
  const VH = pad.t + space.height * s + pad.b;
  const X = (x) => pad.l + (x - a) * s;
  const Y = (y) => pad.t + (space.height - y) * s;
  c.rect(X(a), Y(space.height), (b - a) * s, space.height * s, 'bi-wallbg');
  c.line(X(a) - 6, Y(0), X(b) + 6, Y(0), 'bi-wall');
  c.line(X(a) - 6, Y(space.height), X(b) + 6, Y(space.height), 'bi-wall');
  c.rect(X(o.x), Y(o.y + o.height), o.width * s, o.height * s, 'bi-obstacle');
  c.dimH(X(o.x), X(o.x + o.width), Y(o.y + o.height) - 6, `szer. ${fmt(o.width)}`);
  const rx = X(o.x + o.width) + 12;
  c.dimV(rx, Y(o.y + o.height), Y(o.y), `wys. ${fmt(o.height)}`);
  if (o.y > 0.5) c.dimV(X(o.x) - 12, Y(o.y), Y(0), `od podłogi ${fmt(o.y)}`, 'left', 'bi-small');
  if (space.height - o.y - o.height > 0.5) c.dimV(X(o.x) - 12, Y(space.height), Y(o.y + o.height), `do sufitu ${fmt(space.height - o.y - o.height)}`, 'left', 'bi-small');
  c.text(X(a), VH - 8, `głębokość ${fmt(o.depth)} mm · od lewej ściany ${fmt(o.x)} mm`, 'bi-small', 'start');
  return svg(VW, VH, c.out.join(''), 'Szkic przeszkody');
}

// --- pojedyncza płyta korpusu (bok, wieniec, plecy, półka, front) ---
// Widok na lico: bok — od zewnątrz (szerokość = głębokość korpusu, przód z prawej), wieniec / półka — z góry (przód
// na dole), plecy / front — z przodu. Kontur (także skośny pod skos), oklejone krawędzie (gruba linia), otwory pod
// zawiasy i uchwyt, wymiary; pod spodem wymiar do cięcia, grubość, materiał i obrzeże.
const VIEW = {
  x: { u: [0, 0, 1], v: [0, 1, 0], ua: 'z', va: 'y', flipV: false, sides: { left: 'tył', right: 'przód', top: 'góra', bottom: 'dół' } }, // bok
  y: { u: [1, 0, 0], v: [0, 0, 1], ua: 'x', va: 'z', flipV: true, sides: { left: 'lewo', right: 'prawo', top: 'tył', bottom: 'przód' } }, // wieniec / półka
  z: { u: [1, 0, 0], v: [0, 1, 0], ua: 'x', va: 'y', flipV: false, sides: { left: 'lewo', right: 'prawo', top: 'góra', bottom: 'dół' } }, // plecy / front
};
export function panelSketch(cabinet, panelKey, project) {
  const p = cabinetPanels(cabinet, project).find((x) => x.key === panelKey);
  if (!p) return '';
  const view = VIEW[p.thicknessAxis] ?? VIEW.z;
  const DIMS = { x: 'width', y: 'height', z: 'depth' };
  const u0 = p[view.ua];
  const v0 = p[view.va];
  const U = p[DIMS[view.ua]];
  const V = p[DIMS[view.va]];
  const T = p[DIMS[p.thicknessAxis]];
  // kontur (bryła przycięta skosem) albo prostokąt — w mm względem lewego dolnego rogu
  let poly = p.solid ? outline2d(p.solid, view.u, view.v).map(([a, b]) => [a - u0, b - v0]) : null;
  if (!poly || poly.length < 3) poly = [[0, 0], [U, 0], [U, V], [0, V]];
  const c = canvas();
  const VW = 300;
  const pad = { l: 52, r: 78, t: 44, b: 94 };
  const s = Math.min((VW - pad.l - pad.r) / Math.max(1, U), 200 / Math.max(1, V));
  const X = (a) => pad.l + a * s;
  const Y = (b) => pad.t + (view.flipV ? b : V - b) * s;
  const VH = pad.t + V * s + pad.b;
  c.out.push(`<polygon points="${poly.map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')}" class="${isFrontKeyLocal(p.key) ? 'bi-front' : 'bi-board'}"/>`);
  // oklejone krawędzie — grube linie po stronach prostokąta obrysu
  let solids = null;
  try {
    solids = projectSolids(project);
  } catch {
    solids = null;
  }
  const edges = solids ? panelEdgeSet(p, cabinet, project, solids) : [];
  const side = (k) => {
    const ax = k[0];
    const max = k.endsWith('Max');
    if (ax === view.ua) return max ? [[U, 0], [U, V]] : [[0, 0], [0, V]];
    if (ax === view.va) return max ? [[0, V], [U, V]] : [[0, 0], [U, 0]];
    return null;
  };
  for (const k of edges) {
    const seg = side(k);
    if (seg) c.line(X(seg[0][0]), Y(seg[0][1]), X(seg[1][0]), Y(seg[1][1]), 'bi-band');
  }
  // otwory: zawiasy (fronty) i uchwyt
  const toLocal = (h) => [(view.ua === 'x' ? h.x : h.z ?? 0) - u0, (view.va === 'y' ? h.y : h.z ?? 0) - v0];
  for (const h of p.hinges ?? []) {
    const [a, b] = toLocal(h);
    c.out.push(`<circle cx="${X(a)}" cy="${Y(b)}" r="${Math.max(2, 17.5 * s)}" class="bi-hole-edge"/>`);
  }
  for (const h of p.handle?.holes ?? []) {
    const [a, b] = toLocal(h);
    c.out.push(`<circle cx="${X(a)}" cy="${Y(b)}" r="${Math.max(1.5, 2.5 * s)}" class="bi-hole"/>`);
  }
  // wymiary
  c.dimH(X(0), X(U), Y(view.flipV ? V : 0) + 14, fmt(U));
  c.dimV(X(U) + 12, Y(view.flipV ? 0 : V), Y(view.flipV ? V : 0), fmt(V));
  const cut = panelCutSize({ ...p, edges: edgeCounts(p, p.thicknessAxis, edges) });
  // opisy stron (szare, kursywą): przód / tył, góra / dół, lewo / prawo
  const yTop = Y(view.flipV ? 0 : V);
  const yBot = Y(view.flipV ? V : 0);
  c.text((X(0) + X(U)) / 2, yTop - 8, view.sides.top, 'bi-side');
  c.text((X(0) + X(U)) / 2, yBot + 30, view.sides.bottom, 'bi-side');
  c.text(X(0) - 10, (yTop + yBot) / 2, view.sides.left, 'bi-side', 'middle', -90);
  c.text(X(U) + 44, (yTop + yBot) / 2, view.sides.right, 'bi-side', 'middle', 90);
  // obrzeże do przełączenia kliknięciem: napis przy każdej krawędzi i niewidoczny pas na krawędzi
  const keyOf = { top: `${view.va}${view.flipV ? 'Min' : 'Max'}`, bottom: `${view.va}${view.flipV ? 'Max' : 'Min'}`, left: `${view.ua}Min`, right: `${view.ua}Max` };
  const on = (k) => edges.includes(k);
  const tog = (k) => (on(k) ? '✓ obrzeże' : '＋ obrzeże');
  const cls = (k) => `bi-edge-toggle${on(k) ? ' on' : ''}`;
  c.out.push(`<text x="${(X(0) + X(U)) / 2}" y="${yTop - 22}" class="${cls(keyOf.top)}" text-anchor="middle" data-edge-toggle="${keyOf.top}">${tog(keyOf.top)}</text>`);
  c.out.push(`<text x="${(X(0) + X(U)) / 2}" y="${yBot + 44}" class="${cls(keyOf.bottom)}" text-anchor="middle" data-edge-toggle="${keyOf.bottom}">${tog(keyOf.bottom)}</text>`);
  c.out.push(`<text x="${X(0) - 24}" y="${(yTop + yBot) / 2}" class="${cls(keyOf.left)}" text-anchor="middle" transform="rotate(-90 ${X(0) - 24} ${(yTop + yBot) / 2})" data-edge-toggle="${keyOf.left}">${tog(keyOf.left)}</text>`);
  c.out.push(`<text x="${X(U) + 58}" y="${(yTop + yBot) / 2}" class="${cls(keyOf.right)}" text-anchor="middle" transform="rotate(90 ${X(U) + 58} ${(yTop + yBot) / 2})" data-edge-toggle="${keyOf.right}">${tog(keyOf.right)}</text>`);
  for (const [side, k] of Object.entries(keyOf)) {
    const seg = { top: [[0, view.flipV ? 0 : V], [U, view.flipV ? 0 : V]], bottom: [[0, view.flipV ? V : 0], [U, view.flipV ? V : 0]], left: [[0, 0], [0, V]], right: [[U, 0], [U, V]] }[side];
    c.out.push(`<line x1="${X(seg[0][0])}" y1="${Y(seg[0][1])}" x2="${X(seg[1][0])}" y2="${Y(seg[1][1])}" class="bi-edge-hit" data-edge-toggle="${k}"><title>Kliknij — obrzeże: ${on(k) ? 'usuń' : 'dodaj'}</title></line>`);
  }
  const by = Y(view.flipV ? V : 0) + 62;
  c.text(pad.l, by, `${escapeText(p.name)} · gr. ${fmt(T)} mm · ${escapeText(p.material?.name ?? '')}`, 'bi-small', 'start');
  c.text(pad.l, by + 12, `do cięcia: ${fmt(cut.cutLength ?? cut.length)} × ${fmt(cut.cutWidth ?? cut.width)} mm${edges.length ? ` · obrzeże: ${edges.map((k) => EDGE_LABELS[k]).join(', ')}` : ' · bez obrzeża'}`, 'bi-small', 'start');
  if (p.hinges?.length) c.text(pad.l, by + 24, `${p.hinges.length} × otwór pod zawias Ø35 (od wewnątrz)`, 'bi-small', 'start');
  return svg(VW, VH + (p.hinges?.length ? 12 : 0), c.out.join(''), `Szkic płyty: ${escapeText(p.name)}`);
}
const isFrontKeyLocal = (k) => k.startsWith('front-') || k.startsWith('idrawer-');
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Szkic prostokątnego elementu (np. dno / plecy szuflady): W × H (mm), opisy stron { top, bottom, left, right },
// pod spodem linie notatek (materiał, do cięcia, wzór).
// edges — oklejone strony ('top' | 'bottom' | 'left' | 'right'); toggles — napisy „＋ obrzeże” do klikania.
export function pieceSketch({ W, H, sides, notes = [], edges = [], toggles = false }) {
  const c = canvas();
  const VW = 300;
  const pad = { l: toggles ? 54 : 40, r: toggles ? 78 : 64, t: toggles ? 44 : 30, b: (toggles ? 64 : 50) + notes.length * 12 };
  const s = Math.min((VW - pad.l - pad.r) / Math.max(1, W), 170 / Math.max(1, H));
  const X = (a) => pad.l + a * s;
  const Y = (b) => pad.t + (H - b) * s;
  const VH = pad.t + H * s + pad.b;
  c.rect(X(0), Y(H), W * s, H * s, 'bi-board');
  c.dimH(X(0), X(W), Y(0) + 14, fmt(W));
  c.dimV(X(W) + 12, Y(H), Y(0), fmt(H));
  c.text((X(0) + X(W)) / 2, Y(H) - 8, sides.top, 'bi-side');
  c.text((X(0) + X(W)) / 2, Y(0) + 30, sides.bottom, 'bi-side');
  c.text(X(0) - 10, (Y(H) + Y(0)) / 2, sides.left, 'bi-side', 'middle', -90);
  c.text(X(W) + 44, (Y(H) + Y(0)) / 2, sides.right, 'bi-side', 'middle', 90);
  const seg = { top: [X(0), Y(H), X(W), Y(H)], bottom: [X(0), Y(0), X(W), Y(0)], left: [X(0), Y(0), X(0), Y(H)], right: [X(W), Y(0), X(W), Y(H)] };
  for (const k of edges) c.line(...seg[k], 'bi-band');
  if (toggles) {
    const on = (k) => edges.includes(k);
    const cls = (k) => `bi-edge-toggle${on(k) ? ' on' : ''}`;
    const tog = (k) => (on(k) ? '✓ obrzeże' : '＋ obrzeże');
    const my = (Y(H) + Y(0)) / 2;
    c.out.push(`<text x="${(X(0) + X(W)) / 2}" y="${Y(H) - 22}" class="${cls('top')}" text-anchor="middle" data-piece-edge="top">${tog('top')}</text>`);
    c.out.push(`<text x="${(X(0) + X(W)) / 2}" y="${Y(0) + 44}" class="${cls('bottom')}" text-anchor="middle" data-piece-edge="bottom">${tog('bottom')}</text>`);
    c.out.push(`<text x="${X(0) - 24}" y="${my}" class="${cls('left')}" text-anchor="middle" transform="rotate(-90 ${X(0) - 24} ${my})" data-piece-edge="left">${tog('left')}</text>`);
    c.out.push(`<text x="${X(W) + 58}" y="${my}" class="${cls('right')}" text-anchor="middle" transform="rotate(90 ${X(W) + 58} ${my})" data-piece-edge="right">${tog('right')}</text>`);
    for (const [k, [x1, y1, x2, y2]] of Object.entries(seg)) c.out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="bi-edge-hit" data-piece-edge="${k}"><title>Kliknij — obrzeże: ${on(k) ? 'usuń' : 'dodaj'}</title></line>`);
  }
  const ny = Y(0) + (toggles ? 60 : 46);
  notes.forEach((n, i) => c.text(pad.l, ny + i * 12, n, 'bi-small', 'start'));
  return svg(VW, VH, c.out.join(''), 'Szkic elementu');
}
