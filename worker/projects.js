// Projekty zalogowanego użytkownika (Cloudflare D1).
//
// GET    /api/projects        → { projects: [{ id, name, updatedAt, size }] } (bez treści, od najnowszych)
// POST   /api/projects        { name, data }                → { id, updatedAt }
// GET    /api/projects/:id    → { id, name, data, updatedAt }
// PUT    /api/projects/:id    { name?, data?, baseUpdatedAt? } → { updatedAt }
//        baseUpdatedAt — wersja, od której zaczęto zmiany; gdy na serwerze jest nowsza (zmiana z innego
//        urządzenia) → 409 { updatedAt } i nic nie nadpisujemy (chyba że force: true)
// DELETE /api/projects/:id

import { json, randomId, sameOrigin, readJson } from './util.js';
import { currentUser } from './auth.js';

const MAX_PROJECT_BYTES = 2_000_000; // ok. 2 MB JSON na projekt
const MAX_PROJECTS = 200;
const cleanName = (n) => String(n ?? '').trim().slice(0, 120) || 'Projekt bez nazwy';

export async function handleProjects(request, env, path) {
  if (!path.startsWith('/api/projects')) return null;
  const user = await currentUser(request, env);
  if (!user) return json(401, { error: 'Zaloguj się, żeby zapisywać projekty na koncie.' });
  if (request.method !== 'GET' && !sameOrigin(request)) return json(403, { error: 'Niedozwolone.' });

  const id = path.match(/^\/api\/projects\/([\w-]+)$/)?.[1] ?? null;
  const db = env.DB;
  try {
    if (path === '/api/projects' && request.method === 'GET') {
      const { results } = await db
        .prepare('SELECT id, name, updated_at AS updatedAt, length(data) AS size FROM projects WHERE user_id = ? ORDER BY updated_at DESC')
        .bind(user.id)
        .all();
      return json(200, { projects: results });
    }
    if (path === '/api/projects' && request.method === 'POST') {
      const body = await readJson(request, MAX_PROJECT_BYTES + 1000);
      if (!body?.data || typeof body.data !== 'object') return json(400, { error: 'Brak projektu.' });
      const count = await db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').bind(user.id).first('n');
      if (count >= MAX_PROJECTS) return json(400, { error: `Możesz mieć najwyżej ${MAX_PROJECTS} projektów — usuń niepotrzebne.` });
      const newId = randomId(12);
      const now = Date.now();
      await db
        .prepare('INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId, user.id, cleanName(body.name), JSON.stringify(body.data), now, now)
        .run();
      return json(201, { id: newId, updatedAt: now });
    }
    if (!id) return json(404, { error: 'Nie ma takiego adresu.' });

    const row = await db.prepare('SELECT id, name, data, updated_at AS updatedAt FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first();
    if (!row) return json(404, { error: 'Nie ma takiego projektu (może został usunięty).' });

    if (request.method === 'GET') return json(200, { id: row.id, name: row.name, data: JSON.parse(row.data), updatedAt: row.updatedAt });
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      return json(200, { ok: true });
    }
    if (request.method === 'PUT') {
      const body = await readJson(request, MAX_PROJECT_BYTES + 1000);
      if (body.baseUpdatedAt != null && body.baseUpdatedAt < row.updatedAt && !body.force) {
        return json(409, { error: 'Projekt zmieniono na innym urządzeniu.', updatedAt: row.updatedAt });
      }
      const now = Math.max(Date.now(), row.updatedAt + 1);
      const name = body.name != null ? cleanName(body.name) : row.name;
      const data = body.data != null ? JSON.stringify(body.data) : row.data;
      if (data.length > MAX_PROJECT_BYTES) return json(413, { error: 'Projekt jest za duży.' });
      await db.prepare('UPDATE projects SET name = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(name, data, now, id, user.id).run();
      return json(200, { updatedAt: now });
    }
    return json(405, { error: 'Niedozwolona metoda.' });
  } catch (err) {
    if (err.status) return json(err.status, { error: err.status === 413 ? 'Projekt jest za duży.' : 'Nieprawidłowe dane.' });
    throw err;
  }
}
