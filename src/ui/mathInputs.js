// Działania w polach liczbowych: w dowolnym polu liczbowym można wpisać np. 1100-70, 600/3, 2*18+5,
// a po Enter (albo wyjściu z pola) pole pokaże wynik (1030) i zapisze go jak zwykłą wartość.
//
// Jak to działa: pole typu number nie pozwala odczytać tekstu „1100-70”, więc gdy za liczbą pada
// znak działania (+ - * /), pole na chwilę przełącza się na tekstowe. W tym czasie zmiany nie trafiają
// do aplikacji (to tylko wpisywane działanie). Po Enter / wyjściu z pola — wynik, powrót do typu number
// i zwykłe zdarzenia input + change. Escape — powrót do wartości sprzed działania.
// Minus na początku pustego pola to nadal liczba ujemna.

const OPERATORS = new Set(['+', '-', '*', '/']);
const editing = new WeakMap(); // pole → wartość sprzed działania

export function initMathInputs(root = document) {
  root.addEventListener(
    'keydown',
    (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (editing.has(input)) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(input);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(input, editing.get(input));
        }
        return;
      }
      if (input.type !== 'number' || !OPERATORS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (input.value === '') return; // np. minus liczby ujemnej
      e.preventDefault();
      editing.set(input, input.value);
      const text = input.value + e.key;
      input.type = 'text';
      input.value = text;
      input.setSelectionRange(text.length, text.length);
    },
    true,
  );

  // Podczas wpisywania działania aplikacja nie dostaje niepełnych wartości.
  const swallow = (e) => {
    if (editing.has(e.target)) e.stopImmediatePropagation();
  };
  root.addEventListener('input', swallow, true);
  root.addEventListener('change', swallow, true);

  // Wyjście z pola — liczymy wynik.
  root.addEventListener(
    'blur',
    (e) => {
      if (editing.has(e.target)) commit(e.target);
    },
    true,
  );
}

function commit(input) {
  const result = evaluate(input.value);
  finish(input, result == null ? editing.get(input) : String(Math.round(result * 10) / 10));
}

function finish(input, value) {
  editing.delete(input);
  input.type = 'number';
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Wynik działania (+ - * /, nawiasy, przecinek jako kropka) albo null, gdy to nie jest poprawne działanie.
export function evaluate(text) {
  const src = text.replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9.+\-*/()]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  function number() {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i));
    if (!m) throw new Error('liczba');
    i += m[0].length;
    return Number(m[0]);
  }
  function factor() {
    if (peek() === '-') return i++, -factor();
    if (peek() === '+') return i++, factor();
    if (peek() === '(') {
      i++;
      const v = sum();
      if (peek() !== ')') throw new Error(')');
      i++;
      return v;
    }
    return number();
  }
  function product() {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = src[i++] === '*' ? v * factor() : v / factor();
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + product() : v - product();
    return v;
  }
  try {
    const v = sum();
    return i === src.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
