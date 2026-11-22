import * as THREE from 'three';
import { MM, toScene } from './units.js';
import { decorType } from '../model/decorations.js';

// Dekoracje w 3D (model/decorations.js): proste bryły z kilku elementów, w skali wymiarów obiektu.
// Każda dekoracja to grupa z userData.decorId (klik — zaznaczenie, przeciąganie, menu). Zaznaczona — z obrysem.

const mat = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 30, ...extra });

// Funkcje rysujące: DECOR_BUILDERS[typ](ctx) — ctx: { d (dekoracja), W, H, D (wymiary w mm), color (kolor główny),
// add(geometria, materiał, x, y, z, obrót?) — bryła względem środka podstawy (mm), M(kolor, opcje) — materiał,
// B(w, h, d) — prostopadłościan, C(rGóra, rDół, h, segmenty) — walec / stożek ścięty, S(r) — kula (mm) }.
// NOWA DEKORACJA: wpis w model/decorations.js (DECOR_TYPES) i funkcja tutaj (bez niej — prostopadłościan).
export const DECOR_BUILDERS = {
  lampFloor({ W, H, color, add, M, C }) {
    add(C(W * 0.35, W * 0.4, 25), M('#374151'), 0, 12);
    add(C(9, 9, H * 0.78), M('#4b5563'), 0, H * 0.4);
    add(C(W * 0.3, W * 0.5, H * 0.24, 28), M(color, { side: THREE.DoubleSide, emissive: 0x332a10 }), 0, H * 0.86);
  },
  // kinkiet z ramieniem: okrągła podstawa na ścianie, ukośne ramię z przegubem, pionowy trzpień, abażur z wikliny.
  // y — dół abażuru; W — średnica abażuru u dołu, H — wysokość całości, D — wysięg od ściany (oś abażuru)
  lampWallArm({ W, H, D, color, add, M, C, S, B }) {
    const metal = M(color, { shininess: 90, specular: 0x8a6d3b });
    const shadeH = H * 0.42;
    const yPlate = H * 0.72;
    const yJoint = H * 0.97;
    const reach = D - W * 0.05;
    // podstawa (tarcza) na ścianie + uchwyt
    add(C(60, 60, 16, 32), metal, 0, yPlate, 8, [Math.PI / 2, 0, 0]);
    add(B(16, 70, 18), metal, 0, yPlate, 22);
    // ramię: od podstawy ukośnie w górę i do pokoju
    rod(add, metal, [0, yPlate, 28], [0, yJoint, reach], 7);
    add(S(16), metal, 0, yJoint, reach); // przegub
    add(B(30, 20, 24), metal, 0, yJoint, reach);
    // pionowy trzpień w dół i oprawka nad abażurem
    rod(add, metal, [0, yJoint, reach], [0, shadeH + 55, reach], 8);
    add(C(22, 30, 50, 24), metal, 0, shadeH + 28, reach);
    add(C(6, 6, 24, 12), metal, 34, shadeH + 40, reach, [0, 0, Math.PI / 2]); // pokrętło
    // abażur z wikliny (stożek ścięty, otwarty od dołu) i żarówka
    add(C(W * 0.24, W * 0.5, shadeH, 40), rattanMaterial(M), 0, shadeH / 2, reach);
    add(S(W * 0.08), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), 0, shadeH * 0.45, reach);
  },
  // pot filler (złożony): rozeta na ścianie, krótka rura i zawór z dźwignią, pionowy przegub, dwa ramiona złożone
  // równolegle do ściany (drugie nad pierwszym, wraca w stronę ściany), na końcu zawór z dźwignią i wylewka w dół.
  // W — długość ramienia (rozpiętość), H — wysokość, D — wysięg od ściany.
  // Środek x = 0 — przy ścianie przy rozecie (ramiona w lewo); y = 0 — dół dźwigni przy ścianie.
  potFiller({ W, H, D, color, add, M, C, S }) {
    const metal = M(color, { shininess: 110, specular: 0xa08a50 });
    const k = H / 290; // skala wysokości (części w proporcji do domyślnych 290 mm)
    const y0 = 60 * k; // oś zaworu przy ścianie
    const yA = y0 + 110 * k; // pierwsze ramię
    const yB = yA + 30 * k; // drugie ramię
    const zj = Math.min(85, D * 0.3); // pion przy ścianie (odsunięty od ściany)
    // rozeta i rura od ściany, korpus zaworu
    add(C(32, 32, 10, 32), metal, 0, y0, 5, [Math.PI / 2, 0, 0]);
    rod(add, metal, [0, y0, 10], [0, y0, zj], 10);
    add(C(17, 17, 46, 24), metal, 0, y0, zj + 8, [Math.PI / 2, 0, 0]);
    // dźwignia zaworu (w dół)
    rod(add, metal, [0, y0, zj + 30], [0, y0, zj + 46], 6);
    rod(add, metal, [0, y0 + 20 * k, zj + 50], [0, 0, zj + 50], 6);
    // pion z przegubem
    add(C(15, 15, yA - y0 + 20 * k, 24), metal, 0, (y0 + yA) / 2, zj);
    // pierwsze ramię wzdłuż ściany do przegubu na końcu (złożone)
    const j2 = [-W + 20, yA, zj];
    rod(add, metal, [0, yA, zj], j2, 11);
    add(C(14, 14, (yB - yA) + 50 * k, 24), metal, j2[0], (yA + yB) / 2, j2[2]);
    // drugie ramię złożone nad pierwszym — wraca w stronę pionu (końcówka tuż obok niego)
    const e = [-90, yB, zj];
    rod(add, metal, [j2[0], yB, j2[2]], e, 11);
    // końcówka: korpus zaworu, dźwignia w górę, wylewka w dół
    add(C(18, 18, 60, 24), metal, e[0] - 10, e[1], e[2], [0, 0, Math.PI / 2]);
    rod(add, metal, [e[0] - 10, e[1], e[2] + 18], [e[0] - 10, e[1], e[2] + 34], 6); // trzpień dźwigni (do pokoju)
    rod(add, metal, [e[0] - 10, e[1] - 20 * k, e[2] + 36], [e[0] - 10, e[1] + 85 * k, e[2] + 36], 6); // dźwignia w górę
    add(C(9, 11, 36 * k, 18), metal, e[0] - 32, e[1] - 30 * k, e[2]); // wylewka w dół
    add(S(4), M('#93c5fd'), e[0] - 32, e[1] - 50 * k, e[2]); // (kropla — wylot)
  },
  // robot kuchenny wielofunkcyjny: biała obudowa z wyświetlaczem i pokrętłem, stalowe naczynie z uchwytem,
  // ciemny pierścień, na górze naczynie do gotowania na parze (szeroki stożek z pokrywą). Bez logo.
  kitchenRobot({ W, H, D, color, add, M, B, C, S }) {
    const body = M(color, { shininess: 70 });
    const grey = M('#4b5563', { shininess: 40 });
    const steel = M('#d1d5db', { shininess: 120, specular: 0xffffff });
    const zf = D / 2; // przód (oś z — do pokoju)
    // obudowa: dół (z wyświetlaczem) i tylne „ramiona” wokół naczynia
    add(B(W, H * 0.3, D), body, 0, H * 0.15, 0);
    add(B(W * 0.92, H * 0.24, D * 0.45), body, 0, H * 0.42, -D * 0.25);
    add(C(W * 0.46, W * 0.48, H * 0.06, 32), body, 0, H * 0.31, -D * 0.05); // zaokrąglenie przejścia
    // panel z wyświetlaczem (lekko pochylony) i pokrętło
    add(B(W * 0.62, H * 0.16, 8), M('#9ca3af'), -W * 0.06, H * 0.13, zf + 2, [-0.12, 0, 0]);
    add(B(W * 0.56, H * 0.13, 4), M('#1e3a2f', { emissive: 0x16352a }), -W * 0.06, H * 0.13, zf + 7, [-0.12, 0, 0]);
    add(C(W * 0.07, W * 0.07, 22, 24), steel, W * 0.36, H * 0.15, zf + 10, [Math.PI / 2, 0, 0]);
    // naczynie stalowe (lekko zwężone ku dołowi) z ciemnym uchwytem z przodu
    add(C(W * 0.3, W * 0.24, H * 0.32, 36), steel, 0, H * 0.46, D * 0.08);
    add(B(W * 0.1, H * 0.3, 24), grey, 0, H * 0.45, D * 0.08 + W * 0.3 + 6);
    // ciemny pierścień (pokrywa naczynia) z zaczepami
    add(C(W * 0.34, W * 0.34, H * 0.05, 36), grey, 0, H * 0.63, D * 0.04);
    add(B(W * 0.8, H * 0.04, W * 0.12), grey, 0, H * 0.62, D * 0.04);
    // naczynie do gotowania na parze: szeroki stożek, rant i pokrywa (kopułka)
    add(C(W * 0.56, W * 0.3, H * 0.17, 40), grey, 0, H * 0.74, D * 0.04);
    add(C(W * 0.6, W * 0.6, H * 0.025, 40), grey, 0, H * 0.83, D * 0.04);
    const lid = add(S(W * 0.5), grey, 0, H * 0.84, D * 0.04);
    lid.scale.y = (H * 0.16) / (W * 0.5);
    // „uszy” rantu pokrywy
    add(B(W * 1.2, H * 0.02, W * 0.18), grey, 0, H * 0.85, D * 0.04);
  },
  lampTable({ W, H, color, add, M, C }) {
    add(C(W * 0.3, W * 0.36, 20), M('#374151'), 0, 10);
    add(C(W * 0.12, W * 0.18, H * 0.45), M('#9ca3af'), 0, H * 0.25);
    add(C(W * 0.32, W * 0.5, H * 0.45, 28), M(color, { side: THREE.DoubleSide, emissive: 0x332a10 }), 0, H * 0.7);
  },
  lampPendant({ W, H, color, add, M, C, S }) {
    add(C(3, 3, H * 0.75), M('#111827'), 0, H * 0.625);
    add(C(W * 0.12, W * 0.5, H * 0.25, 28), M(color, { side: THREE.DoubleSide }), 0, H * 0.125);
    add(S(W * 0.1), new THREE.MeshBasicMaterial({ color: 0xfff7d6 }), 0, 10);
  },
  plant(ctx) {
    drawPlant(ctx, 0.4, 9);
  },
  plantSmall(ctx) {
    drawPlant(ctx, 0.45, 5);
  },
  window({ W, H, D, color, add, M, B }) {
    // rama, słupek, szyba, parapet — przy ścianie (głębokość do pokoju)
    const frame = M(color);
    const f = 60;
    add(B(W, f, D), frame, 0, H - f / 2, D / 2);
    add(B(W, f, D), frame, 0, f / 2, D / 2);
    add(B(f, H, D), frame, -W / 2 + f / 2, H / 2, D / 2);
    add(B(f, H, D), frame, W / 2 - f / 2, H / 2, D / 2);
    add(B(f * 0.7, H - 2 * f, D * 0.8), frame, 0, H / 2, D / 2);
    add(B(W - 2 * f, H - 2 * f, 6), M('#bfdbfe', { transparent: true, opacity: 0.55, emissive: 0x1e3a5f }), 0, H / 2, D * 0.4);
    add(B(W + 80, 25, D + 160), M('#e5e7eb'), 0, -12, (D + 160) / 2);
  },
  picture({ W, H, D, color, add, M, B, S }) {
    add(B(W, H, D), M(color), 0, H / 2, D / 2);
    add(B(W - 60, H - 60, 4), M('#93c5fd'), 0, H / 2, D + 1);
    add(B((W - 60) * 0.5, (H - 60) * 0.35, 4), M('#86efac'), -W * 0.1, H * 0.35, D + 3);
    add(S(Math.min(W, H) * 0.08), M('#fde047'), W * 0.25, H * 0.68, D + 3);
  },
  books({ d, W, H, D, add, M, B }) {
    const colors = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#6d28d9', '#0f766e', '#be185d'];
    const n = Math.max(3, Math.round(W / 35));
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      const h = H * (0.75 + 0.25 * (((i * 5) % 7) / 6));
      add(B(bw - 2, h, D * (0.8 + (0.2 * ((i * 3) % 4)) / 3)), M(d.color ?? colors[i % colors.length]), -W / 2 + bw * (i + 0.5), h / 2, 0);
    }
  },
  rug({ W, H, D, color, add, M, B }) {
    add(B(W, H, D), M(color), 0, H / 2, 0);
    add(B(W - 120, H + 1, D - 120), M('#d6d3d1'), 0, H / 2, 0);
    add(B(W - 240, H + 2, D - 240), M(color), 0, H / 2, 0);
  },
};

// pręt (walec) między dwoma punktami [x, y, z] w mm
function rod(add, material, a, b, r) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mesh = add(new THREE.CylinderGeometry(r * MM, r * MM, len * MM, 14), material, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return mesh;
}

// wiklina / rattan: tekstura plecionki rysowana raz (wspólna)
let rattanTex = null;
function rattanMaterial(M) {
  if (!rattanTex && typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#b8894f';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 16) {
        const off = (y / 8) % 2 ? 8 : 0;
        g.fillStyle = (x + y) % 32 ? '#d8b27a' : '#cfa56b';
        g.fillRect((x + off) % 128, y + 1, 13, 6);
      }
      g.fillStyle = 'rgba(90,60,25,0.35)';
      g.fillRect(0, y, 128, 1);
    }
    rattanTex = new THREE.CanvasTexture(cv);
    rattanTex.wrapS = rattanTex.wrapT = THREE.RepeatWrapping;
    rattanTex.repeat.set(6, 3);
    rattanTex.colorSpace = THREE.SRGBColorSpace;
  }
  return M('#ffffff', { map: rattanTex, side: THREE.DoubleSide, emissive: 0x2a1c08 });
}

// roślina w doniczce: potH — część wysokości na doniczkę, n — liczba liści
function drawPlant({ W, H, color, add, M, C, S }, potShare, n) {
  const potH = H * potShare;
  add(C(W * 0.42, W * 0.32, potH), M(color), 0, potH / 2);
  const leaf = M('#3f7d3a');
  const leaf2 = M('#5a9a4b');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = W * 0.18;
    const h = (H - potH) * (0.55 + (0.45 * ((i * 7) % 5)) / 4);
    const m = add(new THREE.ConeGeometry(W * 0.12 * MM, h * MM, 6), i % 2 ? leaf : leaf2, Math.cos(a) * r, potH + h / 2, Math.sin(a) * r);
    m.rotation.z = Math.cos(a) * 0.35;
    m.rotation.x = -Math.sin(a) * 0.35;
  }
  add(S(W * 0.22), leaf2, 0, potH + (H - potH) * 0.3);
}

export function buildDecorations(project, selected = new Set()) {
  const root = new THREE.Group();
  const disposables = [];
  root.userData.disposables = disposables;
  const M = (color, extra) => {
    const m = mat(color, extra);
    disposables.push(m);
    return m;
  };
  const B = (w, h, dd) => new THREE.BoxGeometry(w * MM, h * MM, dd * MM);
  const C = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt * MM, rb * MM, h * MM, seg);
  const S = (r) => new THREE.SphereGeometry(r * MM, 14, 10);
  for (const d of project.decorations ?? []) {
    if (d.hidden) continue;
    const t = decorType(d.type);
    const g = new THREE.Group();
    g.userData.decorId = d.id;
    const add = (geo, material, x = 0, y = 0, z = 0, rot = null) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x * MM, y * MM, z * MM);
      if (rot) mesh.rotation.set(...rot);
      g.add(mesh);
      return mesh;
    };
    const ctx = { d, W: d.width, H: d.height, D: d.depth, color: d.color ?? t.color ?? '#9ca3af', add, M, B, C, S };
    const draw = DECOR_BUILDERS[d.type] ?? (({ W, H, D, color }) => add(B(W, H, D), M(color), 0, H / 2, 0));
    draw(ctx);
    // położenie: x, z — środek podstawy (ściana: z = odległość od tylnej ściany), y — spód; obrót wokół pionu
    g.position.set(...toScene(d.x, d.y, d.z, project.space));
    g.rotation.y = (-(d.rotation ?? 0) * Math.PI) / 180;
    if (selected.has(`decor:${d.id}`)) {
      const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(g), new THREE.Color('#2563eb'));
      root.add(helper);
    }
    root.add(g);
  }
  return root;
}
