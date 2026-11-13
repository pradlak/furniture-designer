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

// Wymiary zaznaczonych elementów (front, blenda boczna, blenda dolna / górna, blat) — każdy osobno:
// wysokość przy lewej krawędzi przodu (wysunięta przed element), szerokość nad górną krawędzią przodu,
// głębokość (przy płytach w płaszczyźnie frontu to grubość) nad prawą górną krawędzią.
// parts: [{ box: { x, y, z, width, height, depth } (mm), name, round? }] — round: element okrągły (nóżka).
// Przy kilku elementach — z nazwą.
export function buildPartDimensions(parts, space) {
  const group = new THREE.Group();
  const p = (px, py, pz) => new THREE.Vector3(...toScene(px, py, pz, space));
  const off = (dx, dy, dz) => p(dx, dy, dz).sub(p(0, 0, 0));
  const add = (a, b, o, text) => group.add(createDimension(a, b, o, text, 'accent'));
  const named = parts.length > 1;
  for (const { box, name, round } of parts) {
    const { x, y, z, width: W, height: H, depth: D } = box;
    const front = z + D;
    const top = y + H;
    const prefix = named ? `${name}: ` : '';
    add(p(x, y, front), p(x, top, front), off(0, 0, NEAR), `${prefix}wys. ${fmt(H)}`);
    if (round) {
      // element okrągły (nóżka) — sama średnica, pod spodem przed elementem
      add(p(x, y, front), p(x + W, y, front), off(0, 0, NEAR / 2), `${prefix}Ø ${fmt(W)}`);
      continue;
    }
    add(p(x, top, front), p(x + W, top, front), off(0, NEAR, 0), `${prefix}szer. ${fmt(W)}`);
    add(p(x + W, top, z), p(x + W, top, front), off(0, NEAR, 0), `${prefix}gł. ${fmt(D)}`);
  }
  return group;
}

// Wymiary całości kilku zaznaczonych obiektów (np. korpus + blenda górna): prostopadłościan obejmujący
// wszystkie — szerokość, wysokość i głębokość „razem”, odsunięte dalej niż wymiary pojedynczych obiektów.
// boxes: [{ x, y, z, width, height, depth }] (mm).
const TOTAL = 400; // mm — odsunięcie linii wymiarów całości
export function buildTotalDimensions(boxes, space) {
  const group = new THREE.Group();
  const x0 = Math.min(...boxes.map((b) => b.x));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  const z0 = Math.min(...boxes.map((b) => b.z));
  const z1 = Math.max(...boxes.map((b) => b.z + b.depth));
  const p = (px, py, pz) => new THREE.Vector3(...toScene(px, py, pz, space));
  const off = (dx, dy, dz) => p(dx, dy, dz).sub(p(0, 0, 0));
  const add = (a, b, o, text) => group.add(createDimension(a, b, o, text, 'accent'));
  add(p(x0, y0, z1), p(x0, y1, z1), off(0, 0, TOTAL), `razem wys. ${fmt(y1 - y0)}`);
  add(p(x0, y1, z1), p(x1, y1, z1), off(0, TOTAL, 0), `razem szer. ${fmt(x1 - x0)}`);
  add(p(x1, y1, z0), p(x1, y1, z1), off(0, TOTAL, 0), `razem gł. ${fmt(z1 - z0)}`);
  return group;
}

const fmt = (v) => `${Math.round(v * 10) / 10} mm`;
