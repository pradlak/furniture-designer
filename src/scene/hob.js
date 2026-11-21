import * as THREE from 'three';
import { MM } from './units.js';

// Płyta grzewcza w otworze blatu (tylko wygląd w 3D): hole.fill — 'induction' (indukcyjna: czarne szkło z polami
// grzewczymi i panelem dotykowym) albo 'gas' (gazowa: stalowa płyta z palnikami i żeliwnymi rusztami).
// Płyta jest większa od wycięcia (leży na blacie) — o HOB_OVERLAP mm z każdej strony.
// box — płyta blatu { x, y, z, width, height, depth } (mm), hole — otwór z wyliczonym środkiem (x, y).
export const HOB_OVERLAP = 15;

const glassMaterial = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 90, specular: 0x666666 });
const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x9ca3af, shininess: 60, specular: 0x888888 });
const steelMaterial = new THREE.MeshPhongMaterial({ color: 0x3a3a3c, shininess: 50, specular: 0x555555 });
const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
const burnerMaterial = new THREE.MeshPhongMaterial({ color: 0x6b7280, shininess: 40 });
const capMaterial = new THREE.MeshPhongMaterial({ color: 0x0f0f0f, shininess: 70 });
const knobMaterial = new THREE.MeshPhongMaterial({ color: 0xd1d5db, shininess: 80 });

// pola grzewcze płyty indukcyjnej / palniki gazowej: [u, v (−0,5…0,5 od środka), średnica względem krótszego boku]
const ZONES = [
  [-0.25, -0.22, 0.42],
  [0.25, -0.24, 0.32],
  [-0.25, 0.24, 0.3],
  [0.25, 0.22, 0.38],
];

const glassTextures = new Map();
function glassTexture(w, d) {
  const key = `${Math.round(w)}x${Math.round(d)}`;
  if (glassTextures.has(key)) return glassTextures.get(key);
  const s = 512 / Math.max(w, d);
  const cw = Math.round(w * s);
  const ch = Math.round(d * s);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  g.fillStyle = '#121212';
  g.fillRect(0, 0, cw, ch);
  const m = Math.min(w, d);
  g.strokeStyle = 'rgba(210,210,210,0.55)';
  g.lineWidth = Math.max(1.5, 3 * s);
  for (const [u, v, k] of ZONES) {
    // płótno: góra — tył płyty, dół — przód
    const cx = (0.5 + u) * cw;
    const cy = (0.5 - v) * ch;
    const r = (k * m * s) / 2;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    g.globalAlpha = 0.35;
    g.stroke();
    g.globalAlpha = 1;
  }
  // panel dotykowy przy przedniej krawędzi
  g.fillStyle = 'rgba(230,230,230,0.6)';
  const py = ch - Math.max(6, 22 * s);
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(cw * (0.3 + i * 0.066), py, Math.max(1.5, 4 * s), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 90, specular: 0x666666 });
  glassTextures.set(key, mat);
  return mat;
}

export function buildHob(box, hole, space) {
  const group = new THREE.Group();
  if (!hole?.fill || hole.shape !== 'rect') return group;
  const w = hole.w + 2 * HOB_OVERLAP;
  const d = hole.h + 2 * HOB_OVERLAP;
  const top = box.y + box.height;
  // środek płyty w scenie
  const cx = (box.x + hole.x) * MM;
  const cz = (box.z + box.depth - hole.y - space.depth) * MM;
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx + x * MM, (top + y) * MM, cz - z * MM); // x — w prawo, z — w głąb (od przodu do tyłu)
    group.add(mesh);
    return mesh;
  };
  const m = Math.min(w, d);
  if (hole.fill === 'induction') {
    const t = 5;
    // szkło: górna ściana z polami grzewczymi, boki czarne; cienka ramka
    const faces = [glassMaterial, glassMaterial, glassTexture(w, d), glassMaterial, glassMaterial, glassMaterial];
    add(new THREE.BoxGeometry(w * MM, t * MM, d * MM), faces, 0, t / 2, 0);
    add(new THREE.BoxGeometry((w + 2) * MM, 1.5 * MM, (d + 2) * MM), frameMaterial, 0, 0.75, 0);
    return group;
  }
  // gazowa: płyta stalowa, palniki z nakrywkami, ruszty, pokrętła przy przedniej krawędzi
  const t = 4;
  add(new THREE.BoxGeometry(w * MM, t * MM, d * MM), steelMaterial, 0, t / 2, 0);
  for (const [u, v, k] of ZONES) {
    const r = (k * m) / 2 * 0.42;
    add(new THREE.CylinderGeometry(r * MM, r * 1.08 * MM, 12 * MM, 28), burnerMaterial, u * w, t + 6, v * d);
    add(new THREE.CylinderGeometry(r * 0.72 * MM, r * 0.72 * MM, 4 * MM, 24), capMaterial, u * w, t + 14, v * d);
  }
  // ruszty: dwa (lewy i prawy), każdy z obwodu i krzyża prętów, 28 mm nad płytą
  const barH = 8;
  const barW = 8;
  const gy = t + 24;
  const gd = d - 80; // ruszty odsunięte od przodu — przed nimi pokrętła
  const gz = 15; // środek rusztów lekko w głąb
  for (const side of [-1, 1]) {
    const gw = w / 2 - 20;
    const gx = (side * w) / 4;
    const bar = (lx, lz, x, z) => add(new THREE.BoxGeometry(lx * MM, barH * MM, lz * MM), ironMaterial, x, gy, z);
    bar(gw, barW, gx, gz - gd / 2);
    bar(gw, barW, gx, gz + gd / 2);
    bar(barW, gd, gx - gw / 2, gz);
    bar(barW, gd, gx + gw / 2, gz);
    bar(gw, barW, gx, gz);
    bar(barW, gd, gx, gz);
    // nóżki rusztu
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(barW * MM, 20 * MM, barW * MM), ironMaterial, gx + (px * gw) / 2, t + 10, gz + (pz * gd) / 2);
  }
  // pokrętła: przed rusztami, przy przedniej krawędzi
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(14 * MM, 16 * MM, 16 * MM, 20), knobMaterial, (-0.3 + i * 0.2) * w, t + 8, -d / 2 + 22);
  return group;
}
