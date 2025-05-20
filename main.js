// main.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js';
import { Wall } from './wall.js';
import { House } from './village.js';

let scene, camera, renderer, controls;
let grid;
let dragging = false;
let dragObject = null;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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
    // wait until the element has a size
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
    startDrag(type, e);
  });
}

/* ---------- DRAG & DROP ---------- */
function startDrag(type, pointerEvent) {
  if (dragging) return;

  dragObject = createDragMesh(type);
  dragging = true;
  scene.add(dragObject);
  controls.enabled = false; // disable orbit while dragging

  updateDragPosition(pointerEvent);

  window.addEventListener('pointermove', updateDragPosition);
  window.addEventListener('pointerup', finishDrag, { once: true });
}

function createDragMesh(type) {
  const materialParams =
    type === 'cube'
      ? { color: 0x4caf50 }
      : { color: 0x2196f3 };

  const geometry =
    type === 'cube'
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.BoxGeometry(1.5, 0.75, 1);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial(materialParams)
  );
  mesh.userData.type = type;
  // start above ground so it's visible even before drop animation
  mesh.position.set(0, 5, 0);

  return mesh;
}
function dragY(obj) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  return size.y / 2;
}

function updateDragPosition(event) {
  if (!dragObject) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(grid.getPlaneMesh());

  if (hit.length) {
    const p = hit[0].point;
    const cellSize = grid.size / grid.divisions;
    dragObject.position.set(snap(p.x, cellSize), dragY(dragObject), snap(p.z, cellSize));
  }
}

function finishDrag() {
  window.removeEventListener('pointermove', updateDragPosition);
  dropOrDispose();
  controls.enabled = true;
  dragging = false;
  dragObject = null;
}

function dropOrDispose() {
  if (!dragObject) return;

  const pos = dragObject.position.clone();
  const half = grid.size / 2;

  if (pos.x >= -half && pos.x <= half && pos.z >= -half && pos.z <= half) {
    // inside the platform -> convert to final object
    const cellSize = grid.size / grid.divisions;
    dragObject.position.set(snap(pos.x, cellSize),0.5,snap(pos.z, cellSize));

    if (dragObject.userData.type === 'cube') {
      new Wall(scene, dragObject.position);
    } else {
      new House(scene, dragObject.position);
    }
  } else {
    // let it fall outside the scene bounds
    const fall = setInterval(() => {
      if (!dragObject) {
        clearInterval(fall);
        return;
      }
      dragObject.position.y -= 0.5;
      if (dragObject.position.y < -10) {
        scene.remove(dragObject);
        clearInterval(fall);
      }
    }, 16);
  }

  // remove the temporary mesh (the building class added its own mesh)
  scene.remove(dragObject);
}

/* ---------- HELPERS ---------- */
function snap(value, cellSize) {
  return Math.round(value / cellSize) * cellSize;
}

/* ---------- HANDLE RESIZE ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
