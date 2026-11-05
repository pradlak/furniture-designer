import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });

// Linia wymiarowa między punktami a i b, odsunięta o wektor offset, z etykietą pośrodku.
export function createDimension(a, b, offset, text) {
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
  group.add(new THREE.LineSegments(geometry, lineMaterial));

  const el = document.createElement('div');
  el.className = 'dim-label';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.copy(a2).lerp(b2, 0.5);
  group.add(label);

  return group;
}
