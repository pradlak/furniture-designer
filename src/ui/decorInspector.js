import { escapeHtml, readNumberInput, setIfNotFocused } from './dom.js';
import { decorType, centerDecoration } from '../model/decorations.js';
import { trimBox } from '../model/trims.js';
import { boardBox } from '../model/boards.js';
const helpers = { trimBox, boardBox };

// Okienko zaznaczonej dekoracji (lampa, kwiatek, okno, obraz, książki, dywan) po prawej stronie widoku 3D:
// nazwa, położenie, wymiary, obrót, kolor; duplikuj, usuń. Tylko wygląd — nie trafia do formatek.
export function createDecorInspector(viewport, store, ui) {
  const root = document.createElement('aside');
  root.className = 'board-inspector decor-inspector';
  root.hidden = true;
  viewport.appendChild(root);
  let shownId = null;
  const current = () => {
    const sel = ui.get().selectedBlends ?? [];
    if (sel.length !== 1 || !sel[0].startsWith('decor:')) return null;
    return (store.get().decorations ?? []).find((d) => d.id === sel[0].slice(6)) ?? null;
  };
  const num = (label, key, step = 10, title = '') =>
    `<label class="bi-field" ${title ? `title="${title}"` : ''}><span>${label}</span><input type="number" step="${step}" data-dc="${key}" /><small>${key === 'rotation' ? '°' : 'mm'}</small></label>`;
  function render(d) {
    const t = decorType(d.type);
    root.innerHTML = `
      <div class="bi-head"><b>${t.icon} <span data-dc-title></span></b>
        <button type="button" class="icon tiny" data-dc-close title="Zamknij">✕</button></div>
      <p class="bi-note">${escapeHtml(t.label)} — tylko wygląd (nie trafia do formatek). W 3D: przeciągnij, żeby przesunąć${t.place === 'wall' ? ' po ścianie' : ' (Shift — w pionie)'}.</p>
      <label class="bi-field wide"><span>Nazwa</span><input type="text" data-dc="name" /></label>
      <div class="bi-sec">Położenie</div>
      <div class="bi-grid">${num('Od lewej', 'x')}${num('Od podłogi', 'y')}${num('Od tyłu', 'z')}</div>
      <div class="dc-center">
        <button type="button" data-dc-center="h" title="Na środku między najbliższymi sąsiadami z lewej i z prawej (ściany, meble, inne dekoracje)">⇔ Wyśrodkuj poziomo</button>
        ${['wall', 'ceiling'].includes(t.place) ? '<button type="button" data-dc-center="v" title="Na środku między tym, co pod spodem (podłoga, blat, korpus), a tym, co nad nią (sufit, szafka, okap)">⇕ Wyśrodkuj pionowo</button>' : ''}
      </div>
      <div class="bi-sec bi-sec-row">Wymiary
        <label class="dc-ratio" title="Zmiana jednego wymiaru skaluje pozostałe w tej samej proporcji"><input type="checkbox" data-dc-ratio /> 🔗 zachowaj proporcje</label>
      </div>
      <div class="bi-grid">${num('Szerokość', 'width')}${num('Wysokość', 'height')}${num('Głębokość', 'depth')}${t.place === 'wall' ? '' : num('Obrót', 'rotation', 15, 'Obrót wokół pionu (stopnie)')}</div>
      <div class="bi-sec">Kolor</div>
      <div class="dc-color"><input type="color" data-dc="color" /> <button type="button" class="icon tiny" data-dc-color-reset title="Kolor domyślny">↺ domyślny</button></div>
      <div class="bi-actions dc-actions">
        <button type="button" data-dc-dup>⧉ Duplikuj</button>
        <button type="button" class="danger" data-dc-del>🗑 Usuń</button>
      </div>`;
  }
  function sync() {
    const d = current();
    if (!d) {
      root.hidden = true;
      shownId = null;
      return;
    }
    if (shownId !== d.id) render(d);
    shownId = d.id;
    root.hidden = false;
    root.querySelector('[data-dc-title]').textContent = d.name;
    // przyciski wyśrodkowania — opis, między czym (albo nieaktywne, gdy już na środku)
    root.querySelectorAll('[data-dc-center]').forEach((b) => {
      const c = centerDecoration(store.get(), d.id, b.dataset.dcCenter, helpers);
      b.disabled = !c;
      b.title = c ? `Wyśrodkuj ${c.label}` : 'Już na środku (albo brak miejsca między sąsiadami)';
    });
    root.querySelector('[data-dc-ratio]').checked = d.keepRatio !== false;
    root.querySelectorAll('[data-dc]').forEach((inp) => {
      const k = inp.dataset.dc;
      if (k === 'color') setIfNotFocused(inp, d.color ?? decorType(d.type).color ?? '#9ca3af');
      else setIfNotFocused(inp, d[k]);
    });
  }
  const set = (patch) => store.set((p) => ({ ...p, decorations: p.decorations.map((x) => (x.id === shownId ? { ...x, ...patch } : x)) }));
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-dc-ratio]')) return set({ keepRatio: e.target.checked });
    const k = e.target.dataset.dc;
    if (!k) return;
    if (k === 'name') return set({ name: e.target.value });
    if (k === 'color') return set({ color: e.target.value });
    if (e.target.matches('[data-dc-ratio]')) return set({ keepRatio: e.target.checked });
    const v = readNumberInput(e.target);
    if (v === undefined) return;
    // wymiar przy zachowanych proporcjach — dopiero po zatwierdzeniu (change), nie przy każdej cyfrze
    const d = current();
    if (d && d.keepRatio !== false && ['width', 'height', 'depth'].includes(k)) return;
    set({ [k]: v });
  });
  // wymiar przy zachowanych proporcjach (Enter, wyjście z pola, strzałki ▲▼) — pozostałe dwa w tej samej skali
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.dc;
    const d = current();
    if (!d || d.keepRatio === false || !['width', 'height', 'depth'].includes(k)) return;
    const v = readNumberInput(e.target);
    if (v === undefined || !(d[k] > 0) || !(v > 0)) return;
    const f = v / d[k];
    const patch = {};
    for (const dim of ['width', 'height', 'depth']) patch[dim] = dim === k ? v : Math.max(2, Math.round(d[dim] * f));
    set(patch);
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-dc-close]')) ui.set({ ...ui.get(), selectedBlends: [] });
    else if (e.target.closest('[data-dc-color-reset]')) set({ color: null });
    else if (e.target.closest('[data-dc-center]')) {
      const c = centerDecoration(store.get(), shownId, e.target.closest('[data-dc-center]').dataset.dcCenter, helpers);
      if (c) set(c.pos);
    }
    else if (e.target.closest('[data-dc-dup]')) {
      const d = current();
      if (!d) return;
      const copy = { ...structuredClone(d), id: crypto.randomUUID?.() ?? String(Date.now()), x: d.x + 200, name: `${d.name} (kopia)` };
      store.set((p) => ({ ...p, decorations: [...p.decorations, copy] }));
      ui.set({ ...ui.get(), selectedBlends: [`decor:${copy.id}`] });
    } else if (e.target.closest('[data-dc-del]')) {
      const id = shownId;
      ui.set({ ...ui.get(), selectedBlends: [] });
      store.set((p) => ({ ...p, decorations: p.decorations.filter((x) => x.id !== id) }));
    }
  });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('wheel', (e) => e.stopPropagation());
  store.subscribe(sync);
  ui.subscribe(sync);
  sync();
}
