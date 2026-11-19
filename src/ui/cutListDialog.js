import { CUT_LIST_PARTS, cutListItems, buildAccessories, BOARDS_KEY, MEBLEPL_CUTTING } from '../model/cutList.js';
import { MATERIAL_TYPES } from '../model/materials.js';
import { escapeHtml } from './dom.js';

// Okienko „Formatki”: wybór formatu (Excel / CSV / meble.pl…) i tego, co wyeksportować — rodzaje płyt
// (korpusy, plecy HDF, fronty, blendy, blaty, akcesoria), które meble i które materiały.
//
// Grupy zależą od siebie: pole, które przy wyborze w pozostałych grupach nie da ani jednej formatki
// (np. „Fronty”, gdy wszystkie fronty są z MDF, a MDF jest odznaczony), jest wyszarzone i odznaczone.
// Każde pole pamięta wybór użytkownika (data-intent) — gdy znów stanie się dostępne, wraca do niego.
// Dostępność liczymy zawsze względem wyboru użytkownika w innych grupach (a nie wyszarzeń), więc
// odznaczenie czegoś nigdy nie blokuje na stałe innych pól. Przy polach — ile sztuk płyt obejmują.
//
// Ostatni wybór formatu i rodzajów płyt pamiętamy w przeglądarce (tylko wygoda); meble i materiały
// zależą od projektu — przy każdym otwarciu zaznaczone są wszystkie.
// onExport({ format: 'xlsx' | 'csv' | 'meblepl' | 'mdf' | 'worktops', parts: Set, accessories: boolean,
//            filter: { cabinetIds?: Set, boards?: false, materials?: Set } }) — przy meble.pl akcesoria pomijamy;
// w filter tylko to, co zawężone (wszystko zaznaczone = bez pola).
const STORAGE_KEY = 'furnitureDesigner.cutListExport';
const WHOLE_PROJECT = new Set(['mdf', 'worktops']); // formaty zawsze z całego projektu

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
        <label class="check"><input type="radio" name="cut-format" value="meblepl" />
          <span><b>meble.pl</b> <small>— plik do wczytania w <a href="https://www.meble.pl/rozkroj,plyty-meblowe" target="_blank" rel="noopener">rozkroju na meble.pl</a>: wszystko z płyty meblowej (korpusy, a także fronty i blendy, jeśli są z płyty meblowej) i plecy HDF; osobny plik dla każdej płyty</small></span></label>
        <label class="check"><input type="radio" name="cut-format" value="mdf" />
          <span><b>Fronty i blendy MDF</b> <small>— elementy z MDF lakierowanego (np. do zamówienia w <a href="https://smartfronty.pl/" target="_blank" rel="noopener">smartfronty.pl</a>): lista w Excelu i rysunek każdego elementu z otworami pod uchwyty i zawiasy</small></span></label>
        <label class="check"><input type="radio" name="cut-format" value="worktops" />
          <span><b>Blaty i płyty z otworami</b> <small>— blaty na szafkach i samodzielne blaty i półki: lista w Excelu i rysunek każdej płyty z góry — wymiary, otwory i wycięcia (zlew, płyta grzewcza…), frezy krawędzi</small></span></label>
      </fieldset>
      <p class="hint cut-list-whole" hidden>Ten format obejmuje zawsze cały projekt — poniższy wybór (rodzaje płyt, meble, materiały) go nie dotyczy.</p>
      <p class="hint cut-list-meblepl" hidden>meble.pl tnie tylko płyty meblowe i HDF — pozostałe materiały są wyszarzone.</p>
      <fieldset class="cut-list-group">
        <legend>Co wyeksportować
          <button type="button" class="link-button" data-pick="part" data-on="1">wszystko</button> ·
          <button type="button" class="link-button" data-pick="part" data-on="0">nic</button>
        </legend>
        ${CUT_LIST_PARTS.map(
          (p) => `<label class="check"><input type="checkbox" data-part="${p.key}" checked />
            <span>${escapeHtml(p.label)}${p.hint ? ` <small>— ${escapeHtml(p.hint)}</small>` : ''} <small class="cut-count"></small></span></label>`,
        ).join('')}
        <label class="check"><input type="checkbox" data-part="accessories" checked />
          <span>Akcesoria <small>— nóżki, zawiasy, prowadnice, uchwyty</small> <small class="cut-count"></small></span></label>
      </fieldset>
      <fieldset class="cut-list-group">
        <legend>Które meble
          <button type="button" class="link-button" data-pick="cabinet" data-on="1">wszystkie</button> ·
          <button type="button" class="link-button" data-pick="cabinet" data-on="0">żaden</button>
        </legend>
        <small>Blendy dolne, górne i blaty — gdy obejmują choć jeden z zaznaczonych korpusów (w całości).</small>
        <div class="cut-list-scroll cut-list-cabinets"></div>
      </fieldset>
      <fieldset class="cut-list-group">
        <legend>Które materiały
          <button type="button" class="link-button" data-pick="material" data-on="1">wszystkie</button> ·
          <button type="button" class="link-button" data-pick="material" data-on="0">żaden</button>
        </legend>
        <div class="cut-list-scroll cut-list-materials"></div>
      </fieldset>
      <p class="warning cut-list-empty" hidden></p>
      <div class="welcome-actions">
        <button type="button" data-cut="cancel">Anuluj</button>
        <button type="button" class="primary" data-cut="export">💾 Zapisz</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const picks = (kind) => [...overlay.querySelectorAll(`input[data-${kind}]`)];
  const close = () => (overlay.hidden = true);
  const format = () => overlay.querySelector('input[name="cut-format"]:checked').value;
  const typeLabel = (t) => MATERIAL_TYPES.find((x) => x.key === t)?.label.replace(/ \(.*\)/, '') ?? '';
  const intent = (b) => b.dataset.intent !== '0';
  const setIntent = (b, on) => (b.dataset.intent = on ? '1' : '0');
  const pcs = (n) => `${n} szt.`;

  // Dane bieżącego projektu (przy otwarciu): pojedyncze elementy i korpusy z akcesoriami.
  let items = [];
  let accessoryCabinets = new Set();

  // Lista mebli i materiałów bieżącego projektu — wszystko zaznaczone.
  function fill(project) {
    items = cutListItems(project);
    accessoryCabinets = new Set(project.furniture.filter((c) => buildAccessories(project, new Set([c.id])).length).map((c) => c.id));
    const cabinets = project.furniture.map((c) => ({ id: c.id, label: escapeHtml(c.name), extra: `${c.width} × ${c.height} × ${c.depth} mm` }));
    if (project.boards?.length) cabinets.push({ id: BOARDS_KEY, label: 'Samodzielne blaty i półki', extra: '' });
    overlay.querySelector('.cut-list-cabinets').innerHTML = cabinets
      .map(
        (c) => `<label class="check"><input type="checkbox" data-cabinet="${escapeHtml(c.id)}" checked />
          <span>${c.label} <small>${c.extra ? `— ${c.extra}` : ''}</small> <small class="cut-count"></small></span></label>`,
      )
      .join('');
    // najpierw płyty meblowe, potem HDF, MDF, blaty
    const order = (t) => (t === 'chipboard' ? 0 : t === 'hdf' ? 1 : t === 'mdf' ? 2 : 3);
    const materials = [...new Map(items.map((it) => [it.material, it.materialType])).entries()].sort(
      ([a, ta], [b, tb]) => order(ta) - order(tb) || a.localeCompare(b, 'pl'),
    );
    overlay.querySelector('.cut-list-materials').innerHTML =
      materials
        .map(
          ([name, type]) => `<label class="check"><input type="checkbox" data-material="${escapeHtml(name)}" checked />
            <span>${escapeHtml(name)} <small>— ${escapeHtml(typeLabel(type))}</small> <small class="cut-count"></small></span></label>`,
        )
        .join('') || '<small>Brak płyt w projekcie.</small>';
    for (const kind of ['cabinet', 'material']) picks(kind).forEach((b) => setIntent(b, true));
  }

  // Zależności między grupami: dostępność i liczba sztuk każdego pola względem wyboru w pozostałych grupach.
  function update() {
    const fmt = format();
    const whole = WHOLE_PROJECT.has(fmt);
    const meblepl = fmt === 'meblepl';
    overlay.querySelector('.cut-list-whole').hidden = !whole;
    overlay.querySelector('.cut-list-meblepl').hidden = !meblepl;
    overlay.querySelectorAll('.cut-list-group:not(:first-of-type)').forEach((g) => g.classList.toggle('inactive', whole));

    const pool = meblepl ? items.filter((it) => it.materialType in MEBLEPL_CUTTING) : items;
    const chosen = (kind) => new Set(picks(kind).filter(intent).map((b) => b.dataset[kind]));
    const P = chosen('part');
    const C = chosen('cabinet');
    const M = chosen('material');
    const okP = (it) => P.has(it.category);
    const okC = (it) => it.cabinetIds.some((id) => C.has(id));
    const okM = (it) => M.has(it.material);
    const count = (test) => pool.filter(test).length;
    const accessoriesWanted = !meblepl && P.has('accessories');

    const apply = (box, n, available = n > 0) => {
      box.disabled = !available;
      box.checked = available && intent(box);
      box.closest('label').classList.toggle('unavailable', !available);
      const el = box.closest('label').querySelector('.cut-count');
      if (el) el.textContent = n > 0 ? `(${pcs(n)})` : available ? '' : '(brak)';
    };

    for (const box of picks('part')) {
      const key = box.dataset.part;
      if (key === 'accessories') {
        // akcesoria zależą tylko od mebli (meble.pl ich nie przyjmuje)
        const available = !meblepl && [...C].some((id) => accessoryCabinets.has(id));
        apply(box, 0, available);
        continue;
      }
      apply(box, count((it) => it.category === key && okC(it) && okM(it)));
    }
    for (const box of picks('cabinet')) {
      const id = box.dataset.cabinet;
      const n = count((it) => it.cabinetIds.includes(id) && okP(it) && okM(it));
      apply(box, n, n > 0 || (accessoriesWanted && accessoryCabinets.has(id)));
    }
    for (const box of picks('material')) {
      const name = box.dataset.material;
      apply(box, count((it) => it.material === name && okP(it) && okC(it)));
    }
  }

  // ostatni wybór (gdy przeglądarka pozwala na zapis)
  function restore() {
    picks('part').forEach((b) => setIntent(b, true));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!saved) return;
      const radio = overlay.querySelector(`input[name="cut-format"][value="${saved.format}"]`);
      if (radio) radio.checked = true;
      for (const b of picks('part')) if (b.dataset.part in saved.include) setIntent(b, saved.include[b.dataset.part]);
    } catch {
      /* bez zapamiętanego wyboru — domyślnie wszystko, Excel */
    }
  }
  function remember(fmt) {
    try {
      const include = Object.fromEntries(picks('part').map((b) => [b.dataset.part, intent(b)]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: fmt, include }));
    } catch {
      /* nic się nie stało — następnym razem domyślny wybór */
    }
  }

  const showError = (text) => {
    const el = overlay.querySelector('.cut-list-empty');
    el.textContent = text;
    el.hidden = !text;
  };

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-cut]')?.dataset.cut;
    if (e.target === overlay || action === 'cancel') close();
    const pick = e.target.closest('button[data-pick]');
    if (pick) {
      picks(pick.dataset.pick).forEach((b) => setIntent(b, pick.dataset.on === '1'));
      showError('');
      update();
    }
    if (action === 'export') {
      const fmt = format();
      const on = (kind) => picks(kind).filter((b) => b.checked && !b.disabled);
      const parts = on('part').map((b) => b.dataset.part);
      const cabinets = picks('cabinet');
      const pickedCabinets = on('cabinet').map((b) => b.dataset.cabinet);
      const materials = picks('material');
      const pickedMaterials = on('material').map((b) => b.dataset.material);
      if (!WHOLE_PROJECT.has(fmt) && !parts.length) return showError('Przy tym wyborze nie ma nic do eksportu — zaznacz rodzaj płyt, mebel i materiał.');
      // w filtrze tylko to, co zawężone
      const filter = {};
      if (pickedCabinets.length < cabinets.length) {
        filter.cabinetIds = new Set(pickedCabinets.filter((id) => id !== BOARDS_KEY));
        filter.boards = pickedCabinets.includes(BOARDS_KEY);
      }
      if (pickedMaterials.length < materials.length) filter.materials = new Set(pickedMaterials);
      remember(fmt);
      close();
      onExport({ format: fmt, parts: new Set(parts.filter((k) => k !== 'accessories')), accessories: parts.includes('accessories'), filter });
    }
  });
  overlay.addEventListener('change', (e) => {
    const box = e.target;
    if (box.matches('input[data-part], input[data-cabinet], input[data-material]')) setIntent(box, box.checked);
    showError('');
    update();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  return {
    open(project) {
      restore();
      fill(project);
      update();
      showError('');
      overlay.hidden = false;
      overlay.querySelector('[data-cut="export"]').focus();
    },
  };
}
