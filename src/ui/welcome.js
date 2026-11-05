import { createExampleProject } from '../model/example.js';

const STORAGE_KEY = 'furnitureDesigner.welcomeSeen';

// Okienko „Jak zacząć”: pokazywane przy pierwszej wizycie (i na żądanie — przycisk „?” na pasku).
export function createWelcome(store) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Projektant mebli — jak zacząć</h2>
      <p>Zaprojektuj szafkę albo całą zabudowę w 3D i pobierz listę formatek do rozkroju. Za darmo, bez rejestracji.</p>
      <ol>
        <li><b>Przestrzeń</b> — wpisz wymiary wnęki lub pokoju, zaznacz ściany, dodaj skosy i przeszkody (rury, listwy).</li>
        <li><b>Meble</b> — dodaj korpus, ustaw wymiary, nóżki i wzmocnienia. Korpus przesuniesz też myszką w podglądzie 3D.</li>
        <li><b>Blendy i blaty</b> — blendy boczne, blenda dolna (cokół), blenda górna i blat.</li>
        <li><b>Materiały</b> — płyty, grubości, kolory i obrzeże.</li>
        <li><b>Formatki (CSV)</b> na górnym pasku — lista płyt do zamówienia rozkroju (otwiera się w Excelu).</li>
      </ol>
      <p class="welcome-note">Projekt zapisuje się automatycznie w tej przeglądarce. Żeby go zachować na dłużej
        albo przenieść na inny komputer, użyj <b>Eksportuj</b> i <b>Importuj</b>.</p>
      <div class="welcome-actions">
        <button type="button" data-welcome="example">Wczytaj przykładowy projekt</button>
        <button type="button" class="primary" data-welcome="close">Zaczynam</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.hidden = true;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignorujemy
    }
  };
  const open = () => {
    overlay.hidden = false;
    overlay.querySelector('[data-welcome="close"]').focus();
  };

  overlay.addEventListener('click', (e) => {
    const action = e.target.dataset?.welcome;
    if (e.target === overlay || action === 'close') close();
    if (action === 'example') {
      const hasWork = store.get().furniture.length > 0;
      if (!hasWork || confirm('Wczytać przykładowy projekt? Bieżący projekt zostanie zastąpiony (możesz go najpierw wyeksportować).')) {
        store.set(createExampleProject(), { replace: true });
        close();
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  let seen = false;
  try {
    seen = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // ignorujemy
  }
  if (!seen) open();

  return { open };
}
