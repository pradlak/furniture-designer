import { cutListCsv, cutListXlsx, cutListRows, buildAccessories, ALL_PARTS } from '../model/cutList.js';
import { boardBox, boardMaterial, describeMountWork, mountInfo, mountPoints } from '../model/boards.js';
import { describeEdges, describeHoles } from '../model/boardFeatures.js';
import { saveFile } from './saveFile.js';
import { sketchSvg } from './boardInspector.js';
import { trimSketch } from './objectSketch.js';
import { trimBox, TRIM_TYPES } from '../model/trims.js';
import { trimMaterial } from '../model/materials.js';

// Pobieranie danych jednej samodzielnej płyty (półki, blatu): formatka (Excel / CSV — z obróbką i akcesoriami)
// oraz rysunek techniczny (PNG / PDF, A4 poziomo): szkic z wymiarami, detal mocowania i opis obróbki.

const fileBase = (board) => (board.name || 'plyta').replace(/[^\p{L}\p{N}_-]+/gu, '_');
const filterFor = (boardId) => ({ cabinetIds: new Set(), boardIds: new Set([boardId]) });

export function downloadBoardCutList(project, boardId, format = 'xlsx') {
  const board = project.boards?.find((b) => b.id === boardId);
  if (!board) return;
  const options = { filter: filterFor(boardId) };
  const xlsx = format === 'xlsx';
  const blob = xlsx
    ? new Blob([cutListXlsx(project, options)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new Blob([cutListCsv(project, options)], { type: 'text/csv;charset=utf-16le' });
  saveFile(blob, `${fileBase(board)}_formatka.${xlsx ? 'xlsx' : 'csv'}`, { description: xlsx ? 'Arkusz Excel' : 'Plik CSV' });
}

// --- rysunek techniczny ---
const PAGE = { w: 1191, h: 842 }; // A4 poziomo (pt × ~1,41) — proporcje strony PDF 842 × 595
const SKETCH_CSS = `
  .bi-board { fill: #f3e8d5; stroke: #6b7280; stroke-width: 1; }
  .bi-hole { fill: #fff; stroke: #374151; stroke-width: 1; }
  .bi-mount { fill: rgba(37, 99, 235, 0.15); stroke: #2563eb; stroke-width: 1; stroke-dasharray: 3 2; }
  .bi-hole-edge { fill: #fff; stroke: #2563eb; stroke-width: 1.2; }
  .bi-wall { stroke: #9ca3af; stroke-width: 3; }
  .bi-dim, .bi-tick { stroke: #2563eb; stroke-width: 1; }
  .bi-dim2 { stroke: #2563eb; stroke-width: 1; stroke-dasharray: 2 2; }
  .bi-txt { font-size: 10px; fill: #1d4ed8; font-weight: 600; font-family: Arial, Helvetica, sans-serif; }
  .bi-small { font-size: 8.5px; fill: #4b5563; font-family: Arial, Helvetica, sans-serif; }
  .bi-plate { fill: rgba(220, 38, 38, 0.18); stroke: #dc2626; stroke-width: 1; }
  .bi-dia { fill: #1d4ed8; font-weight: 500; }
  .bi-leader { stroke: #9ca3af; stroke-width: 0.7; }
  .bi-axis { stroke: #cbd5e1; stroke-width: 0.5; stroke-dasharray: 4 2 1 2; }
  .t-title { font: 700 22px Arial, Helvetica, sans-serif; fill: #111827; }
  .t-sub { font: 13px Arial, Helvetica, sans-serif; fill: #4b5563; }
  .t-h { font: 700 13px Arial, Helvetica, sans-serif; fill: #111827; }
  .t-p { font: 12px Arial, Helvetica, sans-serif; fill: #1f2937; }
`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// zawijanie tekstu na linie po ok. n znaków (po spacjach)
function wrap(text, n) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > n && line) {
        out.push(line);
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    out.push(line);
  }
  return out;
}

// Rysunek jako jeden SVG (strona A4 poziomo): po lewej szkic i detal, po prawej opis.
export function boardDrawingSvg(project, boardId) {
  const board = project.boards?.find((b) => b.id === boardId);
  if (!board) return null;
  const box = boardBox(board, project);
  const mat = boardMaterial(board, project);
  // szkic z okienka (dwa SVG: widoki i detal) — wstawiony jako zagnieżdżone SVG w skali
  const parts = [...sketchSvg(board, box).matchAll(/<svg viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*?)<\/svg>/g)].map((m) => ({ w: +m[1], h: +m[2], inner: m[3] }));
  const left = { x: 30, y: 90, w: 720 };
  let y = left.y;
  const nested = parts
    .map((p, i) => {
      const scale = left.w / p.w;
      const h = Math.min(p.h * scale, i === 0 ? 470 : PAGE.h - y - 30);
      const w = (h / p.h) * p.w;
      const svg = `<svg x="${left.x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${p.w} ${p.h}">${p.inner}</svg>`;
      y += h + 14;
      return svg;
    })
    .join('');
  // opis po prawej
  const pts = mountPoints(board);
  const acc = buildAccessories(project, new Set(), new Set([board.id]));
  const row = cutListRows(project, ALL_PARTS, filterFor(board.id))[0];
  const sections = [
    ['Płyta', [
      `${board.kind === 'worktop' ? 'Blat samodzielny' : 'Półka samodzielna'}: ${board.width} × ${board.depth} × ${box.height} mm`,
      `Materiał: ${mat.name}`,
      row ? `Do cięcia: ${row.cutLength} × ${row.cutWidth} mm${row.edgeNames ? `, okleina: ${row.edgeNames}` : ''}` : '',
      board.clearance ? `Zapas przy wnęce: ${board.clearance} mm (po ${String(board.clearance / 2).replace('.', ',')} z każdej strony)` : '',
      `Położenie: od lewej ${board.x}, od podłogi ${board.y}, od tyłu ${board.z} mm`,
    ]],
    ['Obróbka', [describeEdges(board.edges), describeHoles(board.holes, box.width, box.depth), describeMountWork(board, box.height)].filter(Boolean)],
    ['Mocowanie do ściany', [pts.type ? `${mountInfo(pts.type).label}${pts.count && pts.type !== 'cleat' ? ` — ${pts.count} szt., x od lewej: ${pts.xs.map((x) => Math.round(x * 10) / 10).join('; ')} mm` : ''}` : 'brak']],
    ['Akcesoria', acc.length ? acc.map((a) => `${a.name}: ${a.qty} szt.`) : ['—']],
  ];
  const rx = 780;
  let ty = 100;
  const text = [];
  for (const [head, lines] of sections) {
    const body = lines.filter(Boolean);
    if (!body.length) continue;
    text.push(`<text x="${rx}" y="${ty}" class="t-h">${esc(head)}</text>`);
    ty += 18;
    for (const l of body) {
      for (const w of wrap(l, 58)) {
        text.push(`<text x="${rx}" y="${ty}" class="t-p">${esc(w)}</text>`);
        ty += 16;
      }
      ty += 3;
    }
    ty += 10;
  }
  const date = new Date().toLocaleDateString('pl-PL');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
    <style>${SKETCH_CSS}</style>
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="12" y="12" width="${PAGE.w - 24}" height="${PAGE.h - 24}" fill="none" stroke="#9ca3af"/>
    <text x="30" y="48" class="t-title">${esc(board.name)}</text>
    <text x="30" y="70" class="t-sub">${esc(`${project.space.name || 'Projekt'} · rysunek płyty · wymiary w mm · ${date}`)}</text>
    <line x1="765" y1="85" x2="765" y2="${PAGE.h - 30}" stroke="#e5e7eb"/>
    ${nested}
    ${text.join('')}
  </svg>`;
}

// SVG → obraz na płótnie (×scale) → callback(canvas)
function renderSvg(svg, scale, done) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PAGE.w * scale);
    canvas.height = Math.round(PAGE.h * scale);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    done(canvas);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Nie udało się przygotować rysunku.');
  };
  img.src = url;
}

// Prosty PDF z jedną stroną A4 (poziomo) i obrazem JPEG na całą stronę.
function pdfWithJpeg(jpeg, imgW, imgH) {
  const enc = new TextEncoder();
  const W = 842;
  const H = 595;
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const b of [].concat(body)) push(b);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

// format: 'png' albo 'pdf'
export function downloadBoardDrawing(project, boardId, format = 'pdf') {
  const board = project.boards?.find((b) => b.id === boardId);
  const svg = board && boardDrawingSvg(project, boardId);
  if (!svg) return;
  saveDrawing(svg, `${fileBase(board)}_rysunek`, format);
}

function saveDrawing(svg, name, format) {
  if (format === 'svg') {
    saveFile(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`, { description: 'Rysunek SVG' });
    return;
  }
  renderSvg(svg, 2, (canvas) => {
    if (format === 'png') {
      canvas.toBlob((blob) => blob && saveFile(blob, `${name}.png`, { description: 'Obraz PNG' }), 'image/png');
      return;
    }
    const data = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const jpeg = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) jpeg[i] = data.charCodeAt(i);
    saveFile(pdfWithJpeg(jpeg, canvas.width, canvas.height), `${name}.pdf`, { description: 'Dokument PDF' });
  });
}

// --- blat na szafkach / blenda dolna, górna: formatka i rysunek ---
const trimFilter = (trimId) => ({ cabinetIds: new Set(), boards: false, trimIds: new Set([trimId]) });

export function downloadTrimCutList(project, trimId, format = 'xlsx') {
  const trim = project.trims?.find((t) => t.id === trimId);
  if (!trim) return;
  const options = { accessories: false, filter: trimFilter(trimId) };
  const xlsx = format === 'xlsx';
  const blob = xlsx
    ? new Blob([cutListXlsx(project, options)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new Blob([cutListCsv(project, options)], { type: 'text/csv;charset=utf-16le' });
  saveFile(blob, `${fileBase(trim)}_formatka.${xlsx ? 'xlsx' : 'csv'}`, { description: xlsx ? 'Arkusz Excel' : 'Plik CSV' });
}

export function trimDrawingSvg(project, trimId) {
  const trim = project.trims?.find((t) => t.id === trimId);
  const box = trim && trimBox(trim, project);
  if (!box) return null;
  const mat = trimMaterial(trim, project);
  const m = trimSketch(trim, project).match(/<svg viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*?)<\/svg>/);
  const left = { x: 30, y: 90, w: 720 };
  const h = m ? Math.min(+m[2] * (left.w / +m[1]), PAGE.h - left.y - 30) : 0;
  const w = m ? (h / +m[2]) * +m[1] : 0;
  const nested = m ? `<svg x="${left.x}" y="${left.y}" width="${w}" height="${h}" viewBox="0 0 ${m[1]} ${m[2]}">${m[3]}</svg>` : '';
  const rows = cutListRows(project, ALL_PARTS, trimFilter(trimId));
  const cabs = trim.cabinetIds.map((id) => project.furniture.find((c) => c.id === id)?.name).filter(Boolean);
  const sections = [
    [TRIM_TYPES[trim.type]?.label ?? 'Element', [
      `Wymiary: ${Math.round(box.width)} × ${Math.round(box.depth)} × ${Math.round(box.height)} mm`,
      `Materiał: ${mat.name}`,
      cabs.length ? `Na korpusach: ${cabs.join(', ')}` : '',
      `Wierzch ${Math.round(box.y + box.height)} mm od podłogi`,
    ]],
    ['Do cięcia', rows.map((r) => `${r.cutLength} × ${r.cutWidth} × ${r.thickness} mm${r.qty > 1 ? ` — ${r.qty} szt.` : ''}${r.edgeNames ? `, okleina: ${r.edgeNames}` : ''}${r.shape ? ` — ${r.shape}` : ''}`)],
    ['Obróbka', [describeEdges(trim.edges), describeHoles(trim.holes, box.width, box.depth)].filter(Boolean)],
  ];
  const rx = 780;
  let ty = 100;
  const text = [];
  for (const [head, lines] of sections) {
    const body = lines.filter(Boolean);
    if (!body.length) continue;
    text.push(`<text x="${rx}" y="${ty}" class="t-h">${esc(head)}</text>`);
    ty += 18;
    for (const l of body) {
      for (const line of wrap(l, 58)) {
        text.push(`<text x="${rx}" y="${ty}" class="t-p">${esc(line)}</text>`);
        ty += 16;
      }
      ty += 3;
    }
    ty += 10;
  }
  const date = new Date().toLocaleDateString('pl-PL');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
    <style>${SKETCH_CSS}
  .bi-under { fill: none; stroke: #9ca3af; stroke-width: 0.8; stroke-dasharray: 3 2; }
  .bi-front { fill: #fbf7ef; stroke: #6b7280; stroke-width: 1; }</style>
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="12" y="12" width="${PAGE.w - 24}" height="${PAGE.h - 24}" fill="none" stroke="#9ca3af"/>
    <text x="30" y="48" class="t-title">${esc(trim.name)}</text>
    <text x="30" y="70" class="t-sub">${esc(`${project.space.name || 'Projekt'} · rysunek · wymiary w mm · ${date}`)}</text>
    <line x1="765" y1="85" x2="765" y2="${PAGE.h - 30}" stroke="#e5e7eb"/>
    ${nested}
    ${text.join('')}
  </svg>`;
}

export function downloadTrimDrawing(project, trimId, format = 'pdf') {
  const trim = project.trims?.find((t) => t.id === trimId);
  const svg = trim && trimDrawingSvg(project, trimId);
  if (!svg) return;
  saveDrawing(svg, `${fileBase(trim)}_rysunek`, format);
}
