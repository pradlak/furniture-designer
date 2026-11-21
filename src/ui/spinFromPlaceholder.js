// Pola liczbowe z wartością domyślną w podpowiedzi (puste pole = automatycznie, np. placeholder „18 (materiał)”,
// „250 (auto)”): przeglądarka przy strzałkach (▲▼ w polu albo ↑ / ↓ na klawiaturze) liczy od zera / minimum,
// więc z 18 robiło się 1. Tu — tuż przed zmianą strzałką — wpisujemy do pustego pola wartość z podpowiedzi,
// a przeglądarka zmienia ją o krok (18 → 19). Samo kliknięcie w pole (żeby pisać) niczego nie wpisuje.

const SPINNER_PX = 22; // szerokość strzałek ▲▼ z prawej strony pola

function fillFromPlaceholder(input) {
  if (input?.type !== 'number' || input.value !== '' || input.disabled || input.readOnly) return;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(input.placeholder ?? '');
  if (m) input.value = m[1].replace(',', '.');
}

export function initSpinFromPlaceholder(root = document) {
  // klik w strzałki ▲▼ (prawa krawędź pola)
  root.addEventListener(
    'mousedown',
    (e) => {
      const input = e.target;
      if (input?.tagName !== 'INPUT' || input.type !== 'number') return;
      if (e.offsetX >= input.clientWidth - SPINNER_PX) fillFromPlaceholder(input);
    },
    true,
  );
  // ↑ / ↓ na klawiaturze
  root.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') fillFromPlaceholder(e.target);
    },
    true,
  );
}
