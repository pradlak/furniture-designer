import './style.css';
import { createStore } from './state/store.js';
import { createDefaultProject, loadProject, saveProject, normalizeProject } from './model/project.js';
import { Viewer } from './scene/Viewer.js';
import { attachCabinetInteraction } from './scene/interaction.js';
import { createSpacePanel } from './ui/spacePanel.js';
import { createFurniturePanel } from './ui/furniturePanel.js';
import { createBoardsPanel } from './ui/boardsPanel.js';
import { createMaterialsPanel } from './ui/materialsPanel.js';
import { createTrimsPanel } from './ui/trimsPanel.js';
import { createToolbar } from './ui/toolbar.js';
import { initTabs } from './ui/tabs.js';
import { initShortcuts } from './ui/shortcuts.js';
import { initPanelResizer } from './ui/resizer.js';
import { createWelcome } from './ui/welcome.js';
import { createNewProjectDialog } from './ui/newProject.js';
import { createExamplesDialog } from './ui/examples.js';
import { EXAMPLES } from './model/examples.js';
import { initMathInputs } from './ui/mathInputs.js';
import { selectedCabinetIds } from './state/selection.js';
import { initSizeNotices } from './ui/sizeNotices.js';
import { createFeedbackDialog } from './ui/feedbackDialog.js';
import { createSettingsDialog } from './ui/settingsDialog.js';
import { onSettingsChange } from './state/settings.js';
import { createAccount, getProject } from './state/account.js';
import { createProjectsDialog } from './ui/projectsDialog.js';
import { createAccountBar } from './ui/accountBar.js';

// Działania w polach liczbowych (np. 1100-70 → 1030).
initMathInputs();

// Projekt (zapisywany, z historią cofania) i stan interfejsu (zaznaczenie — nie zapisywany).
const savedProject = loadProject();
const store = createStore(savedProject ?? createDefaultProject(), { history: true });
// Komunikat, gdy rozmiar korpusu zmienia się przy okazji innej zmiany (np. odstęp od ściany → głębokość).
initSizeNotices(store);
// Pierwsze uruchomienie (brak zapisanego projektu): wybór rodzaju przestrzeni jak po „Nowy…”.
const firstRun = !savedProject;
const ui = createStore({ selectedId: null });

const viewer = new Viewer(document.getElementById('viewport'));
const tabs = initTabs(document.getElementById('tabs'));
const spacePanel = createSpacePanel(document.getElementById('space-panel'), store);
const trimsPanel = createTrimsPanel(document.getElementById('trims-panel'), store, ui, { mode: 'blends' });
// Zakładka „Blaty i półki”: blaty na szafkach (ten sam panel, inne elementy) i samodzielne blaty i półki.
const worktopsPanel = createTrimsPanel(document.getElementById('worktop-trims-panel'), store, ui, { mode: 'worktops' });
const furniturePanel = createFurniturePanel(document.getElementById('furniture-panel'), store, ui, tabs, {
  onShowWorktop: (trimId) => {
    tabs.activate('worktops-panel');
    worktopsPanel.revealTrim(trimId);
  },
  onShowTrims: (cabinetId) => {
    tabs.activate('trims-panel');
    trimsPanel.reveal(cabinetId);
  },
});
const materialsPanel = createMaterialsPanel(document.getElementById('materials-panel'), store);
// Samodzielne blaty i półki (z frezami i otworami) — w zakładce „Blaty i półki”, pod blatami na szafkach.
const boardsPanel = createBoardsPanel(document.getElementById('boards-panel'), store);
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
// Link prosto do przykładu, np. meblesamemu.pl/?przyklad=szafa — otwiera gotowy projekt (do postów, poradników).
// Gdy ktoś ma już własny projekt, pytamy, czy go zastąpić. Parametr znika z adresu (odświeżenie nie wczytuje
// przykładu ponownie).
const EXAMPLE_LINKS = { kuchnia: 'kitchen', szafa: 'wardrobe', poddasze: 'attic', regal: 'bookcase', 'regał': 'bookcase', komoda: 'chest', blat: 'worktop' };
const exampleParam = new URLSearchParams(location.search).get('przyklad')?.toLowerCase();
const linkedExample = exampleParam && EXAMPLES.find((ex) => ex.key === (EXAMPLE_LINKS[exampleParam] ?? exampleParam));
// Sam przykład wczytujemy na końcu (pendingExample), gdy panele i widok już nasłuchują zmian projektu.
let pendingExample = null;
if (linkedExample) {
  const hasOwnProject = !!savedProject && savedProject.furniture.length > 0;
  if (!hasOwnProject || confirm(`Otworzyć przykład „${linkedExample.label}”? Twój bieżący projekt zostanie zastąpiony — jeśli chcesz go zachować, kliknij Anuluj i najpierw użyj „Eksportuj”.`)) {
    pendingExample = linkedExample;
    welcome.hide();
    templateOffered = true;
  }
  const url = new URL(location.href);
  url.searchParams.delete('przyklad');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
// Okienko powitalne już kiedyś zamknięte — wybór przestrzeni od razu.
if (!welcome.isOpen()) offerTemplate();
// Uwagi i propozycje (formularz → mail do autora) — z paska i z menu w rogu podglądu 3D.
const feedback = createFeedbackDialog();
// Ustawienia programu (kolor zaznaczenia, jednostki) — po zmianie widok 3D rysuje się na nowo.
const settingsDialog = createSettingsDialog();
document.querySelector('[data-open-feedback]')?.addEventListener('click', () => {
  document.querySelector('.site-menu-root')?.removeAttribute('open');
  feedback.open();
});
const toolbar = createToolbar(document.getElementById('toolbar'), store, viewer, {
  onHelp: () => welcome.open(),
  onNew: () => newProject.open(),
  onFeedback: () => feedback.open(),
  onSettings: () => settingsDialog.open(),
});

// --- Konto (logowanie przez Google) i projekty w chmurze ---
// Zmiana projektu z innego urządzenia: pytamy, którą wersję zostawić.
async function loadCloudVersion() {
  const link = account.get().link;
  if (!link) return;
  const p = await account.open(link.id);
  store.set(normalizeProject(p.data), { replace: true, cloud: true });
}
const account = createAccount(store, {
  onConflict: () => {
    const takeServer = confirm(
      'Ten projekt zmieniono na innym urządzeniu.\n\n' +
        'OK — wczytaj wersję z konta (zmiany zrobione tutaj od ostatniego zapisu przepadną).\n' +
        'Anuluj — zapisz wersję z tego urządzenia (zastąpi tamtą).',
    );
    if (takeServer) loadCloudVersion().catch((err) => alert(err.message));
    else account.overwrite();
  },
});
const projectsDialog = createProjectsDialog(store, account);
createAccountBar(document.querySelector('.account-group'), account, { onOpen: () => projectsDialog.open() });
// Zamykanie strony w trakcie zapisu — ostrzeżenie (zmiany mogłyby nie trafić na konto).
window.addEventListener('beforeunload', (e) => {
  if (['pending', 'saving'].includes(account.get().saveStatus)) e.preventDefault();
});
account.refresh().then(async () => {
  const params = new URLSearchParams(location.search);
  const login = params.get('logowanie');
  if (login) {
    params.delete('logowanie');
    params.delete('powod');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
    if (login === 'ok') {
      // po zalogowaniu — lista projektów (i zapis bieżącego); bez okienek powitania / wyboru przestrzeni
      welcome.hide();
      templateOffered = true;
      document.querySelectorAll('.welcome-overlay').forEach((o) => (o.hidden = true));
      projectsDialog.open();
    }
    else alert('Nie udało się zalogować. Spróbuj ponownie.');
  }
  // Projekt połączony z kontem: gdy na koncie jest nowsza wersja (zmiana na innym urządzeniu) — proponujemy ją.
  const { user, link } = account.get();
  if (user && link) {
    try {
      const p = await getProject(link.id);
      if (p.updatedAt > link.updatedAt && confirm(`Na koncie jest nowsza wersja projektu „${p.name}” (zmieniona na innym urządzeniu). Wczytać ją?`)) {
        await loadCloudVersion();
      }
    } catch (err) {
      if (err.status === 404) account.unlink();
    }
  } else if (!user && link) {
    account.unlink(); // wylogowano (np. sesja wygasła) — projekt zostaje w przeglądarce
  }
});
attachCabinetInteraction(viewer, store, ui);
initShortcuts(store, ui);
initPanelResizer(document.getElementById('panel-resizer'), document.querySelector('.panel'));

// Zaznaczone elementy (wyróżnione na pomarańczowo, z wymiarami): fronty i blendy (boczne „idKorpusu:klucz”, wspólne „trim:id”).
const selectedFronts = () => new Set([...(ui.get().selectedFronts ?? []), ...(ui.get().selectedBlends ?? [])]);
// Otwarcie frontów: pojedynczy front przełączony przeciągnięciem (ui.frontOpen), a domyślnie —
// według przełącznika „otwarte” na pasku.
const isFrontOpen = (id) => ui.get().frontOpen?.[id] ?? store.get().view?.openFronts === true;
const redraw = (refit = false) =>
  viewer.setProject(store.get(), { refit, selectedIds: selectedCabinetIds(ui.get()), selectedFronts: selectedFronts(), isFrontOpen, selectedHole: ui.get().selectedHole ?? null });
onSettingsChange(() => redraw());
redraw();

let lastOpenFronts = store.get().view?.openFronts === true;
store.subscribe((project, meta) => {
  // Konto: nowy / zaimportowany projekt nie jest już tym z konta; zwykła zmiana (i cofnij) — autozapis.
  if (meta.replace && !meta.undo && !meta.cloud) account.unlink();
  else if (!meta.cloud) account.projectChanged();
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
  boardsPanel.sync(project, meta);
  trimsPanel.sync(project, meta);
  worktopsPanel.sync(project, meta);
  materialsPanel.sync(project, meta);
  toolbar.sync(project);
  saveProject(project); // autozapis w przeglądarce
});

// Po zaznaczeniu w 3D frontu, blendy albo nóżek — w panelu po lewej pokazujemy ich ustawienia:
// front → sekcja „Fronty” w karcie korpusu, blenda dolna / górna → karta w „Blendy”, blat → karta w „Blaty i półki”,
// blenda boczna → karta blend bocznych korpusu, nóżki → sekcja „Nóżki” w karcie korpusu.
let lastPicked = null;
let lastFront = null;
function revealPicked(id) {
  if (id.startsWith('board:')) {
    // samodzielny blat / półka → karta w zakładce „Blaty i półki”
    tabs.activate('worktops-panel');
    boardsPanel.reveal(id.slice(6));
    return;
  }
  if (id.startsWith('trim:')) {
    // blat → zakładka „Blaty i półki”, blenda dolna / górna → „Blendy”
    const trim = store.get().trims.find((t) => t.id === id.slice(5));
    if (trim?.type === 'countertop') {
      tabs.activate('worktops-panel');
      worktopsPanel.revealTrim(trim.id);
    } else {
      tabs.activate('trims-panel');
      trimsPanel.revealTrim(id.slice(5));
    }
    return;
  }
  const [cabinetId, key] = id.split(':');
  if (key === 'legs') furniturePanel.revealSection(cabinetId, 'legs');
  else {
    tabs.activate('trims-panel');
    trimsPanel.reveal(cabinetId);
  }
}

ui.subscribe((state, meta) => {
  // zaznaczenie korpusu / frontu / blendy (np. z panelu) — otwór przestaje być zaznaczony
  if (state.selectedHole && (state.selectedId || state.selectedBlends?.length || state.selectedFronts?.length)) {
    ui.set({ ...state, selectedHole: null });
    return;
  }
  redraw();
  furniturePanel.syncSelection(meta);
  trimsPanel.syncSelection();
  worktopsPanel.syncSelection();
  // ostatnio dodany do zaznaczenia element (klik albo Ctrl + klik)
  const newest = (state.selectedBlends ?? []).at(-1) ?? null;
  if (newest && newest !== lastPicked) revealPicked(newest);
  lastPicked = newest;
  // zaznaczony front („idKorpusu:front-N”) — sekcja „Fronty” w karcie jego korpusu
  const front = (state.selectedFronts ?? []).at(-1) ?? null;
  if (front && front !== lastFront) furniturePanel.revealSection(front.split(':')[0], 'fronts');
  lastFront = front;
  // zaznaczony otwór blatu / półki — karta płyty i wiersz otworu w panelu po lewej
  const hole = state.selectedHole;
  const holeKey = hole ? `${hole.kind}:${hole.id}:${hole.index}` : null;
  if (holeKey && holeKey !== lastHole) revealPicked(`${hole.kind}:${hole.id}`);
  lastHole = holeKey;
  markPickedHole();
});
let lastHole = null;
// Wyróżnienie wiersza zaznaczonego otworu w karcie blatu / płyty (także po przebudowie listy otworów).
function markPickedHole() {
  const hole = ui.get().selectedHole;
  document.querySelectorAll('.bf-hole.picked').forEach((r) => r.classList.remove('picked'));
  if (!hole) return;
  const card = document.querySelector(`[data-kind="${hole.kind === 'trim' ? 'trim' : 'board'}"][data-id="${hole.id}"]`);
  card?.querySelector(`.bf-hole[data-hole="${hole.index}"]`)?.classList.add('picked');
}
store.subscribe(() => {
  // usunięty otwór (albo płyta) — zaznaczenie znika
  const hole = ui.get().selectedHole;
  if (hole) {
    const p = store.get();
    const owner = hole.kind === 'trim' ? p.trims.find((t) => t.id === hole.id) : p.boards?.find((b) => b.id === hole.id);
    if (!owner?.holes?.[hole.index]) return ui.set({ ...ui.get(), selectedHole: null });
  }
  markPickedHole();
});

// Menu w rogu podglądu 3D (o programie, poradniki): zamyka się po kliknięciu obok albo Esc.
const siteMenu = document.querySelector('.site-menu-root');
if (siteMenu) {
  document.addEventListener('pointerdown', (e) => {
    if (siteMenu.open && !siteMenu.contains(e.target)) siteMenu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && siteMenu.open) siteMenu.open = false;
  });
}

// Przykład z linku (?przyklad=…) — teraz, gdy wszystko nasłuchuje zmian projektu.
if (pendingExample) store.set(pendingExample.create(), { replace: true });

// Kliknięcie w wiersz otworu w karcie blatu / płyty — zaznacza ten otwór w 3D.
document.addEventListener('focusin', (e) => {
  const row = e.target.closest?.('.bf-hole[data-hole]');
  const card = row?.closest('[data-kind="trim"], [data-kind="board"]');
  if (!card) return;
  const selectedHole = { kind: card.dataset.kind, id: card.dataset.id, index: Number(row.dataset.hole) };
  const cur = ui.get().selectedHole;
  if (cur?.kind === selectedHole.kind && cur.id === selectedHole.id && cur.index === selectedHole.index) return;
  lastHole = `${selectedHole.kind}:${selectedHole.id}:${selectedHole.index}`; // karta już widoczna — bez przewijania
  ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole });
});
