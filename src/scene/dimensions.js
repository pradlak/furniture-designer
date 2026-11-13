import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Wymiary przestrzeni — ciemne; wymiary mebli (accent) — niebieskie, żeby się nie myliły.
const lineMaterials = {
  default: new THREE.LineBasicMaterial({ color: 0x1f2937 }),
  accent: new THREE.LineBasicMaterial({ color: 0x2563eb }),
};

// Linia wymiarowa między punktami a i b, odsunięta o wektor offset, z etykietą pośrodku.
// style: 'default' (przestrzeń) albo 'accent' (meble).
export function createDimension(a, b, offset, text, style = 'default') {
  const group = new THREE.Group();
  const a2 = a.clone().add(offset);
  const b2 = b.clone().add(offset);
  const overshoot = offset.clone().multiplyScalar(0.15);

  const points = [
    a2, b2, // linia główna
    a, a2.clone().add(overshoot), // linie pomocnicze
    b, b2.clone().add(overshoot),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  group.add(new THREE.LineSegments(geometry, lineMaterials[style]));

  const el = document.createElement('div');
  el.className = style === 'accent' ? 'dim-label dim-label-accent' : 'dim-label';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.copy(a2).lerp(b2, 0.5);
  group.add(label);

  return group;
}
