import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildSpace, disposeGroup } from './buildSpace.js';
import { buildFurniture } from './buildFurniture.js';
import { MM } from './units.js';

const VIEW_DIRECTIONS = {
  perspective: new THREE.Vector3(0.55, 0.45, 1),
  front: new THREE.Vector3(0, 0, 1),
  top: new THREE.Vector3(0, 1, 0.0001),
  side: new THREE.Vector3(1, 0, 0),
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.space = null;
    this.spaceGroup = null;

    this.scene = new THREE.Scene();
    // Tło nieco ciemniejsze niż ściany, żeby białe ściany były dobrze widoczne.
    this.scene.background = new THREE.Color(0xd3d8de);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Światło dobrane tak, żeby każda ściana (lewa, prawa, tylna, sufit, skosy) miała
    // nieco inny odcień — białe ściany pozostają jasne, ale da się je odróżnić.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.5);
    key.position.set(0.5, 0.5, 0.7);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-0.3, -0.6, 0.74);
    this.scene.add(fill);

    const grid = new THREE.GridHelper(20, 200, 0xb4bcc5, 0xc6cdd4); // siatka co 10 cm
    grid.position.y = -0.002;
    this.scene.add(grid);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    });
  }

  setProject(project, { refit = false } = {}) {
    const first = !this.space;
    if (this.spaceGroup) {
      this.scene.remove(this.spaceGroup);
      disposeGroup(this.spaceGroup);
    }
    this.space = project.space;
    this.spaceGroup = new THREE.Group();
    this.spaceGroup.add(buildSpace(project.space, project.view));
    this.spaceGroup.add(buildFurniture(project));
    this.scene.add(this.spaceGroup);
    if (first || refit) this.setView('perspective');
  }

  setView(name) {
    if (!this.space) return;
    const { width, height, depth } = this.space;
    const center = new THREE.Vector3((width / 2) * MM, (height / 2) * MM, (-depth / 2) * MM);
    const radius = (Math.hypot(width, height, depth) / 2) * MM;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.15;

    const dir = VIEW_DIRECTIONS[name].clone().normalize();
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.controls.target.copy(center);
    this.controls.update();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }
}
