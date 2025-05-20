// DragAndDrop.js 
import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';

export function setupDragAndDrop({ scene, camera, renderer, grid, controls }) {
	const raycaster = new THREE.Raycaster();
	const mouse     = new THREE.Vector2();
	const cellSize  = grid.size / grid.divisions;

	let dragging = false;
	let dragObject = null;
	let currentCursorPos = null;
	let currentOffset = new THREE.Vector3();

	// Starts the dragging process when a block is selected
	function startDrag(type, e) {
		if (dragging) return;
		dragObject = createPreviewMesh(type);
		dragging = true;
		scene.add(dragObject);
		controls.enabled = false;
		computeCursorOffset(dragObject);
		updateDragPosition(e);
		window.addEventListener('pointermove', updateDragPosition);
		window.addEventListener('pointerup', finishDrag, { once: true });
		window.addEventListener('keydown', rotatePreview);
	}

	// Computes the offset between object's center and its front-left corner to center the block on cursor
	function computeCursorOffset(obj) {
		const box = new THREE.Box3().setFromObject(obj);
		const size = new THREE.Vector3();
		box.getSize(size);
		currentOffset.set(size.x / 2, 0, size.z / 2);
	}

	// Updates the preview object's position to follow the cursor
	function updateDragPosition(e) {
		if (!dragObject) return;
		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouse, camera);
		const hit = raycaster.intersectObject(grid.getPlaneMesh());
		if (!hit.length) return;
		const p = hit[0].point;
		currentCursorPos = p.clone();
		const { spanX, spanZ } = getSpans(dragObject);
		dragObject.position.set(
			snap(p.x - currentOffset.x + cellSize / 2, spanX),
			halfHeight(dragObject),
			snap(p.z - currentOffset.z + cellSize / 2, spanZ)
		);
	}

	// Finalizes the drag and either places the block or drops it
	function finishDrag() {
		window.removeEventListener('pointermove', updateDragPosition);
		window.removeEventListener('keydown', rotatePreview);
		placeOrDrop();
		controls.enabled = true;
		dragging = false;
		dragObject = null;
		currentCursorPos = null;
	}

	// Rotates the preview object by 90 degrees when space is pressed
	function rotatePreview(e) {
		if (!dragObject || e.code !== 'Space') return;
		dragObject.rotation.y += Math.PI / 2;
		computeCursorOffset(dragObject);
		if (currentCursorPos) {
			const { spanX, spanZ } = getSpans(dragObject);
			dragObject.position.set(
				snap(currentCursorPos.x - currentOffset.x + cellSize / 2, spanX),
				halfHeight(dragObject),
				snap(currentCursorPos.z - currentOffset.z + cellSize / 2, spanZ)
			);
		}
	}

	// Places the block into the scene or lets it fall off the platform
	function placeOrDrop() {
		if (!dragObject || !currentCursorPos) return;
		const { spanX, spanZ } = getSpans(dragObject);
		dragObject.position.set(
			snap(currentCursorPos.x - currentOffset.x + cellSize / 2, spanX),
			halfHeight(dragObject),
			snap(currentCursorPos.z - currentOffset.z + cellSize / 2, spanZ)
		);
		const half = grid.size / 2;
		if (Math.abs(dragObject.position.x) > half || Math.abs(dragObject.position.z) > half) {
			const fall = setInterval(() => {
				if (!dragObject) return clearInterval(fall);
				dragObject.position.y -= 0.5;
				if (dragObject.position.y < -10) {
					scene.remove(dragObject);
					clearInterval(fall);
				}
			}, 16);
			scene.remove(dragObject);
			return;
		}
		const rot = dragObject.rotation.y;
		if (dragObject.userData.type === 'cube') {
			const w = new Wall(scene, dragObject.position.clone(), cellSize);
			w.mesh.rotation.y = rot;
		} else {
			const h = new House(scene, dragObject.position.clone(), cellSize);
			h.mesh.rotation.y = rot;
		}
		scene.remove(dragObject);
	}

	// Creates a preview mesh depending on the type of block
	function createPreviewMesh(type) {
		const isCube = type === 'cube';
		const geo = isCube ? new THREE.BoxGeometry(cellSize, 1, cellSize) : new THREE.BoxGeometry(cellSize * 2, 0.75, cellSize);
		const mat = new THREE.MeshStandardMaterial({ color: isCube ? 0x4caf50 : 0x2196f3 });
		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData.type = type;
		mesh.position.y = halfHeight(mesh);
		return mesh;
	}

	// Snaps a coordinate to the grid based on the object's span (width in cells)
	function snap(value, span = 1) {
		const cellIdx = Math.round(value / cellSize);
		const offset = (span % 2 === 0) ? (span / 2) * cellSize : cellSize / 2;
		return cellIdx * cellSize + offset;
	}

	// Determines how many cells the object spans in X and Z directions
	function getSpans(obj) {
		if (obj.userData.type === 'cube') return { spanX: 1, spanZ: 1 };
		const rotated = Math.round(obj.rotation.y / (Math.PI / 2)) % 2 !== 0;
		return rotated ? { spanX: 1, spanZ: 2 } : { spanX: 2, spanZ: 1 };
	}

	// Returns half the height of a 3D object using its bounding box
	function halfHeight(obj) {
		const box = new THREE.Box3().setFromObject(obj);
		const s = new THREE.Vector3();
		box.getSize(s);
		return s.y / 2;
	}

	return { startDrag };
}