import { createDefaultProject } from './project.js';
import { createCabinet } from './furniture.js';
import { createTrim } from './trims.js';

// Przykładowy projekt dla nowych użytkowników: zabudowa wnęki 2000 mm z dwiema szafkami dolnymi
// na nóżkach, blendą boczną z panelem przy ścianie, panelem bocznym, blendą dolną i blatem.
export function createExampleProject() {
  let p = createDefaultProject();
  p = {
    ...p,
    space: { ...p.space, name: 'Przykład: zabudowa wnęki', width: 2000, height: 2500, depth: 650 },
  };

  const side = (o) => ({
    type: 'none',
    width: null,
    wallPanel: false,
    wallPanelDepth: 60,
    fullPanelDepth: null,
    flushFront: false,
    extend: 0,
    allowance: 0,
    hidden: false,
    ...o,
  });
  const base = { y: 0, z: 0, height: 720, depth: 560, legs: { enabled: true, height: 100 }, topType: 'rails' };

  const left = {
    ...createCabinet(p),
    ...base,
    name: 'Szafka lewa',
    x: 70,
    width: 800,
    sideBlends: { left: side({ type: 'filler', wallPanel: true, flushFront: true }), right: side() },
  };
  p = { ...p, furniture: [left] };
  const right = {
    ...createCabinet(p),
    ...base,
    name: 'Szafka prawa',
    x: 870,
    width: 600,
    sideBlends: { left: side(), right: side({ type: 'full', flushFront: true }) },
  };
  p = { ...p, furniture: [left, right] };

  const ids = [left.id, right.id];
  p = { ...p, trims: [createTrim('plinth', ids, p)] };
  p = { ...p, trims: [...p.trims, createTrim('countertop', ids, p)] };
  return p;
}
