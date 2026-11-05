import { createDefaultProject, normalizeProject } from '../model/project.js';

const VIEWS = [
  { key: 'perspective', label: '3D' },
  { key: 'front', label: 'Przód' },
  { key: 'top', label: 'Góra' },
  { key: 'side', label: 'Bok' },
];

export function createToolbar(root, store, viewer) {
  root.innerHTML = `
    <div class="brand">Projektant mebli</div>
    <div class="group">
      <button type="button" data-action="new">Nowy</button>
      <button type="button" data-action="import">Importuj…</button>
      <button type="button" data-action="export">Eksportuj</button>
      <input type="file" accept="application/json,.json" hidden />
    </div>
    <div class="group">
      <span class="group-label">Widok:</span>
      ${VIEWS.map((v) => `<button type="button" data-view="${v.key}">${v.label}</button>`).join('')}
    </div>
    <div class="group">
      <label class="check">
        <input type="checkbox" data-action="toggle-walls" />
        Pokaż ściany
      </label>
    </div>
  `;

  const fileInput = root.querySelector('input[type="file"]');
  const wallsToggle = root.querySelector('[data-action="toggle-walls"]');

  root.addEventListener('click', (e) => {
    const { action, view } = e.target.dataset ?? {};
    if (view) viewer.setView(view);
    if (action === 'new' && confirm('Utworzyć nowy projekt? Bieżące zmiany zostaną utracone.')) {
      store.set(createDefaultProject(), { replace: true });
    }
    if (action === 'export') exportProject(store.get());
    if (action === 'import') fileInput.click();
  });

  wallsToggle.addEventListener('change', () => {
    store.set((p) => ({ ...p, view: { ...p.view, showWalls: wallsToggle.checked } }));
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const project = normalizeProject(JSON.parse(await file.text()));
      store.set(project, { replace: true });
    } catch (err) {
      alert(`Nie udało się wczytać projektu: ${err.message}`);
    }
  });

  const sync = (project) => {
    wallsToggle.checked = project.view.showWalls;
  };
  sync(store.get());
  return { sync };
}

function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(project.space.name || 'projekt').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
