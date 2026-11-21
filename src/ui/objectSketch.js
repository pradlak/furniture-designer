import { cabinetPanels, cabinetLegs, legHeight } from '../model/furniture.js';
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
