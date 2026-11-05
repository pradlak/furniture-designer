import './style.css';
import { createStore } from './state/store.js';
import { createDefaultProject, loadProject, saveProject } from './model/project.js';
import { Viewer } from './scene/Viewer.js';
import { createSpacePanel } from './ui/spacePanel.js';
import { createFurniturePanel } from './ui/furniturePanel.js';
import { createToolbar } from './ui/toolbar.js';
import { initTabs } from './ui/tabs.js';

const store = createStore(loadProject() ?? createDefaultProject());

const viewer = new Viewer(document.getElementById('viewport'));
const spacePanel = createSpacePanel(document.getElementById('space-panel'), store);
const furniturePanel = createFurniturePanel(document.getElementById('furniture-panel'), store);
const toolbar = createToolbar(document.getElementById('toolbar'), store, viewer);
initTabs(document.getElementById('tabs'));

viewer.setProject(store.get());

store.subscribe((project, meta) => {
  viewer.setProject(project, { refit: meta.replace });
  spacePanel.sync(project, meta);
  furniturePanel.sync(project, meta);
  toolbar.sync(project);
  saveProject(project); // autozapis w przeglądarce
});
