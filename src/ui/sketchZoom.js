// Powiększony szkic obiektu (korpus, blat, blenda, przeszkoda) — okno na środku ekranu po kliknięciu w szkic
// w okienku obiektu (.obj-sketch). Zamykanie: ✕, Esc, klik w tło.
export function initSketchZoom() {
  const zoom = document.createElement('div');
  zoom.className = 'bi-zoom';
  zoom.hidden = true;
  zoom.innerHTML = `<div class="bi-zoom-box" role="dialog" aria-label="Szkic">
      <div class="bi-zoom-head"><b></b><button type="button" class="icon" data-zoom-close title="Zamknij (Esc)">✕</button></div>
      <div class="bi-zoom-body bi-sketch"></div>
    </div>`;
  document.body.appendChild(zoom);
  const close = () => (zoom.hidden = true);
  zoom.addEventListener('click', (e) => {
    if (e.target === zoom || e.target.closest('[data-zoom-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !zoom.hidden) {
      e.stopPropagation();
      close();
    }
  }, true);
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-edge-toggle]')) return; // (przełącznik obrzeża na szkicu płyty)
    const sk = e.target.closest?.('.obj-sketch');
    if (!sk || !sk.innerHTML.trim()) return;
    const card = sk.closest('.item');
    const name = card?.querySelector('.item-head input[data-f="name"]')?.value ?? '';
    zoom.querySelector('.bi-zoom-head b').textContent = `Szkic${name ? `: ${name}` : ''}`;
    zoom.querySelector('.bi-zoom-body').innerHTML = sk.innerHTML;
    zoom.hidden = false;
  });
}
