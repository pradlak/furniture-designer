# INSTRUCTIONS.md — mapa projektu dla Claude

Ściąga, żeby szybko zorientować się w kodzie. README.md jest częściowo nieaktualny (opisuje tylko „Etap 1–2”);
ten plik opisuje stan faktyczny. Aktualizuj go przy większych zmianach struktury.

## Co to jest

**Meble Samemu** (meblesamemu.pl) — przeglądarkowy projektant mebli z płyt (Vite + Three.js, czysty JS, bez frameworka,
bez TypeScriptu, bez testów). Użytkownik opisuje przestrzeń (wnęka / poddasze ze skosami, przeszkody), wstawia korpusy,
dodaje fronty, półki, blendy, blaty, nóżki, a na końcu eksportuje **listę formatek do rozkroju** (Excel/CSV, format
meble.pl) i **zamówienie frontów MDF** (Excel + rysunki SVG/PNG). Projekt: autozapis w localStorage, eksport/import
JSON, opcjonalnie konto Google i projekty w chmurze.

Cały interfejs i komentarze w kodzie są **po polsku** — nowe teksty UI i komentarze też piszemy po polsku.
Użytkownik (właściciel) jest Polakiem, początkujący w npm/Vite — tłumaczyć prosto.

## Uruchamianie i publikacja

- `npm run dev` — Vite, http://localhost:5173 (proxy `/api/*` → Worker na :8787, patrz `vite.config.js`).
- `npm run build` — do `dist/`. Szybki test, że nic się nie sypie: `npm run build`.
- Konta lokalnie: `npx wrangler d1 migrations apply meblesamemu --local`, `npm run build`, `npx wrangler dev --port 8787`;
  `.dev.vars` ma `DEV_LOGIN=1` → `/api/auth/dev-login` loguje bez Google (tylko localhost).
  Na Windowsie stare procesy `workerd`/`wrangler` trzeba zabić ręcznie (serwują zepsuty manifest → 404 na `/`).
- Gałęzie: `dev` — praca; `prod` — opublikowana. `npm run deploy` (`scripts/deploy.mjs`) buduje, pushuje dev,
  fast-forward prod, pushuje prod. **Nigdy nie robię `git push` ani `npm run deploy` sam — robi to użytkownik.**
- Hosting: Cloudflare **Worker** (`wrangler.jsonc`) serwuje `dist/` jako assets, `run_worker_first: ["/api/*"]`.
- Nowa tabela/kolumna w D1 → nowy plik `migrations/000N_*.sql` + (użytkownik) `wrangler d1 migrations apply meblesamemu --remote` przed deployem.

## Architektura (przepływ danych)

```
index.html  ── układ strony: pasek (#toolbar), zakładki (Przestrzeń / Meble / Blendy / Blaty i półki / Materiały),
               panele (#space-panel, #furniture-panel, #trims-panel, #worktops-panel + #boards-panel,
               #materials-panel), #viewport (3D)
src/main.js ── spina wszystko:
   store = createStore(project, { history: true })   // projekt (zapisywany, cofnij/ponów)
   ui    = createStore({ selectedId, selectedIds, selectedFronts, selectedBlends, selectedHole, frontOpen })  // niezapisywany
   store.subscribe → redraw 3D (viewer.setProject) + panel.sync(project, meta) każdego panelu + saveProject (localStorage)
                     + account.projectChanged() (autozapis w chmurze, jeśli projekt połączony z kontem)
   ui.subscribe    → redraw + syncSelection paneli + „reveal” (pokaż kartę klikniętego elementu w panelu)
```

- **`src/state/store.js`** — mini-store: `get`, `set(updater, meta)`, `subscribe`, `undo/redo`. Zmiany w ciągu 600 ms
  łączą się w jeden krok cofania. `meta.replace` = pełna podmiana projektu (nowy/import/przykład; odświeża kamerę),
  `meta.undo`, `meta.cloud` (wczytano z konta — nie odłączaj od konta).
- Stan jest **niemutowalny**: zawsze `store.set((p) => ({ ...p, furniture: p.furniture.map(...) }))`.
  Pomocnicze `getPath/setPath` (furniture.js) dla ścieżek typu `fronts.handle.type`.
- **`src/model/`** — czysta logika, bez Three.js i DOM. Tu są wszystkie obliczenia (płyty, kolizje, formatki).
- **`src/scene/`** — Three.js; scena budowana od zera z modelu przy każdym `redraw` (bez diffowania).
- **`src/ui/`** — panele: każdy `createXPanel(root, store, ...)` zwraca `{ sync(project, meta), ... }`;
  HTML generowany stringami, zdarzenia przez delegację (`root.addEventListener('input'|'change'|'click')`),
  pola mają `data-*` (np. `data-kind="cabinet" data-id`, `data-part`, `data-path`). `setIfNotFocused` — nie nadpisuj
  pola, w którym użytkownik pisze.
- **`worker/`** — backend Cloudflare (D1 + Email Routing).

## Układ współrzędnych i jednostki

- Model: **mm**. Przestrzeń: **x** od lewej ściany, **y** od podłogi, **z** od tylnej ściany do przodu (pokoju).
- Pozycja mebla `(x, y, z)` = narożnik lewy-dolny-tylny; `height` korpusu **bez nóżek** (korpus zaczyna się na y + nóżki).
- Scena Three.js: metry; tylna ściana na z = -depth, front przestrzeni na z = 0 — konwersja w `scene/units.js` (`toScene`, `MM`).
- Krawędzie płyty: `xMin/xMax/yMin/yMax/zMin/zMax` (lewa/prawa/dół/góra/tył/przód) — `model/edges.js`.
- Krawędzie blatów/półek (z góry): `front/back/left/right` — `model/boardFeatures.js`.

## Struktura projektu (JSON, `model/project.js`, PROJECT_VERSION = 5)

```
{ version, space, materials[], furniture[] (korpusy), trims[] (blendy dolne/górne, blaty), boards[] (samodzielne płyty), notes[], view }
```

- **space** (`model/space.js`): width/height/depth, które ściany istnieją, kolory, `slopes[]` (skosy — ścianka kolankowa +
  długość/kąt; bryła przycinana płaszczyznami, `slopePlanes`), `obstacles[]`, luzy do sufitu/skosu.
  Przeszkoda `kind: 'wall'` = występ ściany (kominek, filar): rysowana jak ściana, dzieli szerokość na wnęki
  (`wallSegments`, `segmentAt`) — z tego korzystają `fitCabinetToSpace` i `addCabinetToLayout`. Rzut przestrzeni
  to nadal prostokąt; nieregularny kształt = prostokąt + występy ścian. Szablon `alcoves` („Wnęki przy kominku”).
- **materials** (`model/materials.js`): płyty `{ id, name, type (chipboard/mdf/hdf…), thickness, color, edgeBanding, edgeColor, texture }`.
  Korpus odwołuje się przez `materialId` (korpus), `blendMaterialId`, `frontMaterialId`; `colors.{body,blend,front}`
  nadpisują kolor (null = z materiału). Biblioteka materiałów na koncie: `/api/materials`.
- **furniture[]** — korpus (`createCabinet` / `normalizeCabinet` w `model/furniture.js`): wymiary, `backType`, złącza
  wieńców (`bottomJoint/topJoint`), `topType` (pełny / trawersy), `stiffeners[]`, `shelves[]`, `fronts` (drzwi/szuflady,
  szczeliny, uchwyty, frezy uchwytowe, frezy dekoracyjne `decor`, zawiasy), `legs`, `slopeTop` (skośna góra pod skos),
  `ceilingGap`, `backGap`, blendy boczne / panele przy ścianie, **`panelOverrides[key]`** — ręczne zmiany pojedynczej płyty
  (`sx/sy/sz/dx/dy/dz`, `free`, `edgeSet` — ręczny wybór oklejanych krawędzi).
- **`cabinetPanels(cabinet, project)`** — NAJWAŻNIEJSZA funkcja: z korpusu wylicza listę płyt (`PANEL_DEFS`: boki, wieńce,
  trawersy, plecy, blendy, panele, półki, wzmocnienia, fronty) z pudełkami/bryłami (`solid` przy cięciach skośnych).
  Z niej korzystają 3D, kolizje, obrzeże i formatki.
- **trims[]** (`model/trims.js`): `type: plinth | topBlend | countertop`, `cabinetIds[]` (obejmuje kilka korpusów w rzędzie),
  pola auto (`null` = wyliczane — `AUTO_FIELDS`), zapasy na docięcie. Blaty mają też `edges`/`holes` (frezy, otwory).
- **boards[]** (`model/boards.js`): samodzielny blat/półka `{ kind: worktop|shelf, x,y,z, width, depth, materialId, edges, holes }`.
- **notes[]** (`model/notes.js`, panel `ui/notesPanel.js`, zakładka „Notatki”): `{ id, text, cabinetId|null, done, createdAt }`;
  notatka usuniętego korpusu dotyczy całego projektu.
- **view**: przełączniki widoczności (ściany, blaty, blendy, fronty, otwarte fronty, wymiary).

Zgodność wstecz: wszystko przechodzi przez `normalize*` — przy dodawaniu pól dodaj domyślną wartość w normalize,
żeby stare pliki/projekty z chmury się wczytywały.

## Mapa plików — gdzie czego szukać

### model/
| plik | co |
|---|---|
| `furniture.js` (1550 l.) | korpus: stałe (grubości, nóżki, fronty, uchwyty, zawiasy), `createCabinet`, `cabinetPanels`, półki, skosy/sufit (`maxCabinetHeight`, `slopeTopPlane`, `clipBox`), `fitCabinetToSpace`, `resizePanelLinked`, `cabinetIssues` (ostrzeżenia), `normalizeCabinet` |
| `layout.js` | auto-układ w rzędzie: `addCabinetToLayout`, `distributeRow`, zmiany z dopasowaniem rzędu (`updateCabinetRefit`, `updateCabinetKeepingRow`, `setLegs`, `updateSpaceRefit`) |
| `placement.js` | przyciąganie przy przeciąganiu, dosuwanie, duplikowanie |
| `space.js` / `templates.js` | przestrzeń, skosy, przeszkody; szablony „Nowy projekt” (wnęka, poddasze) |
| `trims.js` | blendy dolne/górne i blaty wspólne dla rzędu |
| `boards.js`, `boardFeatures.js` | samodzielne płyty; frezy krawędzi i otwory (blaty, półki) |
| `edges.js` | obrzeże — które krawędzie oklejać (domyślnie widoczne) |
| `materials.js`, `decor.js` | materiały/kolory/faktury; frezy dekoracyjne frontów (odcinki rowków, podgląd SVG) |
| `solid.js` | bryły wypukłe (płyty cięte skośnie) — przycinanie, kolizje, obrys 2D |
| `cutList.js` | formatki: `buildCutList`, CSV, XLSX, eksport meble.pl (`cutListMeblePl`, limity), akcesoria |
| `mdfOrder.js` | zamówienie frontów/blend z MDF (np. smartfronty.pl) + rysunki SVG |
| `xlsx.js` | własny zapis XLSX (ZIP „stored”, bez bibliotek) |
| `example.js`, `examples.js` | przykładowe projekty (galeria, linki `?przyklad=kuchnia|szafa|poddasze|regal|komoda|blat`) |
| `project.js` | struktura projektu, normalize, localStorage (`furnitureDesigner.project`) |

### scene/
`Viewer.js` (renderer, kamera, widoki 3D/przód/góra/bok), `buildFurniture.js` (geometria mebli, otwieranie frontów),
`buildSpace.js`, `polyhedron.js` (bryła przestrzeni przycinana skosami), `slab.js` (płyty z otworami/frezami),
`dimensions.js` + `furnitureDims.js` (linie wymiarowe), `textures.js` (faktury z canvasa), `interaction.js`
(mysz: zaznaczanie, przeciąganie korpusów/półek/frontów, menu kontekstowe).

### ui/
`furniturePanel.js` (1300 l., zakładka Meble — karta korpusu z sekcjami), `trimsPanel.js` (dwa egzemplarze:
`mode: 'blends'` i `mode: 'worktops'`), `sideBlends.js`, `boardsPanel.js` + `boardFeaturesEditor.js`, `spacePanel.js`,
`materialsPanel.js`, `toolbar.js` (nowy/import/eksport/formatki/widoki/cofnij), `cutListDialog.js`, `filesDialog.js`,
`saveFile.js`, okienka (`welcome`, `newProject`, `examples`, `feedbackDialog`, `settingsDialog`, `legsDialog`,
`projectsDialog`), konto (`userMenu`, `accountBar`), drobne (`dom.js`, `widgets.js`, `collapsible.js`, `tabs.js`,
`shortcuts.js`, `mathInputs.js` — działania w polach liczbowych, `sizeNotices.js`, `resizer.js`, `pictures.js`).

### state/
`store.js`, `selection.js` (zaznaczenie wielu korpusów Ctrl+klik), `settings.js` (kolor zaznaczenia, jednostki —
per osoba, nie w projekcie), `account.js` (API klienta, połączenie projektu z kontem, autozapis z debounce, konflikty 409).

### worker/ (Cloudflare)
`index.js` — router: `POST /api/uwagi` (mail przez Email Routing, binding `FEEDBACK`), reszta → `auth.js`
(Google OAuth, sesje w ciasteczku, hash tokenu w D1, `/api/me`, usuwanie konta), `projects.js` (CRUD, wykrywanie
konfliktu po `baseUpdatedAt`), `materials.js`; `util.js` (json, cookie, CSRF `sameOrigin`). Schemat: `migrations/`.

### public/
Statyczne strony SEO: `o-programie.html`, `polityka-prywatnosci.html`, `poradniki/*.html`, `strony.css`,
`sitemap.xml`, `robots.txt`, obrazek `og-image-2.png`.

## Słowniczek (pojęcia stolarskie w kodzie)

korpus — skrzynia szafki · bok — ściana boczna · wieniec dolny/górny — poziome płyty dna/góry · trawers — wąska listwa
zamiast pełnego wieńca · plecy — tył (HDF 3 mm nakładane lub płyta wpuszczana) · front — drzwi/szuflada ·
blenda — zaślepka: dolna (cokół), górna (pod sufit), boczna (przy ścianie) · panel (przy ścianie / boczny) ·
blat · formatka — prostokąt do cięcia z płyty · rozkrój — cięcie płyt · obrzeże — taśma na krawędzi ·
frez — wyfrezowanie (uchwytowy, dekoracyjny, krawędzi) · skos — skośny sufit poddasza · ścianka kolankowa ·
wzmocnienie (stiffener) · nóżki · zawias (puszka 35 mm) · rozstaw uchwytu.

## Zasady pracy

- Logika do `model/`, widok do `scene/`, formularze do `ui/` — model nie importuje DOM/Three.js.
- Unikaj cykli importów (np. `materials.js` celowo nie importuje `furniture.js`).
- Każda zmiana projektu przez `store.set` (inaczej nie ma cofania, autozapisu i odświeżenia).
- Nowe pole w projekcie → domyślna wartość + `normalize*` (stare pliki JSON i projekty na koncie).
- Po zmianach: `npm run build`; najlepiej sprawdzić w przeglądarce (`npm run dev`).
- Commity po polsku, krótko, w stylu historii repo. Bez push/deploy.
- Otwarte tematy i ustalenia z użytkownikiem — w pamięci Claude (MEMORY.md), nie tutaj.
