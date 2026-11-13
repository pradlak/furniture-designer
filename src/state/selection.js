// Zaznaczenie korpusów: selectedId — główny (ostatnio kliknięty; jego karta jest pokazywana, na nim
// działają skróty), selectedIds — wszystkie zaznaczone (Ctrl + klik dodaje / usuwa korpus).
// Gdy selectedId nie należy do selectedIds (np. ktoś ustawił tylko selectedId), zaznaczony jest sam selectedId.
export function selectedCabinetIds(ui) {
  const { selectedId, selectedIds } = ui;
  if (!selectedId) return new Set();
  return new Set(selectedIds?.includes(selectedId) ? selectedIds : [selectedId]);
}

// Ctrl + klik: przełącza korpus w zaznaczeniu. Zwraca nowy stan zaznaczenia ({ selectedId, selectedIds }).
export function toggleCabinet(ui, id) {
  const current = [...selectedCabinetIds(ui)];
  if (!current.includes(id)) return { selectedId: id, selectedIds: [...current, id] };
  const rest = current.filter((x) => x !== id);
  return { selectedId: rest.at(-1) ?? null, selectedIds: rest };
}
