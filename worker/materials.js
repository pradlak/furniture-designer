// Materiały zalogowanego użytkownika (biblioteka na koncie, Cloudflare D1) — do używania w wielu projektach.
//
// GET    /api/materials       → { materials: [{ id, name, data, updatedAt }] } (alfabetycznie)
// POST   /api/materials       { data }  → { id, updatedAt }
// PUT    /api/materials/:id   { data }  → { updatedAt }
// DELETE /api/materials/:id

import { json, randomId, sameOrigin, readJson } from './util.js';
import { currentUser } from './auth.js';

const MAX_MATERIALS = 200;
const TYPES = ['chipboard', 'mdf', 'hdf', 'worktop', 'other'];
const TEXTURES = ['wood', 'concrete', 'marble'];
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Tylko znane pola materiału, z poprawnymi wartościami (bez identyfikatora z projektu).
function cleanMaterial(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    name: String(m.name ?? '').trim().slice(0, 120) || 'Materiał',
    type: TYPES.includes(m.type) ? m.type : 'other',
    thickness: num(m.thickness, 18, 1, 100),
    color: HEX.test(m.color ?? '') ? m.color.toLowerCase() : '#d9d4c7',
    edgeBanding: num(m.edgeBanding, 0, 0, 5),
    edgeColor: HEX.test(m.edgeColor ?? '') ? m.edgeColor.toLowerCase() : null,
    ...(TEXTURES.includes(m.texture) ? { texture: m.texture } : {}),
  };
}

export async function handleMaterials(request, env, path) {
  if (!path.startsWith('/api/materials')) return null;
  const user = await currentUser(request, env);
  if (!user) return json(401, { error: 'Zaloguj się, żeby zapisywać materiały na koncie.' });
  if (request.method !== 'GET' && !sameOrigin(request)) return json(403, { error: 'Niedozwolone.' });

  const id = path.match(/^\/api\/materials\/([\w-]+)$/)?.[1] ?? null;
  const db = env.DB;
  if (path === '/api/materials' && request.method === 'GET') {
    const { results } = await db
      .prepare('SELECT id, data, updated_at AS updatedAt FROM user_materials WHERE user_id = ? ORDER BY name COLLATE NOCASE')
      .bind(user.id)
      .all();
    return json(200, { materials: results.map((r) => ({ id: r.id, data: JSON.parse(r.data), updatedAt: r.updatedAt })) });
  }
  if (path === '/api/materials' && request.method === 'POST') {
    const data = cleanMaterial((await readJson(request, 4000))?.data);
    if (!data) return json(400, { error: 'Brak materiału.' });
    const count = await db.prepare('SELECT COUNT(*) AS n FROM user_materials WHERE user_id = ?').bind(user.id).first('n');
    if (count >= MAX_MATERIALS) return json(400, { error: `Możesz mieć najwyżej ${MAX_MATERIALS} materiałów na koncie — usuń niepotrzebne.` });
    const newId = randomId(12);
    const now = Date.now();
    await db
      .prepare('INSERT INTO user_materials (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId, user.id, data.name, JSON.stringify(data), now, now)
      .run();
    return json(201, { id: newId, updatedAt: now });
  }
  if (!id) return json(404, { error: 'Nie ma takiego adresu.' });
  const row = await db.prepare('SELECT id FROM user_materials WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) return json(404, { error: 'Nie ma takiego materiału na koncie (może został usunięty).' });
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM user_materials WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return json(200, { ok: true });
  }
  if (request.method === 'PUT') {
    const data = cleanMaterial((await readJson(request, 4000))?.data);
    if (!data) return json(400, { error: 'Brak materiału.' });
    const now = Date.now();
    await db.prepare('UPDATE user_materials SET name = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(data.name, JSON.stringify(data), now, id, user.id).run();
    return json(200, { updatedAt: now });
  }
  return json(405, { error: 'Niedozwolona metoda.' });
}
