// Generator stron pod frazy z wyszukiwarki (statyczny HTML w public/): wspólny układ (nagłówek, stopka, FAQ),
// dane strukturalne (WebPage + FAQPage + BreadcrumbList) i wpisy w sitemap.xml.
// Uruchomienie: node scripts/landing-pages.mjs  (po zmianie treści — strony i sitemap generują się na nowo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meblesamemu.pl';
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const PAGES = [
  {
    slug: 'projektant-szaf',
    title: 'Projektant szaf online za darmo — szafa na wymiar w 3D | Meble Samemu',
    description: 'Zaprojektuj szafę na wymiar w przeglądarce: korpusy, półki, drzwi i szuflady w 3D, a potem pobierz listę formatek do rozkroju płyt. Darmowy program, bez instalacji i bez rejestracji.',
    h1: 'Projektant szaf online — zaprojektuj szafę na wymiar za darmo',
    crumb: 'Projektant szaf',
    example: { href: '/?przyklad=szafa', label: 'Szafa we wnęce' },
    body: `
      <p class="lead">Meble Samemu to darmowy program do projektowania szaf w przeglądarce. Wpisujesz wymiary miejsca,
        dodajesz korpusy, półki, drzwi i szuflady, oglądasz szafę w 3D, a na końcu pobierasz gotową
        <a href="/lista-formatek">listę formatek do rozkroju</a> — taką, z którą zamówisz pocięte płyty.</p>
      <figure><img src="/og-image-2.png" width="1200" height="630" loading="lazy" alt="Szafa we wnęce z trzema korpusami, drzwiami i blendami zaprojektowana w 3D w programie Meble Samemu" />
        <figcaption>Szafa do wnęki: trzy korpusy do sufitu, blendy przy ścianach, cokół i drzwi.</figcaption></figure>
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
    related: ['szafa-na-skosy', 'lista-formatek', 'poradniki/szafa-do-wneki'],
  },
  {
    slug: 'szafa-na-skosy',
    title: 'Szafa na skosy — projekt zabudowy poddasza online za darmo | Meble Samemu',
    description: 'Zaprojektuj szafę pod skos na wymiar: wpisz ściankę kolankową i kąt skosu, a program dopasuje korpusy ze skośną górą i policzy formatki do rozkroju. Darmowy projektant 3D w przeglądarce.',
    h1: 'Szafa na skosy — zaprojektuj zabudowę poddasza na wymiar',
    crumb: 'Szafa na skosy',
    example: { href: '/?przyklad=poddasze', label: 'Zabudowa poddasza' },
    body: `
      <p class="lead">Zabudowa skosów to mebel, którego nie kupisz gotowego — każde poddasze ma inną ściankę kolankową
        i inny kąt dachu. W Meble Samemu wpisujesz wymiary skosu, a program sam przycina korpusy pod dach i liczy
        skośne formatki do rozkroju.</p>
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
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/zabudowa-poddasza-skos'],
  },
  {
    slug: 'projektant-kuchni',
    title: 'Program do projektowania kuchni za darmo — szafki kuchenne 3D | Meble Samemu',
    description: 'Darmowy program do projektowania szafek kuchennych w 3D: szafki dolne i górne, szuflady, blat z otworem na zlew i płytę, cokół. Na koniec lista formatek do rozkroju płyt. Bez rejestracji.',
    h1: 'Program do projektowania kuchni — szafki kuchenne w 3D za darmo',
    crumb: 'Projektant kuchni',
    example: { href: '/?przyklad=kuchnia', label: 'Szafki kuchenne' },
    body: `
      <p class="lead">Zaprojektuj szafki kuchenne na wymiar i od razu zobacz je w 3D: szafki dolne na nóżkach, szafki
        wiszące, szuflady, blat z wycięciem na zlew i płytę grzewczą, cokół. Program liczy listę formatek do rozkroju,
        więc z projektu przejdziesz prosto do zamówienia płyt.</p>
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
    related: ['projektant-szaf', 'lista-formatek', 'poradniki/formatki-rozkroj-plyt'],
  },
  {
    slug: 'lista-formatek',
    title: 'Lista formatek do rozkroju płyt — generator za darmo (Excel, CSV, meble.pl) | Meble Samemu',
    description: 'Wygeneruj listę formatek do rozkroju płyt meblowych z projektu 3D: wymiary do cięcia, ilości, okleina krawędzi i akcesoria. Excel, CSV i gotowy plik do rozkroju na meble.pl. Za darmo.',
    h1: 'Lista formatek do rozkroju płyt — wygeneruj ją z projektu 3D',
    crumb: 'Lista formatek',
    example: { href: '/?przyklad=szafa', label: 'Szafa we wnęce' },
    body: `
      <p class="lead">Ręczne liczenie formatek to najczęstsze źródło błędów przy meblach robionych samemu: zapomniana
        grubość płyty, zła okleina, brakujący wieniec. W Meble Samemu lista formatek powstaje sama z projektu 3D —
        zmieniasz wymiar szafy, a wszystkie płyty przeliczają się od razu.</p>
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
    related: ['projektant-szaf', 'projektant-kuchni', 'poradniki/formatki-rozkroj-plyt'],
  },
];

const TITLES = Object.fromEntries(PAGES.map((p) => [p.slug, p.crumb]));
const RELATED_TITLES = {
  'poradniki/szafa-do-wneki': 'Poradnik: szafa do wnęki krok po kroku',
  'poradniki/zabudowa-poddasza-skos': 'Poradnik: zabudowa poddasza ze skosem',
  'poradniki/formatki-rozkroj-plyt': 'Poradnik: formatki i rozkrój płyt',
};

function render(page) {
  const url = `${SITE}/${page.slug}`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.h1,
      description: page.description,
      url,
      inLanguage: 'pl',
      dateModified: today,
      isPartOf: { '@type': 'WebSite', name: 'Meble Samemu', url: `${SITE}/` },
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
        { '@type': 'ListItem', position: 1, name: 'Meble Samemu', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: url },
      ],
    },
  ];
  const related = page.related
    .map((r) => `<li><a href="/${r}">${esc(TITLES[r] ? `${TITLES[r]} — Meble Samemu` : RELATED_TITLES[r] ?? r)}</a></li>`)
    .join('\n        ');
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/strony.css" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pl_PL" />
    <meta property="og:site_name" content="Meble Samemu" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(page.h1)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:image" content="${SITE}/og-image-2.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
    </script>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">Meble Samemu</a>
        <nav class="site-nav" aria-label="Menu">
          <a href="/">Projektant</a>
          <a href="/o-programie">O programie</a>
          <a href="/poradniki/">Poradniki</a>
        </nav>
      </div>
    </header>

    <main class="wrap">
      <p class="updated"><a href="/">Meble Samemu</a> › ${esc(page.crumb)} · aktualizacja ${today}</p>
      <h1>${esc(page.h1)}</h1>
${page.body}
      <p class="cta-row">
        <a class="cta" href="${page.example.href}">Otwórz przykład „${esc(page.example.label)}” w projektancie →</a>
        <a class="cta cta-secondary" href="/">Zacznij od pustego projektu</a>
      </p>

      <h2>Najczęstsze pytania</h2>
      <div class="faq">
        ${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n        ')}
      </div>

      <h2>Zobacz też</h2>
      <ul>
        ${related}
      </ul>
    </main>

    <footer class="site-footer">
      <div class="wrap">
        <a href="/">Projektant mebli</a> · <a href="/projektant-szaf">Projektant szaf</a> · <a href="/szafa-na-skosy">Szafa na skosy</a> ·
        <a href="/projektant-kuchni">Projektant kuchni</a> · <a href="/lista-formatek">Lista formatek</a> ·
        <a href="/o-programie">O programie</a> · <a href="/poradniki/">Poradniki</a> · <a href="/polityka-prywatnosci">Polityka prywatności</a>
      </div>
    </footer>
  </body>
</html>
`;
}

for (const page of PAGES) {
  fs.writeFileSync(path.join(root, 'public', `${page.slug}.html`), render(page));
  console.log(`public/${page.slug}.html — ${strip(page.body).length} znaków treści`);
}

// sitemap: dopisz / zaktualizuj adresy stron
const sitemapPath = path.join(root, 'public', 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
for (const page of PAGES) {
  const loc = `${SITE}/${page.slug}`;
  const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n`;
  const re = new RegExp(`  <url>\\n    <loc>${loc.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}</loc>[\\s\\S]*?</url>\\n`);
  sitemap = re.test(sitemap) ? sitemap.replace(re, entry) : sitemap.replace('</urlset>', `${entry}</urlset>`);
}
// strona główna — nowa treść
sitemap = sitemap.replace(/(<loc>https:\/\/meblesamemu\.pl\/<\/loc>\n    <lastmod>)[^<]*/, `$1${today}`);
fs.writeFileSync(sitemapPath, sitemap);
console.log('public/sitemap.xml — zaktualizowana');
