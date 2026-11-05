// Publikacja: przenosi zmiany z gałęzi `dev` na `prod` i wysyła `prod` na GitHuba.
// Cloudflare Pages publikuje stronę tylko z gałęzi `prod`.
//
// Użycie:  npm run deploy
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

const branch = read('git branch --show-current');
if (branch !== 'dev') fail(`Publikujemy z gałęzi „dev”, a jesteś na „${branch}”. Przełącz się: git checkout dev`);
if (read('git status --porcelain')) fail('Masz niezapisane zmiany. Najpierw zrób commit (git add . && git commit -m "...").');

console.log('▶ Sprawdzam, czy projekt się buduje…');
try {
  run('npm run build');
} catch {
  fail('Build się nie udał — nic nie zostało opublikowane.');
}

console.log('▶ Wysyłam „dev” na GitHuba…');
run('git push origin dev');

console.log('▶ Przenoszę zmiany z „dev” na „prod”…');
run('git checkout prod');
try {
  run('git merge --ff-only dev');
} catch {
  run('git checkout dev');
  fail('Gałąź „prod” ma zmiany, których nie ma w „dev”. Scal je najpierw do „dev” (git merge prod) i spróbuj ponownie.');
}
run('git push origin prod');
run('git checkout dev');

console.log('\n✔ Opublikowano. Cloudflare Pages zbuduje i wystawi nową wersję w ciągu 1–2 minut.\n');
