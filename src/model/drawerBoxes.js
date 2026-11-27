import { cabinetPanels, frontParts } from './furniture.js';
import { drawerSystemBox } from './drawerSystems.js';
import { t } from '../i18n.js';

// Szuflady z wybranym systemem (part.system) w korpusie: wymiary dna i pleców do docięcia, prowadnice, kolor.
// LW — szerokość wewnętrzna korpusu (między bokami; z dystansami pod prowadnice — węższa), LT — dostępna głębokość
// (szuflada wewnętrzna — za czołem cofniętym w korpus).
const INNER_SETBACK = 40; // czoło szuflady wewnętrznej cofnięte w korpus (z grubością czoła), mm — przybliżenie
const SPACER = 25;
const INNER_BOTTOM_GAP = 3; // czoło szuflady wewnętrznej nad wieńcem (jak INTERNAL_DRAWER.bottomGap w furniture.js)

export function cabinetDrawerBoxes(cabinet, project) {
  const st = frontParts(cabinet.fronts);
  const panels = cabinetPanels(cabinet, project);
  const byKey = (k) => panels.find((p) => p.key === k);
  const left = byKey('left');
  const right = byKey('right');
  const tL = left ? left.width : 18;
  const tR = right ? right.width : 18;
  const bottom = byKey('bottom');
  const tB = bottom ? bottom.height : 18;
  const base = bottom ? bottom.y : cabinet.y; // spód korpusu (bez nóżek)
  const out = [];
  st.parts.forEach((part, index) => {
    if (!part.system || (part.type !== 'drawer' && part.type !== 'innerDrawer')) return;
    const front = panels.find((p) => p.valid && p.part === index && p.opening?.drawer);
    const inner = front?.key.startsWith('idrawer-') ?? part.type === 'innerDrawer';
    const LW = cabinet.width - tL - tR - (inner && cabinet.fronts?.innerSpacers ? 2 * SPACER : 0);
    const LT = cabinet.depth - (inner ? INNER_SETBACK : 0);
    const box = drawerSystemBox(part.system, { LW, LT, height: front?.height });
    if (!box) return;
    // Wysokość prowadnic (oś otworów, w układzie przestrzeni) — prawa i lewa na tej samej wysokości.
    let rail = null;
    if (front && box.system.rail) {
      const ref = inner ? front.y - INNER_BOTTOM_GAP : front.y + tB; // spód szuflady
      const y = ref + box.system.rail.axis;
      const sp = inner && cabinet.fronts?.innerSpacers ? SPACER : 0;
      rail = {
        y,
        fromBottom: Math.round((y - base) * 10) / 10, // od spodu korpusu
        fromTop: Math.round((y - (base + tB)) * 10) / 10, // od wierzchu wieńca dolnego
        frontHole: box.system.rail.frontHole,
        length: box.NL,
        xLeft: (left ? left.x + left.width : cabinet.x + tL) + sp, // lico, na którym jest prowadnica (bok albo dystans)
        xRight: (right ? right.x : cabinet.x + cabinet.width - tR) - sp,
        zFront: left ? left.z + left.depth : cabinet.z + cabinet.depth, // przednia krawędź boków
      };
    }
    out.push({ index, part, front, inner, LW, LT, ...box, rail, name: front?.name ?? t('Szuflada {n}', { n: st.parts.length - index }) });
  });
  return out;
}

export const drawerBoxFor = (cabinet, index, project) => cabinetDrawerBoxes(cabinet, project).find((b) => b.index === index) ?? null;

// Linie montażu prowadnic dla WSZYSTKICH szuflad korpusu (widok 3D, szkic boku): szuflady z systemem — wg katalogu
// (rail z cabinetDrawerBoxes); bez systemu — orientacyjnie (generic: true), jak w systemie: oś 34 mm nad spodem
// szuflady, pierwszy otwór 37 mm, długość — najdłuższa standardowa prowadnica mieszcząca się w głębokości.
const GENERIC_RAIL = { axis: 34, frontHole: 37, lengths: [250, 300, 350, 400, 450, 500, 550, 600], depthMargin: 3 };
export function cabinetDrawerRails(cabinet, project) {
  const st = frontParts(cabinet.fronts);
  const panels = cabinetPanels(cabinet, project);
  const byKey = (k) => panels.find((p) => p.key === k);
  const left = byKey('left');
  const right = byKey('right');
  const bottom = byKey('bottom');
  const tL = left ? left.width : 18;
  const tR = right ? right.width : 18;
  const tB = bottom ? bottom.height : 18;
  const base = bottom ? bottom.y : cabinet.y;
  const boxes = new Map(cabinetDrawerBoxes(cabinet, project).map((b) => [b.index, b]));
  const out = [];
  st.parts.forEach((part, index) => {
    if (part.type !== 'drawer' && part.type !== 'innerDrawer') return;
    const box = boxes.get(index);
    if (box?.rail) return out.push({ index, name: box.name, inner: box.inner, rail: box.rail, generic: false });
    const front = panels.find((p) => p.valid && p.part === index && p.opening?.drawer);
    if (!front) return;
    const inner = front.key.startsWith('idrawer-');
    const LT = cabinet.depth - (inner ? INNER_SETBACK : 0);
    const fit = GENERIC_RAIL.lengths.filter((l) => l + GENERIC_RAIL.depthMargin <= LT);
    const y = (inner ? front.y - INNER_BOTTOM_GAP : front.y + tB) + GENERIC_RAIL.axis;
    const sp = inner && cabinet.fronts?.innerSpacers ? SPACER : 0;
    out.push({
      index,
      name: front.name,
      inner,
      generic: true,
      rail: {
        y,
        fromBottom: Math.round((y - base) * 10) / 10,
        fromTop: Math.round((y - (base + tB)) * 10) / 10,
        frontHole: GENERIC_RAIL.frontHole,
        length: fit.length ? fit[fit.length - 1] : GENERIC_RAIL.lengths[0],
        xLeft: (left ? left.x + left.width : cabinet.x + tL) + sp,
        xRight: (right ? right.x : cabinet.x + cabinet.width - tR) - sp,
        zFront: left ? left.z + left.depth : cabinet.z + cabinet.depth,
      },
    });
  });
  return out;
}
