import { PICTURES } from './pictures.js';

const STORAGE_KEY = 'furnitureDesigner.welcomeSeen';

// Okienko „Jak zacząć”: pokazywane przy pierwszej wizycie (i na żądanie — przycisk „?” na pasku).
// onNew — otwiera okienko „Nowy projekt” (wybór szablonu przestrzeni);
// onStart — po zamknięciu okienka przyciskiem „Zaczynam”, Esc albo kliknięciem obok (np. przy pierwszym
// uruchomieniu — wybór przestrzeni).
// onExamples — otwiera galerię przykładowych projektów.
export function createWelcome(store, { onNew, onStart, onExamples } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Meble Samemu — jak zacząć</h2>
      <p>Zaprojektuj szafkę albo całą zabudowę w 3D i pobierz listę formatek do rozkroju. Za darmo, bez rejestracji.</p>
      <ol>
        <li><b>Przestrzeń</b> — wpisz wymiary wnęki lub pokoju, zaznacz ściany, dodaj skosy i przeszkody (rury, listwy).</li>
        <li><b>Meble</b> — dodaj korpus, ustaw wymiary, nóżki i wzmocnienia. Korpus przesuniesz też myszką w podglądzie 3D.</li>
        <li><b>Blendy i blaty</b> — blendy boczne, blenda dolna (cokół), blenda górna i blat.</li>
        <li><b>Materiały</b> — płyty, grubości, kolory i obrzeże.</li>
        <li><b>💾 Formatki…</b> na górnym pasku — lista płyt do zamówienia rozkroju: Excel, CSV albo plik do rozkroju na meble.pl.</li>
      </ol>
      <p class="welcome-note">Krok po kroku: <a href="/poradniki/szafa-do-wneki" target="_blank" rel="noopener">jak zaprojektować szafę do wnęki</a>
        · <a href="/poradniki/" target="_blank" rel="noopener">wszystkie poradniki</a>.</p>
      <p class="welcome-note">Projekt zapisuje się automatycznie w tej przeglądarce. Żeby go zachować na dłużej
        albo przenieść na inny komputer, użyj <b>Eksportuj</b> i <b>Importuj</b>.</p>
      <h3 class="welcome-choices-title">Od czego zaczynasz?</h3>
      <div class="welcome-choices">
        <button type="button" class="choice-card" data-welcome="new" data-template="niche">
          ${PICTURES.niche}
          <b>Wnęka prostokątna</b>
          <small>Szafa albo zabudowa między ścianami</small>
        </button>
        <button type="button" class="choice-card" data-welcome="new" data-template="attic">
          ${PICTURES.attic}
          <b>Poddasze ze skosem</b>
          <small>Zabudowa pod skosem — korpusy ze skośną górą</small>
        </button>
        <button type="button" class="choice-card" data-welcome="example">
          ${PICTURES.kitchen}
          <b>Przykładowe projekty</b>
          <small>Kuchnia, szafa, poddasze, regał, komoda — do obejrzenia i zmian</small>
        </button>
      </div>
      <div class="welcome-actions">
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

  const start = () => {
    close();
    onStart?.();
  };

  overlay.addEventListener('click', (e) => {
    // kliknięcie w kartę (obrazek, tytuł, opis) — akcja karty
    const card = e.target.closest('[data-welcome]');
    const action = card?.dataset.welcome;
    if (e.target === overlay || action === 'close') start();
    if (action === 'new') {
      close();
      onNew?.(card.dataset.template);
    }
    if (action === 'example') {
      // galeria przykładów (okienko „Przykładowe projekty”)
      close();
      onExamples?.();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) start();
  });

  let seen = false;
  try {
    seen = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // ignorujemy
  }
  if (!seen) open();

  // hide — chowa okienko bez zapamiętywania (np. wejście z linku do przykładu: przy następnej wizycie pokaże się znowu)
  return { open, hide: () => (overlay.hidden = true), isOpen: () => !overlay.hidden };
}
