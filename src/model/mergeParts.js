import { newId } from './furniture.js';
import { trimBox } from './trims.js';
import { resolveHole } from './boardFeatures.js';

// Usuwanie i łączenie zaznaczonych blatów / blend wspólnych („trim:id”) i samodzielnych płyt („board:id”).

const trimIdsOf = (partIds) => partIds.filter((id) => id.startsWith('trim:')).map((id) => id.slice(5));
const boardIdsOf = (partIds) => partIds.filter((id) => id.startsWith('board:')).map((id) => id.slice(6));

// Ile zaznaczonych elementów da się usunąć (blaty, blendy wspólne, samodzielne płyty).
export const removableCount = (partIds) => trimIdsOf(partIds).length + boardIdsOf(partIds).length;

export function removeParts(project, partIds) {
  const trims = new Set(trimIdsOf(partIds));
  const boards = new Set(boardIdsOf(partIds));
  return {
    ...project,
    trims: (project.trims ?? []).filter((t) => !trims.has(t.id)),
    boards: (project.boards ?? []).filter((b) => !boards.has(b.id)),
  };
}

// Otwory płyty przeliczone na nową płytę, której lewa krawędź jest o shift mm dalej w lewo (położenie „własne”).
const shiftHoles = (holes, width, depth, shift) =>
  (holes ?? []).map((h) => {
    const r = resolveHole(h, width, depth);
    return { ...r, pos: null, x: Math.round((r.x + shift) * 10) / 10 };
  });

// Co da się połączyć: co najmniej dwa blaty na szafkach (→ jeden blat na wszystkich ich korpusach) albo co najmniej
// dwie samodzielne płyty (→ jedna płyta od lewej krawędzi pierwszej do prawej ostatniej). → { kind, ids } albo null.
export function mergeCandidate(project, partIds) {
  const trims = trimIdsOf(partIds).map((id) => project.trims?.find((t) => t.id === id)).filter(Boolean);
  const boards = boardIdsOf(partIds).map((id) => project.boards?.find((b) => b.id === id)).filter(Boolean);
  if (trims.length >= 2 && !boards.length && trims.every((t) => t.type === 'countertop')) return { kind: 'trims', ids: trims.map((t) => t.id) };
  if (boards.length >= 2 && !trims.length) return { kind: 'boards', ids: boards.map((b) => b.id) };
  return null;
}

// Łączy zaznaczone blaty / płyty w jedną. → { project, partId } albo null (nie da się połączyć).
export function mergeParts(project, partIds) {
  const cand = mergeCandidate(project, partIds);
  if (!cand) return null;
  if (cand.kind === 'trims') {
    // od lewej do prawej (blat bez korpusów — na końcu)
    const list = cand.ids
      .map((id) => project.trims.find((t) => t.id === id))
      .map((t) => ({ t, box: trimBox(t, project) }))
      .sort((a, b) => (a.box?.x ?? Infinity) - (b.box?.x ?? Infinity));
    const first = list[0].t;
    const last = list[list.length - 1].t;
    const merged = {
      ...structuredClone(first),
      id: newId(),
      cabinetIds: [...new Set(list.flatMap(({ t }) => t.cabinetIds))],
      x: null, // długość i położenie — automatycznie, na wszystkich korpusach
      length: null,
      depth: list.every(({ t }) => t.depth === first.depth) ? first.depth : null,
      extendLeft: first.extendLeft, // dosunięcie do ściany — z lewego blatu po lewej, z prawego po prawej
      extendRight: last.extendRight,
    };
    const next = { ...project, trims: [...project.trims.filter((t) => !cand.ids.includes(t.id)), merged] };
    // otwory (zlew, płyta grzewcza…) zostają w tych samych miejscach na nowym blacie
    const box = trimBox(merged, next);
    if (box) {
      merged.holes = list.flatMap(({ t, box: b }) => (b ? shiftHoles(t.holes, b.width, b.depth, b.x - box.x) : []));
    }
    return { project: next, partId: `trim:${merged.id}` };
  }
  const list = cand.ids.map((id) => project.boards.find((b) => b.id === id)).sort((a, b) => a.x - b.x);
  const first = list[0];
  const x0 = Math.min(...list.map((b) => b.x));
  const x1 = Math.max(...list.map((b) => b.x + b.width));
  const merged = {
    ...structuredClone(first),
    id: newId(),
    x: x0,
    width: Math.round(x1 - x0),
    depth: Math.max(...list.map((b) => b.depth)),
    holes: list.flatMap((b) => shiftHoles(b.holes, b.width, b.depth, b.x - x0)),
  };
  return { project: { ...project, boards: [...project.boards.filter((b) => !cand.ids.includes(b.id)), merged] }, partId: `board:${merged.id}` };
}
