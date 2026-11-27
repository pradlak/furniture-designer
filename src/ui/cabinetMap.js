import { escapeHtml } from './dom.js';
import { legHeight, cabinetIssues, cabinetPanels } from '../model/furniture.js';
import { isWallLike } from '../model/space.js';
import { trimBox } from '../model/trims.js';
import { boardBox } from '../model/boards.js';
import { getSettings } from '../state/settings.js';
import { t } from '../i18n.js';

// Mapka zabudowy na górze zakładki „Meble”: schemat ściany z przodu (mm → SVG), korpusy jako prostokąty
// z nazwą albo numerem, występy ścian (kominek) szare, blaty jako cienkie paski. Klik w korpus — zaznacza go
// (jak klik w 3D) i pokazuje jego kartę; Ctrl + klik — dodaje do zaznaczenia / usuwa z niego. Klik w front
// zaznaczonego korpusu (albo dwuklik) — zaznacza ten front (szufladę, drzwi).
// Korpus z ostrzeżeniami ma czerwoną ramkę. Rysowana na nowo przy każdej zmianie projektu i zaznaczenia.
// selectedParts — zaznaczone elementy („idKorpusu:klucz”, np. front szuflady): na mapce wyróżnione, a ich korpus —
// tylko obramowany (jak w 3D). Fronty (drzwi, szuflady, czoła szuflad wewnętrznych) rysowane na korpusach.
export function cabinetMapSvg(project, selectedIds, selectedParts = new Set()) {
  const { space } = project;
  const W = space.width;
  const H = space.height;
  const Y = (y) => H - y; // SVG: y w dół
  const pad = Math.max(W, H) * 0.015;
  const parts = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" class="map-space" />`);
  const pickedObstacle = [...selectedParts].find((id) => id.startsWith('obstacle:'))?.slice(9) ?? null;
  for (const o of space.obstacles) {
    const cls = isWallLike(o) ? (o.kind === 'hood' ? 'map-wall map-hood' : 'map-wall') : 'map-obstacle';
    parts.push(`<rect x="${o.x}" y="${Y(o.y + o.height)}" width="${o.width}" height="${Math.max(o.height, H * 0.01)}" class="${cls}${o.id === pickedObstacle ? ' picked' : ''}" data-map-obstacle="${o.id}" ${o.color?.hex ? `style="fill:${o.color.hex}"` : ''}><title>${escapeHtml(o.name || t('Przeszkoda'))}</title></rect>`);
  }
  for (const t of (project.trims ?? []).filter((t) => t.type === 'countertop' && !t.hidden)) {
    const b = trimBox(t, project);
    if (b) parts.push(`<rect x="${b.x}" y="${Y(b.y + b.height)}" width="${b.width}" height="${Math.max(b.height, H * 0.012)}" class="map-top" />`);
  }

  // od tyłu do przodu — korpus stojący bliżej przykrywa ten za nim
  const highlight = getSettings().highlight;
  const cabs = project.furniture.map((c, i) => ({ c, i })).sort((a, b) => a.c.z - b.c.z);
  for (const { c, i } of cabs) {
    const y0 = c.y + legHeight(c);
    const sel = selectedIds.has(c.id);
    const partPicked = [...selectedParts].some((id) => id.startsWith(`${c.id}:`));
    const issues = cabinetIssues(c, project);
    const bad = issues.length > 0;
    const fs = Math.max(H * 0.045, Math.min(c.width * 0.22, c.height * 0.2, H * 0.09));
    // cała nazwa, gdy się mieści; inaczej numer z nazwy („Korpus 3” → 3), a bez numeru — kolejny na liście
    const short = /(\d+)\s*$/.exec(c.name)?.[1] ?? String(i + 1);
    const label = c.name.length * fs * 0.55 < c.width * 0.92 ? c.name : short;
    const legs = legHeight(c)
      ? `<rect x="${c.x + c.width * 0.08}" y="${Y(y0)}" width="${c.width * 0.84}" height="${legHeight(c)}" class="map-legs" />`
      : '';
    parts.push(`
      <g class="map-cab${sel ? ' sel' : ''}${bad ? ' bad' : ''}" data-map-cab="${c.id}">
        <title>${escapeHtml(`${c.name} · ${c.width} × ${c.height} × ${c.depth} mm${bad ? ' · ⚠ ' + issues.join(' ') : ''}`)}</title>
        ${legs}
        <rect x="${c.x}" y="${Y(y0 + c.height)}" width="${c.width}" height="${c.height}" ${sel && !partPicked ? `style="fill:${highlight}"` : ''} />
        ${frontsSvg(c, project, selectedParts, Y, highlight)}
        <text x="${c.x + c.width / 2}" y="${Y(y0 + c.height / 2)}" font-size="${fs}">${escapeHtml(label)}</text>
      </g>`);
  }
  // samodzielne półki i blaty (widok z przodu: pas na wysokości płyty)
  for (const b of (project.boards ?? []).filter((x) => !x.hidden)) {
    const box = boardBox(b, project);
    const picked = selectedParts.has(`board:${b.id}`);
    parts.push(`<rect x="${box.x}" y="${Y(box.y + box.height)}" width="${box.width}" height="${Math.max(box.height, H * 0.012)}" class="map-board${picked ? ' picked' : ''}" data-map-board="${b.id}" ${picked ? `style="fill:${highlight}"` : ''}><title>${escapeHtml(b.name)}</title></rect>`);
  }
  return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${t('Mapka zabudowy')}">${parts.join('')}</svg>`;
}

// Fronty korpusu na mapce (widok z przodu): drzwi i szuflady — obrys, szuflady z kreską uchwytu, czoła szuflad
// wewnętrznych — przerywane; zaznaczony front — w kolorze zaznaczenia.
function frontsSvg(c, project, selectedParts, Y, highlight) {
  const parts = [];
  for (const p of cabinetPanels(c, project)) {
    if (!p.valid || p.hidden || !(p.key.startsWith('front-') || p.key.startsWith('idrawer-'))) continue;
    const picked = selectedParts.has(`${c.id}:${p.key}`);
    const cls = p.key.startsWith('idrawer-') ? 'map-front map-inner' : 'map-front';
    parts.push(`<rect x="${p.x}" y="${Y(p.y + p.height)}" width="${p.width}" height="${p.height}" class="${cls}${picked ? ' picked' : ''}" data-map-front="${c.id}:${p.key}" ${picked ? `style="fill:${highlight}"` : ''}><title>${escapeHtml(p.name ?? '')}</title></rect>`);
    if (p.opening?.drawer && !p.key.startsWith('idrawer-')) {
      const cy = Y(p.y + p.height / 2);
      parts.push(`<line x1="${p.x + p.width * 0.4}" y1="${cy}" x2="${p.x + p.width * 0.6}" y2="${cy}" class="map-front-handle" />`);
    }
  }
  return parts.join('');
}
