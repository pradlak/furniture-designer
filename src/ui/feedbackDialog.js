// Okienko „Uwagi i propozycje”: pole tekstowe (i opcjonalnie kontakt do odpowiedzi). Wiadomość idzie
// do Workera (POST /api/uwagi), który wysyła ją mailem na stały adres autora — strona go nie zna
// i nie da się wybrać innego.
const MAX = 5000;

export function createFeedbackDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <form class="welcome feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" novalidate>
      <h2 id="feedback-title">Uwagi i propozycje</h2>
      <p class="welcome-note">Coś nie działa, czegoś brakuje, masz pomysł? Napisz — każda wiadomość trafia do autora programu.</p>
      <label class="field">
        <span>Twoja uwaga albo propozycja</span>
        <textarea name="message" rows="7" maxlength="${MAX}" required placeholder="Np. przydałaby się opcja…"></textarea>
      </label>
      <p class="feedback-count welcome-note"></p>
      <label class="field">
        <span>Twój e-mail <small>(opcjonalnie — jeśli chcesz odpowiedź)</small></span>
        <input type="email" name="contact" autocomplete="email" maxlength="200" />
      </label>
      <!-- pułapka na boty — ukryta dla ludzi -->
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="feedback-trap" aria-hidden="true" />
      <p class="feedback-status" role="status"></p>
      <div class="welcome-actions">
        <button type="button" data-feedback="cancel">Anuluj</button>
        <button type="submit" class="primary">Wyślij</button>
      </div>
    </form>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('form');
  const status = overlay.querySelector('.feedback-status');
  const count = overlay.querySelector('.feedback-count');
  const send = form.querySelector('[type="submit"]');
  const close = () => (overlay.hidden = true);
  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `feedback-status ${kind}`;
  };
  const updateCount = () => (count.textContent = `${form.message.value.length} / ${MAX} znaków`);

  form.addEventListener('input', updateCount);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-feedback="cancel"]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = form.message.value.trim();
    if (message.length < 3) {
      setStatus('Napisz kilka słów.', 'error');
      form.message.focus();
      return;
    }
    send.disabled = true;
    setStatus('Wysyłam…');
    try {
      const res = await fetch('/api/uwagi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, contact: form.contact.value.trim(), website: form.website.value, page: location.pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Nie udało się wysłać — spróbuj później.');
      form.reset();
      updateCount();
      setStatus('Dziękuję! Wiadomość wysłana.', 'ok');
      window.umami?.track?.('wyslanie-uwagi');
    } catch (err) {
      setStatus(err.message || 'Nie udało się wysłać — spróbuj później.', 'error');
    } finally {
      send.disabled = false;
    }
  });

  return {
    open() {
      setStatus('');
      updateCount();
      overlay.hidden = false;
      form.message.focus();
    },
  };
}
