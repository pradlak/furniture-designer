// Wspólne drobiazgi Workera: odpowiedzi JSON, ciasteczka, losowe identyfikatory, skróty, ochrona przed CSRF.

export const json = (status, data, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

// Losowy identyfikator / token (base64url, bez znaków specjalnych).
export function randomId(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

// Ciasteczko: HttpOnly (niedostępne dla skryptów), Secure (tylko HTTPS — poza localhostem), SameSite=Lax.
export function cookie(name, value, { maxAge, secure = true } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    ...(maxAge != null ? [`Max-Age=${maxAge}`] : []),
  ].join('; ');
}

export const isLocal = (request) => /^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname);

// Zmiany (POST / PUT / DELETE) tylko z naszej strony: nagłówek Origin musi pasować do adresu Workera.
// Razem z ciasteczkiem SameSite=Lax chroni przed wywołaniem akcji z obcej strony (CSRF).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}

export async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('too-large'), { status: 413 });
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('bad-json'), { status: 400 });
  }
}
