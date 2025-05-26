// main.js – gestione camera + grid + drag&drop + evidenzia/muovi/rimuovi blocchi
import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { Grid } from './grid.js';
import { setupDragAndDrop } from './DragAndDrop.js';
import { setupMoveAndRemove } from './MoveAndRemove.js';

let scene, camera, renderer, controls;
let grid, dragManager, moveRemoveManager;

const moveKeys   = { w:false, a:false, s:false, d:false, q:false, e:false, r:false, f:false };
const moveSpeed  = 0.5;   // translation speed per frame
const rotateStep = 0.04;  // radians per frame for keyboard orbit

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

	const mainLight = new THREE.PointLight(0xffffff, 3, 200);
	mainLight.position.set(50, 20, 0);
	scene.add(mainLight);
	scene.add(new THREE.PointLightHelper(mainLight, 2));

	grid = new Grid(scene);
	dragManager = setupDragAndDrop({ scene, camera, renderer, grid, controls });

	// ⬇️ setup hover, click, double click handlers
	moveRemoveManager = setupMoveAndRemove({
		scene,
		camera,
		renderer,
		controls,
		dragManager
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

function animate(){
	requestAnimationFrame(animate);
	keyboardControl();
	controls.update();
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
}

function initPreviewCanvas(c){
	const t = c.dataset.type;
	const s = new THREE.Scene();
	const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
	cam.position.set(1.5, 1.5, 1.5);
	cam.lookAt(0, 0, 0);
	const ren = new THREE.WebGLRenderer({ canvas: c, alpha: true });
	ren.setSize(c.clientWidth, c.clientHeight);
	ren.setPixelRatio(window.devicePixelRatio);

	const dirLight = new THREE.DirectionalLight(0xffffff, 1);
	dirLight.position.set(2, 2, 2);
	s.add(dirLight);

	const mesh = t === 'cube'
		? new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf50 }))
		: new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1), new THREE.MeshStandardMaterial({ color: 0x2196f3 }));

	s.add(mesh);

	(function loop(){
		mesh.rotation.y += 0.01;
		ren.render(s, cam);
		requestAnimationFrame(loop);
	})();

	c.addEventListener('pointerdown', e => dragManager.startDrag(t, e));
}

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
