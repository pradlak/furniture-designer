import { escapeHtml } from './dom.js';
import { COLOR_PRESETS } from '../model/materials.js';

// Wspólne elementy formularzy paneli mebli i blend.

// Przycisk 👁: wyszarzony, gdy element jest ukryty w widoku 3D.
export function setEye(btn, hidden, what) {
  if (!btn) return;
  btn.classList.toggle('off', !!hidden);
  btn.title = hidden ? `Pokaż ${what} w widoku 3D` : `Ukryj ${what} w widoku 3D`;
}

// --- Wybór koloru (niezależny od materiału) ---
// Lista: „jak w materiale”, gotowe kolory z nazwami i „własny…” (próbnik koloru obok).
// path — ścieżka w obiekcie (np. 'colors.front' w korpusie, 'color' w blendzie wspólnej).
// Odczyt zmiany: readColorInput(input) → { path, value } (value: { hex, name } albo null).
// Lista kolorów pogrupowana: jednolite kolory i dekory z fakturą (drewno, beton, marmur).
const COLOR_GROUPS = [
  { label: 'Kolory jednolite', test: (c) => !c.texture },
  { label: 'Dekory drewna', test: (c) => c.texture === 'wood' },
  { label: 'Beton i marmur', test: (c) => c.texture === 'concrete' || c.texture === 'marble' },
];
export const colorOptions = () =>
  COLOR_GROUPS.map(
    (g) => `<optgroup label="${g.label}">${COLOR_PRESETS.filter(g.test).map((c) => `<option value="${c.hex}">${escapeHtml(c.name)}</option>`).join('')}</optgroup>`,
  ).join('');

// wide — pole na całą szerokość karty (np. blat: wybór dekoru)
export function colorPicker(label, path, { wide = false, resetLabel = 'jak w materiale' } = {}) {
  return `
    <label class="field small color-field${wide ? ' wide' : ''}">
      <span>${label}</span>
      <span class="color-row">
        <select data-color-select="${path}">
          <option value="">${resetLabel}</option>
          ${colorOptions()}
          <option value="custom">własny…</option>
        </select>
        <input type="color" data-color-custom="${path}" title="Własny kolor" />
      </span>
    </label>`;
}

export function readColorInput(input) {
  if (input.dataset.colorSelect) {
    const preset = COLOR_PRESETS.find((c) => c.hex === input.value);
    if (input.value === '') return { path: input.dataset.colorSelect, value: null };
    if (preset) return { path: input.dataset.colorSelect, value: { ...preset } };
    // „własny…” — bierzemy kolor z próbnika obok
    const custom = input.parentElement.querySelector('[data-color-custom]').value;
    return { path: input.dataset.colorSelect, value: { hex: custom, name: `własny ${custom}` } };
  }
  if (input.dataset.colorCustom) {
    const preset = COLOR_PRESETS.find((c) => c.hex === input.value.toLowerCase());
    return { path: input.dataset.colorCustom, value: preset ? { ...preset } : { hex: input.value, name: `własny ${input.value}` } };
  }
  return null;
}

// Pokazuje w polach kolor obiektu (color — { hex, name } albo null; fallbackHex — kolor materiału).
export function syncColorPicker(root, path, color, fallbackHex) {
  const select = root.querySelector(`[data-color-select="${path}"]`);
  const custom = root.querySelector(`[data-color-custom="${path}"]`);
  if (!select || !custom) return;
  const preset = color && COLOR_PRESETS.find((c) => c.hex === color.hex);
  if (document.activeElement !== select) select.value = !color ? '' : preset ? preset.hex : 'custom';
  if (document.activeElement !== custom) custom.value = color?.hex ?? fallbackHex ?? '#ffffff';
  select.title = color ? `Kolor: ${color.name}` : 'Kolor jak w wybranym materiale';
}

// Lista wyboru materiału z biblioteki projektu.
export function materialSelect(label, field, project) {
  return `
    <label class="field small">
      <span>${label}</span>
      <select data-f="${field}">
        ${project.materials.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${m.thickness} mm)</option>`).join('')}
      </select>
    </label>`;
}
