import { HIGHLIGHT_PRESETS, UNITS, DEFAULT_SETTINGS, getSettings, setSettings, onSettingsChange } from '../state/settings.js';
import { escapeHtml } from './dom.js';

// Pola ustawień (kolor zaznaczenia w 3D, jednostki) — wspólne dla okienka „Ustawienia” (koło zębate, bez
// logowania) i menu pod awatarem (po zalogowaniu). Zmiany działają od razu.
export function settingsFieldsHtml({ compact = false } = {}) {
  return `
    <fieldset class="settings-group">
      <legend>Kolor zaznaczenia w 3D</legend>
      ${compact ? '' : '<p class="welcome-note">Kolor, na który podświetlają się zaznaczone korpusy, fronty, blendy, nóżki i otwory.</p>'}
      <div class="swatches">
        ${HIGHLIGHT_PRESETS.map(
          (c) => `<button type="button" class="swatch" data-highlight="${c.hex}" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" style="--swatch:${c.hex}"></button>`,
        ).join('')}
        <label class="swatch-custom" title="Własny kolor">własny <input type="color" data-highlight-custom /></label>
      </div>
    </fieldset>
    <fieldset class="settings-group">
      <legend>Jednostki</legend>
      <label class="field small">
        <span>Wymiary na widoku 3D</span>
        <select data-units>
          ${UNITS.map((u) => `<option value="${u.key}">${escapeHtml(u.label)}</option>`).join('')}
        </select>
      </label>
      ${compact ? '' : '<p class="welcome-note">Pola w panelach i lista formatek są zawsze w milimetrach.</p>'}
    </fieldset>`;
}

// Obsługa pól ustawień w kontenerze root (kliknięcia, zmiany, „Przywróć domyślne” — [data-settings="reset"]).
export function bindSettingsFields(root) {
  const sync = () => {
    const s = getSettings();
    root.querySelectorAll('[data-highlight]').forEach((b) => b.classList.toggle('selected', b.dataset.highlight === s.highlight));
    const custom = root.querySelector('[data-highlight-custom]');
    if (custom) custom.value = s.highlight;
    const units = root.querySelector('[data-units]');
    if (units) units.value = s.units;
  };
  root.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-highlight]');
    if (swatch) setSettings({ highlight: swatch.dataset.highlight });
    if (e.target.closest('[data-settings="reset"]')) setSettings({ ...DEFAULT_SETTINGS });
  });
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-highlight-custom]')) setSettings({ highlight: e.target.value });
    if (e.target.matches('[data-units]')) setSettings({ units: e.target.value });
  });
  onSettingsChange(sync); // także zmiany z konta (po zalogowaniu) i z drugiego miejsca
  sync();
  return sync;
}

// Okienko „Ustawienia” (koło zębate na pasku — gdy nikt nie jest zalogowany).
export function createSettingsDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <h2 id="settings-title">Ustawienia</h2>
      <p class="welcome-note">Dotyczą tej przeglądarki — nie zmieniają projektu. Po zalogowaniu zapamiętują się na koncie.</p>
      ${settingsFieldsHtml()}
      <div class="welcome-actions">
        <button type="button" data-settings="reset">Przywróć domyślne</button>
        <button type="button" class="primary" data-settings="close">Gotowe</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const sync = bindSettingsFields(overlay);
  const close = () => (overlay.hidden = true);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-settings="close"]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    open() {
      sync();
      overlay.hidden = false;
      overlay.querySelector('[data-settings="close"]').focus();
    },
  };
}
