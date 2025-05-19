import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js'; 

let scene, camera, renderer, controls, grid;

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

    // ✅ Ora controls è globale
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;

    // Luce
    const light = new THREE.PointLight(0xffffff, 4.5, 150);
    light.position.set(50, 20, 0);
    light.decay = 2;
    scene.add(light);

    const lightHelper = new THREE.PointLightHelper(light, 2);
    scene.add(lightHelper);
    
    // Griglia
    grid = new Grid(scene);  // anche grid ora è globale
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();  // ✅ adesso non dà errore
    renderer.render(scene, camera);
}

// For toggle the submenu
document.querySelectorAll('.toggle').forEach(el => {
  el.addEventListener('click', () => {
    const targetId = el.dataset.target;
    const submenu = document.getElementById(targetId);
    const isOpen = submenu.style.display === 'flex';

    // Close all submenus
    document.querySelectorAll('.submenu').forEach(sub => sub.style.display = 'none');

    // Toggle selected submenu
    submenu.style.display = isOpen ? 'none' : 'flex';
  });
});

// Optional: handle subitem click (selection logic can be added later)
document.querySelectorAll('.subitem').forEach(el => {
  el.addEventListener('click', () => {
    const selected = el.dataset.type;
    console.log("Selected object:", selected);
    // You can now store selected type in a global variable
    // and use it for placing on the grid
  });
});