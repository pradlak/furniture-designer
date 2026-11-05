import { escapeHtml } from './dom.js';

// Wspólne elementy formularzy paneli mebli i blend.

// Przycisk 👁: wyszarzony, gdy element jest ukryty w widoku 3D.
export function setEye(btn, hidden, what) {
  if (!btn) return;
  btn.classList.toggle('off', !!hidden);
  btn.title = hidden ? `Pokaż ${what} w widoku 3D` : `Ukryj ${what} w widoku 3D`;
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
