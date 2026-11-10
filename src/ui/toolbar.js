import { createDefaultProject, normalizeProject } from '../model/project.js';
import { cutListCsv } from '../model/cutList.js';

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
      <button type="button" data-action="new" title="Nowy projekt — wnęka prostokątna albo poddasze ze skosem">Nowy…</button>
      <button type="button" data-action="import">Importuj…</button>
      <button type="button" data-action="export">Eksportuj</button>
      <input type="file" accept="application/json,.json" hidden />
      <button type="button" data-action="cut-list" title="Lista płyt do rozkroju — plik CSV (Excel)">⬇ Formatki (CSV)</button>
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
      <label class="check"><input type="checkbox" data-view-flag="showCountertops" /> Blaty</label>
      <label class="check"><input type="checkbox" data-view-flag="showBlends" /> Blendy</label>
    </div>
    <div class="group help-group">
      <button type="button" data-action="help" title="Jak zacząć">?</button>
    </div>
  `;

  const fileInput = root.querySelector('input[type="file"]');
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
    if (action === 'cut-list') downloadCutList(store.get());
    if (action === 'help') onHelp?.();
  });

  for (const box of viewFlags) {
    box.addEventListener('change', () => {
      store.set((p) => ({ ...p, view: { ...p.view, [box.dataset.viewFlag]: box.checked } }));
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
    for (const box of viewFlags) box.checked = project.view[box.dataset.viewFlag] !== false;
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
  };
  sync(store.get());
  return { sync };
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

function downloadCutList(project) {
  if (!project.furniture.length) {
    alert('Projekt nie ma jeszcze żadnych mebli — dodaj korpus w zakładce „Meble”.');
    return;
  }
  const blob = new Blob([cutListCsv(project)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(project, 'projekt')}_formatki.csv`;
  a.click();
  URL.revokeObjectURL(url);
  track('pobranie-formatek-csv', { korpusy: project.furniture.length });
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
