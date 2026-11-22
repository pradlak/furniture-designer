import { rowOf } from './trims.js';
import { maxCabinetHeight, CABINET_LIMITS } from './furniture.js';

// Ten sam wymiar dla kilku korpusów naraz (zaznaczonych Ctrl + klik): dim — 'width' | 'height' | 'depth'.
// Szerokość: korpusy w rzędzie na prawo od zmienionych przesuwają się o sumę zmian (każdy rząd osobno), żeby
// dalej stały bok przy boku. Wysokość — w każdym korpusie najwyżej tyle, ile się zmieści pod sufitem / skosem.
// base — projekt, od którego liczymy (przy przeciąganiu w 3D: stan z początku przeciągania).
export function resizeCabinets(base, ids, dim, value) {
  const set = new Set(ids);
  const min = CABINET_LIMITS.sizeMin;
  if (dim === 'width') {
    const moved = new Map();
    for (const cid of set) {
      if (moved.has(cid) || !base.furniture.some((c) => c.id === cid)) continue;
      const row = rowOf(cid, base).map((rid) => base.furniture.find((c) => c.id === rid)).sort((a, b) => a.x - b.x);
      let shift = 0;
      for (const c of row) {
        const width = set.has(c.id) ? Math.max(min, value) : c.width;
        moved.set(c.id, { ...c, x: c.x + shift, width });
        shift += width - c.width;
      }
    }
    return { ...base, furniture: base.furniture.map((c) => moved.get(c.id) ?? c) };
  }
  return {
    ...base,
    furniture: base.furniture.map((c) => {
      if (!set.has(c.id)) return c;
      const v = dim === 'height' ? Math.min(Math.floor(maxCabinetHeight(c, base)), value) : value;
      return { ...c, [dim]: Math.max(min, Math.round(v)) };
    }),
  };
}
