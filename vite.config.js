import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Adresy bez „.html” (np. /poradniki/szafa-do-wneki) — na Cloudflare działają same; lokalnie (npm run dev / preview)
// zamieniamy je na plik .html z public/ (albo dist/), żeby linki między stronami działały tak samo jak na serwerze.
function cleanUrls() {
  const rewrite = (dir) => (req, _res, next) => {
    const [pathname, query = ''] = req.url.split('?');
    if (pathname !== '/' && !path.extname(pathname)) {
      const file = pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`;
      if (fs.existsSync(path.join(dir, file))) req.url = file + (query ? `?${query}` : '');
    }
    next();
  };
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(rewrite(path.resolve('public')));
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite(path.resolve('dist')));
    },
  };
}

// Serwer deweloperski: adresy /api/* (logowanie, projekty, uwagi) przekazujemy do lokalnego Workera
// (`npx wrangler dev --port 8787` — patrz README). Bez niego strona działa, tylko bez konta.
export default defineConfig({
  plugins: [cleanUrls()],
  build: {
    // dwie strony z programem: polska (/) i angielska (/en/ — src/main-en.js, słownik w src/i18n/en/)
    rollupOptions: { input: { main: path.resolve('index.html'), en: path.resolve('en/index.html') } },
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
