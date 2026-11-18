// Logowanie przez Google (OAuth 2.0 / OpenID Connect) i sesje.
//
// GET  /api/auth/google    → przekierowanie do Google (wybór konta)
// GET  /api/auth/callback  → powrót z Google: zakładamy / odnawiamy konto, sesja w ciasteczku, powrót na stronę
// POST /api/auth/logout    → koniec sesji
// GET  /api/me             → { user: { name, email, picture, settings } } albo { user: null }
// PUT  /api/me/settings    → zapis ustawień programu użytkownika (kolor zaznaczenia, jednostki)
// DELETE /api/me           → usunięcie konta razem z projektami (RODO)
// GET  /api/auth/dev-login → logowanie testowe — TYLKO na localhoście i gdy DEV_LOGIN=1 (plik .dev.vars)
//
// Konfiguracja: vars.GOOGLE_CLIENT_ID (wrangler.jsonc), sekret GOOGLE_CLIENT_SECRET (`wrangler secret put`).
// Adres powrotu (w Google Cloud): https://meblesamemu.pl/api/auth/callback (+ www i localhost do testów).

import { json, randomId, sha256, getCookie, cookie, isLocal, sameOrigin, readJson } from './util.js';

const SESSION_COOKIE = 'ms_session';
const STATE_COOKIE = 'ms_oauth_state';
const SESSION_DAYS = 30;

const redirectUri = (request) => `${new URL(request.url).origin}/api/auth/callback`;
const redirect = (location, headers = []) => {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of headers) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
};

// Zalogowany użytkownik (z ciasteczka sesji) albo null.
export async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, u.settings FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first();
  return row ?? null;
}

// Nowa sesja dla użytkownika → nagłówek Set-Cookie.
async function startSession(request, env, userId) {
  const token = randomId(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 864e5)
    .run();
  // przy okazji sprzątamy wygasłe sesje
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure: !isLocal(request) });
}

// Konto Google → nasz użytkownik (zakładany przy pierwszym logowaniu).
// Zdjęcie profilowe: tylko adres obrazka z serwerów Google (https, *.googleusercontent.com), inaczej puste.
const safePicture = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|.)googleusercontent.com$/.test(u.hostname) && url.length <= 1000 ? url : '';
  } catch {
    return '';
  }
};

async function upsertUser(env, { sub, email, name, picture = '' }) {
  const now = Date.now();
  const pic = safePicture(picture);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first();
  if (existing) {
    await env.DB.prepare('UPDATE users SET email = ?, name = ?, picture = ?, last_login = ? WHERE id = ?').bind(email, name, pic, now, existing.id).run();
    return existing.id;
  }
  const id = randomId(12);
  await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, sub, email, name, pic, now, now)
    .run();
  return id;
}

// Treść tokenu JWT (bez sprawdzania podpisu — token przychodzi prosto z serwera Google przez HTTPS,
// więc wystarczy sprawdzić wydawcę, odbiorcę i ważność).
function jwtPayload(jwt) {
  const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(part + '='.repeat((4 - (part.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

async function googleStart(request, env) {
  if (!env.GOOGLE_CLIENT_ID) return json(503, { error: 'Logowanie nie jest jeszcze skonfigurowane.' });
  // www.meblesamemu.pl → meblesamemu.pl: w Google Cloud wystarczy jeden adres powrotu (bez „www”), a sesja
  // (ciasteczko) jest na adresie głównym.
  const url0 = new URL(request.url);
  if (url0.hostname.startsWith('www.')) {
    url0.hostname = url0.hostname.slice(4);
    return redirect(url0.toString());
  }
  const state = randomId(16);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return redirect(url.toString(), [cookie(STATE_COOKIE, state, { maxAge: 600, secure: !isLocal(request) })]);
}

async function googleCallback(request, env) {
  const url = new URL(request.url);
  const fail = (why) => redirect(`/?logowanie=blad&powod=${encodeURIComponent(why)}`, [cookie(STATE_COOKIE, '', { maxAge: 0, secure: !isLocal(request) })]);
  if (url.searchParams.get('error')) return fail('anulowano');
  const state = url.searchParams.get('state');
  if (!state || state !== getCookie(request, STATE_COOKIE)) return fail('stan');
  const code = url.searchParams.get('code');
  if (!code) return fail('kod');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    console.error('Google token', res.status, await res.text());
    return fail('google');
  }
  const { id_token: idToken } = await res.json();
  const p = idToken ? jwtPayload(idToken) : null;
  const validIssuer = p && (p.iss === 'https://accounts.google.com' || p.iss === 'accounts.google.com');
  if (!p || !validIssuer || p.aud !== env.GOOGLE_CLIENT_ID || p.exp * 1000 < Date.now() || !p.email || p.email_verified === false) {
    return fail('token');
  }
  const userId = await upsertUser(env, { sub: p.sub, email: p.email, name: p.name ?? p.given_name ?? '', picture: p.picture ?? '' });
  return redirect('/?logowanie=ok', [await startSession(request, env, userId), cookie(STATE_COOKIE, '', { maxAge: 0, secure: !isLocal(request) })]);
}

// Logowanie testowe (lokalnie, bez Google) — do sprawdzania programu na localhoście.
async function devLogin(request, env) {
  if (env.DEV_LOGIN !== '1' || !isLocal(request)) return json(404, { error: 'Nie ma takiego adresu.' });
  const userId = await upsertUser(env, { sub: 'dev-user', email: 'test@localhost', name: 'Użytkownik testowy' });
  return redirect('/?logowanie=ok', [await startSession(request, env, userId)]);
}

async function logout(request, env) {
  if (!sameOrigin(request)) return json(403, { error: 'Niedozwolone.' });
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json(200, { ok: true }, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: !isLocal(request) }) });
}

async function me(request, env) {
  if (request.method === 'DELETE') {
    // usunięcie konta: projekty, sesje i dane użytkownika
    if (!sameOrigin(request)) return json(403, { error: 'Niedozwolone.' });
    const user = await currentUser(request, env);
    if (!user) return json(401, { error: 'Nie jesteś zalogowany.' });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM projects WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM user_materials WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return json(200, { ok: true }, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: !isLocal(request) }) });
  }
  const user = await currentUser(request, env);
  return json(200, {
    user: user ? { name: user.name, email: user.email, picture: user.picture || '', settings: parseSettings(user.settings) } : null,
    loginAvailable: !!env.GOOGLE_CLIENT_ID,
  });
}

// Ustawienia programu użytkownika: tylko znane pola i dozwolone wartości (reszta jest pomijana).
function cleanSettings(raw) {
  const out = {};
  if (typeof raw?.highlight === 'string' && /^#[0-9a-f]{6}$/i.test(raw.highlight)) out.highlight = raw.highlight.toLowerCase();
  if (['mm', 'cm', 'm'].includes(raw?.units)) out.units = raw.units;
  return out;
}
function parseSettings(text) {
  try {
    return text ? cleanSettings(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

async function saveSettings(request, env) {
  if (!sameOrigin(request)) return json(403, { error: 'Niedozwolone.' });
  const user = await currentUser(request, env);
  if (!user) return json(401, { error: 'Nie jesteś zalogowany.' });
  const settings = cleanSettings(await readJson(request, 2000));
  await env.DB.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(JSON.stringify(settings), user.id).run();
  return json(200, { settings });
}

export async function handleAuth(request, env, path) {
  if (path === '/api/auth/google') return googleStart(request, env);
  if (path === '/api/auth/callback') return googleCallback(request, env);
  if (path === '/api/auth/dev-login') return devLogin(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
  if (path === '/api/me') return me(request, env);
  if (path === '/api/me/settings' && request.method === 'PUT') return saveSettings(request, env);
  return null;
}
