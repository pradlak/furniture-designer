import { duplicateSelection } from '../model/placement.js';
import { selectedCabinetIds } from './selection.js';

// Duplikuje to, co zaznaczone: korpusy (Ctrl + klik — kilka) razem z zaznaczonymi blatami, blendami wspólnymi
// i samodzielnymi płytami (Ctrl + klik w blat). Kopie zostają zaznaczone. cabinetId — korpus z menu / przycisku
// (gdy nie należy do zaznaczenia — kopiujemy tylko jego).
export function duplicateSelected(store, ui, cabinetId = null) {
  const state = ui.get();
  let ids = [...selectedCabinetIds(state)];
  if (cabinetId && !ids.includes(cabinetId)) ids = [cabinetId];
  const parts = (state.selectedBlends ?? []).filter((id) => id.startsWith('trim:') || id.startsWith('board:'));
  const r = duplicateSelection(store.get(), ids, parts);
  if (!r.cabinetIds.length && !r.blendIds.length) return;
  store.set(r.project);
  ui.set(
    { ...ui.get(), selectedId: r.cabinetIds.at(-1) ?? null, selectedIds: r.cabinetIds, selectedFronts: [], selectedBlends: r.blendIds, selectedHole: null },
    { reveal: !!r.cabinetIds.length },
  );
}
