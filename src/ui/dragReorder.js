// Zmiana kolejności kart na liście przeciąganiem za uchwyt ⠿ (karty korpusów, blatów, samodzielnych płyt).
// Karta: element z data-kind="<kind>" i data-id; uchwyt w jej nagłówku: DRAG_HANDLE (draggable).
// Kreska nad / pod kartą pokazuje miejsce upuszczenia; karty przenosi się tylko w obrębie tej samej listy
// (np. blat między blatami). onMove(movedId, targetId, after) — zmiana kolejności w projekcie.

export const DRAG_HANDLE = '<span class="drag-handle" draggable="true" data-drag-card title="Przeciągnij, aby zmienić kolejność na liście">⠿</span>';

// Nowa kolejność listy: element `movedId` przed albo za `targetId` (pozostałe bez zmian).
export function moveInList(list, movedId, targetId, after) {
  const item = list.find((x) => x.id === movedId);
  if (!item || movedId === targetId) return list;
  const rest = list.filter((x) => x.id !== movedId);
  const at = rest.findIndex((x) => x.id === targetId) + (after ? 1 : 0);
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

export function attachDragReorder(root, kind, onMove) {
  const selector = `[data-kind="${kind}"]`;
  let drag = null; // { id, list — kontener kart (.items), z którego zaczęto }
  const clearMarks = () => root.querySelectorAll(`${selector}.drop-before, ${selector}.drop-after`).forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  const target = (e) => {
    const card = e.target.closest?.(selector);
    if (!drag || !card || card.dataset.id === drag.id || card.parentElement !== drag.list) return null;
    const r = card.getBoundingClientRect();
    return { card, after: e.clientY > r.top + r.height / 2 };
  };

  root.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('[data-drag-card]')?.closest(selector);
    if (!card) return;
    drag = { id: card.dataset.id, list: card.parentElement };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', drag.id); // Firefox wymaga danych, żeby przeciąganie ruszyło
    e.dataTransfer.setDragImage(card, 20, 16);
    card.classList.add('dragging');
  });
  root.addEventListener('dragover', (e) => {
    const t = target(e);
    if (!t) return;
    e.preventDefault(); // pozwalamy upuścić
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    t.card.classList.add(t.after ? 'drop-after' : 'drop-before');
  });
  root.addEventListener('drop', (e) => {
    const t = target(e);
    clearMarks();
    if (!t) return;
    e.preventDefault();
    onMove(drag.id, t.card.dataset.id, t.after);
  });
  root.addEventListener('dragend', () => {
    drag = null;
    clearMarks();
    root.querySelectorAll(`${selector}.dragging`).forEach((el) => el.classList.remove('dragging'));
  });
}
