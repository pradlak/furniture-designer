import './style.css';
import { createStore } from './state/store.js';
import { createDefaultProject, loadProject, saveProject } from './model/project.js';
import { Viewer } from './scene/Viewer.js';
import { attachCabinetInteraction } from './scene/interaction.js';
import { createSpacePanel } from './ui/spacePanel.js';
import { createFurniturePanel } from './ui/furniturePanel.js';
import { createMaterialsPanel } from './ui/materialsPanel.js';
import { createTrimsPanel } from './ui/trimsPanel.js';
import { createToolbar } from './ui/toolbar.js';
import { initTabs } from './ui/tabs.js';
import { initShortcuts } from './ui/shortcuts.js';
import { initPanelResizer } from './ui/resizer.js';
import { createWelcome } from './ui/welcome.js';
import { createNewProjectDialog } from './ui/newProject.js';
import { createExamplesDialog } from './ui/examples.js';

// Projekt (zapisywany, z historią cofania) i stan interfejsu (zaznaczenie — nie zapisywany).
const savedProject = loadProject();
const store = createStore(savedProject ?? createDefaultProject(), { history: true });
// Pierwsze uruchomienie (brak zapisanego projektu): wybór rodzaju przestrzeni jak po „Nowy…”.
const firstRun = !savedProject;
const ui = createStore({ selectedId: null });

const viewer = new Viewer(document.getElementById('viewport'));
const tabs = initTabs(document.getElementById('tabs'));
const spacePanel = createSpacePanel(document.getElementById('space-panel'), store);
const trimsPanel = createTrimsPanel(document.getElementById('trims-panel'), store, ui);
const furniturePanel = createFurniturePanel(document.getElementById('furniture-panel'), store, ui, tabs, {
  onShowTrims: (cabinetId) => {
    tabs.activate('trims-panel');
    trimsPanel.reveal(cabinetId);
  },
});
const materialsPanel = createMaterialsPanel(document.getElementById('materials-panel'), store);
const examples = createExamplesDialog(store);
const newProject = createNewProjectDialog(store, { onExamples: () => examples.open() });
let templateOffered = false;
const offerTemplate = () => {
  if (!firstRun || templateOffered) return;
  templateOffered = true;
  newProject.open();
};
const welcome = createWelcome(store, {
  // karta na ekranie powitalnym — okienko „Nowy projekt” z zaznaczonym szablonem
  onNew: (templateKey) => {
    templateOffered = true;
    newProject.open(templateKey);
  },
  onStart: offerTemplate,
  onExamples: () => {
    templateOffered = true;
    examples.open();
  },
});
// Okienko powitalne już kiedyś zamknięte — wybór przestrzeni od razu.
if (!welcome.isOpen()) offerTemplate();
const toolbar = createToolbar(document.getElementById('toolbar'), store, viewer, {
  onHelp: () => welcome.open(),
  onNew: () => newProject.open(),
});
attachCabinetInteraction(viewer, store, ui);
initShortcuts(store, ui);
initPanelResizer(document.getElementById('panel-resizer'), document.querySelector('.panel'));

// Zaznaczone fronty (kliknięte w 3D, z Ctrl — kilka) — wyróżnione: zbiór „idKorpusu:front-N”.
const selectedFronts = () => new Set(ui.get().selectedFronts ?? []);
// Otwarcie frontów: pojedynczy front przełączony przeciągnięciem (ui.frontOpen), a domyślnie —
// według przełącznika „otwarte” na pasku.
const isFrontOpen = (id) => ui.get().frontOpen?.[id] ?? store.get().view?.openFronts === true;
const redraw = (refit = false) =>
  viewer.setProject(store.get(), { refit, selectedId: ui.get().selectedId, selectedFronts: selectedFronts(), isFrontOpen });
redraw();

let lastOpenFronts = store.get().view?.openFronts === true;
store.subscribe((project, meta) => {
  // Usunięty korpus nie może pozostać zaznaczony.
  const { selectedId } = ui.get();
  if (selectedId && !project.furniture.some((c) => c.id === selectedId)) ui.set({ ...ui.get(), selectedId: null });
  // Przełącznik „otwarte” otwiera / zamyka wszystkie fronty — zapominamy pojedyncze przełączenia.
  const openFronts = project.view?.openFronts === true;
  if (openFronts !== lastOpenFronts) {
    lastOpenFronts = openFronts;
    ui.set({ ...ui.get(), frontOpen: {} });
  }

  redraw(meta.replace && !meta.undo);
  spacePanel.sync(project, meta);
  furniturePanel.sync(project, meta);
  trimsPanel.sync(project, meta);
  materialsPanel.sync(project, meta);
  toolbar.sync(project);
  saveProject(project); // autozapis w przeglądarce
});

ui.subscribe((_state, meta) => {
  redraw();
  furniturePanel.syncSelection(meta);
  trimsPanel.syncSelection();
});
