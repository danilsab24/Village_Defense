// main.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js';
import { setupDragAndDrop } from './DragAndDrop.js';

let scene, camera, renderer, controls;
let grid;
let dragManager;

init();
animate();

/* ---------- INITIALISATION ---------- */
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1f21);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;

  const light = new THREE.PointLight(0xffffff, 3, 200);
  light.position.set(50, 20, 0);
  scene.add(light, new THREE.PointLightHelper(light, 2));

  grid = new Grid(scene);

  dragManager = setupDragAndDrop({
    scene,
    camera,
    renderer,
    grid,
    controls
  });

  initUI();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/* ---------- UI ---------- */
function initUI() {
  /* --- sidebar toggles --- */
  document.querySelectorAll('.toggle').forEach((el) => {
    el.addEventListener('click', () => {
      const targetId = el.dataset.target;
      const submenu = document.getElementById(targetId);

      document.querySelectorAll('.submenu').forEach((sub) => {
        if (sub.id !== targetId) sub.style.display = 'none';
      });

      submenu.style.display =
        submenu.style.display === 'flex' ? 'none' : 'flex';
    });
  });

  /* --- previews --- */
  document.querySelectorAll('.preview').forEach((canvas) => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0].contentRect.height > 0) {
        observer.disconnect();
        initPreviewCanvas(canvas);
      }
    });
    observer.observe(canvas);
  });
}

/* ---------- PREVIEW CANVAS ---------- */
function initPreviewCanvas(canvas) {
  const type = canvas.dataset.type;

  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  previewCamera.position.set(1.5, 1.5, 1.5);
  previewCamera.lookAt(0, 0, 0);

  const previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  previewRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  previewRenderer.setPixelRatio(window.devicePixelRatio);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(2, 2, 2);
  previewScene.add(light);

  const mesh =
    type === 'cube'
      ? new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x4caf50 })
        )
      : new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.75, 1),
          new THREE.MeshStandardMaterial({ color: 0x2196f3 })
        );

  previewScene.add(mesh);

  const renderPreview = () => {
    mesh.rotation.y += 0.01;
    previewRenderer.render(previewScene, previewCamera);
    requestAnimationFrame(renderPreview);
  };
  renderPreview();

  /* ----- DRAG START ----- */
  canvas.addEventListener('pointerdown', (e) => {
    dragManager.startDrag(type, e);
  });
}

/* ---------- HANDLE RESIZE ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
