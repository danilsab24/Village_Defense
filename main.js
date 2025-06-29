import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js';
import { setupDragAndDrop } from './DragAndDrop.js';
import { setupMoveAndRemove } from './MoveAndRemove.js';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';
import { CannonManager } from './cannon.js';

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

let scene, camera, renderer, controls;
let grid, dragManager, moveRemoveManager;
let cannonManager; 
let gameState = 'BUILDING';
const clock = new THREE.Clock();

const moveKeys   = { w:false, a:false, s:false, d:false, q:false, e:false, r:false, f:false };
const moveSpeed  = 0.5;
const rotateStep = 0.04;


init();
animate();

function init() {
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x1e1f21);

	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.set(30, 30, 30);
	camera.lookAt(0, 0, 0);

	renderer = new THREE.WebGLRenderer({ antialias:true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.enablePan     = false;

	const lightDistance = 150;
	const lightHeight = 50;
	const lightIntensity = 2.5;
	const lightColor = 0xffffff;

	const lightPositions = [
	{ x:  0, y: lightHeight, z: -lightDistance }, // Nord (fronte)
	{ x:  0, y: lightHeight, z:  lightDistance }, // Sud (retro)
	{ x:  lightDistance, y: lightHeight, z: 0 },  // Est (destra)
	{ x: -lightDistance, y: lightHeight, z: 0 },  // Ovest (sinistra)
	];

	lightPositions.forEach((pos, index) => {
	const light = new THREE.PointLight(lightColor, lightIntensity, 300);
	light.position.set(pos.x, pos.y, pos.z);
	scene.add(light);

	const helper = new THREE.PointLightHelper(light, 2);
	scene.add(helper);
});

	grid = new Grid(scene);
	const getGameState = () => gameState;
	dragManager = setupDragAndDrop({ scene, camera, renderer, grid, controls, getGameState });

    cannonManager = new CannonManager(scene, camera, controls);

	moveRemoveManager = setupMoveAndRemove({
		scene, camera, renderer, controls, dragManager, grid
	});

	window.addEventListener('keydown', e => {
		const k = e.key.toLowerCase();
		if (k in moveKeys) moveKeys[k] = true;
	});
	window.addEventListener('keyup', e => {
		const k = e.key.toLowerCase();
		if (k in moveKeys) moveKeys[k] = false;
	});

	initUI();
}


function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // La logica di aggiornamento viene scelta in base allo stato
    if (gameState === 'BUILDING') {
        keyboardControl();
        controls.update();
    } else if (gameState === 'ATTACKING') {
        const collidables = [];
        scene.traverse(node => {
            if (node.userData.isWall || node.userData.isHouse || node.userData.isStrongBlock) {
                collidables.push(node);
            }
        });
        // Aggiungiamo anche il piano della griglia per i rimbalzi
        collidables.push(grid.getPlaneMesh());
        
        // Passiamo la lista al cannone
        cannonManager.update(delta, collidables);
    }
    
    renderer.render(scene, camera);
}

function keyboardControl(){
	const dir = new THREE.Vector3();
	if (moveKeys.w) dir.z -= 1;
	if (moveKeys.s) dir.z += 1;
	if (moveKeys.a) dir.x -= 1;
	if (moveKeys.d) dir.x += 1;

	if (dir.lengthSq() > 0) {
		dir.normalize().applyQuaternion(camera.quaternion);
		camera.position.addScaledVector(dir, moveSpeed);
		controls.target.addScaledVector(dir, moveSpeed);
	}

	if (moveKeys.q) rotateAroundTarget(new THREE.Vector3(0, 1, 0),  rotateStep);
	if (moveKeys.e) rotateAroundTarget(new THREE.Vector3(0, 1, 0), -rotateStep);

	const right = new THREE.Vector3().subVectors(camera.position, controls.target)
		.cross(new THREE.Vector3(0, 1, 0)).normalize();

	if (moveKeys.r) rotateAroundTarget(right,  rotateStep);
	if (moveKeys.f) rotateAroundTarget(right, -rotateStep);
}

function rotateAroundTarget(axis, angle){
	const target = controls.target;
	const pos    = camera.position.clone().sub(target);
	pos.applyAxisAngle(axis, angle);
	camera.position.copy(target).add(pos);
	camera.lookAt(target);
}


async function startAttackPhase() {
    console.log("Switching to ATTACK mode...");
    gameState = 'ATTACKING';

    // Disabilita tutti gli elementi della fase di costruzione
    controls.enabled = true;
    Object.keys(moveKeys).forEach(k => moveKeys[k] = false);
    moveRemoveManager.dispose();
    document.getElementById('sidebar').style.display = 'none';

    // Carica il modello del cannone e aspetta che sia pronto
    await cannonManager.load();

    // Imposta la camera per la nuova vista
    camera.position.set(0, 8, 48);
    camera.lookAt(0, 5, 0);
    controls.target.set(0, 5, 0);
    
    cannonManager.startAttackMode();
}

function initUI(){
	document.querySelectorAll('.toggle').forEach(el => {
		el.addEventListener('click', () => {
			const id = el.dataset.target;
			document.querySelectorAll('.submenu').forEach(s => {
				if (s.id !== id) s.style.display = 'none';
			});
			const menu = document.getElementById(id);
			menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
		});
	});

	document.querySelectorAll('.preview').forEach(canvas => {
		const obs = new ResizeObserver(rs => {
			if (rs[0].contentRect.height > 0) {
				obs.disconnect();
				initPreviewCanvas(canvas);
			}
		});
		obs.observe(canvas);
	});

	document.getElementById('done-button').addEventListener('click', startAttackPhase);
}


function initPreviewCanvas(c) {
    const t = c.dataset.type;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
    renderer.setSize(c.clientWidth, c.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    let previewObject;

    const frameObject = (target) => {
        const box = new THREE.Box3().setFromObject(target);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        target.position.sub(center);
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / camera.aspect;
        const distance = 0.85 * Math.max(fitHeightDistance, fitWidthDistance);
        camera.position.set(distance, distance, distance);
        camera.lookAt(0, 0, 0);
    };

    const startAnimation = () => {
        (function loop() {
            if (previewObject) previewObject.rotation.y += 0.01;
            renderer.render(scene, camera);
            requestAnimationFrame(loop);
        })();
    };

    if (t.startsWith('house_h')) {
        const height = t.split('_h')[1];
		const houseModelPaths = { 2: 'MODEL/2H_house.glb', 4: 'MODEL/4H_house.glb', 6: 'MODEL/6H_house.glb' };
		gltfLoader.load(houseModelPaths[height], (gltf) => {
			previewObject = gltf.scene;
			scene.add(previewObject);
			frameObject(previewObject);
			startAnimation();
		});
    } else {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        let map;
        if (t === 'cube') { map = textureLoader.load('TEXTURE/DIRT.png'); } 
        else if (t === 'strong') { map = textureLoader.load('TEXTURE/STONE.png'); }
        const material = new THREE.MeshStandardMaterial({ map: map });
        previewObject = new THREE.Mesh(geometry, material);
        scene.add(previewObject);
        frameObject(previewObject);
        startAnimation();
    }

    c.addEventListener('pointerdown', e => dragManager.startDrag(t, e));
}