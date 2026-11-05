# Projektant mebli

Przeglądarkowa aplikacja do projektowania mebli (Vite + Three.js, czysty JavaScript).

## Uruchomienie

```bash
npm install
npm run dev      # serwer deweloperski, http://localhost:5173
npm run build    # wersja produkcyjna do katalogu dist/
```

## Etap 1 — przestrzeń

- wymiary wewnętrzne wnęki/pomieszczenia (szerokość × wysokość × głębokość, mm),
- wybór istniejących ścian (podłoga, tył, lewa, prawa, sufit), kolory ścian i podłogi,
- skosy (np. poddasze): ścianka kolankowa + długość skosu w poziomie lub kąt; bryła jest przycinana płaszczyznami skosów,
- przeszkody prostopadłościenne (listwy, rury, parapety…) z ostrzeżeniem, gdy wystają poza przestrzeń (także przez skos),
- podgląd 3D z wymiarami i widokami: 3D / przód / góra / bok, przełącznik widoczności ścian,
- autozapis w przeglądarce (localStorage), eksport/import projektu do JSON.

## Etap 2 — prosty korpus

- korpus: boki na całą wysokość, wieńce między bokami, plecy (HDF 3 mm nakładane / z płyty wpuszczane / brak),
- grubość płyty do wyboru (domyślnie 18 mm), kolor płyty,
- „Dopasuj do wnęki” — wymiary wnęki, wysokość obniżona pod skosy,
- ostrzeżenia: wyjście poza przestrzeń / przez skos, kolizja z przeszkodą lub innym meblem,
- lista elementów korpusu z wymiarami (długość × szerokość × grubość).

## Struktura

```
src/
  main.js              — spina stan, scenę i UI
  state/store.js       — prosty obserwowalny magazyn stanu
  model/               — dane projektu (bez zależności od Three.js i DOM)
    space.js           — model przestrzeni, przeszkody, walidacja
    furniture.js       — korpus: płyty, dopasowanie, kolizje
    project.js         — projekt, zapis/odczyt
  scene/               — wizualizacja 3D
    Viewer.js          — renderer, kamera, sterowanie, widoki
    buildSpace.js      — budowa geometrii przestrzeni z modelu
    polyhedron.js      — bryła wypukła i przycinanie płaszczyznami (skosy)
    buildFurniture.js  — geometria mebli (płyty korpusów)
    dimensions.js      — linie wymiarowe
    units.js           — mm ↔ metry sceny, układ współrzędnych
  ui/                  — panele i pasek narzędzi
```

Układ współrzędnych przestrzeni (mm): **x** od lewej ściany, **y** od podłogi, **z** od tylnej ściany.

## Pomysły na kolejne etapy

- przestrzeń pod schodami, wnęki o nieregularnym kształcie, okna dachowe w skosie,
- korpus mebla: płyty o zadanej grubości, półki, przegrody, drzwi, szuflady,
- lista elementów do rozkroju (formatki), okleina, materiały,
- rzut 2D z wymiarami, eksport do PDF.
