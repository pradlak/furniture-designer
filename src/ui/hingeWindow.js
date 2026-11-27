import { escapeHtml, readNumberInput, setIfNotFocused } from './dom.js';
import { cabinetPanels, frontParts, HINGE_TYPES, HINGE_CUP, HINGE_LIMITS, hingeType, doorOpenLimit } from '../model/furniture.js';
import { setHingeType, moveHinge, addHinge, removeHinge, resetHinges, hingeYs } from '../model/frontEdit.js';
import { t } from '../i18n.js';

// Okienko „Zawias” — zaznaczony w widoku 3D zawias drzwi (klik w kółko zawiasu na zaznaczonych drzwiach / korpusie):
// rodzaj zawiasów drzwi, wysokość zaznaczonego zawiasu (też przeciąganiem w 3D), dodawanie / usuwanie zawiasów,
// powrót do położeń automatycznych. Stan: ui.selectedHinge = { cabinetId, key (front-N), index (od dołu) }.
// Później: marka / producent / model zawiasu.

const STEP = 10;

// Szkic: po lewej drzwi (widok od wewnątrz) z zawiasami i wymiarami zaznaczonego (od dołu / od góry), po prawej —
// puszka zawiasu: widok z tyłu drzwi (Ø, odległość od krawędzi) i przekrój (głębokość w grubości frontu).
function hingeSketch(panel, ys, index, ht) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const H = panel.height;
  const W = panel.width;
  const left = panel.opening?.hinge !== 'right';
  const clash = new Set(panel.hingeClash ?? []);
  // drzwi
  const dh = 196;
  const sc = dh / H;
  const dw = Math.max(36, Math.min(84, W * sc));
  const dx = 62;
  const dy = 16;
  const ex = left ? dx : dx + dw; // krawędź z zawiasami
  const cx = left ? ex + 7 : ex - 7;
  const Y = (y) => dy + dh - y * sc;
  const out = [];
  out.push(`<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" class="hs-door"/>`);
  ys.forEach((y, i) => {
    const cls = i === index ? 'hs-pick' : clash.has(Math.round(y)) ? 'hs-bad' : 'hs-cup';
    out.push(`<circle cx="${cx}" cy="${Y(y)}" r="${i === index ? 5.5 : 4}" class="${cls}"/>`);
    out.push(`<text x="${left ? cx + 9 : cx - 9}" y="${Y(y) + 3.5}" class="hs-num" text-anchor="${left ? 'start' : 'end'}">${i + 1}</text>`);
  });
  // wymiary zaznaczonego: od dołu i od góry (po stronie zawiasów, na zewnątrz)
  const sel = ys[index];
  const lx = left ? dx - 14 : dx + dw + 14;
  const tick = (y) => `<line x1="${lx - 4}" y1="${y}" x2="${lx + 4}" y2="${y}" class="hs-dim"/>`;
  out.push(`<line x1="${lx}" y1="${Y(0)}" x2="${lx}" y2="${Y(H)}" class="hs-dim"/>`, tick(Y(0)), tick(Y(sel)), tick(Y(H)));
  out.push(`<line x1="${lx}" y1="${Y(sel)}" x2="${cx}" y2="${Y(sel)}" class="hs-lead"/>`);
  const lab = (y, txt) => `<text x="${left ? lx - 6 : lx + 6}" y="${y + 3.5}" class="hs-txt" text-anchor="${left ? 'end' : 'start'}">${txt}</text>`;
  out.push(lab((Y(0) + Y(sel)) / 2, r1(sel)), lab((Y(sel) + Y(H)) / 2, r1(H - sel)));
  // wysokość i szerokość drzwi
  const ox = left ? dx + dw + 6 : dx - 6;
  out.push(`<text x="${ox}" y="${dy + dh / 2}" class="hs-muted" text-anchor="${left ? 'start' : 'end'}">${r1(H)}</text>`);
  out.push(`<text x="${dx + dw / 2}" y="${dy + dh + 13}" class="hs-muted" text-anchor="middle">${r1(W)}</text>`);
  out.push(`<text x="${dx + dw / 2}" y="${dy - 5}" class="hs-muted" text-anchor="middle">${t('drzwi od wewnątrz')}</text>`);

  // puszka: widok z tyłu drzwi (krawędź z zawiasami po lewej)
  const s = 2.1; // px / mm
  const bx = 200; // krawędź drzwi na szczególe
  const r = (ht.cup / 2) * s;
  const ccx = bx + HINGE_CUP.edgeDistance * s;
  const ccy = 66;
  out.push(`<text x="${bx}" y="14" class="hs-muted">${t('puszka — widok od tyłu drzwi')}</text>`);
  out.push(`<path d="M${bx} 24 V${ccy + r + 12} M${bx} 24 H${ccx + r + 22} M${bx} ${ccy + r + 12} H${ccx + r + 22}" class="hs-door-o"/>`);
  out.push(`<circle cx="${ccx}" cy="${ccy}" r="${r}" class="hs-cup-big"/>`, `<circle cx="${ccx}" cy="${ccy}" r="1.6" class="hs-dot"/>`);
  // Ø
  out.push(`<line x1="${ccx - r}" y1="${ccy}" x2="${ccx + r}" y2="${ccy}" class="hs-dim"/>`);
  out.push(`<text x="${ccx + 4}" y="${ccy - 4}" class="hs-txt">Ø${ht.cup}</text>`);
  // odległość środka od krawędzi
  const ky = 34;
  out.push(`<line x1="${bx}" y1="${ky}" x2="${ccx}" y2="${ky}" class="hs-dim"/>`, `<line x1="${ccx}" y1="${ky - 3}" x2="${ccx}" y2="${ccy}" class="hs-lead"/>`);
  out.push(`<text x="${(bx + ccx) / 2}" y="${ky - 3}" class="hs-txt" text-anchor="middle">${HINGE_CUP.edgeDistance}</text>`);
  // przekrój: grubość frontu, puszka wiercona od tyłu
  const ft = Math.max(12, panel.depth || 18);
  const sy = ccy + r + 34; // tył drzwi (góra przekroju)
  const th = ft * s;
  const cd = HINGE_CUP.depth * s;
  out.push(`<text x="${bx}" y="${sy - 7}" class="hs-muted">${t('przekrój (tył drzwi u góry)')}</text>`);
  out.push(`<path d="M${bx} ${sy} H${ccx - r} V${sy + cd} H${ccx + r} V${sy} H${ccx + r + 22} V${sy + th} H${bx} Z" class="hs-section"/>`);
  out.push(`<line x1="${ccx + r + 30}" y1="${sy}" x2="${ccx + r + 30}" y2="${sy + cd}" class="hs-dim"/>`);
  out.push(`<text x="${ccx + r + 34}" y="${sy + cd / 2 + 3.5}" class="hs-txt">${t('gł.')} ${HINGE_CUP.depth}</text>`);
  out.push(`<text x="${ccx + r + 34}" y="${sy + th + 1}" class="hs-muted">${t('front')} ${r1(ft)}</text>`);
  const Hh = Math.max(dy + dh + 18, sy + th + 10);
  return `<svg viewBox="0 0 370 ${Hh}" width="100%" role="img" aria-label="${t('Szkic zawiasu z wymiarami')}">${out.join('')}</svg>`;
} // mm — przyciski ↑ / ↓ (z Shift — 1 mm)

export function createHingeWindow(store, ui) {
  const win = document.createElement('aside');
  win.className = 'drawer-window hinge-window';
  win.hidden = true;
  document.body.appendChild(win);
  win.innerHTML = `
    <div class="dw-head">
      <button type="button" class="dw-back" data-hw-close title="${t('Wróć do ustawień drzwi (sekcja „Fronty / szuflady”)')}">${t('Powrót do drzwi →')}</button>
      <b data-hw-title></b>
    </div>
    <div class="hw-sketch" data-hw-sketch></div>
    <p class="dw-hint">${t('przeciągnij kółko zawiasu w widoku 3D w górę / w dół — zmienia jego wysokość')}</p>
    <div class="hw-pick" data-hw-list></div>
    <div class="bi-sec">${t('Rodzaj')} <small>${t('(wszystkie zawiasy tych drzwi)')}</small></div>
    <label class="bi-field wide"><span>${t('Rodzaj zawiasu')}</span><select data-hw="type">${HINGE_TYPES.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('')}</select></label>
    <div class="dw-calc" data-hw-facts></div>
    <label class="bi-field wide hw-soon" title="${t('Wkrótce: wybór marki, producenta i modelu zawiasu')}"><span>${t('Marka / producent / model')}</span><select disabled><option>${t('wkrótce')}</option></select></label>
    <div class="bi-sec">${t('Położenie zaznaczonego zawiasu')}</div>
    <div class="dw-row">
      <label class="bi-field"><span>${t('Wysokość od dołu drzwi')}</span><input type="number" step="1" data-hw="y" /><small>mm</small></label>
      <button type="button" data-hw-step="1" title="${t('Wyżej o {step} mm (z Shift — o 1 mm)', { step: STEP })}">↑</button>
      <button type="button" data-hw-step="-1" title="${t('Niżej o {step} mm (z Shift — o 1 mm)', { step: STEP })}">↓</button>
    </div>
    <div class="hw-from-top" data-hw-top></div>
    <div class="dw-warn" data-hw-warn hidden></div>
    <div class="bi-sec">${t('Zawiasy drzwi')}</div>
    <div class="dw-row">
      <button type="button" data-hw-add>${t('+ Dodaj zawias')}</button>
      <button type="button" data-hw-remove>${t('🗑 Usuń ten zawias')}</button>
      <button type="button" data-hw-reset title="${t('Liczba i położenia zawiasów jak standardowo (z wysokości drzwi)')}">${t('↺ Położenia automatyczne')}</button>
    </div>
    <div class="hw-mode" data-hw-mode></div>`;

  const current = () => {
    const st = ui.get();
    const sel = st.selectedHinge;
    if (!sel) return null;
    if (!(st.selectedFronts ?? []).includes(`${sel.cabinetId}:${sel.key}`)) return null;
    const project = store.get();
    const cabinet = project.furniture.find((c) => c.id === sel.cabinetId);
    const panel = cabinet && cabinetPanels(cabinet, project).find((p) => p.key === sel.key);
    if (!panel?.hinges?.length || panel.door == null) return null;
    const index = Math.min(sel.index, panel.hinges.length - 1);
    return { cabinet, panel, key: sel.key, index, project };
  };
  const update = (fn) => {
    const cur = current();
    if (!cur) return;
    store.set((p) => ({ ...p, furniture: p.furniture.map((c) => (c.id === cur.cabinet.id ? fn(c, p, cur) : c)) }));
  };
  const pickIndex = (index) => {
    const sel = ui.get().selectedHinge;
    if (sel) ui.set({ ...ui.get(), selectedHinge: { ...sel, index } });
  };

  function sync() {
    const cur = current();
    document.documentElement.classList.toggle('hinge-open', !!cur);
    if (!cur) {
      win.hidden = true;
      return;
    }
    win.hidden = false;
    const { cabinet, panel, index } = cur;
    const ys = hingeYs(panel);
    const ht = hingeType(panel.hingeType);
    const n = ys.length;
    win.querySelector('[data-hw-title]').textContent = t('Zawias {i} z {n} (od dołu) — {panel} — {cabinet}', { i: index + 1, n, panel: panel.name, cabinet: cabinet.name });
    win.querySelector('[data-hw-sketch]').innerHTML = hingeSketch(panel, ys, index, ht);
    // przyciski zawiasów: od 1 (najniższy) w górę
    const list = win.querySelector('[data-hw-list]');
    const html = ys
      .map((y, i) => ({ y, i }))
      .map(({ y, i }) => `<button type="button" data-hw-index="${i}" class="${i === index ? 'on' : ''}${panel.hingeClash?.includes(Math.round(y)) ? ' bad' : ''}" title="${t('Zawias {i}: {y} mm od dołu drzwi', { i: i + 1, y })}">${i + 1}<small>${Math.round(y)} mm</small></button>`)
      .join('');
    if (list.dataset.html !== html) {
      list.innerHTML = html;
      list.dataset.html = html;
    }
    setIfNotFocused(win.querySelector('[data-hw="type"]'), ht.key);
    const doorType = frontParts(cabinet.fronts).doors[panel.door]?.type;
    const lim = doorOpenLimit(panel, cur.project);
    win.querySelector('[data-hw-facts]').innerHTML = `
      <div>${t('<b>Puszka:</b> Ø{cup} mm, gł. {depth} mm, środek {edge} mm od krawędzi drzwi', { cup: ht.cup, depth: HINGE_CUP.depth, edge: HINGE_CUP.edgeDistance })}</div>
      <div>${t('<b>Kąt otwarcia:</b> {angle}°', { angle: ht.angle })}${ht.key === 'zero155' ? t(' · zerowy uskok — drzwi po otwarciu nie wchodzą w światło korpusu (np. przy szufladach wewnętrznych)') : ''}</div>
      ${lim.max < lim.angle ? `<div class="dw-warn">${t('⚠ Przy tym ustawieniu drzwi otworzą się tylko na ok. {max}° — przeszkadza {what}.', { max: lim.max, what: escapeHtml(lim.blocked) })}${lim.angle > 110 && lim.max >= 110 ? t(' Zawias 110° otworzy się w pełni.') : ''}</div>` : ''}
      <div>${t('<b>Strona:</b> {side}', { side: panel.opening?.hinge === 'right' ? t('prawa') : t('lewa') })}${doorType === 'doubleDoor' ? t(' (drzwi podwójne — położenia ustawia się osobno dla każdego skrzydła)') : ''}</div>`;
    const yIn = win.querySelector('[data-hw="y"]');
    setIfNotFocused(yIn, ys[index]);
    yIn.min = 0;
    yIn.max = Math.round(panel.height);
    win.querySelector('[data-hw-top]').textContent = t('od góry drzwi: {top} mm · wysokość drzwi {h} mm', { top: Math.round((panel.height - ys[index]) * 10) / 10, h: Math.round(panel.height * 10) / 10 });
    const warn = win.querySelector('[data-hw-warn]');
    const clash = panel.hingeClash?.includes(Math.round(ys[index]));
    warn.hidden = !clash;
    warn.textContent = clash ? t('⚠ Zawias wypada na wysokości szuflady wewnętrznej — przesuń go albo włącz dystanse pod prowadnice (sekcja Fronty).') : '';
    win.querySelector('[data-hw-add]').disabled = n >= HINGE_LIMITS.max;
    win.querySelector('[data-hw-remove]').disabled = n <= HINGE_LIMITS.min;
    win.querySelector('[data-hw-reset]').hidden = !panel.hingeCustom;
    win.querySelector('[data-hw-mode]').textContent = panel.hingeCustom ? t('Położenia ustawione ręcznie.') : t('Położenia automatyczne (liczba zawiasów z wysokości drzwi). Przesunięcie zawiasu zapisuje położenia na stałe.');
  }

  win.addEventListener('change', (e) => {
    const k = e.target.dataset.hw;
    if (k === 'type') {
      const val = e.target.value;
      update((c, p, cur) => setHingeType(c, cur.key, val, p));
    } else if (k === 'y') {
      const v = readNumberInput(e.target);
      if (v == null) return;
      update((c, p, cur) => moveHinge(c, cur.key, cur.index, v, p));
    }
  });
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.hw === 'y') e.target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  win.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-hw-close]')) return ui.set({ ...ui.get(), selectedHinge: null });
    const pick = t.closest('[data-hw-index]');
    if (pick) return pickIndex(Number(pick.dataset.hwIndex));
    const step = t.closest('[data-hw-step]');
    if (step) {
      const d = Number(step.dataset.hwStep) * (e.shiftKey ? 1 : STEP);
      return update((c, p, cur) => moveHinge(c, cur.key, cur.index, hingeYs(cur.panel)[cur.index] + d, p));
    }
    if (t.closest('[data-hw-add]')) {
      let added = null;
      update((c, p, cur) => {
        const r = addHinge(c, cur.key, p);
        added = r.index;
        return r.cabinet;
      });
      if (added != null) pickIndex(added);
      return;
    }
    if (t.closest('[data-hw-remove]')) {
      const cur = current();
      update((c, p, cc) => removeHinge(c, cc.key, cc.index, p));
      if (cur) pickIndex(Math.max(0, cur.index - 1));
      return;
    }
    if (t.closest('[data-hw-reset]')) {
      update((c, p, cur) => resetHinges(c, cur.key, p));
      pickIndex(0);
    }
  });
  // (klik w okienku nie trafia do sceny 3D; kółko — nie przybliża widoku)
  win.addEventListener('pointerdown', (e) => e.stopPropagation());
  win.addEventListener('wheel', (e) => e.stopPropagation());
  store.subscribe(sync);
  ui.subscribe(sync);
  sync();
  return { sync };
}
