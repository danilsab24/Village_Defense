import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js'; 
import { Wall } from './wall.js';
import { House } from './village.js';

let scene, camera, renderer, controls;
let grid;
let dragging = false;
let dragObject = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1f21);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;

  const light = new THREE.PointLight(0xffffff, 4.5, 150);
  light.position.set(50, 20, 0);
  light.decay = 2;
  scene.add(light);

  const lightHelper = new THREE.PointLightHelper(light, 2);
  scene.add(lightHelper);

  grid = new Grid(scene);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Toggle submenu visibility
document.querySelectorAll('.toggle').forEach(el => {
  el.addEventListener('click', () => {
    const targetId = el.dataset.target;
    const submenu = document.getElementById(targetId);

    // Collapse other submenus
    document.querySelectorAll('.submenu').forEach(sub => {
      if (sub.id !== targetId) sub.style.display = 'none';
    });

    // Toggle this one
    submenu.style.display = (submenu.style.display === 'flex') ? 'none' : 'flex';
  });
});


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

  let mesh;
  if (type === 'cube') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4caf50 })
    );
  } else if (type === 'box') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.75, 1),
      new THREE.MeshStandardMaterial({ color: 0x2196f3 })
    );
  }
  previewScene.add(mesh);

  function animatePreview() {
    mesh.rotation.y += 0.01;
    previewRenderer.render(previewScene, previewCamera);
    requestAnimationFrame(animatePreview);
  }
  animatePreview();

  canvas.addEventListener('mousedown', () => {
    let dragMesh;
    if (type === 'cube') {
      dragMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x4caf50 })
      );
    } else if (type === 'box') {
      dragMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.75, 1),
        new THREE.MeshStandardMaterial({ color: 0x2196f3 })
      );
    }

    dragMesh.userData.type = type;
    dragObject = dragMesh;
    dragging = true;
    scene.add(dragObject);
  });
}

// Use ResizeObserver to wait until canvas is visible and has size
document.querySelectorAll('.preview').forEach(canvas => {
  const observer = new ResizeObserver(entries => {
    for (let entry of entries) {
      if (entry.contentRect.height > 0) {
        initPreviewCanvas(canvas);
        observer.disconnect();
      }
    }
  });
  observer.observe(canvas);
});


document.addEventListener('mousemove', (event) => {
  if (!dragging || !dragObject) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(grid.getPlaneMesh());

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const gridSize = 1;
    const x = Math.round(point.x / gridSize) * gridSize;
    const z = Math.round(point.z / gridSize) * gridSize;
    dragObject.position.set(x, 5, z);
  }
});

document.addEventListener('mouseup', () => {
  if (!dragging || !dragObject) return;

  const pos = dragObject.position;
  const halfSize = grid.size / 2;

  if (
    pos.x >= -halfSize && pos.x <= halfSize &&
    pos.z >= -halfSize && pos.z <= halfSize
  ) {
    const targetY = 0.5;
    const dropInterval = setInterval(() => {
      dragObject.position.y -= 0.2;
      if (dragObject.position.y <= targetY) {
        dragObject.position.y = targetY;
        clearInterval(dropInterval);

        const finalPos = dragObject.position.clone();
        if (dragObject.userData.type === 'cube') {
          new Wall(scene, finalPos);
        } else if (dragObject.userData.type === 'box') {
          new House(scene, finalPos);
        }

        scene.remove(dragObject);
      }
    }, 16);
  } else {
    const fallInterval = setInterval(() => {
      dragObject.position.y -= 0.5;
      if (dragObject.position.y < -10) {
        scene.remove(dragObject);
        clearInterval(fallInterval);
      }
    }, 16);
  }

  dragging = false;
  dragObject = null;
});
