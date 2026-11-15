// Samodzielne płyty poziome (project.boards): blat (np. biurko, parapet, blat na nogach) albo półka
// (np. wisząca na ścianie) — niezwiązane z korpusami. Każda ma frezy krawędzi i otwory (model/boardFeatures.js).
//
// board: { id, name, kind: 'worktop' | 'shelf', x, y, z (lewy-dolny-tylny narożnik, mm), width (wzdłuż X),
//          depth (wzdłuż Z), materialId, color, edges, holes, hidden }
// Grubość — z materiału.

import { resolveMaterial, withColor, normalizeColor } from './materials.js';
import { defaultEdges, normalizeEdges, normalizeHoles, holeFits } from './boardFeatures.js';
import { isPointInside, describeOutside } from './space.js';
import { newId } from './furniture.js';

export const BOARD_KINDS = [
  { key: 'worktop', label: 'Blat' },
  { key: 'shelf', label: 'Półka' },
];
export const BOARD_LIMITS = { sizeMin: 50, sizeMax: 6000 };

export const boardMaterial = (board, project) =>
  withColor(resolveMaterial(project, board.materialId, board.kind === 'worktop' ? 'worktop' : 'chipboard'), board.color);

// Prostopadłościan płyty (mm, układ przestrzeni).
export function boardBox(board, project) {
  return { x: board.x, y: board.y, z: board.z, width: board.width, height: boardMaterial(board, project).thickness, depth: board.depth };
}

export function createBoard(project, kind = 'worktop') {
  const { space } = project;
  const count = (project.boards ?? []).filter((b) => b.kind === kind).length;
  const worktop = kind === 'worktop';
  const width = Math.min(worktop ? 1600 : 800, space.width);
  const depth = Math.min(worktop ? 600 : 250, space.depth);
  return {
    id: newId(),
    name: `${worktop ? 'Blat' : 'Półka'} ${count + 1}`,
    kind,
    x: Math.max(0, Math.round((space.width - width) / 2)),
    y: worktop ? Math.min(750, space.height - 50) : Math.min(1500, space.height - 100),
    z: 0, // przy tylnej ścianie
    width,
    depth,
    materialId: project.materials?.find((m) => m.type === (worktop ? 'worktop' : 'chipboard'))?.id ?? null,
    color: null,
    edges: defaultEdges(),
    holes: [],
    hidden: false,
  };
}

export function normalizeBoard(raw = {}) {
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const { sizeMin, sizeMax } = BOARD_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Płyta',
    kind: raw.kind === 'shelf' ? 'shelf' : 'worktop',
    x: num(raw.x, 0, -sizeMax, sizeMax * 4),
    y: num(raw.y, 750, -sizeMax, sizeMax * 4),
    z: num(raw.z, 0, -sizeMax, sizeMax * 4),
    width: num(raw.width, 1600, sizeMin, sizeMax),
    depth: num(raw.depth, 600, sizeMin, sizeMax),
    materialId: typeof raw.materialId === 'string' ? raw.materialId : null,
    color: normalizeColor(raw.color),
    edges: normalizeEdges(raw.edges),
    holes: normalizeHoles(raw.holes),
    hidden: raw.hidden === true,
  };
}

// Problemy płyty (do podświetlenia i listy): poza przestrzenią, otwór nie mieści się w płycie.
export function boardIssues(board, project) {
  const b = boardBox(board, project);
  const corners = [];
  for (const x of [b.x, b.x + b.width]) for (const y of [b.y, b.y + b.height]) for (const z of [b.z, b.z + b.depth]) corners.push([x, y, z]);
  const issues = [];
  const outside = describeOutside(corners, project.space, { openFront: true });
  if (outside) issues.push(outside);
  board.holes.forEach((h, i) => {
    if (!holeFits(h, board.width, board.depth)) issues.push(`Otwór ${i + 1} nie mieści się w płycie (min. 10 mm od krawędzi).`);
  });
  return issues;
}
