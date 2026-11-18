import * as THREE from 'three';
import { MM, toScene } from './units.js';

// Wygląd występu ściany (o.decor — patrz WALL_DECORS w model/space.js): kominek klasyczny, wkład kominkowy
// z szybą albo telewizor na przedniej ścianie występu. Tylko efekt wizualny — bez wpływu na model.
// Wymiary dobierane do szerokości i wysokości występu (mm); za wąski / za niski występ — bez dekoracji.

// Materiały są stałe i współdzielone między przebudowami sceny (nie zwalniamy ich).
const M = {
  stone: new THREE.MeshStandardMaterial({ color: 0xe7e1d3, roughness: 0.85 }),
  mantel: new THREE.MeshStandardMaterial({ color: 0x8b6a47, roughness: 0.7 }),
  hearth: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6 }),
  soot: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 1 }),
  log: new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  flameCore: new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  frame: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18 }),
  bezel: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.35 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x0b1220, roughness: 0.15, metalness: 0.1 }),
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function buildWallDecor(o, space) {
  if (!o.decor || o.width < 400 || o.height < 800) return null;
  const group = new THREE.Group();
  // prostopadłościan w mm (lewy-dolny-tylny narożnik, z — od tylnej ściany)
  const box = (x, y, z, w, h, d, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), material);
    mesh.position.set(...toScene(x + w / 2, y + h / 2, z + d / 2, space));
    group.add(mesh);
    return mesh;
  };
  // płomień: stożek (r — promień podstawy, h — wysokość), podstawa na wysokości y
  const flame = (x, y, z, r, h, material) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r * MM, h * MM, 10), material);
    mesh.position.set(...toScene(x, y + h / 2, z, space));
    mesh.scale.z = 0.5; // spłaszczony — wygląda jak płomień, nie wystaje z paleniska
    group.add(mesh);
  };
  const F = o.z + o.depth; // przednia ściana występu
  const cx = o.x + o.width / 2;
  const y0 = o.y;

  if (o.decor === 'fireplace') {
    // obudowa (portal) z kamienia: dwa filary i nadproże wokół paleniska, półka kominkowa, płyta przed kominkiem
    const sw = clamp(o.width - 160, 400, 1500);
    const sh = clamp(o.height * 0.45, 600, 1150);
    const sd = 80;
    const ow = sw * 0.56;
    const oh = sh * 0.62;
    const leg = (sw - ow) / 2;
    box(cx - sw / 2, y0, F, leg, oh, sd, M.stone);
    box(cx + ow / 2, y0, F, leg, oh, sd, M.stone);
    box(cx - sw / 2, y0 + oh, F, sw, sh - oh, sd, M.stone);
    box(cx - sw / 2 - 60, y0 + sh, F, sw + 120, 50, 220, M.mantel);
    const hw = Math.min(sw + 200, o.width); // płyta przed kominkiem — nie wchodzi przed sąsiednie wnęki
    box(cx - hw / 2, y0, F, hw, 25, 400, M.hearth);
    // palenisko: osmolone wnętrze, polana, ogień
    box(cx - ow / 2, y0 + 25, F, ow, oh - 25, 12, M.soot);
    for (const dy of [0, 70]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(40 * MM, 40 * MM, ow * 0.6 * MM, 12), M.log);
      log.rotation.z = Math.PI / 2;
      log.position.set(...toScene(cx + (dy ? 30 : -20), y0 + 25 + 40 + dy, F + 45, space));
      group.add(log);
    }
    const fy = y0 + 70;
    flame(cx - ow * 0.18, fy, F + 40, 45, oh * 0.38, M.flame);
    flame(cx + ow * 0.16, fy, F + 40, 40, oh * 0.33, M.flame);
    flame(cx, fy, F + 40, 55, oh * 0.5, M.flame);
    flame(cx, fy, F + 42, 28, oh * 0.32, M.flameCore);
  } else if (o.decor === 'insert') {
    // nowoczesny wkład: czarna rama, ciemne wnętrze, rząd płomieni, szyba
    const iw = clamp(o.width - 300, 300, 1200);
    const ih = clamp(iw * 0.45, 250, 600);
    const yb = y0 + clamp(o.height * 0.32, 300, 900);
    const fr = 40;
    box(cx - iw / 2, yb, F, iw, ih, 8, M.soot);
    box(cx - iw / 2 - fr, yb - fr, F, iw + 2 * fr, fr, 25, M.frame);
    box(cx - iw / 2 - fr, yb + ih, F, iw + 2 * fr, fr, 25, M.frame);
    box(cx - iw / 2 - fr, yb, F, fr, ih, 25, M.frame);
    box(cx + iw / 2, yb, F, fr, ih, 25, M.frame);
    const n = Math.max(3, Math.round(iw / 120));
    for (let i = 0; i < n; i++) {
      const x = cx - iw / 2 + ((i + 0.5) * iw) / n;
      const h = ih * (0.35 + 0.25 * Math.abs(Math.sin(i * 2.3)));
      flame(x, yb + 15, F + 14, iw / n / 2.4, h, M.flame);
      flame(x, yb + 15, F + 16, iw / n / 5, h * 0.55, M.flameCore);
    }
    box(cx - iw / 2, yb, F + 22, iw, ih, 2, M.glass);
  } else if (o.decor === 'tv') {
    // telewizor 16:9 na ścianie: obudowa i ekran
    const tw = clamp(o.width - 200, 300, 1450);
    const th = (tw * 9) / 16;
    const yc = y0 + clamp(o.height * 0.52, th / 2 + 300, 1400);
    box(cx - tw / 2, yc - th / 2, F, tw, th, 35, M.bezel);
    box(cx - tw / 2 + 12, yc - th / 2 + 12, F + 35, tw - 24, th - 24, 2, M.screen);
  }
  // klik w dekorację = klik w występ (zaznaczenie, przeciąganie, menu)
  group.traverse((m) => {
    if (m.isMesh) m.userData.obstacleId = o.id;
  });
  return group;
}
