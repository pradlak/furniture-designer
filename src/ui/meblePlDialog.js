import { escapeHtml } from './dom.js';
import { saveFile } from './saveFile.js';

// Okienko z plikami do rozkroju na meble.pl: po jednym przycisku „Zapisz” na każdy plik (płytę).
// Przeglądarki blokują kilka pobrań naraz, więc każdy plik zapisuje się osobnym kliknięciem (z oknem „Zapisz jako”).
// show({ files: [{ fileName, label, count, cutting: { label, url }, csv }], outOfRange: [tekst], limits })
export function createMeblePlDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome meblepl-dialog" role="dialog" aria-modal="true" aria-labelledby="meblepl-title">
      <h2 id="meblepl-title">Pliki do rozkroju na meble.pl</h2>
      <p class="welcome-note">Każdy plik wczytaj w podanym rozkroju: wybierz płytę, a potem
        „Wczytaj listę formatek z CSV”. Sprawdź dane po wczytaniu.</p>
      <ul class="meblepl-files"></ul>
      <div class="meblepl-warning"></div>
      <div class="welcome-actions">
        <button type="button" class="primary" data-meblepl="close">Zamknij</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let current = [];
  const close = () => (overlay.hidden = true);

  // Zapis z oknem „Zapisz jako” (gdzie przeglądarka na to pozwala); po anulowaniu — bez zmian.
  async function download(file, button) {
    const saved = await saveFile(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }), file.fileName, { description: 'Plik CSV' });
    if (saved) button.textContent = '✔ Zapisano — zapisz jeszcze raz';
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-meblepl="close"]')) close();
    const btn = e.target.closest('[data-meblepl-file]');
    if (btn) download(current[Number(btn.dataset.mebleplFile)], btn);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    show({ files, outOfRange, limits }) {
      current = files;
      overlay.querySelector('.meblepl-files').innerHTML = files
        .map(
          (f, i) => `
          <li class="meblepl-file">
            <div><b>${escapeHtml(f.label)}</b> — ${f.count} szt.<br />
              <small>wczytaj w rozkroju <a href="${f.cutting.url}" target="_blank" rel="noopener">„${escapeHtml(f.cutting.label)}”</a></small></div>
            <button type="button" data-meblepl-file="${i}">💾 Zapisz</button>
          </li>`,
        )
        .join('');
      overlay.querySelector('.meblepl-warning').innerHTML = outOfRange.length
        ? `<p class="warning">⚠ Formatki poza zakresem meble.pl (od ${limits.minLong} × ${limits.minShort} do ${limits.maxLong} × ${limits.maxShort} mm) —
            trzeba je zamówić inaczej albo zmienić:</p><ul class="warning">${outOfRange.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
        : '';
      overlay.hidden = false;
      overlay.querySelector('[data-meblepl-file]')?.focus();
    },
  };
}
