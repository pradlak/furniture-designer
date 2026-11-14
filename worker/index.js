// Worker Cloudflare: serwuje stronę (pliki z dist/) i obsługuje formularz uwag.
//
// POST /api/uwagi  { message, contact?, website? }  → wysyła uwagę mailem na adres z konfiguracji
// (wrangler.jsonc: vars.FEEDBACK_TO i binding send_email „FEEDBACK”). Adres nie trafia do kodu strony.
// website — pole-pułapka na boty (niewidoczne dla ludzi): gdy jest wypełnione, udajemy sukces i nic nie wysyłamy.

const MAX_MESSAGE = 5000;
const FROM = { email: 'uwagi@meblesamemu.pl', name: 'Meble Samemu — uwagi' };

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function handleFeedback(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'Tylko POST.' });
  if ((Number(request.headers.get('content-length')) || 0) > 20000) return json(413, { error: 'Wiadomość jest za długa.' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Nieprawidłowe dane.' });
  }
  if (body?.website) return json(200, { ok: true }); // bot

  const message = String(body?.message ?? '').trim();
  const contact = String(body?.contact ?? '').trim().slice(0, 200);
  if (message.length < 3) return json(400, { error: 'Napisz kilka słów.' });
  if (message.length > MAX_MESSAGE) return json(400, { error: `Wiadomość może mieć najwyżej ${MAX_MESSAGE} znaków.` });

  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : undefined;
  const text = [
    message,
    '',
    '—',
    `Kontakt: ${contact || '(nie podano)'}`,
    `Strona: ${String(body?.page ?? '').slice(0, 300)}`,
    `Przeglądarka: ${(request.headers.get('user-agent') ?? '').slice(0, 300)}`,
    `Kraj: ${request.cf?.country ?? '?'}`,
  ].join('\n');

  try {
    await env.FEEDBACK.send({
      to: env.FEEDBACK_TO,
      from: FROM,
      subject: `Uwaga do projektanta mebli: ${message.slice(0, 60).replace(/\s+/g, ' ')}${message.length > 60 ? '…' : ''}`,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (err) {
    console.error('Wysyłka uwagi nie powiodła się', err?.code, err?.message);
    return json(502, { error: 'Nie udało się wysłać — spróbuj później.' });
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/uwagi') return handleFeedback(request, env);
    // pozostałe adresy — pliki strony (tu trafiamy tylko wyjątkowo; zwykle serwuje je Cloudflare przed Workerem)
    return env.ASSETS.fetch(request);
  },
};
