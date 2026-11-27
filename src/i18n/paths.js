// Adresy stron: polski → angielski. Używane w programie (linki w menu, przełącznik języka — i18n.js localPath)
// i przez skrypty stron (hreflang, sitemap). Pliki: polskie w public/…, angielskie w public/en/… (program — en/index.html).
export const PATHS = {
  '/': '/en/',
  '/o-programie': '/en/about',
  '/poradniki/': '/en/guides/',
  '/poradniki/szafa-do-wneki': '/en/guides/built-in-wardrobe-alcove',
  '/poradniki/zabudowa-poddasza-skos': '/en/guides/attic-wardrobe-under-slope',
  '/poradniki/formatki-rozkroj-plyt': '/en/guides/cut-list-panel-cutting',
  '/poradniki/rozkroj-meble-pl-csv': '/en/guides/meble-pl-cutting-csv',
  '/poradniki/polecane-materialy-i-narzedzia': '/en/guides/recommended-materials-and-tools',
  '/poradniki/wymiary-szafek-kuchennych': '/en/guides/kitchen-cabinet-dimensions',
  '/poradniki/ile-plyty-na-szafe': '/en/guides/how-much-board-for-a-wardrobe',
  '/poradniki/zawiasy-puszkowe-otwory': '/en/guides/concealed-hinge-holes',
  '/poradniki/okleina-obrzeze-krawedzi': '/en/guides/edge-banding',
  '/poradniki/darmowy-program-do-projektowania-mebli': '/en/guides/free-furniture-design-software',
  '/projektant-szaf': '/en/wardrobe-designer',
  '/szafa-na-skosy': '/en/sloped-ceiling-wardrobe',
  '/projektant-kuchni': '/en/kitchen-designer',
  '/lista-formatek': '/en/cut-list',
  '/polityka-prywatnosci': '/en/privacy-policy',
};

// angielski → polski (przełącznik „Polski” na stronach angielskich)
export const PATHS_PL = Object.fromEntries(Object.entries(PATHS).map(([pl, en]) => [en, pl]));
