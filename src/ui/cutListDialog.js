import { CUT_LIST_PARTS } from '../model/cutList.js';
import { escapeHtml } from './dom.js';

// Okienko „Formatki”: wybór formatu (Excel / CSV) i tego, co wyeksportować (korpusy, plecy HDF,
// fronty, blendy, blaty, akcesoria). Ostatni wybór pamiętamy w przeglądarce (tylko wygoda).
// onExport({ format: 'xlsx' | 'csv', parts: Set, accessories: boolean })
const STORAGE_KEY = 'furnitureDesigner.cutListExport';

export function createCutListDialog({ onExport }) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="welcome cut-list-dialog" role="dialog" aria-modal="true" aria-labelledby="cut-list-title">
      <h2 id="cut-list-title">Formatki do rozkroju</h2>
      <p class="welcome-note">Lista płyt do zamówienia cięcia (z wymiarami do cięcia, okleiną i obróbką).</p>
      <fieldset class="cut-list-group">
        <legend>Format pliku</legend>
        <label class="check"><input type="radio" name="cut-format" value="xlsx" checked />
          <span><b>Excel (.xlsx)</b> <small>— najczytelniejszy: nagłówki, szerokie kolumny, arkusze</small></span></label>
        <label class="check"><input type="radio" name="cut-format" value="csv" />
          <span><b>CSV</b> <small>— zwykły tekst z tabulatorami, np. do programu do rozkroju</small></span></label>
      </fieldset>
      <fieldset class="cut-list-group">
        <legend>Co wyeksportować
          <button type="button" class="link-button" data-cut="all">wszystko</button> ·
          <button type="button" class="link-button" data-cut="none">nic</button>
        </legend>
        ${CUT_LIST_PARTS.map(
          (p) => `<label class="check"><input type="checkbox" data-part="${p.key}" checked />
            <span>${escapeHtml(p.label)}${p.hint ? ` <small>— ${escapeHtml(p.hint)}</small>` : ''}</span></label>`,
        ).join('')}
        <label class="check"><input type="checkbox" data-part="accessories" checked />
          <span>Akcesoria <small>— nóżki, zawiasy, prowadnice, uchwyty</small></span></label>
      </fieldset>
      <p class="warning cut-list-empty" hidden>Zaznacz przynajmniej jedną rzecz do eksportu.</p>
      <div class="welcome-actions">
        <button type="button" data-cut="cancel">Anuluj</button>
        <button type="button" class="primary" data-cut="export">💾 Pobierz</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const boxes = () => [...overlay.querySelectorAll('[data-part]')];
  const close = () => (overlay.hidden = true);

  // ostatni wybór (gdy przeglądarka pozwala na zapis)
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!saved) return;
      const radio = overlay.querySelector(`input[name="cut-format"][value="${saved.format}"]`);
      if (radio) radio.checked = true;
      for (const b of boxes()) if (b.dataset.part in saved.include) b.checked = saved.include[b.dataset.part];
    } catch {
      /* bez zapamiętanego wyboru — domyślnie wszystko, Excel */
    }
  }
  function remember(format) {
    try {
      const include = Object.fromEntries(boxes().map((b) => [b.dataset.part, b.checked]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ format, include }));
    } catch {
      /* nic się nie stało — następnym razem domyślny wybór */
    }
  }

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-cut]')?.dataset.cut;
    if (e.target === overlay || action === 'cancel') close();
    if (action === 'all' || action === 'none') boxes().forEach((b) => (b.checked = action === 'all'));
    if (action === 'export') {
      const checked = boxes().filter((b) => b.checked).map((b) => b.dataset.part);
      overlay.querySelector('.cut-list-empty').hidden = checked.length > 0;
      if (!checked.length) return;
      const format = overlay.querySelector('input[name="cut-format"]:checked').value;
      remember(format);
      close();
      onExport({ format, parts: new Set(checked.filter((k) => k !== 'accessories')), accessories: checked.includes('accessories') });
    }
  });
  overlay.addEventListener('change', () => (overlay.querySelector('.cut-list-empty').hidden = true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    open() {
      restore();
      overlay.querySelector('.cut-list-empty').hidden = true;
      overlay.hidden = false;
      overlay.querySelector('[data-cut="export"]').focus();
    },
  };
}
