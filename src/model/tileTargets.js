import { cabinetBounds } from './furniture.js';
import { trimBox } from './trims.js';
import { boardBox } from './boards.js';
import { t } from '../i18n.js';

// Szybkie ustawienie pasa płytek (menu ściany w 3D i panel „Przestrzeń”): do sufitu, od podłogi, na całą wysokość,
// od wierzchu blatu, do spodu szafek wiszących. → [{ key, icon, label, patch: { from?, to? } }]
// Blaty i szafki — z całego projektu (zwykle stoją przy ścianie z płytkami).
const WALL_CABINET_MIN = 1000; // szafka wisząca: spód wyżej niż 1 m od podłogi
export function tileTargets(project) {
  const H = project.space.height;
  const out = [
    { key: 'ceiling', icon: '⤒', label: t('Do sufitu'), patch: { to: H } },
    { key: 'floor', icon: '⤓', label: t('Od podłogi'), patch: { from: 0 } },
    { key: 'full', icon: '⇕', label: t('Na całą wysokość (podłoga – sufit)'), patch: { from: 0, to: H } },
  ];
  const tops = [
    ...(project.trims ?? []).filter((t) => t.type === 'countertop' && !t.hidden).map((t) => trimBox(t, project)).filter(Boolean),
    ...(project.boards ?? []).filter((b) => b.kind === 'worktop' && !b.hidden).map((b) => boardBox(b, project)),
  ].map((b) => Math.round(b.y + b.height));
  if (tops.length) out.push({ key: 'worktop', icon: '▁', label: t('Od wierzchu blatu ({h} mm)', { h: Math.max(...tops) }), patch: { from: Math.max(...tops) } });
  const bottoms = project.furniture.map((c) => cabinetBounds(c, project)).filter((b) => b.y > WALL_CABINET_MIN).map((b) => Math.round(b.y));
  if (bottoms.length) out.push({ key: 'upper', icon: '▔', label: t('Do spodu szafek wiszących ({h} mm)', { h: Math.min(...bottoms) }), patch: { to: Math.min(...bottoms) } });
  return out;
}
