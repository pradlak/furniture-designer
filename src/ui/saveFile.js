// Zapis pliku z pytaniem, gdzie go zapisać (okno „Zapisz jako”).
// Chrome i Edge mają do tego showSaveFilePicker; w innych przeglądarkach (Firefox, Safari) — zwykłe
// pobranie (plik trafia do folderu pobranych albo przeglądarka sama pyta, zależnie od jej ustawień).
// Trzeba wywołać bezpośrednio po kliknięciu użytkownika.
// Zwraca true, gdy plik zapisano / pobrano, false — gdy użytkownik anulował okno zapisu.
export async function saveFile(blob, fileName, { description = 'Plik', mime = blob.type || 'application/octet-stream' } = {}) {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: ext ? [{ description, accept: { [mime.split(';')[0]]: [ext] } }] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false; // anulowano okno zapisu
      // inny błąd (np. strona w ramce bez dostępu) — zwykłe pobranie poniżej
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
