export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function numberField(label, key, value, { min, max, step = 1, unit, small } = {}) {
  return `
    <label class="field${small ? ' small' : ''}">
      <span>${label}${unit ? ` <small>${unit}</small>` : ''}</span>
      <input type="number" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}
        data-f="${key}" value="${value}" />
    </label>`;
}

// Odczyt pola liczbowego z walidacją min/max. Zwraca undefined, gdy wartości nie należy zapisywać
// (puste pole w trakcie pisania albo wartość poza zakresem — wtedy pole dostaje klasę .invalid).
export function readNumberInput(input) {
  if (input.value.trim() === '') return undefined;
  const value = Number(input.value);
  const tooLow = input.min !== '' && value < Number(input.min);
  const tooHigh = input.max !== '' && value > Number(input.max);
  if (!Number.isFinite(value) || tooLow || tooHigh) {
    input.classList.add('invalid');
    return undefined;
  }
  input.classList.remove('invalid');
  return value;
}

export function setIfNotFocused(input, value) {
  if (input && document.activeElement !== input) input.value = value;
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}
