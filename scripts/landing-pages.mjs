// Generator stron pod frazy z wyszukiwarki (statyczny HTML w public/): wspólny układ (nagłówek, stopka, FAQ),
// dane strukturalne (WebPage + FAQPage + BreadcrumbList) i wpisy w sitemap.xml.
// Wersje angielskie (PAGES_EN) — w public/en/, adresy z src/i18n/paths.js; obie wersje mają hreflang i przełącznik języka.
// Uruchomienie: node scripts/landing-pages.mjs  (po zmianie treści — strony i sitemap generują się na nowo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from '../src/i18n/paths.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meblesamemu.pl';
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const PAGES = [
  {
    slug: 'projektant-szaf',
    title: 'Projektant szaf online za darmo — szafa 3D | Meble Samemu',
    description: 'Zaprojektuj szafę na wymiar w 3D: korpusy, półki, drzwi i szuflady. Pobierz listę formatek do rozkroju płyt. Za darmo, bez instalacji i rejestracji.',
    h1: 'Projektant szaf online — zaprojektuj szafę na wymiar za darmo',
    crumb: 'Projektant szaf',
    example: { href: '/?przyklad=szafa', label: 'Szafa we wnęce' },
    body: `
      <p class="lead">Meble Samemu to darmowy program do projektowania szaf w przeglądarce. Wpisujesz wymiary miejsca,
        dodajesz korpusy, półki, drzwi i szuflady, oglądasz szafę w 3D, a na końcu pobierasz gotową
        <a href="/lista-formatek">listę formatek do rozkroju</a> — taką, z którą zamówisz pocięte płyty.</p>
      <figure><img src="/obrazki/projektant-mebli-3d-wymiary.webp" width="1200" height="771" alt="Projektant szaf Meble Samemu: szafa z trzech korpusów w 3D, zaznaczony korpus z wymiarami i karta z rysunkiem" />
        <figcaption>Szafa do wnęki w projektancie: zaznaczony korpus pokazuje wymiary, a karta po prawej — rysunek i ustawienia.</figcaption></figure>
      <h2>Jak zaprojektować szafę w programie</h2>
      <ol class="steps">
        <li><b>Wymiary miejsca.</b> Wybierz wnękę prostokątną albo poddasze ze skosem i wpisz szerokość, wysokość i głębokość.
          Dodaj przeszkody: listwę przypodłogową, rurę, kominek.</li>
        <li><b>Korpusy.</b> Kliknij „Dodaj → Korpus” — kolejne korpusy dzielą wnękę po równo. Szerokość, wysokość i głębokość
          zmienisz myszką w 3D albo wpisując liczby.</li>
        <li><b>Wnętrze i fronty.</b> Dodaj półki, drzwi (pojedyncze lub podwójne) i szuflady — z frontem albo wewnętrzne,
          schowane za drzwiami. Program sam rozkłada zawiasy i ostrzega, gdy drzwi są za szerokie.</li>
        <li><b>Blendy i cokół.</b> Blendy boczne zakryją szczeliny przy krzywych ścianach, górna wypełni miejsce pod sufitem,
          dolna zasłoni nóżki.</li>
        <li><b>Lista formatek.</b> Pobierz listę płyt do cięcia (Excel, CSV albo gotowy plik do rozkroju na meble.pl)
          z okleiną krawędzi i akcesoriami: zawiasy, prowadnice, nóżki, uchwyty.</li>
      </ol>
      <h2>Wymiary, o których warto pamiętać</h2>
      <ul>
        <li><b>Głębokość szafy na ubrania:</b> ok. 60 cm (wieszak ma ok. 45–50 cm szerokości); szafa na książki czy buty — 30–40 cm.</li>
        <li><b>Szerokość korpusu:</b> do ok. 100 cm — szersze półki uginają się pod ciężarem.</li>
        <li><b>Szerokość drzwi:</b> do ok. 60 cm na jedno skrzydło; szersze lepiej zrobić jako drzwi podwójne.</li>
        <li><b>Luz pod sufitem:</b> kilka–kilkanaście milimetrów, żeby korpus dało się postawić; szczelinę zakryje blenda górna.</li>
      </ul>
      <div class="box"><p><b>Najszybciej:</b> otwórz gotowy przykład i zmień wymiary pod swoją wnękę — wszystkie elementy
        dopasują się same.</p></div>`,
    faq: [
      ['Czy projektant szaf jest darmowy?', 'Tak. Program działa w przeglądarce, jest całkowicie darmowy i nie wymaga instalacji.'],
      ['Czy trzeba się rejestrować?', 'Nie. Projekt zapisuje się w przeglądarce i możesz go wyeksportować do pliku. Logowanie przez Google jest opcjonalne — przydaje się, gdy chcesz mieć projekty na kilku komputerach.'],
      ['Jak zamówić płyty do szafy?', 'Pobierz listę formatek (Excel albo CSV) i zanieś ją do punktu rozkroju płyt albo wczytaj gotowy plik na meble.pl. Na liście są wymiary do cięcia, ilości i okleina krawędzi.'],
      ['Jakiej grubości płyty użyć na szafę?', 'Na korpusy i półki najczęściej płyta meblowa 18 mm, na plecy HDF 3 mm. W programie wybierzesz materiał i jego grubość — formatki przeliczą się same.'],
      ['Czy program zaprojektuje szafę z drzwiami przesuwnymi?', 'Na razie program projektuje korpusy z drzwiami uchylnymi i szufladami. Przy szafie przesuwnej możesz zaprojektować w nim korpusy i wnętrze, a drzwi przesuwne zamówić osobno w systemie przesuwnym.'],
    ],
    related: ['szafa-na-skosy', 'lista-formatek', 'poradniki/szafa-do-wneki', 'poradniki/ile-plyty-na-szafe', 'poradniki/zawiasy-puszkowe-otwory', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'szafa-na-skosy',
    title: 'Szafa na skosy — projekt online za darmo | Meble Samemu',
    description: 'Szafa pod skos na wymiar: wpisz ściankę kolankową i kąt skosu, a program dotnie korpusy pod dach i policzy formatki do rozkroju. Darmowo, w 3D.',
    h1: 'Szafa na skosy — zaprojektuj zabudowę poddasza na wymiar',
    crumb: 'Szafa na skosy',
    example: { href: '/?przyklad=poddasze', label: 'Zabudowa poddasza' },
    body: `
      <p class="lead">Zabudowa skosów to mebel, którego nie kupisz gotowego — każde poddasze ma inną ściankę kolankową
        i inny kąt dachu. W Meble Samemu wpisujesz wymiary skosu, a program sam przycina korpusy pod dach i liczy
        skośne formatki do rozkroju.</p>
      <figure><img src="/obrazki/przyklad-zabudowa-poddasza.webp" width="900" height="540" alt="Zabudowa poddasza w 3D: sześć drzwi w korpusach ze skośną górą dociętą pod skos dachu" />
        <figcaption>Przykład „Zabudowa poddasza”: korpusy ze skośną górą pod skosem 45°, drzwi ścięte pod kąt.</figcaption></figure>
      <h2>Jak zaprojektować szafę pod skos</h2>
      <ol class="steps">
        <li><b>Wybierz poddasze ze skosem.</b> Przy nowym projekcie wybierz „Poddasze” i wpisz szerokość, wysokość i głębokość.</li>
        <li><b>Opisz skos.</b> Podaj wysokość ścianki kolankowej (tam, gdzie skos zaczyna się przy ścianie) i długość skosu
          albo jego kąt. Skos może być z lewej, z prawej, z tyłu albo z przodu.</li>
        <li><b>Dodaj korpusy.</b> Korpus wysunięty pod skos dostaje skośną górę i skośne boki — program pilnuje,
          żeby nic nie wystawało poza dach, i zostawia ustawiony luz.</li>
        <li><b>Fronty i półki.</b> Drzwi pod skosem też są ścięte; półki dopasowują się do wnętrza korpusu.</li>
        <li><b>Formatki.</b> Lista płyt zawiera skośne cięcia z wymiarami (np. „ścięty róg 470 × 560 mm”), więc
          stolarnia wie dokładnie, jak ciąć.</li>
      </ol>
      <h2>Na co uważać przy zabudowie poddasza</h2>
      <ul>
        <li><b>Zmierz skos w kilku miejscach</b> — krokwie i płyty g-k rzadko są idealnie równe. Do projektu weź najmniejsze wymiary.</li>
        <li><b>Zostaw luz pod skosem</b> (ok. 10–20 mm) — skośny korpus trzeba wsunąć na miejsce, a szczelinę zakryje blenda.</li>
        <li><b>Niska część przy ściance kolankowej</b> świetnie nadaje się na szuflady albo półki na buty,
          wyższa — na drążek i drzwi.</li>
        <li><b>Głębokość:</b> pod skosem często opłaca się płytsza szafa (40–50 cm), żeby fronty nie były zbyt niskie.</li>
      </ul>
      <p>Szczegółowy opis znajdziesz w poradniku <a href="/poradniki/zabudowa-poddasza-skos">zabudowa poddasza ze skosem krok po kroku</a>.</p>`,
    faq: [
      ['Czy program przytnie korpus pod skos automatycznie?', 'Tak. Po wpisaniu ścianki kolankowej i skosu korpusy dosunięte pod dach dostają skośną górę i boki, a lista formatek zawiera skośne cięcia z wymiarami.'],
      ['Jaki skos da się zaprojektować?', 'Dowolny kąt — skos wpisujesz jako wysokość ścianki kolankowej i długość skosu (albo kąt). Może być z każdej strony pomieszczenia, także kilka naraz.'],
      ['Ile luzu zostawić pod skosem?', 'Najczęściej 10–20 mm. Program ma osobne ustawienie luzu dla skosu i pilnuje, żeby korpus się zmieścił.'],
      ['Czy projekt jest darmowy?', 'Tak, projektant działa w przeglądarce za darmo i bez rejestracji.'],
    ],
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/zabudowa-poddasza-skos', 'poradniki/ile-plyty-na-szafe', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'projektant-kuchni',
    title: 'Program do projektowania kuchni za darmo | Meble Samemu',
    description: 'Zaprojektuj szafki kuchenne w 3D: dolne i wiszące, szuflady, blat z otworem na zlew i płytę, cokół. Na koniec lista formatek do rozkroju. Za darmo.',
    h1: 'Program do projektowania kuchni — szafki kuchenne w 3D za darmo',
    crumb: 'Projektant kuchni',
    example: { href: '/?przyklad=kuchnia', label: 'Szafki kuchenne' },
    body: `
      <p class="lead">Zaprojektuj szafki kuchenne na wymiar i od razu zobacz je w 3D: szafki dolne na nóżkach, szafki
        wiszące, szuflady, blat z wycięciem na zlew i płytę grzewczą, cokół. Program liczy listę formatek do rozkroju,
        więc z projektu przejdziesz prosto do zamówienia płyt.</p>
      <figure><img src="/obrazki/przyklad-szafki-kuchenne.webp" width="900" height="540" alt="Szafki kuchenne w 3D: szafka z drzwiami i szafka z trzema szufladami pod drewnianym blatem" />
        <figcaption>Przykład „Szafki kuchenne”: szafki dolne na nóżkach z blatem, cokołem, drzwiami i szufladami.</figcaption></figure>
      <h2>Co zaprojektujesz</h2>
      <ul>
        <li><b>Szafki dolne i górne</b> — dowolne wymiary; szafki wiszące ustawisz na wybranej wysokości.</li>
        <li><b>Szuflady i drzwi</b> — szuflady z frontem albo wewnętrzne za drzwiami, różne wysokości, jedna pod drugą
          albo z wolną przestrzenią; program dopasuje ich wysokość do miejsca w szafce.</li>
        <li><b>Blat</b> na całą zabudowę, z wycięciem na zlew, otworem na kran i płytę indukcyjną albo gazową
          (widoczną w 3D) oraz frezowaniem krawędzi.</li>
        <li><b>Cokół i blendy</b> — blenda dolna zasłoni nóżki, blendy boczne wyrównają szczeliny przy ścianie.</li>
        <li><b>Okap i przeszkody</b> — zaznaczysz okap, rury czy kominek, a szafki dopasują się do wolnego miejsca.</li>
        <li><b>Płytki na ścianie</b> — pas płytek nad blatem z wyliczeniem orientacyjnej liczby płytek.</li>
      </ul>
      <h2>Standardowe wymiary szafek kuchennych</h2>
      <ul>
        <li><b>Wysokość blatu:</b> zwykle 85–92 cm (szafka ok. 72–82 cm + nóżki/cokół + blat 28–38 mm).</li>
        <li><b>Głębokość szafek dolnych:</b> ok. 56–58 cm pod blat 60 cm.</li>
        <li><b>Szafki górne:</b> głębokość 30–35 cm, dolna krawędź ok. 50–60 cm nad blatem.</li>
        <li><b>Szerokości:</b> typowo 30, 40, 45, 50, 60 i 80 cm; pod zlew zwykle 60–80 cm.</li>
      </ul>
      <div class="box"><p>Program jest przeznaczony do projektowania <b>korpusów i frontów z płyt</b> pod rozkrój —
        nie zastępuje projektu instalacji (prąd, woda, gaz) ani wyboru sprzętu AGD.</p></div>`,
    faq: [
      ['Czy program do projektowania kuchni jest darmowy?', 'Tak — działa w przeglądarce, bez instalacji, bez rejestracji i bez opłat.'],
      ['Czy mogę zaprojektować blat z otworem na zlew i płytę?', 'Tak. Do blatu dodasz wycięcie na zlew, otwór na kran, przepusty kablowe i wycięcie pod płytę indukcyjną albo gazową — płyta jest widoczna w 3D, a wymiary otworów trafiają do listy formatek.'],
      ['Jak zamówić płyty na szafki kuchenne?', 'Pobierz listę formatek w Excelu albo CSV (z okleiną krawędzi i akcesoriami) i zamów rozkrój w hurtowni płyt albo wczytaj gotowy plik na meble.pl.'],
      ['Czy program projektuje kuchnię narożną?', 'Szafki ustawiasz wzdłuż ścian pomieszczenia, które możesz dowolnie kształtować (także skośne ściany). Specjalnych szafek narożnych z karuzelą program na razie nie ma.'],
    ],
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/wymiary-szafek-kuchennych', 'poradniki/zawiasy-puszkowe-otwory', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'lista-formatek',
    title: 'Lista formatek do rozkroju płyt — za darmo | Meble Samemu',
    description: 'Lista formatek z projektu 3D: wymiary do cięcia, ilości, okleina i akcesoria. Excel, CSV i plik do rozkroju na meble.pl. Za darmo, bez rejestracji.',
    h1: 'Lista formatek do rozkroju płyt — wygeneruj ją z projektu 3D',
    crumb: 'Lista formatek',
    example: { href: '/?przyklad=szafa', label: 'Szafa we wnęce' },
    body: `
      <p class="lead">Ręczne liczenie formatek to najczęstsze źródło błędów przy meblach robionych samemu: zapomniana
        grubość płyty, zła okleina, brakujący wieniec. W Meble Samemu lista formatek powstaje sama z projektu 3D —
        zmieniasz wymiar szafy, a wszystkie płyty przeliczają się od razu.</p>
      <figure style="max-width:520px"><img src="/obrazki/lista-formatek-okno.webp" width="520" height="560" alt="Okienko Formatki do rozkroju: wybór formatu (Excel, CSV, meble.pl, fronty MDF, blaty) i elementów do eksportu" />
        <figcaption>Okienko „Formatki”: format pliku oraz to, co trafi na listę — korpusy, plecy, fronty, blendy, blaty, akcesoria.</figcaption></figure>
      <h2>Co zawiera lista formatek</h2>
      <ul>
        <li><b>Materiał i grubość</b> każdej płyty (płyta meblowa, MDF na fronty, HDF na plecy, blaty).</li>
        <li><b>Wymiary do cięcia</b> — z uwzględnieniem grubości okleiny, z łączeniem jednakowych formatek w jedną pozycję.</li>
        <li><b>Okleina</b> — które krawędzie okleić (na długości i szerokości).</li>
        <li><b>Obróbka</b> — skośne cięcia pod skos, frezy, otwory w blacie, otwory pod zawiasy w drzwiach, mocowanie półek.</li>
        <li><b>Akcesoria</b> — zawiasy, prowadnice szuflad, nóżki, uchwyty, wsporniki półek.</li>
      </ul>
      <h2>Formaty do pobrania</h2>
      <ul>
        <li><b>Excel (.xlsx)</b> — najczytelniejszy, z osobnym arkuszem akcesoriów i objaśnieniami.</li>
        <li><b>CSV</b> — do własnych programów i arkuszy.</li>
        <li><b>Plik do rozkroju na meble.pl</b> — osobny plik dla każdego dekoru, gotowy do wczytania w konfiguratorze rozkroju
          (więcej w poradniku <a href="/poradniki/rozkroj-meble-pl-csv">rozkrój na meble.pl z pliku CSV</a>).</li>
        <li><b>Rysunki</b> — fronty z otworami pod zawiasy i półki z wymiarami obróbki (PDF / PNG).</li>
      </ul>
      <div class="box"><p>Formatki możesz pobrać dla całego projektu albo tylko dla wybranych mebli i materiałów —
        np. osobno korpusy z płyty meblowej i osobno fronty z MDF.</p></div>
      <p>Jak czytać listę i na co uważać przy zamawianiu: <a href="/poradniki/formatki-rozkroj-plyt">formatki i rozkrój płyt</a>.</p>`,
    faq: [
      ['Czym jest lista formatek?', 'To spis wszystkich elementów do wycięcia z płyt: materiał, grubość, wymiary do cięcia, ilość i okleina krawędzi. Z taką listą zamawiasz rozkrój w hurtowni płyt.'],
      ['Czy program uwzględnia okleinę w wymiarach?', 'Tak. Wymiar do cięcia jest pomniejszony o grubość okleiny na oklejanych krawędziach, a lista podaje, które krawędzie okleić.'],
      ['Czy mogę zamówić rozkrój na meble.pl?', 'Tak. Program generuje plik w formacie rozkroju meble.pl — osobno dla każdego dekoru płyty — który wczytasz w ich konfiguratorze.'],
      ['Czy generator formatek jest darmowy?', 'Tak, cały program i pobieranie formatek są darmowe i nie wymagają rejestracji.'],
    ],
    related: ['projektant-szaf', 'projektant-kuchni', 'poradniki/formatki-rozkroj-plyt', 'poradniki/okleina-obrzeze-krawedzi', 'poradniki/rozkroj-meble-pl-csv', 'poradniki/ile-plyty-na-szafe'],
  },
];

// Angielskie wersje tych samych stron (tłumaczenie 1:1 — polskie realia, np. meble.pl, zostają z krótkim wyjaśnieniem).
// Adresy — src/i18n/paths.js; slug jak w PAGES (polski), plik zapisuje się pod adresem angielskim.
export const PAGES_EN = [
  {
    slug: 'projektant-szaf',
    title: 'Free online wardrobe designer — 3D | Meble Samemu',
    description: 'Design a made-to-measure wardrobe in 3D: cabinets, shelves, doors and drawers. Download a cut list for panel cutting. Free, no install, no sign-up.',
    h1: 'Online wardrobe designer — design a made-to-measure wardrobe for free',
    crumb: 'Wardrobe designer',
    example: { href: '/en/?example=wardrobe', label: 'Wardrobe in an alcove' },
    body: `
      <p class="lead">Meble Samemu is a free wardrobe design program that runs in your browser. Enter the size of the space,
        add cabinets, shelves, doors and drawers, view the wardrobe in 3D and finally download a ready
        <a href="/en/cut-list">cut list for panel cutting</a> — the list you use to order cut boards.</p>
      <figure><img src="/obrazki/projektant-mebli-3d-wymiary.webp" width="1200" height="771" alt="Meble Samemu wardrobe designer: a three-cabinet wardrobe in 3D, the selected cabinet with dimensions and a card with its drawing" />
        <figcaption>An alcove wardrobe in the designer: the selected cabinet shows its dimensions, the card on the right shows its drawing and settings.</figcaption></figure>
      <h2>How to design a wardrobe in the program</h2>
      <ol class="steps">
        <li><b>Size of the space.</b> Choose a rectangular alcove or an attic with a sloped ceiling and enter the width, height and depth.
          Add obstacles: a skirting board, a pipe, a chimney breast.</li>
        <li><b>Cabinets.</b> Click “Add → Cabinet” — each new cabinet splits the alcove into equal parts. Change the width, height
          and depth with the mouse in 3D or by typing numbers.</li>
        <li><b>Interior and fronts.</b> Add shelves, doors (single or double) and drawers — with a front or internal ones,
          hidden behind the doors. The program places the hinges and warns you when a door is too wide.</li>
        <li><b>Fillers and plinth.</b> Side fillers cover the gaps at uneven walls, the top filler fills the space below the ceiling,
          and the bottom filler (plinth) hides the legs.</li>
        <li><b>Cut list.</b> Download the list of boards to cut (Excel, CSV or a ready file for meble.pl, a Polish
          panel-cutting service) with edge banding and accessories: hinges, drawer runners, legs, handles.</li>
      </ol>
      <h2>Dimensions worth remembering</h2>
      <ul>
        <li><b>Depth of a clothes wardrobe:</b> about 60 cm (a hanger is about 45–50 cm wide); a wardrobe for books or shoes — 30–40 cm.</li>
        <li><b>Cabinet width:</b> up to about 100 cm — wider shelves sag under load.</li>
        <li><b>Door width:</b> up to about 60 cm per leaf; wider openings are better as double doors.</li>
        <li><b>Clearance below the ceiling:</b> a few to a dozen or so millimetres, so the cabinet can be stood up; the top filler covers the gap.</li>
      </ul>
      <div class="box"><p><b>Quickest way:</b> open a ready example and change the dimensions to fit your alcove — all parts
        adjust automatically.</p></div>`,
    faq: [
      ['Is the wardrobe designer free?', 'Yes. The program runs in your browser, is completely free and needs no installation.'],
      ['Do I need to sign up?', 'No. The project is saved in your browser and you can export it to a file. Signing in with Google is optional — it is useful when you want your projects on several computers.'],
      ['How do I order the boards for a wardrobe?', 'Download the cut list (Excel or CSV) and take it to a panel-cutting service, or load the ready file on meble.pl (a Polish panel-cutting service). The list contains cutting dimensions, quantities and edge banding.'],
      ['What board thickness should I use for a wardrobe?', 'Cabinets and shelves are usually made of 18 mm melamine-faced chipboard, the back of 3 mm HDF. In the program you choose the material and its thickness — the cut list is recalculated automatically.'],
      ['Can the program design a wardrobe with sliding doors?', 'For now the program designs cabinets with hinged doors and drawers. For a sliding wardrobe you can design the cabinets and interior in it and order the sliding doors separately from a sliding door system.'],
    ],
    related: ['szafa-na-skosy', 'lista-formatek', 'poradniki/szafa-do-wneki', 'poradniki/ile-plyty-na-szafe', 'poradniki/zawiasy-puszkowe-otwory', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'szafa-na-skosy',
    title: 'Sloped ceiling wardrobe — free online design | Meble Samemu',
    description: 'A made-to-measure wardrobe under a slope: enter the knee wall and the slope angle, the program cuts the cabinets to the roof and builds the cut list.',
    h1: 'Sloped ceiling wardrobe — design made-to-measure attic furniture',
    crumb: 'Sloped ceiling wardrobe',
    example: { href: '/en/?example=attic', label: 'Attic furniture' },
    body: `
      <p class="lead">Furniture under a sloped ceiling is something you cannot buy ready-made — every attic has a different
        knee wall and a different roof angle. In Meble Samemu you enter the slope dimensions and the program cuts the
        cabinets to the roof and calculates the angled pieces for the cut list.</p>
      <figure><img src="/obrazki/przyklad-zabudowa-poddasza.webp" width="900" height="540" alt="Attic furniture in 3D: six doors on cabinets with a sloped top cut to the roof slope" />
        <figcaption>The “Attic furniture” example: cabinets with a sloped top under a 45° slope, doors cut to the angle.</figcaption></figure>
      <h2>How to design a wardrobe under a slope</h2>
      <ol class="steps">
        <li><b>Choose an attic with a slope.</b> When creating a new project choose “Attic” and enter the width, height and depth.</li>
        <li><b>Describe the slope.</b> Enter the height of the knee wall (where the slope starts at the wall) and the length of
          the slope or its angle. The slope can be on the left, right, back or front.</li>
        <li><b>Add cabinets.</b> A cabinet reaching under the slope gets a sloped top and sloped sides — the program makes sure
          nothing sticks out beyond the roof and leaves the clearance you set.</li>
        <li><b>Fronts and shelves.</b> Doors under the slope are cut to the angle too; shelves fit the inside of the cabinet.</li>
        <li><b>Cut list.</b> The list of boards includes angled cuts with dimensions (e.g. “cut corner 470 × 560 mm”), so
          the workshop knows exactly how to cut.</li>
      </ol>
      <h2>What to watch out for with attic furniture</h2>
      <ul>
        <li><b>Measure the slope in several places</b> — rafters and plasterboard are rarely perfectly straight. Use the smallest dimensions in the project.</li>
        <li><b>Leave clearance under the slope</b> (about 10–20 mm) — a sloped cabinet has to be slid into place, and a filler covers the gap.</li>
        <li><b>The low part at the knee wall</b> is great for drawers or shoe shelves,
          the higher part — for a hanging rail and doors.</li>
        <li><b>Depth:</b> under a slope a shallower wardrobe (40–50 cm) often pays off, so the fronts are not too low.</li>
      </ul>
      <p>You will find a detailed description in the guide <a href="/en/guides/attic-wardrobe-under-slope">attic furniture under a sloped ceiling, step by step</a>.</p>`,
    faq: [
      ['Will the program cut the cabinet to the slope automatically?', 'Yes. After you enter the knee wall and the slope, cabinets pushed under the roof get a sloped top and sides, and the cut list includes the angled cuts with dimensions.'],
      ['What slope can I design?', 'Any angle — you enter the slope as the knee wall height and the slope length (or the angle). It can be on any side of the room, and several at once.'],
      ['How much clearance should I leave under the slope?', 'Usually 10–20 mm. The program has a separate clearance setting for the slope and checks that the cabinet fits.'],
      ['Is the design free?', 'Yes, the designer runs in your browser for free and without signing up.'],
    ],
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/zabudowa-poddasza-skos', 'poradniki/ile-plyty-na-szafe', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'projektant-kuchni',
    title: 'Free kitchen design software — 3D | Meble Samemu',
    description: 'Design kitchen cabinets in 3D: base and wall units, drawers, a worktop with sink and hob cut-outs, plinth. Then download the cut list. Free.',
    h1: 'Kitchen design software — kitchen cabinets in 3D for free',
    crumb: 'Kitchen designer',
    example: { href: '/en/?example=kitchen', label: 'Kitchen cabinets' },
    body: `
      <p class="lead">Design made-to-measure kitchen cabinets and see them in 3D straight away: base units on legs, wall
        units, drawers, a worktop with a cut-out for the sink and the hob, a plinth. The program calculates the cut list,
        so you go straight from the design to ordering the boards.</p>
      <figure><img src="/obrazki/przyklad-szafki-kuchenne.webp" width="900" height="540" alt="Kitchen cabinets in 3D: a cabinet with doors and a cabinet with three drawers under a wooden worktop" />
        <figcaption>The “Kitchen cabinets” example: base units on legs with a worktop, plinth, doors and drawers.</figcaption></figure>
      <h2>What you can design</h2>
      <ul>
        <li><b>Base and wall units</b> — any dimensions; wall units are placed at the height you choose.</li>
        <li><b>Drawers and doors</b> — drawers with a front or internal ones behind the doors, different heights, one above
          the other or with free space; the program fits their height to the space in the cabinet.</li>
        <li><b>Worktop</b> across the whole run, with a cut-out for the sink, a hole for the tap and a cut-out for an induction
          or gas hob (visible in 3D) and edge routing.</li>
        <li><b>Plinth and fillers</b> — the bottom filler hides the legs, side fillers even out the gaps at the wall.</li>
        <li><b>Cooker hood and obstacles</b> — mark a cooker hood, pipes or a chimney breast and the cabinets fit the free space.</li>
        <li><b>Wall tiles</b> — a strip of tiles above the worktop with an approximate tile count.</li>
      </ul>
      <h2>Standard kitchen cabinet dimensions</h2>
      <ul>
        <li><b>Worktop height:</b> usually 85–92 cm (cabinet about 72–82 cm + legs/plinth + 28–38 mm worktop).</li>
        <li><b>Base unit depth:</b> about 56–58 cm for a 60 cm worktop.</li>
        <li><b>Wall units:</b> 30–35 cm deep, bottom edge about 50–60 cm above the worktop.</li>
        <li><b>Widths:</b> typically 30, 40, 45, 50, 60 and 80 cm; a sink unit is usually 60–80 cm.</li>
      </ul>
      <div class="box"><p>The program is meant for designing <b>cabinets and fronts made of boards</b> for panel cutting —
        it does not replace planning the installations (electricity, water, gas) or choosing the appliances.</p></div>`,
    faq: [
      ['Is the kitchen design software free?', 'Yes — it runs in your browser, with no installation, no sign-up and no fees.'],
      ['Can I design a worktop with a sink and hob cut-out?', 'Yes. You can add a sink cut-out, a tap hole, cable grommets and a cut-out for an induction or gas hob to the worktop — the hob is visible in 3D and the cut-out dimensions go into the cut list.'],
      ['How do I order the boards for kitchen cabinets?', 'Download the cut list in Excel or CSV (with edge banding and accessories) and order the cutting from a board supplier, or load the ready file on meble.pl (a Polish panel-cutting service).'],
      ['Does the program design corner kitchens?', 'You place cabinets along the walls of the room, which you can shape freely (sloped walls too). There are no special corner cabinets with a carousel yet.'],
    ],
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/wymiary-szafek-kuchennych', 'poradniki/zawiasy-puszkowe-otwory', 'poradniki/darmowy-program-do-projektowania-mebli'],
  },
  {
    slug: 'lista-formatek',
    title: 'Cut list for panel cutting — free | Meble Samemu',
    description: 'A cut list from your 3D design: cutting sizes, quantities, edge banding and accessories. Excel, CSV and a file for meble.pl. Free, no sign-up.',
    h1: 'Cut list for panel cutting — generate it from a 3D design',
    crumb: 'Cut list',
    example: { href: '/en/?example=wardrobe', label: 'Wardrobe in an alcove' },
    body: `
      <p class="lead">Working out the cut list by hand is the most common source of mistakes in DIY furniture: a forgotten
        board thickness, wrong edge banding, a missing top panel. In Meble Samemu the cut list is created automatically
        from the 3D design — change the size of the wardrobe and all boards are recalculated at once.</p>
      <figure style="max-width:520px"><img src="/obrazki/lista-formatek-okno.webp" width="520" height="560" alt="The Cut list window: choice of format (Excel, CSV, meble.pl, MDF fronts, worktops) and parts to export" />
        <figcaption>The “Cut list” window: the file format and what goes on the list — cabinets, backs, fronts, fillers, worktops, accessories.</figcaption></figure>
      <h2>What the cut list contains</h2>
      <ul>
        <li><b>Material and thickness</b> of every board (melamine-faced chipboard, MDF for fronts, HDF for backs, worktops).</li>
        <li><b>Cutting dimensions</b> — taking the edge banding thickness into account, with identical pieces merged into one line.</li>
        <li><b>Edge banding</b> — which edges to band (along the length and the width).</li>
        <li><b>Machining</b> — angled cuts for slopes, routing, holes in the worktop, hinge holes in doors, shelf supports.</li>
        <li><b>Accessories</b> — hinges, drawer runners, legs, handles, shelf supports.</li>
      </ul>
      <h2>Download formats</h2>
      <ul>
        <li><b>Excel (.xlsx)</b> — the most readable, with a separate accessories sheet and explanations.</li>
        <li><b>CSV</b> — for your own programs and spreadsheets.</li>
        <li><b>File for meble.pl</b> (a Polish panel-cutting service) — a separate file for each decor, ready to load into their
          cutting configurator (more in the guide <a href="/en/guides/meble-pl-cutting-csv">cutting on meble.pl from a CSV file</a>).</li>
        <li><b>Drawings</b> — fronts with hinge holes and shelves with machining dimensions (PDF / PNG).</li>
      </ul>
      <div class="box"><p>You can download the cut list for the whole project or only for selected furniture and materials —
        e.g. the chipboard cabinets separately and the MDF fronts separately.</p></div>
      <p>How to read the list and what to watch out for when ordering: <a href="/en/guides/cut-list-panel-cutting">cut list and panel cutting</a>.</p>`,
    faq: [
      ['What is a cut list?', 'It is a list of all the pieces to be cut from boards: material, thickness, cutting dimensions, quantity and edge banding. With such a list you order the cutting from a board supplier.'],
      ['Does the program take edge banding into account in the dimensions?', 'Yes. The cutting dimension is reduced by the banding thickness on the banded edges, and the list shows which edges to band.'],
      ['Can I order the cutting on meble.pl?', 'Yes. The program generates a file in the meble.pl cutting format (meble.pl is a Polish panel-cutting service) — separately for each board decor — which you load into their configurator.'],
      ['Is the cut list generator free?', 'Yes, the whole program and downloading the cut list are free and need no sign-up.'],
    ],
    related: ['projektant-szaf', 'projektant-kuchni', 'poradniki/formatki-rozkroj-plyt', 'poradniki/okleina-obrzeze-krawedzi', 'poradniki/rozkroj-meble-pl-csv', 'poradniki/ile-plyty-na-szafe'],
  },
];

const RELATED_TITLES = {
  'poradniki/szafa-do-wneki': 'Poradnik: szafa do wnęki krok po kroku',
  'poradniki/zabudowa-poddasza-skos': 'Poradnik: zabudowa poddasza ze skosem',
  'poradniki/formatki-rozkroj-plyt': 'Poradnik: formatki i rozkrój płyt',
  'poradniki/rozkroj-meble-pl-csv': 'Poradnik: rozkrój na meble.pl z pliku CSV',
  'poradniki/wymiary-szafek-kuchennych': 'Poradnik: standardowe wymiary szafek kuchennych',
  'poradniki/ile-plyty-na-szafe': 'Poradnik: ile płyty potrzeba na szafę',
  'poradniki/zawiasy-puszkowe-otwory': 'Poradnik: zawiasy puszkowe — gdzie wiercić otwory',
  'poradniki/okleina-obrzeze-krawedzi': 'Poradnik: okleina na krawędzie płyty',
  'poradniki/darmowy-program-do-projektowania-mebli': 'Porównanie: darmowe programy do projektowania mebli',
};
const RELATED_TITLES_EN = {
  'poradniki/szafa-do-wneki': 'Guide: a built-in wardrobe for an alcove, step by step',
  'poradniki/zabudowa-poddasza-skos': 'Guide: attic furniture under a sloped ceiling',
  'poradniki/formatki-rozkroj-plyt': 'Guide: cut list and panel cutting',
  'poradniki/rozkroj-meble-pl-csv': 'Guide: cutting on meble.pl from a CSV file',
  'poradniki/wymiary-szafek-kuchennych': 'Guide: standard kitchen cabinet dimensions',
  'poradniki/ile-plyty-na-szafe': 'Guide: how much board you need for a wardrobe',
  'poradniki/zawiasy-puszkowe-otwory': 'Guide: concealed hinges — where to drill the holes',
  'poradniki/okleina-obrzeze-krawedzi': 'Guide: edge banding for board edges',
  'poradniki/darmowy-program-do-projektowania-mebli': 'Comparison: free furniture design software',
};

// Teksty układu strony w obu językach.
const L = {
  pl: {
    lang: 'pl',
    locale: 'pl_PL',
    home: '/',
    nav: [['/', 'Projektant'], ['/o-programie', 'O programie'], ['/poradniki/', 'Poradniki']],
    switchLabel: 'English',
    switchLang: 'en',
    crumbsLabel: 'Okruszki',
    updated: 'Aktualizacja',
    openExample: (label) => `Otwórz przykład „${label}” w projektancie →`,
    blank: 'Zacznij od pustego projektu',
    faq: 'Najczęstsze pytania',
    related: 'Powiązane poradniki i strony',
    ogAlt: 'Szafa we wnęce zaprojektowana w 3D w programie Meble Samemu',
    relTitle: (r, titles) => (titles[r] ? `${titles[r]} — Meble Samemu` : RELATED_TITLES[r] ?? r),
    footer: `<a href="/">Projektant mebli</a> · <a href="/projektant-szaf">Projektant szaf</a> · <a href="/szafa-na-skosy">Szafa na skosy</a> ·
        <a href="/projektant-kuchni">Projektant kuchni</a> · <a href="/lista-formatek">Lista formatek</a> ·
        <a href="/o-programie">O programie</a> · <a href="/poradniki/">Poradniki</a> · <a href="/polityka-prywatnosci">Polityka prywatności</a>`,
  },
  en: {
    lang: 'en',
    locale: 'en_GB',
    home: '/en/',
    nav: [['/en/', 'Designer'], ['/en/about', 'About'], ['/en/guides/', 'Guides']],
    switchLabel: 'Polski',
    switchLang: 'pl',
    crumbsLabel: 'Breadcrumbs',
    updated: 'Updated',
    openExample: (label) => `Open the “${label}” example in the designer →`,
    blank: 'Start with an empty project',
    faq: 'Frequently asked questions',
    related: 'Related guides and pages',
    ogAlt: 'A wardrobe in an alcove designed in 3D in Meble Samemu',
    relTitle: (r, titles) => (titles[r] ? `${titles[r]} — Meble Samemu` : RELATED_TITLES_EN[r] ?? r),
    footer: `<a href="/en/">Furniture designer</a> · <a href="/en/wardrobe-designer">Wardrobe designer</a> · <a href="/en/sloped-ceiling-wardrobe">Sloped ceiling wardrobe</a> ·
        <a href="/en/kitchen-designer">Kitchen designer</a> · <a href="/en/cut-list">Cut list</a> ·
        <a href="/en/about">About</a> · <a href="/en/guides/">Guides</a> · <a href="/en/privacy-policy">Privacy policy</a>`,
  },
};

const plPath = (slug) => `/${slug}`;
const enPath = (slug) => PATHS[`/${slug}`] ?? `/en/${slug}`;

function render(page, lang, titles) {
  const t = L[lang];
  const own = lang === 'en' ? enPath(page.slug) : plPath(page.slug);
  const other = lang === 'en' ? plPath(page.slug) : enPath(page.slug);
  const url = `${SITE}${own}`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.h1,
      description: page.description,
      url,
      inLanguage: t.lang,
      dateModified: today,
      isPartOf: { '@type': 'WebSite', name: 'Meble Samemu', url: `${SITE}${t.home}` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Meble Samemu', item: `${SITE}${t.home}` },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: url },
      ],
    },
  ];
  const relHref = (r) => (lang === 'en' ? enPath(r) : `/${r}`);
  const related = page.related.map((r) => `<li><a href="${relHref(r)}">${esc(t.relTitle(r, titles))}</a></li>`).join('\n        ');
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="pl" href="${SITE}${plPath(page.slug)}" />
    <link rel="alternate" hreflang="en" href="${SITE}${enPath(page.slug)}" />
    <link rel="alternate" hreflang="x-default" href="${SITE}${plPath(page.slug)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/strony.css" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${t.locale}" />
    <meta property="og:site_name" content="Meble Samemu" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(page.h1)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:image" content="${SITE}/og-image-2.png" />
    <meta property="og:image:alt" content="${esc(t.ogAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
    </script>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="${t.home}">Meble Samemu</a>
        <nav class="site-nav" aria-label="Menu">
          ${t.nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n          ')}
          <a href="${other}" lang="${t.switchLang}" hreflang="${t.switchLang}" class="lang-link">${t.switchLabel}</a>
        </nav>
      </div>
    </header>

    <main class="wrap">
      <nav class="crumbs" aria-label="${t.crumbsLabel}"><a href="${t.home}">Meble Samemu</a> › <span aria-current="page">${esc(page.crumb)}</span></nav>
      <h1>${esc(page.h1)}</h1>
      <p class="updated">${t.updated}: ${today}</p>
${page.body}
      <p class="cta-row">
        <a class="cta" href="${page.example.href}">${esc(t.openExample(page.example.label))}</a>
        <a class="cta cta-secondary" href="${t.home}">${t.blank}</a>
      </p>

      <h2>${t.faq}</h2>
      <div class="faq">
        ${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n        ')}
      </div>

      <h2>${t.related}</h2>
      <ul>
        ${related}
      </ul>
    </main>

    <footer class="site-footer">
      <div class="wrap">
        ${t.footer}
      </div>
    </footer>
  </body>
</html>
`;
}

const TITLES = Object.fromEntries(PAGES.map((p) => [p.slug, p.crumb]));
const TITLES_EN = Object.fromEntries(PAGES_EN.map((p) => [p.slug, p.crumb]));
for (const page of PAGES) {
  fs.writeFileSync(path.join(root, 'public', `${page.slug}.html`), render(page, 'pl', TITLES));
  console.log(`public/${page.slug}.html — ${strip(page.body).length} znaków treści`);
}
// Strony angielskie: zrzuty z angielskiego interfejsu (/obrazki/nazwa-en.webp), jeśli są.
const enImages = (html) =>
  html.replace(/\/obrazki\/([a-z0-9-]+?)(?<!-en)\.webp/g, (m, b) => (fs.existsSync(path.join(root, 'public', 'obrazki', `${b}-en.webp`)) ? `/obrazki/${b}-en.webp` : m));
for (const page of PAGES_EN) {
  const file = path.join(root, 'public', `${enPath(page.slug).replace(/^\//, '')}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, enImages(render(page, 'en', TITLES_EN)));
  console.log(`${path.relative(root, file)} — ${strip(page.body).length} znaków treści`);
}

// sitemap: cała od nowa (wszystkie strony PL i EN z mapy adresów)
await import('./sitemap.mjs');
