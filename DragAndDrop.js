// DragAndDrop.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';

function setupDragAndDrop({ scene, camera, renderer, grid, controls }) {

    // GLOBAL VARIABLES
    const raycaster = new THREE.Raycaster(); // for mouse picking
    const mouse = new THREE.Vector2(); // coordinates of mouse
    const cellSize = grid.size / grid.divisions;
	
	// Utilis variables for Drag and Drop feature
    let dragging = false;
    let dragObject = null;
    let currentPos = null;
    let cursorOffset = new THREE.Vector3();

    const heightMap = new Map(); // need for taking care of height and object of the scene
	/*
	  Generates a unique string key from grid coordinates (ix, iz) to use as Map identifier.
	  Used by heightMap to track object placement in grid cells.
	  Example: coordinates (5, 3) → key "5_3"
	 */
    const mapKey = (ix, iz) => `${ix}_${iz}`;
    const worldToIndex = (x) => Math.round(x / cellSize);
	

    // Helper functions
    function computeCursorOffset() {
        const box = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        cursorOffset.set(size.x / 2, 0, size.z / 2);
    }

	function cellSnap(value, span = 1) {
		// Per oggetti pari (2,4,…) lo snap deve cadere sulla linea di griglia,
		// per quelli dispari (1,3,…) sul centro-cella.
		if (span % 2 === 0) {
			const idx = Math.round(value / cellSize - 0.5);   // linea di griglia
			return idx * cellSize + (span / 2) * cellSize;    // centro del blocco
		} else {
			const idx = Math.round(value / cellSize);         // centro-cella
			return idx * cellSize + 0.5 * cellSize;
		}
	}

	function getSpans(obj) {
		// muri: sempre 1 × 1
		if (obj.userData?.isWall) return { sx: 1, sz: 1 };

		// case: 2 × 1 oppure 1 × 2 a seconda della rotazione
		if (obj.userData?.isHouse) {
			const rotated = Math.round(obj.rotation.y / (Math.PI / 2)) % 2 !== 0;
			return rotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
		}

		// preview durante il drag (usa la vecchia logica)
		return obj.userData.type === 'cube'
			? { sx: 1, sz: 1 }
			: (() => {
				const rotated = Math.round(obj.rotation.y / (Math.PI / 2)) % 2 !== 0;
				return rotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
			})();
	}

	function cellsCovered(ix0, iz0, sx, sz) {
		// Con uno span pari il “centro” cade su una linea di griglia,
		// quindi partiamo da ix0 − (sx-1)/2 invece di ix0 − sx/2
		const startX = ix0 - Math.floor((sx - 1) / 2);
		const startZ = iz0 - Math.floor((sz - 1) / 2);

		const cells = [];
		for (let dx = 0; dx < sx; dx++) {
			for (let dz = 0; dz < sz; dz++) {
				cells.push({ ix: startX + dx, iz: startZ + dz });
			}
		}
		return cells;
	}

    function updateHeightMap(cells, newH, top) {
        cells.forEach(c => heightMap.set(mapKey(c.ix, c.iz), { height: newH, top }));
    }

	function updateHeightMapFromScene() {
		heightMap.clear();
		scene.traverse(obj => {
			if (obj.userData?.isWall || obj.userData?.isHouse) {
				const type = obj.userData.isWall ? 'wall' : 'house';
				const pos = obj.position;
				const { sx, sz } = getSpans(obj);
				
				const ix0 = worldToIndex(pos.x);
				const iz0 = worldToIndex(pos.z);
				const cells = cellsCovered(ix0, iz0, sx, sz);
				
				// Usa i valori precalcolati da userData
				updateHeightMap(cells, obj.userData.topHeight, type);
			}
		});
	}

	function canPlace(type, cells) {
		let refHeight = null;
		let valid = true;

		for (const c of cells) {
			const entry       = heightMap.get(mapKey(c.ix, c.iz));
			const currentTop  = entry ? entry.top    : 'ground';
			const currentH    = entry ? entry.height : 0;

			//BLOCCO: mai sovrapporre nulla a una house
			if (currentTop === 'house') {   // c'è già una casa
				valid = false;
				break;
			}

			if (refHeight === null) {
				refHeight = currentH;
			} else if (Math.abs(currentH - refHeight) > 0.01) {
				valid = false;
				break;
			}
		}

		return valid ? (refHeight ?? 0) : null;
	}

    // Drag and drop functions
    function startDrag(type, evt) {
        if (dragging) return;

        updateHeightMapFromScene();
        dragObject = createPreviewMesh(type);
        dragging = true;
        scene.add(dragObject);
        controls.enabled = false;

        computeCursorOffset();
        updateDragPosition(evt);

        window.addEventListener('pointermove', updateDragPosition);
        window.addEventListener('pointerup', finishDrag, { once: true });
        window.addEventListener('keydown', rotatePreview);
    }

    function updateDragPosition(evt) {
        if (!dragObject) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObject(grid.getPlaneMesh());
        if (!hit.length) return;

        currentPos = hit[0].point.clone();
        const { sx, sz } = getSpans(dragObject);

        const baseX = cellSnap(currentPos.x - cursorOffset.x + cellSize / 2, sx);
        const baseZ = cellSnap(currentPos.z - cursorOffset.z + cellSize / 2, sz);

        const ix0 = worldToIndex(baseX);
        const iz0 = worldToIndex(baseZ);
        const cells = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';

        const baseH = canPlace(objType, cells);
        const objHeight = getObjectHeight(dragObject);

        if (baseH === null) {
            // Invalid position - show red preview at ground level
            dragObject.material.color.set(0xff4444);
            dragObject.position.set(baseX, objHeight/2, baseZ);
        } else {
            // Valid position - show normal color at correct height
            dragObject.material.color.set(objType === 'wall' ? 0x4caf50 : 0x2196f3);
            dragObject.position.set(baseX, baseH + objHeight/2, baseZ);
        }
    }

    function rotatePreview(evt) {
        if (!dragObject || evt.code !== 'Space') return;
        dragObject.rotation.y += Math.PI / 2;
        computeCursorOffset();
        if (currentPos) updateDragPosition(evt);
    }

    function finishDrag() {
        window.removeEventListener('pointermove', updateDragPosition);
        window.removeEventListener('keydown', rotatePreview);

        placeOrCancel();
        controls.enabled = true;
        dragging = false;
        dragObject = null;
        currentPos = null;
    }

    function placeOrCancel() {
		if (!dragObject || !currentPos) return;

		const { sx, sz } = getSpans(dragObject);
		const baseX = cellSnap(currentPos.x - cursorOffset.x + cellSize / 2, sx);
		const baseZ = cellSnap(currentPos.z - cursorOffset.z + cellSize / 2, sz);

		const ix0 = worldToIndex(baseX);
		const iz0 = worldToIndex(baseZ);
		const cells = cellsCovered(ix0, iz0, sx, sz);
		const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
		const baseH = canPlace(objType, cells);

		if (baseH === null) {
			scene.remove(dragObject);
			return;
		}

		const objHeight = getObjectHeight(dragObject);
		const finalY = baseH + (objHeight / 2);

		// Creazione oggetto con posizionamento corretto
		let realObject;
		if (objType === 'wall') {
			realObject = new Wall(scene, new THREE.Vector3(baseX, finalY, baseZ), cellSize);
		} else {
			realObject = new House(scene, new THREE.Vector3(baseX, finalY, baseZ), cellSize);
		}

		// Aggiornamento rotazione
		realObject.mesh.rotation.y = dragObject.rotation.y;

		// Aggiornamento mappa
		updateHeightMapFromScene(); // Solo questo aggiornamento necessario

		// Pulizia
		scene.remove(dragObject);
	}

    function getObjectHeight(obj) {
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        return size.y;
    }

    function createPreviewMesh(type) {
        const geometry = type === 'cube'
            ? new THREE.BoxGeometry(cellSize, 1, cellSize)
            : new THREE.BoxGeometry(cellSize * 2, 0.75, cellSize);

        const material = new THREE.MeshStandardMaterial({
            color: type === 'cube' ? 0x4caf50 : 0x2196f3,
            transparent: true,
            opacity: 0.7
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.type = type === 'cube' ? 'cube' : 'house';
        return mesh;
    }

    return { startDrag };
}

export { setupDragAndDrop };