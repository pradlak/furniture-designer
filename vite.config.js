import { defineConfig } from 'vite';

// Serwer deweloperski: adresy /api/* (logowanie, projekty, uwagi) przekazujemy do lokalnego Workera
// (`npx wrangler dev --port 8787` — patrz README). Bez niego strona działa, tylko bez konta.
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
