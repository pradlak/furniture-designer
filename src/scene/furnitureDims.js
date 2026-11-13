import * as THREE from 'three';
import { toScene } from './units.js';
import { createDimension } from './dimensions.js';
import { legHeight } from '../model/furniture.js';

// Wymiary zaznaczonych korpusów w widoku 3D (jeden korpus albo grupa zaznaczona z Ctrl):
//  - przy lewej krawędzi frontów, wysunięte przed korpusy: nóżki, korpus i (dalej) razem;
//    przy grupie nóżki / korpus tylko wtedy, gdy wszystkie korpusy mają takie same,
//  - nad górną krawędzią frontów: szerokość każdego korpusu, a przy grupie (dalej) — łączna,
//  - nad prawą górną krawędzią: głębokość (przy grupie — od najdalszych pleców do najdalszego frontu).
// Wymiary dotyczą samych korpusów (bez frontów, blend i paneli bocznych).
const NEAR = 120; // mm — odsunięcie pierwszej linii wymiarowej
const FAR = 260; // mm — odsunięcie drugiej linii (razem / łączna szerokość)

export function buildCabinetDimensions(cabinets, space) {
  const group = new THREE.Group();
  const list = [...cabinets].sort((a, b) => a.x - b.x);
  const same = (f) => new Set(list.map((c) => Math.round(f(c) * 10))).size === 1;

  const x0 = Math.min(...list.map((c) => c.x));
  const x1 = Math.max(...list.map((c) => c.x + c.width));
  const y0 = Math.min(...list.map((c) => c.y));
  const top = Math.max(...list.map((c) => c.y + legHeight(c) + c.height));
  const back = Math.min(...list.map((c) => c.z));
  const front = Math.max(...list.map((c) => c.z + c.depth));

  const p = (px, py, pz) => new THREE.Vector3(...toScene(px, py, pz, space));
  const off = (dx, dy, dz) => p(dx, dy, dz).sub(p(0, 0, 0)); // przesunięcie w mm → wektor sceny
  const add = (a, b, o, text) => group.add(createDimension(a, b, o, text, 'accent'));

  // Wysokości — pionowo przy lewej krawędzi frontów, przed korpusami.
  const uniform = same((c) => c.y) && same(legHeight) && same((c) => c.height);
  const L = legHeight(list[0]);
  if (uniform) {
    const H = list[0].height;
    if (L > 0) {
      add(p(x0, y0, front), p(x0, y0 + L, front), off(0, 0, NEAR), `nóżki ${fmt(L)}`);
      add(p(x0, y0 + L, front), p(x0, top, front), off(0, 0, NEAR), `korpus ${fmt(H)}`);
      add(p(x0, y0, front), p(x0, top, front), off(0, 0, FAR), `razem ${fmt(L + H)}`);
    } else {
      add(p(x0, y0, front), p(x0, top, front), off(0, 0, NEAR), `korpus ${fmt(H)}`);
    }
  } else {
    // różne nóżki / wysokości — tylko wysokość całej zabudowy (od najniższego dołu do najwyższej góry)
    add(p(x0, y0, front), p(x0, top, front), off(0, 0, NEAR), `razem ${fmt(top - y0)}`);
  }

  // Szerokości — nad górną krawędzią frontów: każdego korpusu, a przy grupie dalej łączna.
  for (const c of list) {
    add(p(c.x, top, front), p(c.x + c.width, top, front), off(0, NEAR, 0), `${list.length > 1 ? '' : 'szer. '}${fmt(c.width)}`);
  }
  if (list.length > 1) add(p(x0, top, front), p(x1, top, front), off(0, FAR, 0), `szer. razem ${fmt(x1 - x0)}`);

  // Głębokość — nad prawą górną krawędzią.
  add(p(x1, top, back), p(x1, top, front), off(0, NEAR, 0), `gł. ${fmt(front - back)}`);
  return group;
}

const fmt = (v) => `${Math.round(v * 10) / 10} mm`;
