import { scrollIntoPanel } from './ui/dom.js';
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
import { initViewportHelp } from './ui/viewportHelp.js';
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
import { onSettingsChange, getSettings, setSettings, DEFAULT_SETTINGS } from './state/settings.js';
import { createUserMenu } from './ui/userMenu.js';
import { createAccount, getProject, saveUserSettings } from './state/account.js';
import { createProjectsDialog } from './ui/projectsDialog.js';
import { createAccountBar } from './ui/accountBar.js';
import { createNotesPanel } from './ui/notesPanel.js';
import { createBoardInspector } from './ui/boardInspector.js';
import { initSpinFromPlaceholder } from './ui/spinFromPlaceholder.js';
import { initInspectorBox } from './ui/inspectorCard.js';
import { initPanelCollapse } from './ui/panelCollapse.js';
import { initAddMenu } from './ui/addMenu.js';
import { initWindowsMenu } from './ui/windowsMenu.js';
import { initProblemsMenu } from './ui/problemsMenu.js';
import { initMapWindow } from './ui/mapWindow.js';
import { initMiniCabinet } from './scene/miniCabinet.js';
import { createDecorInspector } from './ui/decorInspector.js';
import { createDrawerWindow } from './ui/drawerWindow.js';
import { createMultiCabinetWindow } from './ui/multiCabinetWindow.js';
import { createHingeWindow } from './ui/hingeWindow.js';
import { createDecoration } from './model/decorations.js';
import { createDecorAddWindow } from './ui/decorAddWindow.js';
import { initSketchZoom } from './ui/sketchZoom.js';

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
initViewportHelp(document.getElementById('viewport')); // okienko ze skrótami — można je ukryć
initSpinFromPlaceholder(); // strzałki ▲▼ w pustym polu liczą od wartości domyślnej z podpowiedzi
initInspectorBox(document.getElementById('viewport'), () =>
  ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null }),
); // okienko karty zaznaczonego obiektu po prawej (✕ — odznacza obiekt)
initSketchZoom(); // powiększanie szkiców obiektów
initMapWindow(document.getElementById('viewport')); // mapka zabudowy — okienko w lewym górnym rogu
initMiniCabinet(store, ui); // mini-podgląd 3D zaznaczonego korpusu pod mapką — klik zaznacza płytę
createDecorInspector(document.getElementById('viewport'), store, ui); // okienko dekoracji (lampa, kwiatek, okno…)
createDrawerWindow(store, ui); // okienko jednej zaznaczonej szuflady (mini-podgląd 3D, ustawienia)
createMultiCabinetWindow(document.getElementById('viewport'), store, ui); // kilka zaznaczonych korpusów — wspólna edycja
createHingeWindow(store, ui); // okienko zaznaczonego zawiasu drzwi (rodzaj, wysokość)
// okienko „Dekoracje”: wybór i dodawanie (nowa — w sensownym miejscu, od razu zaznaczona — jej ustawienia po prawej)
const decorAdd = createDecorAddWindow(document.getElementById('decor-add-panel'), {
  onAdd: (type) => {
    const d = createDecoration(store.get(), type, { onCabinetId: ui.get().selectedId });
    store.set((p) => ({ ...p, decorations: [...(p.decorations ?? []), d] }));
    ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [`decor:${d.id}`], selectedHole: null, selectedObstacle: null, spaceOpen: false, panelWin: null });
  },
});
ui.subscribe((st) => decorAdd.setOpen(st.panelWin === 'decor'));
document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-side-close]')) ui.set({ ...ui.get(), sideBlendsFor: null }); // ✕ okienka blend bocznych
});
const tabs = initTabs(document.getElementById('tabs'));
const panelCollapse = initPanelCollapse(document.querySelector('.panel'), tabs); // zwijany lewy panel (pasek ikonek)
const spacePanel = createSpacePanel(document.getElementById('space-panel'), store);
// Przestrzeń — okienko po prawej: przycisk 🏠 na pasku zakładek (przełącza), klik w podłogę / ścianę, menu w 3D
// Okienko materiałów / notatek (przyciski na górnym pasku): otwarcie odznacza obiekty i zamyka przestrzeń.
function openPanelWin(name) {
  const st = ui.get();
  ui.set(name ? { ...st, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null, spaceOpen: false, panelWin: name } : { ...st, panelWin: null });
}
document.addEventListener('click', (e) => {
  const open = e.target.closest?.('[data-win-open]')?.dataset.winOpen;
  if (open) openPanelWin(ui.get().panelWin === open ? null : open);
  else if (e.target.closest?.('[data-win-close]')) openPanelWin(null);
});
function openSpace(open = true) {
  const st = ui.get();
  ui.set(open ? { ...st, selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: null, spaceOpen: true, panelWin: null } : { ...st, spaceOpen: false });
}
document.querySelector('[data-open-space]')?.addEventListener('click', () => openSpace(!ui.get().spaceOpen));
document.getElementById('space-panel').addEventListener('click', (e) => {
  if (e.target.closest('[data-space-close]')) openSpace(false);
});
// klik w krótką kartę przeszkody (poza polami) — zaznacza ją (karta pokazuje się po prawej)
document.getElementById('space-panel').addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.item.obstacle');
  if (!card || card.classList.contains('in-inspector') || e.target.closest('input, select, button, [data-collapse-card]')) return;
  ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [], selectedHole: null, selectedObstacle: card.dataset.id });
});
const trimsPanel = createTrimsPanel(document.getElementById('trims-panel'), store, ui, { mode: 'blends' });
// Zakładka „Blaty i półki”: blaty na szafkach (ten sam panel, inne elementy) i samodzielne blaty i półki.
const worktopsPanel = createTrimsPanel(document.getElementById('worktop-trims-panel'), store, ui, { mode: 'worktops' });
const furniturePanel = createFurniturePanel(document.getElementById('furniture-panel'), store, ui, tabs, {
  // „Blat →” — okienko blatu; „Blendy →” — okienko blend bocznych obok okienka korpusu (przełącza)
  onShowWorktop: (trimId) =>
    ui.set({ ...ui.get(), selectedId: null, selectedIds: [], selectedFronts: [], selectedBlends: [`trim:${trimId}`], selectedHole: null, selectedObstacle: null }),
  onShowTrims: (cabinetId) => ui.set({ ...ui.get(), sideBlendsFor: ui.get().sideBlendsFor === cabinetId ? null : cabinetId }),
});
const materialsPanel = createMaterialsPanel(document.getElementById('materials-panel'), store);
// Samodzielne blaty i półki (z frezami i otworami) — w zakładce „Blaty i półki”, pod blatami na szafkach.
const boardsPanel = createBoardsPanel(document.getElementById('boards-panel'), store, ui);
// okienko po prawej stronie widoku 3D z ustawieniami i szkicem zaznaczonej samodzielnej półki / blatu
createBoardInspector(document.getElementById('viewport'), store, ui, {
  onMore: (id) => {
    tabs.activate('worktops-panel');
    boardsPanel.reveal(id);
  },
});
// Notatki projektu — okienko „Notatki” (na przycisku na górnym pasku liczba niezrobionych).
const notesTab = { set textContent(t) { document.querySelectorAll('[data-win-open="notes"]').forEach((b) => (b.textContent = `📝 ${t}`)); } };
const notesPanel = createNotesPanel(document.getElementById('notes-panel'), store, {
  onShowCabinet: (id) => {
    tabs.activate('furniture-panel');
    ui.set({ ...ui.get(), selectedId: id, selectedIds: [id], selectedFronts: [], selectedBlends: [], selectedHole: null }, { reveal: true });
  },
  onCountChange: (open) => {
    if (notesTab) notesTab.textContent = open ? `Notatki (${open})` : 'Notatki';
  },
});
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
initAddMenu(document.getElementById('toolbar'), {
  // dekoracje (tylko wygląd): nowa — w sensownym miejscu, od razu zaznaczona (okienko po prawej)
  // dekoracje — osobne okienko po prawej (kategoria, wyszukiwarka, dekoracja, podgląd 3D)
  extra: [{ title: '', items: [{ label: '🎨 Dekoracje (tylko wygląd)…', run: () => openPanelWin('decor') }] }],
}); // „+ Dodaj ▾” — korpus, półka, blat, blendy, przeszkody, dekoracje
initWindowsMenu(document.getElementById('toolbar'), store, ui, { openSpace: (open) => openSpace(open) });
initProblemsMenu(document.getElementById('toolbar'), store, ui); // „Problemy” — wszystkie błędy i ostrzeżenia // „🏠 Przestrzeń”, „🗄️ Korpusy ▾”

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
materialsPanel.setAccount(account); // materiały zapisane na koncie
// Awatar w prawym górnym rogu (po zalogowaniu) z menu: projekty, ustawienia, wyloguj.
createUserMenu(document.querySelector('.user-slot'), account, {
  onProjects: () => projectsDialog.open(),
  onMaterials: () => {
    openPanelWin('materials');
    scrollIntoPanel(document.querySelector('#materials-panel .material-library'), { block: 'start', behavior: 'smooth' });
  },
  onLogout: () => account.logout().catch((err) => alert(err.message)),
});
// Ustawienia (kolor zaznaczenia, jednostki) zapamiętane na koncie: po zalogowaniu wczytujemy je z konta
// (a gdy konto jeszcze ich nie ma — zapisujemy tam bieżące z przeglądarki); każda zmiana idzie na konto.
let settingsUser = null;
let settingsTimer = null;
const uploadSettings = () => {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveUserSettings(getSettings()).catch((err) => console.warn('Ustawienia na koncie:', err.message)), 800);
};
account.onChange((s) => {
  const email = s.user?.email ?? null;
  if (email === settingsUser) return;
  settingsUser = email;
  if (!s.user) return;
  if (s.user.settings) setSettings({ ...DEFAULT_SETTINGS, ...s.user.settings }, { fromAccount: true });
  else uploadSettings();
});
onSettingsChange((_, meta) => {
  if (account.get().user && !meta?.fromAccount) uploadSettings();
});
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
attachCabinetInteraction(viewer, store, ui, {
  // kształt ścian z menu w 3D: zakładka „Przestrzeń” (z uchwytami kształtu ścian)
  showSpace: () => openSpace(),
});
initShortcuts(store, ui);
initPanelResizer(document.getElementById('panel-resizer'), document.querySelector('.panel'));

// Zaznaczone elementy (wyróżnione na pomarańczowo, z wymiarami): fronty i blendy (boczne „idKorpusu:klucz”, wspólne „trim:id”).
const selectedFronts = () => new Set([...(ui.get().selectedFronts ?? []), ...(ui.get().selectedBlends ?? [])]);
// Otwarcie frontów: pojedynczy front przełączony przeciągnięciem (ui.frontOpen), a domyślnie —
// według przełącznika „otwarte” na pasku.
// zaznaczony zawias — tylko póki zaznaczone są jego drzwi (inne zaznaczenie go „gasi”)
const activeHinge = () => {
  const h = ui.get().selectedHinge;
  return h && (ui.get().selectedFronts ?? []).includes(`${h.cabinetId}:${h.key}`) ? h : null;
};
const isFrontOpen = (id) => ui.get().frontOpen?.[id] ?? store.get().view?.openFronts === true;
const redraw = (refit = false) =>
  viewer.setProject(store.get(), {
    refit,
    selectedIds: selectedCabinetIds(ui.get()),
    selectedFronts: selectedFronts(),
    isFrontOpen,
    selectedHole: ui.get().selectedHole ?? null,
    selectedObstacle: ui.get().selectedObstacle ?? null,
    selectedHinge: activeHinge(),
    // uchwyty kształtu ścian w 3D — gdy otwarte jest okienko „Przestrzeń”
    wallHandles: !!ui.get().spaceOpen && !ui.get().selectedObstacle,
  });
tabs.onChange(() => redraw());
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
  notesPanel.sync(project, meta);
  toolbar.sync(project);
  saveProject(project); // autozapis w przeglądarce
});

// Po zaznaczeniu w 3D frontu, blendy albo nóżek — w panelu po lewej pokazujemy ich ustawienia:
// front → sekcja „Fronty” w karcie korpusu, blenda dolna / górna → karta w „Blendy”, blat → karta w „Blaty i półki”,
// blenda boczna → karta blend bocznych korpusu, nóżki → sekcja „Nóżki” w karcie korpusu.
let lastPicked = null;
let lastFront = null;
let lastObstacle = null;
function revealPicked(id) {
  if (id.startsWith('decor:')) return; // dekoracja — okienko po prawej (ui/decorInspector.js)
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
  // płyta korpusu: półka → sekcja „Półki” (z podświetlonym wierszem), poprzeczka → „Wzmocnienia”,
  // nóżki → „Nóżki”, bok / wieniec / plecy → „Korpus”; blendy i panele boczne → zakładka „Blendy”
  const BLEND_KEYS = ['blendLeft', 'blendRight', 'wallPanelLeft', 'wallPanelRight'];
  if (key === 'legs') furniturePanel.revealSection(cabinetId, 'legs');
  else if (key.startsWith('shelf-')) {
    furniturePanel.revealSection(cabinetId, 'shelves');
    markPickedShelves();
  } else if (key.startsWith('stiff-')) furniturePanel.revealSection(cabinetId, 'stiff');
  else if (key.startsWith('idrawer-')) furniturePanel.revealFront(cabinetId, key); // czoło szuflady wewnętrznej — jej sekcja frontu
  else if (BLEND_KEYS.includes(key)) {
    tabs.activate('trims-panel');
    trimsPanel.reveal(cabinetId);
  } else furniturePanel.revealSection(cabinetId, 'parts'); // płyta korpusu — sekcja „Elementy” (ze szkicem płyty)
}

// Podświetlenie wierszy zaznaczonych półek w karcie korpusu (sekcja „Półki”).
function markPickedShelves() {
  document.querySelectorAll('.shelf-row.picked').forEach((r) => r.classList.remove('picked'));
  for (const b of ui.get().selectedBlends ?? []) {
    const [cabinetId, key] = b.split(':');
    if (!key?.startsWith('shelf-')) continue;
    const i = store.get().furniture.find((c) => c.id === cabinetId)?.shelves.findIndex((s) => `shelf-${s.id}` === key);
    if (i >= 0) document.querySelector(`[data-kind="cabinet"][data-id="${cabinetId}"] .shelf-row[data-shelf="${i}"]`)?.classList.add('picked');
  }
}

ui.subscribe((state, meta) => {
  // zaznaczenie korpusu / frontu / blendy (np. z panelu) — otwór przestaje być zaznaczony
  if (state.selectedHole && (state.selectedId || state.selectedBlends?.length || state.selectedFronts?.length)) {
    ui.set({ ...state, selectedHole: null });
    return;
  }
  // tak samo występ ściany (kominek) — przestaje być zaznaczony
  if (state.selectedObstacle && (state.selectedId || state.selectedBlends?.length || state.selectedFronts?.length || state.selectedHole)) {
    ui.set({ ...state, selectedObstacle: null });
    return;
  }
  // okienko przestrzeni zamyka się przy zaznaczeniu obiektu
  if (state.spaceOpen && (state.selectedId || state.selectedBlends?.length || state.selectedFronts?.length || state.selectedHole || state.selectedObstacle)) {
    ui.set({ ...state, spaceOpen: false });
    return;
  }
  // okienko materiałów / notatek — tak samo (zajmuje to samo miejsce po prawej)
  if (state.panelWin && (state.selectedId || state.selectedBlends?.length || state.selectedFronts?.length || state.selectedHole || state.selectedObstacle || state.spaceOpen)) {
    ui.set({ ...state, panelWin: null });
    return;
  }
  document.querySelectorAll('.win-shell').forEach((w) => w.classList.toggle('open', w.dataset.win === state.panelWin));
  document.querySelectorAll('[data-win-open]').forEach((b) => b.classList.toggle('active', b.dataset.winOpen === state.panelWin));
  document.getElementById('space-panel').classList.toggle('open', !!state.spaceOpen);
  // okienko przestrzeni zamknięte — jego grupy (okienka obok) też
  // (poza zaznaczonym okapem / przeszkodą — jej karta jest w grupie „Przeszkody”)
  if (!state.spaceOpen && !state.selectedObstacle) document.querySelectorAll('#space-panel > details.panel-sec[open]').forEach((d) => (d.open = false));
  document.querySelector('.tabs-space')?.classList.toggle('active', !!state.spaceOpen);
  redraw();
  // zaznaczony występ ściany — jego karta w zakładce „Przestrzeń”
  const obstacle = state.selectedObstacle ?? null;
  if (obstacle && meta?.revealObstacle) spacePanel.reveal(obstacle);
  spacePanel.markPicked(obstacle);
  lastObstacle = obstacle;
  furniturePanel.syncSelection(meta);
  trimsPanel.syncSelection();
  worktopsPanel.syncSelection();
  // ostatnio dodany do zaznaczenia element (klik albo Ctrl + klik)
  const newest = (state.selectedBlends ?? []).at(-1) ?? null;
  // (zaznaczenie kliknięciem w kartę w panelu — karta już widoczna, bez przewijania)
  if (newest && newest !== lastPicked && !meta?.fromPanel) revealPicked(newest);
  lastPicked = newest;
  // zaznaczony front („idKorpusu:front-N”) — sekcja „Fronty” w karcie jego korpusu
  const front = (state.selectedFronts ?? []).at(-1) ?? null;
  if (front && front !== lastFront) furniturePanel.revealFront(...front.split(':'), !!meta?.fromPanel); // sekcja tego frontu w karcie
  lastFront = front;
  // zaznaczony otwór blatu / półki — karta płyty i wiersz otworu w panelu po lewej
  const hole = state.selectedHole;
  const holeKey = hole ? `${hole.kind}:${hole.id}:${hole.index}` : null;
  if (holeKey && holeKey !== lastHole) revealPicked(`${hole.kind}:${hole.id}`);
  lastHole = holeKey;
  markPickedHole();
  markPickedShelves();
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
store.subscribe((project) => {
  // usunięty występ ściany — zaznaczenie znika; po przebudowie panelu karta znów wyróżniona
  const obstacle = ui.get().selectedObstacle;
  if (obstacle && !project.space.obstacles.some((o) => o.id === obstacle)) ui.set({ ...ui.get(), selectedObstacle: null });
  else spacePanel.markPicked(obstacle ?? null);
  // usunięty otwór (albo płyta) — zaznaczenie znika
  const hole = ui.get().selectedHole;
  if (hole) {
    const p = store.get();
    const owner = hole.kind === 'trim' ? p.trims.find((t) => t.id === hole.id) : p.boards?.find((b) => b.id === hole.id);
    if (!owner?.holes?.[hole.index]) return ui.set({ ...ui.get(), selectedHole: null });
  }
  markPickedHole();
  markPickedShelves();
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
