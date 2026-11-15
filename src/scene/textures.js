import * as THREE from 'three';

// Faktury dekorów (drewno, beton, marmur) rysowane w przeglądarce (canvas) — bez plików graficznych.
// Jedna faktura na parę (rodzaj, kolor); kafel faktury odpowiada TILE_MM milimetrom płyty, a współrzędne
// UV płyt są w milimetrach (patrz scaleBoxUVs i ExtrudeGeometry), więc słoje mają ten sam rozmiar na
// każdej płycie.

export const TILE_MM = { wood: 900, concrete: 700, marble: 1200 };
const SIZE = 1024;
const cache = new Map();

// Prosty, powtarzalny generator liczb losowych (ta sama faktura przy każdym rysowaniu).
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  return `rgb(${Math.round(Math.min(255, c.r * 255 * k))},${Math.round(Math.min(255, c.g * 255 * k))},${Math.round(Math.min(255, c.b * 255 * k))})`;
};

// Drewno: słoje wzdłuż osi X kafla (falujące linie różnej grubości i jasności), delikatne pory.
function drawWood(ctx, base) {
  const r = rng(7);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // szerokie pasy jaśniejsze / ciemniejsze (deski, przyrosty)
  for (let i = 0; i < 26; i++) {
    const y = r() * SIZE;
    const h = 8 + r() * 60;
    ctx.fillStyle = shade(base, 0.86 + r() * 0.28);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, y, SIZE, h);
  }
  // słoje: falujące linie (okresowe w X, żeby kafel łączył się bez szwu)
  for (let i = 0; i < 170; i++) {
    const y0 = r() * SIZE;
    const amp = 2 + r() * 14;
    const waves = 1 + Math.floor(r() * 3);
    const phase = r() * Math.PI * 2;
    ctx.strokeStyle = shade(base, 0.55 + r() * 0.35);
    ctx.globalAlpha = 0.18 + r() * 0.35;
    ctx.lineWidth = 0.6 + r() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= SIZE; x += 8) {
      const y = y0 + amp * Math.sin((x / SIZE) * Math.PI * 2 * waves + phase);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // pory
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = shade(base, 0.5 + r() * 0.3);
    ctx.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 6, 1);
  }
  ctx.globalAlpha = 1;
}

// Beton: plamy i drobne ziarno.
function drawConcrete(ctx, base) {
  const r = rng(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 140; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const x = r() * SIZE;
    const y = r() * SIZE;
    const rad = 30 + r() * 160;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rad, rad);
    g.addColorStop(0, shade(base, 0.85 + r() * 0.3));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = shade(base, 0.6 + r() * 0.7);
    ctx.fillRect(r() * SIZE, r() * SIZE, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

// Marmur: jasne tło z cienkimi, rozgałęzionymi żyłkami.
function drawMarble(ctx, base) {
  const r = rng(23);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 26; i++) {
    let x = r() * SIZE;
    let y = r() * SIZE;
    let a = r() * Math.PI * 2;
    ctx.strokeStyle = shade(base, 0.45 + r() * 0.3);
    ctx.globalAlpha = 0.15 + r() * 0.4;
    ctx.lineWidth = 0.6 + r() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 60; s++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const DRAW = { wood: drawWood, concrete: drawConcrete, marble: drawMarble };

// Faktura dla dekoru (rodzaj + kolor bazowy) albo null, gdy dekor jednolity.
export function decorTexture(kind, color) {
  if (!DRAW[kind]) return null;
  const key = `${kind}:${color}`;
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    DRAW[kind](canvas.getContext('2d'), color);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / TILE_MM[kind], 1 / TILE_MM[kind]);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    cache.set(key, tex);
  }
  return cache.get(key);
}

// Współrzędne UV prostopadłościanu (BoxGeometry, 0…1 na ścianę) → milimetry ściany; słoje wzdłuż
// dłuższego boku ściany. w, h, d — wymiary pudełka w mm (X, Y, Z).
export function scaleBoxUVs(geometry, w, h, d) {
  const uv = geometry.attributes.uv;
  // kolejność ścian BoxGeometry: +x, −x, +y, −y, +z, −z (po 4 wierzchołki); wymiary ściany w osiach u / v
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = faces[f];
    const swap = fv > fu; // słoje (oś X kafla) wzdłuż dłuższego boku
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const u = uv.getX(k);
      const v = uv.getY(k);
      if (swap) uv.setXY(k, v * fv, u * fu);
      else uv.setXY(k, u * fu, v * fv);
    }
  }
  uv.needsUpdate = true;
}
