import './style.css';
import { createStore } from './state/store.js';
import { createDefaultProject, loadProject, saveProject } from './model/project.js';
import { Viewer } from './scene/Viewer.js';
import { attachCabinetInteraction } from './scene/interaction.js';
import { createSpacePanel } from './ui/spacePanel.js';
import { createFurniturePanel } from './ui/furniturePanel.js';
import { createMaterialsPanel } from './ui/materialsPanel.js';
import { createToolbar } from './ui/toolbar.js';
import { initTabs } from './ui/tabs.js';
import { initShortcuts } from './ui/shortcuts.js';

// Projekt (zapisywany, z historią cofania) i stan interfejsu (zaznaczenie — nie zapisywany).
const store = createStore(loadProject() ?? createDefaultProject(), { history: true });
const ui = createStore({ selectedId: null });

const viewer = new Viewer(document.getElementById('viewport'));
const tabs = initTabs(document.getElementById('tabs'));
const spacePanel = createSpacePanel(document.getElementById('space-panel'), store);
const furniturePanel = createFurniturePanel(document.getElementById('furniture-panel'), store, ui, tabs);
const materialsPanel = createMaterialsPanel(document.getElementById('materials-panel'), store);
const toolbar = createToolbar(document.getElementById('toolbar'), store, viewer);
attachCabinetInteraction(viewer, store, ui);
initShortcuts(store, ui);

const redraw = (refit = false) => viewer.setProject(store.get(), { refit, selectedId: ui.get().selectedId });
redraw();

store.subscribe((project, meta) => {
  // Usunięty korpus nie może pozostać zaznaczony.
  const { selectedId } = ui.get();
  if (selectedId && !project.furniture.some((c) => c.id === selectedId)) ui.set({ ...ui.get(), selectedId: null });

  redraw(meta.replace && !meta.undo);
  spacePanel.sync(project, meta);
  furniturePanel.sync(project, meta);
  materialsPanel.sync(project, meta);
  toolbar.sync(project);
  saveProject(project); // autozapis w przeglądarce
});

ui.subscribe((_state, meta) => {
  redraw();
  furniturePanel.syncSelection(meta);
});
