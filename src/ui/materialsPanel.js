import {
  MATERIAL_TYPES,
  MATERIAL_THICKNESSES,
  EDGE_BANDING_OPTIONS,
  createMaterial, TEXTURES, COLOR_PRESETS } from '../model/materials.js';
import { colorOptions } from './widgets.js';
import { COLLAPSE_BUTTON, COLLAPSE_ALL_BUTTONS, createCardCollapse } from './collapsible.js';
import { GOOGLE_ICON } from './projectsDialog.js';
import { listAccountMaterials, createAccountMaterial, updateAccountMaterial, deleteAccountMaterial } from '../state/account.js';
import { normalizeMaterials } from '../model/materials.js';
import { escapeHtml, readNumberInput, setIfNotFocused, commitEmptyAsZero } from './dom.js';

// Zakładka „Materiały”: biblioteka płyt projektu. Zmiana grubości materiału od razu przebudowuje
// wszystkie korpusy i blendy, które go używają.
// Nazwany kolor z listy dla koloru materiału. texture podany (null / 'wood'…) — musi pasować też wzór
// (dąb naturalny to kolor + słoje); bez texture (obrzeże) — wystarczy kolor.
function presetOf(hex, texture) {
  const h = String(hex ?? '').toLowerCase();
  if (texture === undefined) return COLOR_PRESETS.find((c) => c.hex === h);
  return COLOR_PRESETS.find((c) => c.hex === h && (c.texture ?? null) === texture);
}

// Najbliższy nazwany kolor (o tym samym wzorze) — podpowiedź przy kolorze spoza listy, np. „≈ biały”.
function nearestPreset(hex, texture) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = null;
  for (const c of COLOR_PRESETS.filter((x) => (x.texture ?? null) === texture)) {
    const [r2, g2, b2] = rgb(c.hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (!best || d < best.d) best = { d, c };
  }
  return best && best.d < 40 ** 2 * 3 ? best.c : null; // tylko gdy naprawdę podobny
}

// Materiał do zapisu na koncie: tylko jego cechy (bez identyfikatorów).
const materialData = (m) => ({
  name: m.name,
  type: m.type,
  thickness: m.thickness,
  color: String(m.color).toLowerCase(),
  edgeBanding: m.edgeBanding,
  edgeColor: m.edgeColor ? String(m.edgeColor).toLowerCase() : null,
  ...(m.texture ? { texture: m.texture } : {}),
});
const sameMaterial = (a, b) => JSON.stringify(materialData(a)) === JSON.stringify(materialData(b));

export function createMaterialsPanel(root, store) {
  let renderedKey = null;
  const cardCollapse = createCardCollapse(root, 'materiał'); // zwijane karty materiałów
  const structureKey = (project) => project.materials.map((m) => m.id).join('|');
  const updateMaterial = (id, patch) =>
    store.set((p) => ({ ...p, materials: p.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  // Gdzie materiał jest użyty (do podpowiedzi i ostrzeżenia przy usuwaniu).
  function usage(project, id) {
    const body = project.furniture.filter((c) => c.materialId === id).length;
    const blend = project.furniture.filter((c) => c.blendMaterialId === id).length;
    const trims = project.trims.filter((t) => t.materialId === id).length;
    const parts = [];
    if (body) parts.push(`korpus: ${body}`);
    if (blend) parts.push(`blendy korpusów: ${blend}`);
    if (trims) parts.push(`blendy dolne/górne: ${trims}`);
    return parts;
  }

  function render(project) {
    root.innerHTML = `
      <h2>Materiały</h2>
      <p class="hint">Płyty używane w projekcie. Materiał określa grubość i kolor elementów.
        <b>Obrzeże</b> to taśma (ABS/PCV) oklejająca krawędzie płyty — wymiar gotowego elementu
        zawiera obrzeże, a wymiar do cięcia jest o nie mniejszy. Domyślnie ma kolor płyty, ale można wybrać inny
        (w widoku 3D oklejone krawędzie mają kolor obrzeża). Lakierowany MDF i HDF zwykle nie mają obrzeża.</p>
      ${project.materials.length > 1 ? COLLAPSE_ALL_BUTTONS : ''}
      <div class="items">
        ${project.materials.map(renderMaterial).join('') || '<p class="empty">Brak materiałów.</p>'}
      </div>
      <div class="add-row"><button type="button" data-action="add-material">+ Materiał</button></div>
      <section class="material-library"></section>
      <datalist id="material-thicknesses">${MATERIAL_THICKNESSES.map((t) => `<option value="${t}"></option>`).join('')}</datalist>
    `;
    renderedKey = structureKey(project);
    updateStatus(project);
    renderLibrary();
    cardCollapse.applyAll();
  }

  function renderMaterial(m) {
    return `
      <div class="item material" data-kind="material" data-id="${m.id}">
        <div class="item-head">
          ${COLLAPSE_BUTTON}
          <input type="text" data-f="name" value="${escapeHtml(m.name)}" aria-label="Nazwa materiału" />
          <button type="button" class="cloud-save" data-cloud-save hidden>☁</button>
          <button type="button" class="danger" data-remove-material="${m.id}" title="Usuń">✕</button>
        </div>
        <div class="card-sum" data-collapse-card title="Kliknij, aby rozwinąć"><span class="sum-swatch"></span><span class="sum-text"></span></div>
        <div class="grid-3">
          <label class="field small">
            <span>Rodzaj</span>
            <select data-f="type">
              ${MATERIAL_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
            </select>
          </label>
          <label class="field small">
            <span>Grubość <small>mm</small></span>
            <input type="number" list="material-thicknesses" step="0.1" min="1" max="100" data-f="thickness" data-type="number" />
          </label>
          <label class="field small">
            <span>Obrzeże <small>mm</small></span>
            <select data-f="edgeBanding" data-type="number">
              ${EDGE_BANDING_OPTIONS.map((b) => `<option value="${b}">${b ? String(b).replace('.', ',') : 'brak'}</option>`).join('')}
            </select>
          </label>
          <label class="field small" title="Wygląd w 3D: jednolity kolor albo dekor z fakturą (słoje drewna, beton, marmur) w kolorze materiału">
            <span>Wzór</span>
            <select data-texture>
              ${TEXTURES.map((t) => `<option value="${t.key ?? ''}">${t.label}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="field small color-field wide" title="Kolor domyślny — używany tam, gdzie przy korpusie, blendzie czy froncie wybrano „jak w materiale”">
          <span>Kolor płyty</span>
          <span class="color-row">
            <select data-mat-color aria-label="Kolor płyty z listy">
              <option value="custom">własny (z próbnika obok)</option>
              ${colorOptions()}
            </select>
            <input type="color" data-f="color" title="Własny kolor płyty" />
          </span>
        </label>
        <div class="edge-color-row">
          <span>Kolor obrzeża:</span>
          <label class="check small"><input type="checkbox" data-edge-same /> jak płyta</label>
          <select data-edge-select aria-label="Kolor obrzeża z listy">
            <option value="custom">własny</option>
            ${colorOptions()}
          </select>
          <input type="color" data-edge-color title="Kolor obrzeża" />
        </div>
        <p class="material-usage hint"></p>
      </div>`;
  }

  function updateStatus(project) {
    for (const m of project.materials) {
      const el = root.querySelector(`.material[data-id="${m.id}"]`);
      if (!el) continue;
      el.querySelectorAll('[data-f]').forEach((input) => {
        if (!input.classList.contains('invalid')) setIfNotFocused(input, m[input.dataset.f]);
      });
      setIfNotFocused(el.querySelector('[data-texture]'), m.texture ?? '');
      // lista kolorów: nazwany kolor (np. kaszmirowy) albo „własny”, gdy kolor jest spoza listy
      const colorSelect = el.querySelector('[data-mat-color]');
      const named = presetOf(m.color, m.texture ?? null);
      const near = named ? null : nearestPreset(m.color, m.texture ?? null);
      colorSelect.querySelector('option[value="custom"]').textContent = named
        ? 'własny (z próbnika obok)'
        : `własny ${m.color}${near ? ` (≈ ${near.name})` : ''}`;
      setIfNotFocused(colorSelect, named?.hex ?? 'custom');
      // Kolor obrzeża: „jak płyta” albo własny; ukryty, gdy materiał nie ma obrzeża.
      const sameColor = m.edgeColor == null;
      const row = el.querySelector('.edge-color-row');
      row.hidden = !m.edgeBanding;
      row.querySelector('[data-edge-same]').checked = sameColor;
      const picker = row.querySelector('[data-edge-color]');
      picker.disabled = sameColor;
      setIfNotFocused(picker, m.edgeColor ?? m.color);
      const edgeSelect = row.querySelector('[data-edge-select]');
      edgeSelect.disabled = sameColor;
      setIfNotFocused(edgeSelect, presetOf(m.edgeColor ?? m.color)?.hex ?? 'custom');

      // zapis na koncie: nowy / zapisany / zmieniony od zapisu
      const cloudBtn = el.querySelector('[data-cloud-save]');
      cloudBtn.hidden = !account?.get().user;
      const saved = m.cloudId && library?.find((x) => x.id === m.cloudId);
      const state = !saved ? 'new' : sameMaterial(saved.data, m) ? 'saved' : 'changed';
      cloudBtn.textContent = { new: '☁ Zapisz', saved: '☁ ✓', changed: '☁ ↑' }[state];
      cloudBtn.title = {
        new: 'Zapisz ten materiał na koncie — będzie do wybrania w innych projektach',
        saved: 'Materiał jest zapisany na koncie',
        changed: 'Materiał zmieniono od zapisu — kliknij, aby zaktualizować go na koncie',
      }[state];
      cloudBtn.className = `cloud-save cloud-${state}`;
      const used = usage(project, m.id);
      // podsumowanie zwiniętej karty: rodzaj, grubość, kolor, obrzeże, użycie
      const sw = el.querySelector('.sum-swatch');
      sw.style.setProperty('--swatch', m.color);
      sw.className = `sum-swatch${m.texture ? ` tex-${m.texture}` : ''}`;
      const nearColor = nearestPreset(m.color, m.texture ?? null);
      const colorName = presetOf(m.color, m.texture ?? null)?.name ?? (nearColor ? `≈ ${nearColor.name}` : m.color);
      el.querySelector('.sum-text').textContent = [
        MATERIAL_TYPES.find((t) => t.key === m.type)?.label.replace(/ \(.*\)/, ''),
        `${String(m.thickness).replace('.', ',')} mm`,
        colorName,
        m.edgeBanding ? `obrzeże ${String(m.edgeBanding).replace('.', ',')}` : null,
        used.length ? used.join(', ') : 'nieużywany',
      ]
        .filter(Boolean)
        .join(' · ');
      el.querySelector('.material-usage').textContent = used.length ? `Używany — ${used.join(', ')}` : 'Nieużywany';
    }
  }

  root.addEventListener('input', (e) => {
    const input = e.target;
    const id = input.closest('.material')?.dataset.id;
    // Kolor obrzeża: zaznaczone „jak płyta” = null; odznaczenie zaczyna od koloru płyty.
    if (id && input.dataset.edgeSame !== undefined) {
      const m = store.get().materials.find((x) => x.id === id);
      updateMaterial(id, { edgeColor: input.checked ? null : m.color });
      return;
    }
    // Kolor płyty z listy: dekor (np. dąb) ustawia też wzór, kolor jednolity — wzór jednolity.
    if (id && input.dataset.matColor !== undefined) {
      const preset = COLOR_PRESETS.find((c) => c.hex === input.value);
      if (preset) updateMaterial(id, { color: preset.hex, texture: preset.texture ?? undefined });
      return;
    }
    if (id && input.dataset.edgeSelect !== undefined) {
      const preset = COLOR_PRESETS.find((c) => c.hex === input.value);
      if (preset) updateMaterial(id, { edgeColor: preset.hex });
      return;
    }
    if (id && input.dataset.edgeColor !== undefined) {
      updateMaterial(id, { edgeColor: input.value });
      return;
    }
    // Wzór (faktura): pusty — jednolity kolor
    if (id && input.dataset.texture !== undefined) {
      updateMaterial(id, { texture: input.value || undefined });
      return;
    }
    const field = input.dataset.f;
    if (!id || !field) return;
    let value = input.value;
    if (input.type === 'number') {
      value = readNumberInput(input);
      if (value === undefined) return;
    } else if (input.dataset.type === 'number') {
      value = Number(value);
    }
    updateMaterial(id, { [field]: value });
  });

  root.addEventListener('change', (e) => {
    const input = e.target;
    if (input.type !== 'number' || commitEmptyAsZero(input)) return;
    if (!input.classList.contains('invalid') && input.value.trim() !== '') return;
    input.classList.remove('invalid');
    const m = store.get().materials.find((x) => x.id === input.closest('.material')?.dataset.id);
    if (m) input.value = m[input.dataset.f];
  });

  root.addEventListener('click', async (e) => {
    if (cardCollapse.handleClick(e.target)) return;
    const cloud = e.target.closest('[data-cloud-save]');
    if (cloud) return saveToAccount(cloud.closest('.material').dataset.id);
    const lib = e.target.closest('[data-lib]');
    if (lib) return libraryAction(lib.dataset.lib, lib.dataset.id);
    const { action, removeMaterial } = e.target.dataset ?? {};
    if (action === 'add-material') {
      store.set((p) => ({ ...p, materials: [...p.materials, createMaterial()] }));
    } else if (removeMaterial) {
      const project = store.get();
      const used = usage(project, removeMaterial);
      const msg = used.length
        ? `Materiał jest używany (${used.join(', ')}). Elementy przejdą na pierwszy materiał tego samego rodzaju. Usunąć?`
        : 'Usunąć materiał?';
      if (confirm(msg)) store.set((p) => ({ ...p, materials: p.materials.filter((m) => m.id !== removeMaterial) }));
    }
  });

  // --- materiały na koncie (biblioteka użytkownika) ---
  let account = null;
  let library = null; // null — nie wczytano (albo nikt nie jest zalogowany)
  let libraryError = '';
  let libraryUser = null;

  async function loadLibrary() {
    try {
      library = await listAccountMaterials();
      libraryError = '';
    } catch (err) {
      libraryError = err.message;
    }
    renderLibrary();
    updateStatus(store.get());
  }

  async function saveToAccount(id) {
    const m = store.get().materials.find((x) => x.id === id);
    if (!m) return;
    try {
      const data = materialData(m);
      if (m.cloudId && library?.some((x) => x.id === m.cloudId)) {
        await updateAccountMaterial(m.cloudId, data);
      } else {
        const { id: cloudId } = await createAccountMaterial(data);
        updateMaterial(id, { cloudId });
      }
      await loadLibrary();
    } catch (err) {
      alert(`Nie udało się zapisać materiału na koncie: ${err.message}`);
    }
  }

  async function libraryAction(action, cloudId) {
    const item = library?.find((x) => x.id === cloudId);
    if (!item) return;
    if (action === 'add') {
      // kopia materiału z konta w projekcie (z własnym identyfikatorem w projekcie)
      const [material] = normalizeMaterials([{ ...item.data, id: createMaterial().id, cloudId }]);
      store.set((p) => ({ ...p, materials: [...p.materials, material] }));
      root.querySelector('.items > .material:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (action === 'delete') {
      if (!confirm(`Usunąć „${item.data.name}” z konta? Materiały w projektach zostaną bez zmian.`)) return;
      try {
        await deleteAccountMaterial(cloudId);
        await loadLibrary();
      } catch (err) {
        alert(err.message);
      }
    }
  }

  function renderLibrary() {
    const box = root.querySelector('.material-library');
    if (!box) return;
    const s = account?.get();
    if (!s?.loaded || (!s.user && !s.loginAvailable)) {
      box.innerHTML = '';
      return;
    }
    if (!s.user) {
      box.innerHTML = `<h3>Moje materiały na koncie</h3>
        <p class="hint">Po zalogowaniu zapiszesz tu swoje płyty — z kolorem, grubością i obrzeżem — i wstawisz je
          w kolejnych projektach, na każdym urządzeniu. Konto znajdziesz też pod ikonką w prawym górnym rogu.</p>
        <a class="google-login library-login" href="${account.loginUrl}">${GOOGLE_ICON}<span>Zaloguj przez Google</span></a>`;
      return;
    }
    const inProject = new Set(store.get().materials.map((m) => m.cloudId).filter(Boolean));
    const typeLabel = (t) => MATERIAL_TYPES.find((x) => x.key === t)?.label ?? '';
    const item = (x) => `
      <li>
        <span class="library-swatch${x.data.texture ? ` tex-${x.data.texture}` : ''}" style="--swatch:${x.data.color}"></span>
        <span class="library-name"><b>${escapeHtml(x.data.name)}</b><small>${String(x.data.thickness).replace('.', ',')} mm · ${escapeHtml(typeLabel(x.data.type))}</small></span>
        ${
          inProject.has(x.id)
            ? '<span class="library-badge">w projekcie</span>'
            : `<button type="button" data-lib="add" data-id="${x.id}" title="Dodaj ten materiał do bieżącego projektu">+ Do projektu</button>`
        }
        <button type="button" class="danger" data-lib="delete" data-id="${x.id}" title="Usuń z konta">✕</button>
      </li>`;
    const list =
      library == null
        ? `<p class="hint">${libraryError ? `⚠ ${escapeHtml(libraryError)}` : 'Wczytuję…'}</p>`
        : library.length
          ? `<ul class="library-list">${library.map(item).join('')}</ul>`
          : '<p class="hint">Nie masz jeszcze materiałów na koncie. Kliknij „☁ Zapisz” przy materiale powyżej.</p>';
    box.innerHTML = `<h3>Moje materiały na koncie</h3>
      <p class="hint">Twoje płyty zapisane na koncie — do wstawienia w każdym projekcie.</p>${list}`;
  }

  render(store.get());

  return {
    // Konto (logowanie) — po zalogowaniu wczytujemy materiały z konta.
    setAccount(acc) {
      account = acc;
      acc.onChange((s) => {
        const who = s.user?.email ?? null;
        if (who !== libraryUser) {
          libraryUser = who;
          library = null;
          libraryError = '';
          if (who) loadLibrary();
        }
        renderLibrary();
        updateStatus(store.get());
      });
    },
    sync(project, meta = {}) {
      if (meta.replace || structureKey(project) !== renderedKey) render(project);
      else {
        updateStatus(project);
        renderLibrary(); // „w projekcie” przy materiałach z konta
      }
    },
  };
}
