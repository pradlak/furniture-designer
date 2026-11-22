import { cabinetPanels, frontParts } from './furniture.js';
import { drawerSystemBox } from './drawerSystems.js';

// Szuflady z wybranym systemem (part.system) w korpusie: wymiary dna i pleców do docięcia, prowadnice, kolor.
// LW — szerokość wewnętrzna korpusu (między bokami; z dystansami pod prowadnice — węższa), LT — dostępna głębokość
// (szuflada wewnętrzna — za czołem cofniętym w korpus).
const INNER_SETBACK = 40; // czoło szuflady wewnętrznej cofnięte w korpus (z grubością czoła), mm — przybliżenie
const SPACER = 25;

export function cabinetDrawerBoxes(cabinet, project) {
  const st = frontParts(cabinet.fronts);
  const panels = cabinetPanels(cabinet, project);
  const byKey = (k) => panels.find((p) => p.key === k);
  const left = byKey('left');
  const right = byKey('right');
  const tL = left ? left.width : 18;
  const tR = right ? right.width : 18;
  const out = [];
  st.parts.forEach((part, index) => {
    if (!part.system || (part.type !== 'drawer' && part.type !== 'innerDrawer')) return;
    const front = panels.find((p) => p.valid && p.part === index && p.opening?.drawer);
    const inner = front?.key.startsWith('idrawer-') ?? part.type === 'innerDrawer';
    const LW = cabinet.width - tL - tR - (inner && cabinet.fronts?.innerSpacers ? 2 * SPACER : 0);
    const LT = cabinet.depth - (inner ? INNER_SETBACK : 0);
    const box = drawerSystemBox(part.system, { LW, LT, height: front?.height });
    if (box) out.push({ index, part, front, inner, LW, LT, ...box, name: front?.name ?? `Szuflada ${st.parts.length - index}` });
  });
  return out;
}

export const drawerBoxFor = (cabinet, index, project) => cabinetDrawerBoxes(cabinet, project).find((b) => b.index === index) ?? null;
