import { escapeHtml } from './dom.js';
import { saveFile } from './saveFile.js';
import { zipStored } from '../model/xlsx.js';

// Okienko z listą plików do zapisania — po jednym przycisku „Zapisz” na plik (przeglądarki blokują kilka
// pobrań naraz, a okno „Zapisz jako” musi wynikać z kliknięcia). Używane przy eksporcie do meble.pl
// i zamówieniu frontów z MDF.
// show({ title, intro, files: [{ fileName, label, info?, linkUrl?, linkText?, blob | blobPromise }], warningHtml?, zipName? })
// „Zapisz wszystkie” — wszystkie pliki naraz w jednym archiwum ZIP (zipName).
export function createFilesDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome files-dialog" role="dialog" aria-modal="true" aria-labelledby="files-title">
      <h2 id="files-title"></h2>
      <p class="welcome-note files-intro"></p>
      <div class="files-all"><button type="button" class="primary" data-files="all" disabled>⏳ Przygotowuję pliki…</button></div>
      <ul class="files-list"></ul>
      <div class="files-warning"></div>
      <div class="welcome-actions">
        <button type="button" class="primary" data-files="close">Zamknij</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let current = [];
  let zipName = 'pliki.zip';
  let zipBlob = null; // archiwum gotowe zawczasu — zapis musi ruszyć od razu po kliknięciu
  const blobs = new Map(); // gotowe pliki (rysunki PNG robią się chwilę — przygotowujemy je od razu)
  const close = () => (overlay.hidden = true);

  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.closest('[data-files="close"]')) close();
    const allBtn = e.target.closest('[data-files="all"]');
    if (allBtn) {
      if (!zipBlob) return;
      const saved = await saveFile(zipBlob, zipName, { description: 'Archiwum ZIP' });
      if (saved) allBtn.textContent = '✔ Zapisano wszystkie — zapisz jeszcze raz';
      return;
    }
    const btn = e.target.closest('[data-file]');
    if (!btn) return;
    const i = Number(btn.dataset.file);
    const blob = blobs.get(i);
    if (!blob) return;
    const f = current[i];
    const saved = await saveFile(blob, f.fileName, { description: f.description ?? 'Plik' });
    if (saved) btn.textContent = '✔ Zapisano — zapisz jeszcze raz';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    show({ title, intro, files, warningHtml = '', zipName: zip = 'pliki.zip' }) {
      current = files;
      zipName = zip;
      const allBtn = overlay.querySelector('[data-files="all"]');
      allBtn.disabled = true;
      allBtn.textContent = '⏳ Przygotowuję pliki…';
      zipBlob = null;
      overlay.querySelector('.files-all').hidden = files.length < 2;
      blobs.clear();
      overlay.querySelector('#files-title').textContent = title;
      overlay.querySelector('.files-intro').innerHTML = intro;
      overlay.querySelector('.files-list').innerHTML = files
        .map(
          (f, i) => `
          <li class="files-item">
            <div><b>${escapeHtml(f.label)}</b>${f.info ? ` — ${escapeHtml(f.info)}` : ''}
              ${f.linkUrl ? `<br /><small><a href="${f.linkUrl}" target="_blank" rel="noopener">${escapeHtml(f.linkText ?? f.linkUrl)}</a></small>` : ''}
              <br /><small class="files-name">${escapeHtml(f.fileName)}</small></div>
            <button type="button" data-file="${i}" disabled>⏳ Przygotowuję…</button>
          </li>`,
        )
        .join('');
      overlay.querySelector('.files-warning').innerHTML = warningHtml;
      overlay.hidden = false;
      files.forEach((f, i) => {
        const btn = overlay.querySelector(`[data-file="${i}"]`);
        Promise.resolve(f.blob ?? f.blobPromise)
          .then((blob) => {
            if (current !== files) return; // okienko otwarte już dla innych plików
            blobs.set(i, blob);
            btn.disabled = false;
            btn.textContent = '💾 Zapisz';
            if (blobs.size === files.length) {
              const n = files.length;
              Promise.all(files.map(async (f, j) => [f.fileName, new Uint8Array(await blobs.get(j).arrayBuffer())])).then((entries) => {
                if (current !== files) return;
                zipBlob = new Blob([zipStored(entries)], { type: 'application/zip' });
                allBtn.disabled = false;
                allBtn.textContent = `💾 Zapisz wszystkie (${n} ${n < 5 ? 'pliki' : 'plików'} w jednym ZIP)`;
              });
            }
          })
          .catch(() => {
            btn.textContent = '✖ Błąd';
          });
      });
    },
  };
}

// Rysunek SVG → obraz PNG (Blob), np. rysunek frontu do dołączenia do zamówienia.
export function svgToPng(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(img.width * scale);
      canvas.height = Math.ceil(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png');
    };
    img.onerror = () => reject(new Error('SVG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
