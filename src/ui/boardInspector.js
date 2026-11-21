import { escapeHtml, readNumberInput, setIfNotFocused } from './dom.js';
import {
  BOARD_LIMITS,
  BOARD_MOUNTS,
  MOUNT_MACHINING,
  boardBox,
  boardMaterial,
  fitBoardWidth,
  boardNicheWidth,
  mountPoints,
  mountMachining,
  normalizeMount,
} from '../model/boards.js';
import { resolveHoles } from '../model/boardFeatures.js';
import { renderBoardFeatures, syncBoardFeatures, readFeatureInput, readFeatureClick, applyFeatureChange } from './boardFeaturesEditor.js';
import { materialSelect, colorPicker, readColorInput, syncColorPicker } from './widgets.js';
import { setPath } from '../model/furniture.js';
import { downloadBoardCutList, downloadBoardDrawing } from './boardExport.js';

// Inspektor zaznaczonej samodzielnej płyty (półki, blatu) — okienko po prawej stronie widoku 3D:
// wymiary i położenie, mocowanie do ściany z obróbką (wymiary otworów / frezu) oraz szkic z wymiarami:
// widok z góry (tylna krawędź u góry — przy ścianie) i widok tylnej krawędzi (otwory w osi grubości / frezy w spodzie).
// Pokazuje się przy jednej zaznaczonej płycie; ✕ chowa je do czasu zaznaczenia innej płyty.

const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

export function createBoardInspector(viewport, store, ui, { onMore } = {}) {
  const root = document.createElement('aside');
  root.className = 'board-inspector';
  root.hidden = true;
  viewport.appendChild(root);
  let shownId = null;
  const extra = document.createElement('aside');
  extra.className = 'board-inspector board-inspector-extra';
  extra.hidden = true;
  viewport.appendChild(extra);
  let extraOpen = false;
  let extraFor = null;
  function syncExtra(board, project) {
    if (!board || !extraOpen || root.hidden) {
      extra.hidden = true;
      return;
    }
    if (extraFor !== board.id) {
      extra.innerHTML = `
        <div class="bi-head">
          <b>${escapeHtml(board.name)} — obróbka i wygląd</b>
          <button type="button" class="icon tiny" data-bx-close title="Zamknij">✕</button>
        </div>
        <div class="bi-sec">Materiał i kolor</div>
        ${materialSelect('Materiał', 'materialId', project)}
        ${colorPicker('Kolor / dekor (dąb, orzech, beton, marmur…)', 'color', { wide: true })}
        ${renderBoardFeatures()}`;
      extraFor = board.id;
    }
    extra.hidden = false;
    const mat = extra.querySelector('[data-f="materialId"]');
    if (mat) setIfNotFocused(mat, board.materialId ?? mat.options[0]?.value ?? '');
    syncColorPicker(extra, 'color', board.color, boardMaterial(board, project).color);
    syncBoardFeatures(extra, board, board.width, board.depth);
  }
  extra.addEventListener('input', (e) => {
    const input = e.target;
    const color = readColorInput(input);
    if (color) return setBoard((b) => setPath(b, color.path, color.value));
    const feature = readFeatureInput(input);
    if (feature) return setBoard((b) => applyFeatureChange(b, feature, b.width, b.depth, setPath));
    if (input.dataset.f === 'materialId') setBoard((b) => ({ ...b, materialId: input.value }));
  });
  extra.addEventListener('click', (e) => {
    if (e.target.closest('[data-bx-close]')) {
      extraOpen = false;
      extra.hidden = true;
      return;
    }
    if (e.target.closest('[data-bx-card]') && shownId) return onMore?.(shownId);
    const click = readFeatureClick(e.target);
    if (click) setBoard((b) => applyFeatureChange(b, click, b.width, b.depth, setPath));
  });
  extra.addEventListener('pointerdown', (e) => e.stopPropagation());
  extra.addEventListener('wheel', (e) => e.stopPropagation());
  // powiększony szkic — okno na środku ekranu (odświeżane na żywo, zamykane ✕, Esc albo klikiem w tło)
  const zoom = document.createElement('div');
  zoom.className = 'bi-zoom';
  zoom.hidden = true;
  zoom.innerHTML = `<div class="bi-zoom-box" role="dialog" aria-label="Szkic płyty">
      <div class="bi-zoom-head"><b></b><button type="button" class="icon" data-bi-zoom-close title="Zamknij (Esc)">✕</button></div>
      <div class="bi-zoom-body bi-sketch"></div>
    </div>`;
  document.body.appendChild(zoom);
  const closeZoom = () => (zoom.hidden = true);
  zoom.addEventListener('click', (e) => {
    if (e.target === zoom || e.target.closest('[data-bi-zoom-close]')) closeZoom();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !zoom.hidden) {
      e.stopPropagation();
      closeZoom();
    }
  }, true);
  let closedId = null;
  let sig = null;

  const boardOf = () => {
    const sel = ui.get().selectedBlends ?? [];
    if (sel.length !== 1 || !sel[0].startsWith('board:') || ui.get().selectedId) return null;
    return store.get().boards?.find((b) => b.id === sel[0].slice(6)) ?? null;
  };

  const num = (label, key, value, { min, max, step = 1, placeholder = '', unit = 'mm', title = '' } = {}) => `
    <label class="bi-field" ${title ? `title="${escapeHtml(title)}"` : ''}>
      <span>${label}</span>
      <input type="number" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} data-bi="${key}" value="${value ?? ''}" placeholder="${escapeHtml(placeholder)}" />
      <small>${unit}</small>
    </label>`;

  function render(board, project) {
    const L = BOARD_LIMITS;
    const m = normalizeMount(board.mount);
    const work = mountMachining(board);
    const matT = boardMaterial({ ...board, thickness: null }, project).thickness;
    root.innerHTML = `
      <div class="bi-head">
        <b>${escapeHtml(board.name)}</b>
        <button type="button" class="icon tiny" data-bi-close title="Zamknij (płyta zostaje zaznaczona)">✕</button>
      </div>
      <div class="bi-sec">Wymiary i położenie</div>
      <div class="bi-grid">
        ${num('Szerokość', 'width', board.width, { min: L.sizeMin, max: L.sizeMax })}
        ${num('Głębokość', 'depth', board.depth, { min: L.sizeMin, max: L.sizeMax })}
        ${num('Grubość', 'thickness', board.thickness ?? '', { min: 3, max: 100, placeholder: `${matT} (materiał)`, title: 'Puste — grubość materiału' })}
        ${num('Od podłogi', 'y', board.y)}
        ${num('Od lewej', 'x', board.x)}
        ${num('Od tyłu', 'z', board.z, { min: 0 })}
        ${num('Zapas (luz)', 'clearance', board.clearance ?? 0, { min: 0, max: 50, step: 0.5, title: 'Płyta krótsza od wnęki o tyle mm łącznie (po połowie z każdej strony) — przy „Dopasuj do wnęki” i dosuwaniu. Na niedokładny pomiar i krzywe ściany, np. 2–3 mm.' })}
      </div>
      <button type="button" class="bi-fit" data-bi-fit title="Szerokość od lewego do prawego sąsiada (ściana, okap, korpus, inna płyta) minus zapas">⇔ Dopasuj szerokość do wnęki</button>
      <div class="bi-sec">Mocowanie do ściany</div>
      <label class="bi-field wide"><span>Rodzaj</span>
        <select data-bi="mount.type">${BOARD_MOUNTS.map((x) => `<option value="${x.key ?? ''}" ${(x.key ?? null) === m.type ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select>
      </label>
      ${
        m.type && m.type !== 'cleat'
          ? `<div class="bi-grid">
              ${num('Ilość', 'mount.count', m.count ?? '', { min: 1, max: 20, unit: 'szt.', placeholder: `${mountPoints(board).count} (auto)`, title: 'Puste — automatycznie (mocowania nie nachodzą na siebie i nie wychodzą poza płytę)' })}
              ${num('Od boku', 'mount.edge', m.edge ?? '', { min: 0, max: 1000, placeholder: `${mountPoints(board).edge}`, title: 'Odstęp skrajnego mocowania (krawędzi płytki / wspornika) od lewego i prawego boku płyty' })}
            </div>`
          : ''
      }
      ${
        m.type === 'hidden'
          ? `<label class="bi-field wide"><span>Obróbka</span>
               <select data-bi="mount.machining">${MOUNT_MACHINING.map((x) => `<option value="${x.key ?? ''}" ${(x.key ?? null) === m.machining ? 'selected' : ''}>${escapeHtml(x.label)}</option>`).join('')}</select>
             </label>
             ${
               work?.kind === 'holes'
                 ? `<div class="bi-grid">
                      ${num('Średnica otworu', 'mount.holeD', m.holeD ?? '', { min: 3, max: 40, step: 0.5, placeholder: `${work.d}` })}
                      ${num('Głębokość otworu', 'mount.holeDepth', m.holeDepth ?? '', { min: 10, max: 500, placeholder: `${work.depth}`, title: 'Jak głęboko pręt wchodzi w płytę (od tylnej krawędzi)' })}
                    </div>
                    <label class="bi-check" title="Płytka montażowa wspornika (przykręcana do ściany) chowa się we wpuście w tylnej krawędzi — półka dochodzi do ściany bez szczeliny">
                      <input type="checkbox" data-bi="mount.plate" ${m.plate ? 'checked' : ''} /> wpust pod płytkę montażową (przy ścianie)
                    </label>
                    ${
                      work.plate
                        ? `<div class="bi-grid">
                            ${num('Szer. płytki', 'mount.plateW', m.plateW ?? '', { min: 10, max: 400, placeholder: `${work.plate.w}` })}
                            ${num('Wys. płytki', 'mount.plateH', m.plateH ?? '', { min: 5, max: 100, placeholder: `${work.plate.h}`, title: 'Wymiar w pionie — w osi grubości płyty' })}
                            ${num('Gł. wpustu', 'mount.plateDepth', m.plateDepth ?? '', { min: 1, max: 30, step: 0.5, placeholder: `${work.plate.depth}`, title: 'Grubość płytki — o tyle wpust wchodzi w płytę od tylnej krawędzi' })}
                          </div>`
                        : ''
                    }`
                 : work?.kind === 'slot'
                   ? `<div class="bi-grid">
                        ${num('Szer. frezu', 'mount.slotW', m.slotW ?? '', { min: 5, max: 100, placeholder: `${work.w}` })}
                        ${num('Dł. frezu', 'mount.slotLen', m.slotLen ?? '', { min: 20, max: 600, placeholder: `${work.len}`, title: 'Od tylnej krawędzi w głąb płyty' })}
                        ${num('Gł. frezu', 'mount.slotDepth', m.slotDepth ?? '', { min: 1, max: 40, step: 0.5, placeholder: `${work.depth}`, title: 'Od spodu płyty' })}
                      </div>`
                   : ''
             }`
          : ''
      }
      <div class="bi-sec bi-sec-row">Szkic <button type="button" class="icon tiny" data-bi-zoom title="Powiększ szkic (albo kliknij w szkic)">🔍 Powiększ</button></div>
      <div class="bi-sketch" data-bi-zoom title="Kliknij, aby powiększyć"></div>
      <p class="bi-note"></p>
      <button type="button" class="bi-more" data-bi-more>◂ Frezy krawędzi, otwory, materiał, kolor</button>
      <div class="bi-download">
        <button type="button" class="bi-download-btn" data-bi-download-toggle aria-haspopup="true">💾 Pobierz… <small>▾</small></button>
        <div class="bi-download-menu" hidden>
          <button type="button" data-bi-download="xlsx" title="Formatka tej płyty z obróbką i akcesoriami">Formatka — Excel (.xlsx)</button>
          <button type="button" data-bi-download="csv">Formatka — CSV (.csv)</button>
          <button type="button" data-bi-drawing="pdf" title="A4 poziomo: szkic z wymiarami, detal mocowania, opis obróbki i akcesoria">Rysunek z wymiarami — PDF</button>
          <button type="button" data-bi-drawing="png">Rysunek z wymiarami — obraz PNG</button>
        </div>
      </div>`;
  }

  function update(board, project) {
    const box = boardBox(board, project);
    root.querySelectorAll('[data-bi]').forEach((inp) => {
      if (inp.classList.contains('invalid')) return;
      const key = inp.dataset.bi;
      const m = normalizeMount(board.mount);
      const v = key.startsWith('mount.') ? m[key.slice(6)] : board[key];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else setIfNotFocused(inp, v ?? '');
    });
    const svg = sketchSvg(board, box);
    root.querySelector('.bi-sketch').innerHTML = svg;
    if (!zoom.hidden) {
      zoom.querySelector('.bi-zoom-body').innerHTML = svg;
      zoom.querySelector('.bi-zoom-head b').textContent = `Szkic: ${board.name}`;
    }
    // przycisk dopasowania: docelowa szerokość (wnęka minus zapas)
    const niche = boardNicheWidth(project, board.id);
    const fitBtn = root.querySelector('[data-bi-fit]');
    if (fitBtn && niche != null) {
      const target = Math.round((niche - (board.clearance ?? 0)) * 10) / 10;
      fitBtn.textContent = `⇔ Dopasuj szerokość do wnęki → ${fmt(target)} mm`;
      fitBtn.disabled = Math.abs(target - board.width) < 0.5;
      fitBtn.title = `Wnęka ${fmt(niche)} mm${board.clearance ? ` minus zapas ${fmt(board.clearance)} mm (po ${fmt(board.clearance / 2)} z każdej strony)` : ''}`;
    }
    const pts = mountPoints(board);
    root.querySelector('.bi-note').textContent = pts.type
      ? `${BOARD_MOUNTS.find((x) => x.key === pts.type).label}${pts.count && pts.type !== 'cleat' ? ` — ${pts.count} szt.` : ''}`
      : 'Bez mocowania do ściany.';
  }

  function sync() {
    const board = boardOf();
    if (!board || closedId === board.id) {
      root.hidden = true;
      closeZoom();
      extra.hidden = true;
      shownId = board?.id ?? null;
      if (!board) closedId = null;
      return;
    }
    const project = store.get();
    const m = normalizeMount(board.mount);
    const nextSig = [board.id, board.name, m.type, m.machining, m.type && m.type !== 'cleat', m.plate].join('|');
    if (nextSig !== sig || shownId !== board.id) {
      render(board, project);
      sig = nextSig;
    }
    shownId = board.id;
    root.hidden = false;
    update(board, project);
    syncExtra(board, project);
  }

  const setBoard = (fn) => {
    const id = shownId;
    store.set((p) => ({ ...p, boards: p.boards.map((b) => (b.id === id ? fn(b) : b)) }));
  };
  root.addEventListener('input', (e) => {
    const inp = e.target;
    const key = inp.dataset.bi;
    if (!key) return;
    if (inp.type === 'checkbox') return setBoard((b) => ({ ...b, mount: { ...normalizeMount(b.mount), [key.slice(6)]: inp.checked } }));
    if (inp.tagName === 'SELECT') {
      const value = inp.value || null;
      if (key === 'mount.type') return setBoard((b) => ({ ...b, mount: { type: value, count: null } }));
      return setBoard((b) => ({ ...b, mount: { ...normalizeMount(b.mount), [key.slice(6)]: value } }));
    }
    const empty = inp.value.trim() === '';
    const nullable = key === 'thickness' || key.startsWith('mount.');
    const value = empty ? (nullable ? null : undefined) : readNumberInput(inp);
    if (value === undefined) return;
    if (key.startsWith('mount.')) return setBoard((b) => ({ ...b, mount: { ...normalizeMount(b.mount), [key.slice(6)]: value } }));
    setBoard((b) => ({ ...b, [key]: value }));
  });
  root.addEventListener('click', (e) => {
    // wybór formatu zamyka listę „Pobierz…”
    if (e.target.closest('[data-bi-download], [data-bi-drawing]')) root.querySelector('.bi-download-menu').hidden = true;
    if (e.target.closest('[data-bi-close]')) {
      closedId = shownId;
      root.hidden = true;
    } else if (e.target.closest('[data-bi-more]') && shownId) {
      // drugie okienko obok (frezy, otwory, materiał, kolor) — przełącza
      extraOpen = !extraOpen;
      sync();
    }
    else if (e.target.closest('[data-bi-fit]') && shownId) store.set((p) => fitBoardWidth(p, shownId));
    else if (e.target.closest('[data-bi-download-toggle]')) {
      const list = root.querySelector('.bi-download-menu');
      list.hidden = !list.hidden;
      return;
    } else if (e.target.closest('[data-bi-download]') && shownId) downloadBoardCutList(store.get(), shownId, e.target.closest('[data-bi-download]').dataset.biDownload);
    else if (e.target.closest('[data-bi-drawing]') && shownId) downloadBoardDrawing(store.get(), shownId, e.target.closest('[data-bi-drawing]').dataset.biDrawing);
    else if (e.target.closest('[data-bi-zoom]')) {
      zoom.hidden = false;
      sync(); // wypełnia okno szkicem
    }
  });
  document.addEventListener('pointerdown', (e) => {
    const list = root.querySelector('.bi-download-menu');
    if (list && !list.hidden && !e.target.closest?.('.bi-download')) list.hidden = true;
  });
  // klik / przeciąganie w okienku nie trafia do sceny 3D
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('wheel', (e) => e.stopPropagation());

  store.subscribe(sync);
  ui.subscribe(sync);
  return { sync };
}

// Szkic płyty z wymiarami (SVG): widok z góry (tył u góry) i pod nim widok tylnej krawędzi (grubość powiększona).
export function sketchSvg(board, box) {
  const W = box.width;
  const D = box.depth;
  const T = box.height;
  const VW = 300; // szerokość rysunku (px)
  const pad = { l: 34, r: 40, t: 26, b: 40 };
  const s = (VW - pad.l - pad.r) / W;
  const top = { h: D * s };
  const edgeH = Math.max(18, T * s * 3); // widok krawędzi — grubość powiększona (×3, min 18 px)
  const gap = 46;
  const H = pad.t + top.h + gap + edgeH + pad.b;
  const X = (u) => pad.l + u * s;
  const Yt = (v) => pad.t + v * s; // v — od tylnej krawędzi w głąb (u góry rysunku — ściana)
  const ey = pad.t + top.h + gap; // górna krawędź widoku krawędzi
  const out = [];
  const line = (x1, y1, x2, y2, cls = 'bi-dim') => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`);
  const text = (x, y, t, cls = 'bi-txt', anchor = 'middle', rot = 0) =>
    out.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${t}</text>`);
  // ściana
  line(pad.l - 10, pad.t - 4, X(W) + 10, pad.t - 4, 'bi-wall');
  text(X(W) + 12, pad.t - 1, 'ściana', 'bi-small', 'start');
  // płyta z góry
  out.push(`<rect x="${X(0)}" y="${Yt(0)}" width="${W * s}" height="${D * s}" class="bi-board"/>`);
  // otwory w płycie (y w modelu — od przodu)
  for (const h of resolveHoles(board.holes, W, D)) {
    const cy = Yt(D - h.y);
    if (h.shape === 'circle') out.push(`<circle cx="${X(h.x)}" cy="${cy}" r="${Math.max(1.5, (h.d / 2) * s)}" class="bi-hole"/>`);
    else out.push(`<rect x="${X(h.x - h.w / 2)}" y="${cy - (h.h / 2) * s}" width="${h.w * s}" height="${h.h * s}" rx="${(h.r ?? 0) * s}" class="bi-hole"/>`);
  }
  // mocowanie: widok z góry (przerywane — pod płytą / w płycie)
  const pts = mountPoints(board);
  const work = mountMachining(board);
  for (const u of pts.xs) {
    if (work?.kind === 'holes') out.push(`<rect x="${X(u) - Math.max(1, (work.d / 2) * s)}" y="${Yt(0)}" width="${Math.max(2, work.d * s)}" height="${Math.min(D, work.depth) * s}" class="bi-mount"/>`);
    if (work?.plate) out.push(`<rect x="${X(u - work.plate.w / 2)}" y="${Yt(0)}" width="${work.plate.w * s}" height="${Math.max(2, work.plate.depth * s)}" class="bi-plate"/>`);
    else if (work?.kind === 'slot') out.push(`<rect x="${X(u - work.w / 2)}" y="${Yt(0)}" width="${work.w * s}" height="${Math.min(D, work.len) * s}" class="bi-mount"/>`);
    else if (pts.type === 'brackets' || pts.type === 'rail') out.push(`<rect x="${X(u) - 2}" y="${Yt(0)}" width="4" height="${Math.min(D - 20, pts.type === 'rail' ? D * 0.8 : 200) * s}" class="bi-mount"/>`);
  }
  if (pts.type === 'cleat') out.push(`<rect x="${X(10)}" y="${Yt(0)}" width="${(W - 20) * s}" height="${20 * s}" class="bi-mount"/>`);
  // wymiary: szerokość (pod spodem widoku z góry), głębokość (z prawej)
  const wy = Yt(D) + 14;
  line(X(0), wy, X(W), wy);
  line(X(0), wy - 4, X(0), wy + 4);
  line(X(W), wy - 4, X(W), wy + 4);
  text(X(W / 2), wy - 3, `${fmt(W)}`);
  const dx = X(W) + 14;
  line(dx, Yt(0), dx, Yt(D));
  line(dx - 4, Yt(0), dx + 4, Yt(0));
  line(dx - 4, Yt(D), dx + 4, Yt(D));
  text(dx + 4, Yt(D / 2), `${fmt(D)}`, 'bi-txt', 'middle', 90);
  // położenia mocowań nad płytą (odstępy między nimi)
  if (pts.xs.length) {
    const my = pad.t - 12;
    const marks = [0, ...pts.xs, W];
    for (let i = 1; i < marks.length; i++) {
      const [a, b] = [marks[i - 1], marks[i]];
      if (b - a < 1) continue;
      text(X((a + b) / 2), my, fmt(b - a), 'bi-small');
    }
    for (const u of pts.xs) line(X(u), my + 2, X(u), pad.t - 4, 'bi-tick');
  }
  if (work?.kind === 'holes' || work?.kind === 'slot') {
    // głębokość otworu / frezu w głąb płyty — przy pierwszym mocowaniu
    const u = pts.xs[0];
    const len = Math.min(D, work.kind === 'holes' ? work.depth : work.len);
    const lx = X(u) + Math.max(6, ((work.kind === 'holes' ? work.d : work.w) / 2) * s + 6);
    line(lx, Yt(0), lx, Yt(len), 'bi-dim2');
    text(lx + 3, Yt(len / 2) + 3, `gł. ${fmt(len)}`, 'bi-small', 'start');
  }
  // widok tylnej krawędzi (od ściany)
  text(pad.l, ey - 8, 'tylna krawędź (widok od ściany):', 'bi-small', 'start');
  out.push(`<rect x="${X(0)}" y="${ey}" width="${W * s}" height="${edgeH}" class="bi-board"/>`);
  for (const u of pts.xs) {
    if (work?.plate) {
      const ph = Math.min(edgeH, (Math.min(work.plate.h, T) / T) * edgeH);
      out.push(`<rect x="${X(u - work.plate.w / 2)}" y="${ey + (edgeH - ph) / 2}" width="${work.plate.w * s}" height="${ph}" class="bi-plate"/>`);
    }
    if (work?.kind === 'holes') {
      const r = Math.min(edgeH / 2 - 1, Math.max(2, (work.d / T) * (edgeH / 2)));
      out.push(`<circle cx="${X(u)}" cy="${ey + edgeH / 2}" r="${r}" class="bi-hole-edge"/>`);
    } else if (work?.kind === 'slot') {
      const h = Math.min(edgeH - 2, (work.depth / T) * edgeH);
      out.push(`<rect x="${X(u - work.w / 2)}" y="${ey + edgeH - h}" width="${work.w * s}" height="${h}" class="bi-hole-edge"/>`);
    }
  }
  if (work?.kind === 'holes' && pts.xs.length) {
    const u0 = pts.xs[0];
    const r0 = Math.min(edgeH / 2 - 1, Math.max(2, (work.d / T) * (edgeH / 2)));
    line(X(u0) + r0 * 0.7, ey + edgeH / 2 - r0 * 0.7, X(u0) + 14, ey - 4, 'bi-leader');
    text(X(u0) + 16, ey - 5, `Ø${fmt(work.d)}`, 'bi-small', 'start');
  }
  // grubość
  const tx = X(W) + 14;
  line(tx, ey, tx, ey + edgeH);
  text(tx + 4, ey + edgeH / 2 + 3, `${fmt(T)}`, 'bi-txt', 'start');
  if (work?.kind === 'holes') text(X(W / 2), ey + edgeH + 16, `otwory Ø${fmt(work.d)} w osi grubości (${fmt(T / 2)} od spodu)`, 'bi-small');
  if (work?.plate) text(X(W / 2), ey + edgeH + 27, `wpust pod płytkę ${fmt(work.plate.w)} × ${fmt(Math.min(work.plate.h, T))}, gł. ${fmt(work.plate.depth)}`, 'bi-small');
  if (work?.kind === 'slot') text(X(W / 2), ey + edgeH + 16, `frez ${fmt(work.w)} × ${fmt(work.len)}, gł. ${fmt(work.depth)} od spodu`, 'bi-small');
  let detail = '';
  if (pts.xs.length && (work || pts.type === 'brackets' || pts.type === 'rail')) detail = detailSvg(pts, work, T, W);
  return `<svg viewBox="0 0 ${VW} ${H}" width="100%" role="img" aria-label="Szkic płyty z wymiarami">${out.join('')}</svg>${detail}`;
}

// Detal (powiększenie) skrajnego mocowania na tylnej krawędzi, od lewego boku płyty: odstęp od boku, szerokość
// i wysokość płytki montażowej (albo frezu / wspornika), otwór pod pręt, grubość płyty — w mm.
function detailSvg(pts, work, T, W) {
  const u = pts.xs[0];
  const ew = pts.elementW;
  const region = Math.min(W, u + ew / 2 + Math.max(30, ew * 0.4)); // od boku do kawałka za elementem
  const VW = 300;
  const pad = { l: 16, r: 70, t: 34, b: 46 };
  const s = Math.min((VW - pad.l - pad.r) / region, 120 / T);
  const H = pad.t + T * s + pad.b;
  const X = (x) => pad.l + x * s;
  const Y = (y) => pad.t + (T - y) * s; // y — od spodu płyty
  const out = [];
  const line = (x1, y1, x2, y2, cls = 'bi-dim') => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`);
  const text = (x, y, t, cls = 'bi-txt', anchor = 'middle') => out.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${t}</text>`);
  const dimH = (a, b, y, label) => {
    line(X(a), y, X(b), y);
    line(X(a), y - 3, X(a), y + 3);
    line(X(b), y - 3, X(b), y + 3);
    text((X(a) + X(b)) / 2, y - 3, label);
  };
  text(pad.l, 12, 'detal — tylna krawędź przy lewym boku (od ściany)', 'bi-small', 'start');
  // kawałek płyty — z prawej urwany
  out.push(`<path d="M${X(0)} ${Y(0)} L${X(region)} ${Y(0)} L${X(region) - 4} ${Y(T / 2)} L${X(region)} ${Y(T)} L${X(0)} ${Y(T)} Z" class="bi-board"/>`);
  const x0 = u - ew / 2;
  if (work?.plate) {
    const ph = Math.min(work.plate.h, T);
    out.push(`<rect x="${X(x0)}" y="${Y(T / 2 + ph / 2)}" width="${ew * s}" height="${ph * s}" class="bi-plate"/>`);
    const rx = X(region) + 10;
    line(rx, Y(T / 2 + ph / 2), rx, Y(T / 2 - ph / 2));
    text(rx + 3, Y(T / 2) + 3, `płytka ${fmt(ph)}`, 'bi-small', 'start');
  } else if (work?.kind === 'slot') {
    out.push(`<rect x="${X(x0)}" y="${Y(work.depth)}" width="${ew * s}" height="${work.depth * s}" class="bi-hole-edge"/>`);
  } else if (!work) {
    out.push(`<rect x="${X(x0)}" y="${Y(0)}" width="${ew * s}" height="4" class="bi-mount"/>`); // wspornik pod płytą
  }
  if (work?.kind === 'holes') out.push(`<circle cx="${X(u)}" cy="${Y(T / 2)}" r="${(work.d / 2) * s}" class="bi-hole-edge"/>`);
  const yTop = pad.t - 8;
  if (pts.edge > 0.5) dimH(0, x0, yTop, fmt(pts.edge));
  dimH(x0, x0 + ew, yTop, work?.plate ? `płytka ${fmt(ew)}` : work?.kind === 'slot' ? `frez ${fmt(ew)}` : work?.kind === 'holes' ? `Ø${fmt(ew)}` : fmt(ew));
  if (work?.kind === 'holes') {
    // średnica: linie pomocnicze od krawędzi otworu w dół, pod płytą linia wymiarowa „Ø…”
    const r = (work.d / 2) * s;
    const yd = Y(0) + 12;
    line(X(u) - r, Y(T / 2), X(u) - r, yd + 3, 'bi-dim2');
    line(X(u) + r, Y(T / 2), X(u) + r, yd + 3, 'bi-dim2');
    line(X(u) - r, yd, X(u) + r, yd);
    text(X(u), yd + 12, `Ø${fmt(work.d)}`, 'bi-txt bi-dia');
    text(X(u), yd + 24, `otwór w osi grubości (${fmt(T / 2)} od spodu), gł. ${fmt(work.depth)}`, 'bi-small');
    // środek otworu — krzyżyk
    line(X(u) - r - 3, Y(T / 2), X(u) + r + 3, Y(T / 2), 'bi-axis');
    line(X(u), Y(T / 2) - r - 3, X(u), Y(T / 2) + r + 3, 'bi-axis');
  }
  const gx = X(region) + 50;
  line(gx, Y(T), gx, Y(0));
  text(gx + 3, Y(T / 2) + 3, `gr. ${fmt(T)}`, 'bi-small', 'start');
  return `<svg viewBox="0 0 ${VW} ${H}" width="100%" class="bi-detail" role="img" aria-label="Detal mocowania">${out.join('')}</svg>`;
}
