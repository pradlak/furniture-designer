import { createDefaultProject, normalizeProject } from '../model/project.js';
import { cutListCsv, cutListXlsx, cutListMeblePl, MEBLEPL_LIMITS, MEBLEPL_CUTTING } from '../model/cutList.js';
import { createCutListDialog } from './cutListDialog.js';
import { createFilesDialog, svgToPng } from './filesDialog.js';
import { mdfOrderItems, mdfOrderXlsx, mdfDrawingSvg } from '../model/mdfOrder.js';
import { worktopItems, worktopXlsx, worktopDrawingSvg } from '../model/worktopOrder.js';
import { saveFile } from './saveFile.js';

const VIEWS = [
  { key: 'perspective', label: '3D' },
  { key: 'front', label: 'Przód' },
  { key: 'top', label: 'Góra' },
  { key: 'side', label: 'Bok' },
];

// onHelp — otwiera okienko „Jak zacząć”; onNew — okienko „Nowy projekt” (wybór szablonu przestrzeni);
// onFeedback — okienko „Uwagi i propozycje”; onSettings — okienko „Ustawienia”.
export function createToolbar(root, store, viewer, { onHelp, onNew, onFeedback, onSettings } = {}) {
  root.innerHTML = `
    <div class="brand" title="Meble Samemu — darmowy projektant mebli">Meble Samemu</div>
    <div class="group">
      <button type="button" data-action="new" title="Nowy projekt — wnęka prostokątna albo poddasze ze skosem">📄 Nowy…</button>
      <button type="button" data-action="import" title="Wczytaj projekt z pliku (.json)">📂 Importuj…</button>
      <button type="button" data-action="export" title="Zapisz projekt do pliku (.json) — żeby go zachować albo przenieść na inny komputer">📤 Eksportuj</button>
      <input type="file" accept="application/json,.json" hidden />
      <button type="button" data-action="cut-list" title="Lista płyt do rozkroju — do wyboru Excel albo CSV oraz co wyeksportować (korpusy, fronty, blendy, blaty, akcesoria)">💾 Formatki…</button>
    </div>
    <div class="group">
      <button type="button" data-action="undo" title="Cofnij (Ctrl+Z)">↶ Cofnij</button>
      <button type="button" data-action="redo" title="Ponów (Ctrl+Y)">↷ Ponów</button>
    </div>
    <div class="group">
      <span class="group-label">Widok:</span>
      ${VIEWS.map((v) => `<button type="button" data-view="${v.key}">${v.label}</button>`).join('')}
    </div>
    <details class="group show-menu">
      <summary title="Co pokazać w widoku 3D">👁 Pokaż <span class="show-count"></span> ▾</summary>
      <div class="show-menu-list">
      <label class="check"><input type="checkbox" data-view-flag="showWalls" /> Ściany</label>
      <label class="check" title="Wymiary zaznaczonego korpusu: nóżki, korpus, razem, szerokość, głębokość"><input type="checkbox" data-view-flag="showDims" /> Wymiary</label>
      <label class="check"><input type="checkbox" data-view-flag="showCountertops" /> Blaty</label>
      <label class="check"><input type="checkbox" data-view-flag="showBlends" /> Blendy</label>
      <label class="check" title="Ukryj fronty, żeby zajrzeć do wnętrza korpusów (np. przesunąć półkę)"><input type="checkbox" data-view-flag="showFronts" /> Fronty</label>
      <label class="check" title="Otwórz drzwi i wysuń szuflady — żeby zobaczyć, co jest w środku (tylko widok)"><input type="checkbox" data-view-flag="openFronts" data-default-off /> Fronty otwarte</label>
      </div>
    </details>
    <div class="group account-group" hidden></div>
    <div class="group help-group">
      <button type="button" class="feedback-btn" data-action="feedback" title="Coś nie działa albo czegoś brakuje? Napisz do autora programu">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 8.5h8M8 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>Zgłoś uwagę</span>
      </button>
      <button type="button" class="settings-btn" data-action="settings" title="Ustawienia (kolor zaznaczenia, jednostki)" aria-label="Ustawienia">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" data-action="help" title="Jak zacząć">?</button>
      <div class="user-slot" hidden></div>
    </div>
  `;

  const fileInput = root.querySelector('input[type="file"]');
  // okienko „Formatki”: format i zakres eksportu
  const cutListDialog = createCutListDialog({ onExport: (options) => downloadCutList(store.get(), options) });
  const viewFlags = [...root.querySelectorAll('[data-view-flag]')];

  root.addEventListener('click', (e) => {
    // przycisk mógł zostać kliknięty w ikonkę albo napis w środku — szukamy najbliższego przycisku z akcją
    const action = e.target.closest?.('[data-action]')?.dataset.action;
    const view = e.target.closest?.('[data-view]')?.dataset.view;
    if (view) viewer.setView(view);
    if (action === 'new') {
      if (onNew) onNew();
      else if (confirm('Utworzyć nowy projekt? Bieżące zmiany zostaną utracone.')) store.set(createDefaultProject(), { replace: true });
    }
    if (action === 'undo') store.undo();
    if (action === 'redo') store.redo();
    if (action === 'export') exportProject(store.get());
    if (action === 'import') fileInput.click();
    if (action === 'cut-list') {
      if (!store.get().furniture.length) alert('Projekt nie ma jeszcze żadnych mebli — dodaj korpus w zakładce „Meble”.');
      else cutListDialog.open();
    }
    if (action === 'help') onHelp?.();
    if (action === 'feedback') onFeedback?.();
    if (action === 'settings') onSettings?.();
  });

  for (const box of viewFlags) {
    box.addEventListener('change', () => {
      const flag = box.dataset.viewFlag;
      store.set((p) => {
        const next = { ...p, view: { ...p.view, [flag]: box.checked } };
        // „Pokaż: Fronty” to główny włącznik — kasuje ukrycia pojedynczych frontów i frontów korpusów.
        return flag === 'showFronts' ? { ...next, furniture: next.furniture.map(showAllFronts) } : next;
      });
    });
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const project = normalizeProject(JSON.parse(await file.text()));
      store.set(project, { replace: true });
      track('import-projektu-json');
    } catch (err) {
      alert(`Nie udało się wczytać projektu: ${err.message}`);
    }
  });

  const undoBtn = root.querySelector('[data-action="undo"]');
  const redoBtn = root.querySelector('[data-action="redo"]');
  const sync = (project) => {
    // Przełączniki domyślnie włączone (np. „Ściany”) — zaznaczone, dopóki nie są wyłączone;
    // domyślnie wyłączone (data-default-off, np. „otwarte”) — tylko gdy włączone.
    for (const box of viewFlags) {
      const value = project.view[box.dataset.viewFlag];
      box.checked = box.dataset.defaultOff !== undefined ? value === true : value !== false;
    }
    // na przycisku „Pokaż”: ile elementów widać (bez „Fronty otwarte”, który nie ukrywa niczego)
    const shown = viewFlags.filter((b) => b.dataset.defaultOff === undefined);
    showCount.textContent = `(${shown.filter((b) => b.checked).length}/${shown.length})`;
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
  };
  // menu „Pokaż” zamyka się po kliknięciu obok i klawiszem Esc
  const showMenu = root.querySelector('.show-menu');
  const showCount = showMenu.querySelector('.show-count');
  document.addEventListener('pointerdown', (e) => {
    if (showMenu.open && !showMenu.contains(e.target)) showMenu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && showMenu.open) showMenu.open = false;
  });
  sync(store.get());
  return { sync };
}

// Korpus bez ukrytych frontów: zdejmuje ukrycie frontów korpusu i ukrycie pojedynczych płyt frontów.
function showAllFronts(cabinet) {
  const overrides = Object.fromEntries(
    Object.entries(cabinet.panelOverrides ?? {}).map(([key, o]) => {
      if (!key.startsWith('front-') || !o?.hidden) return [key, o];
      const { hidden: _removed, ...rest } = o;
      return [key, rest];
    }),
  );
  return { ...cabinet, fronts: { ...cabinet.fronts, hidden: false }, panelOverrides: overrides };
}

function safeName(project, fallback) {
  return (project.space.name || fallback).replace(/[^\p{L}\p{N}_-]+/gu, '_');
}

// Zdarzenie w statystykach Umami (np. ile osób pobrało formatki).
// Gdy licznik się nie wczytał (adblock, localhost) — po prostu nic nie robi.
function track(event, data) {
  try {
    window.umami?.track(event, data);
  } catch {
    /* statystyki nie mogą psuć aplikacji */
  }
}

// format: 'xlsx' (Excel) albo 'csv' (tabulatory, UTF-16 — Excel otwiera go od razu w kolumnach);
// parts / accessories — co wyeksportować (patrz cutListDialog).
function downloadCutList(project, { format, parts, accessories }) {
  if (format === 'meblepl') {
    downloadMeblePl(project, parts);
    return;
  }
  if (format === 'mdf') {
    downloadMdfOrder(project);
    return;
  }
  if (format === 'worktops') {
    downloadWorktops(project);
    return;
  }
  const xlsx = format === 'xlsx';
  const options = { parts, accessories };
  const blob = xlsx
    ? new Blob([cutListXlsx(project, options)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new Blob([cutListCsv(project, options)], { type: 'text/csv;charset=utf-16le' });
  const fileName = `${safeName(project, 'projekt')}_formatki.${xlsx ? 'xlsx' : 'csv'}`;
  saveFile(blob, fileName, { description: xlsx ? 'Arkusz Excel' : 'Plik CSV' }).then((saved) => {
    if (!saved) return;
    track(xlsx ? 'pobranie-formatek-xlsx' : 'pobranie-formatek-csv', { korpusy: project.furniture.length, zakres: [...parts, ...(accessories ? ['akcesoria'] : [])].join(',') });
  });
}

// Okienko z plikami do zapisania (meble.pl, fronty MDF) — każdy plik osobnym kliknięciem.
let filesDialog = null;
const fileSafe = (s) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_');

// Rozkrój na meble.pl: płyty meblowe i HDF (plecy) — także fronty i blendy, jeśli są z płyty meblowej;
// po jednym pliku na płytę (dekor).
function downloadMeblePl(project, parts) {
  const files = cutListMeblePl(project, { parts });
  if (!files.length) {
    alert('Wśród wybranych elementów nie ma płyt meblowych (laminowanych) ani HDF. Fronty i blendy z MDF lakierowanego zapiszesz w formacie „Fronty i blendy MDF”.');
    return;
  }
  const bad = files.flatMap((f) => f.outOfRange);
  const { minLong, minShort, maxLong, maxShort } = MEBLEPL_LIMITS;
  filesDialog ??= createFilesDialog();
  filesDialog.show({
    title: 'Pliki do rozkroju na meble.pl',
    zipName: `${safeName(project, 'projekt')}_meblepl.zip`,
    intro: 'Każdy plik wczytaj w podanym rozkroju: wybierz płytę, a potem „Wczytaj listę formatek z CSV”. Sprawdź dane po wczytaniu.',
    files: files.map((f) => ({
      fileName: `${safeName(project, 'projekt')}_meblepl_${fileSafe(f.material)}.csv`,
      label: f.material,
      info: `${f.count} szt.`,
      linkUrl: MEBLEPL_CUTTING[f.type].url,
      linkText: `wczytaj w rozkroju „${MEBLEPL_CUTTING[f.type].label}”`,
      blob: new Blob([f.csv], { type: 'text/csv;charset=utf-8' }),
      description: 'Plik CSV',
    })),
    warningHtml: bad.length
      ? `<p class="warning">⚠ Formatki poza zakresem meble.pl (od ${minLong} × ${minShort} do ${maxLong} × ${maxShort} mm) — trzeba je zamówić inaczej albo zmienić:</p>
         <ul class="warning">${bad.map((t) => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')}</ul>`
      : '',
  });
  track('pobranie-formatek-meblepl', { korpusy: project.furniture.length, pliki: files.length });
}

// Fronty i blendy z MDF lakierowanego (np. do zamówienia w smartfronty.pl): lista w Excelu i rysunek
// każdej pozycji (PNG) z wymiarami, frezem i otworami pod uchwyty i zawiasy.
function downloadMdfOrder(project) {
  const items = mdfOrderItems(project);
  if (!items.length) {
    alert('Projekt nie ma frontów ani blend z MDF lakierowanego. Fronty i blendy z płyty meblowej są w eksporcie do meble.pl.');
    return;
  }
  const base = safeName(project, 'projekt');
  filesDialog ??= createFilesDialog();
  filesDialog.show({
    title: 'Fronty i blendy z MDF lakierowanego',
    zipName: `${base}_fronty_MDF.zip`,
    intro:
      'Lista w Excelu (wymiary, kolor, frezy, współrzędne otworów) i rysunek każdej pozycji z otworami pod uchwyty i zawiasy — ' +
      'do dołączenia do zamówienia, np. w <a href="https://smartfronty.pl/" target="_blank" rel="noopener">smartfronty.pl</a>. ' +
      'Rodzaj frontu i frezu wybierasz u producenta, wymiary przepisujesz z listy.',
    files: [
      {
        fileName: `${base}_fronty_MDF.xlsx`,
        label: 'Lista frontów i blend (Excel)',
        info: `${items.length} poz., ${items.reduce((s, it) => s + it.qty, 0)} szt.`,
        blob: new Blob([mdfOrderXlsx(project)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        description: 'Arkusz Excel',
      },
      ...items.map((it) => ({
        // nazwa mówi, czego dotyczy plik: front / blenda, numer z listy i wymiary, np. projekt_front_F1_395x717.png
        fileName: `${base}_${it.kind === 'front' ? 'front' : 'blenda'}_${it.no}_${String(it.width).replace('.', ',')}x${String(it.height).replace('.', ',')}.png`,
        label: `${it.kind === 'front' ? 'Front' : 'Blenda'} ${it.no} — rysunek`,
        info: `${it.kind === 'front' ? 'front' : 'blenda'} ${String(it.width).replace('.', ',')} × ${String(it.height).replace('.', ',')} mm, ${it.qty} szt.`,
        blobPromise: svgToPng(mdfDrawingSvg(it)),
        description: 'Obraz PNG',
      })),
    ],
  });
  track('pobranie-frontow-mdf', { pozycje: items.length });
}

// Blaty i płyty z otworami: lista w Excelu i rysunek każdej płyty z góry (wymiary, otwory i wycięcia, frezy krawędzi)
// — do zamówienia docięcia blatu albo do warsztatu.
function downloadWorktops(project) {
  const items = worktopItems(project);
  if (!items.length) {
    alert('Projekt nie ma blatów ani samodzielnych płyt (blatów, półek). Dodasz je w zakładce „Blaty i półki”.');
    return;
  }
  const base = safeName(project, 'projekt');
  const size = (it) => `${String(it.width).replace('.', ',')}x${String(it.depth).replace('.', ',')}`;
  filesDialog ??= createFilesDialog();
  filesDialog.show({
    title: 'Blaty i płyty z otworami',
    zipName: `${base}_blaty.zip`,
    intro:
      'Lista w Excelu (wymiary, materiał, frezy krawędzi, otwory) i rysunek każdej płyty z góry — z wymiarami, ' +
      'położeniem otworów i wycięć oraz frezami krawędzi.',
    files: [
      {
        fileName: `${base}_blaty.xlsx`,
        label: 'Lista blatów i płyt (Excel)',
        info: `${items.length} poz.`,
        blob: new Blob([worktopXlsx(project)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        description: 'Arkusz Excel',
      },
      ...items.map((it) => ({
        // nazwa mówi, czego dotyczy plik, np. projekt_blat_T1_2400x600.png
        fileName: `${base}_${fileSafe(it.kind)}_${it.no}_${size(it)}.png`,
        label: `${it.no} — ${it.name} — rysunek`,
        info: `${it.kind} ${size(it).replace('x', ' × ')} mm${it.holes.length ? `, otwory: ${it.holes.length}` : ''}`,
        blobPromise: svgToPng(worktopDrawingSvg(it)),
        description: 'Obraz PNG',
      })),
    ],
  });
  track('pobranie-blatow', { pozycje: items.length });
}

function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  saveFile(blob, `${safeName(project, 'projekt')}.json`, { description: 'Projekt mebli (JSON)' }).then((saved) => {
    if (saved) track('eksport-projektu-json', { korpusy: project.furniture.length });
  });
}
