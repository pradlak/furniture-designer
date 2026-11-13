import { createDefaultProject, normalizeProject } from '../model/project.js';
import { cutListCsv, cutListXlsx } from '../model/cutList.js';
import { createCutListDialog } from './cutListDialog.js';

const VIEWS = [
  { key: 'perspective', label: '3D' },
  { key: 'front', label: 'Przód' },
  { key: 'top', label: 'Góra' },
  { key: 'side', label: 'Bok' },
];

// onHelp — otwiera okienko „Jak zacząć”; onNew — okienko „Nowy projekt” (wybór szablonu przestrzeni).
export function createToolbar(root, store, viewer, { onHelp, onNew } = {}) {
  root.innerHTML = `
    <div class="brand">Projektant mebli</div>
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
    <div class="group">
      <span class="group-label">Pokaż:</span>
      <label class="check"><input type="checkbox" data-view-flag="showWalls" /> Ściany</label>
      <label class="check" title="Wymiary zaznaczonego korpusu: nóżki, korpus, razem, szerokość, głębokość"><input type="checkbox" data-view-flag="showDims" /> Wymiary</label>
      <label class="check"><input type="checkbox" data-view-flag="showCountertops" /> Blaty</label>
      <label class="check"><input type="checkbox" data-view-flag="showBlends" /> Blendy</label>
      <label class="check" title="Ukryj fronty, żeby zajrzeć do wnętrza korpusów (np. przesunąć półkę)"><input type="checkbox" data-view-flag="showFronts" /> Fronty</label>
      <label class="check" title="Otwórz drzwi i wysuń szuflady — żeby zobaczyć, co jest w środku (tylko widok)"><input type="checkbox" data-view-flag="openFronts" data-default-off /> otwarte</label>
    </div>
    <div class="group help-group">
      <button type="button" data-action="help" title="Jak zacząć">?</button>
    </div>
  `;

  const fileInput = root.querySelector('input[type="file"]');
  // okienko „Formatki”: format i zakres eksportu
  const cutListDialog = createCutListDialog({ onExport: (options) => downloadCutList(store.get(), options) });
  const viewFlags = [...root.querySelectorAll('[data-view-flag]')];

  root.addEventListener('click', (e) => {
    const { action, view } = e.target.dataset ?? {};
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
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
  };
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
  const xlsx = format === 'xlsx';
  const options = { parts, accessories };
  const blob = xlsx
    ? new Blob([cutListXlsx(project, options)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new Blob([cutListCsv(project, options)], { type: 'text/csv;charset=utf-16le' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project, 'projekt')}_formatki.${xlsx ? 'xlsx' : 'csv'}`;
  a.click();
  URL.revokeObjectURL(url);
  track(xlsx ? 'pobranie-formatek-xlsx' : 'pobranie-formatek-csv', { korpusy: project.furniture.length, zakres: [...parts, ...(accessories ? ['akcesoria'] : [])].join(',') });
}

function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project, 'projekt')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  track('eksport-projektu-json', { korpusy: project.furniture.length });
}
