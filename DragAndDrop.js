// DragAndDrop.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';

function setupDragAndDrop({ scene, camera, renderer, grid, controls }) {

    // Global variables
    const raycaster = new THREE.Raycaster();         // for mouse picking
    const mouse = new THREE.Vector2();               // coordinates of mouse
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
	/*
	  Computes the cursor offset relative to the dragged object's dimensions.
	  This ensures:
	  - The object is positioned correctly under the cursor during dragging
	  - The object's dimensions are accounted for in grid snapping calculations
	  - The "grab point" remains consistent with the object's geometry
	 */
    function computeCursorOffset() {
        const box = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        cursorOffset.set(size.x / 2, 0, size.z / 2);
    }

	/*
	  Snaps a world coordinate value to the grid based on object span.
	  - Even spans (2,4,...): snaps to grid lines (between cells)
	  - Odd spans (1,3,...): snaps to cell centers
	*/
	function cellSnap(value, span = 1) {
		if (span % 2 === 0) {
			const idx = Math.round(value / cellSize - 0.5);   // grid's line
			return idx * cellSize + (span / 2) * cellSize;    // ccenter of the cell
		} else {
			const idx = Math.round(value / cellSize);         // cell's center
			return idx * cellSize + 0.5 * cellSize;
		}
	}

	/*
	  Determines grid spans (occupied cells) for an object based on its type and rotation.
	  - Walls: Always occupy 1x1 cell
	  - Houses: 2x1 or 1x2 depending on 90° rotation
	*/
	function getSpans(obj) {
		if (obj.userData?.isWall) {     // Check if is a wall
			return { sx: 1, sz: 1 };
		}
		if (obj.userData?.isHouse) {    // Check if is a house
			return getRotatedSpans(obj);
		}

		// Manage the preview during the drag
		if (obj.userData?.type === 'cube') {
			return { sx: 1, sz: 1 };
		}
		return getRotatedSpans(obj);
	}

	// Helper function of getSpans for rotated objects
	function getRotatedSpans(obj) {
		const rotationSteps = Math.round(obj.rotation.y / (Math.PI / 2));
		const isRotated = rotationSteps % 2 !== 0;

		if (isRotated) {
			return { sx: 1, sz: 2 };
		} else {
			return { sx: 2, sz: 1 };
		}
	}

	/*
	  Calculates all grid cells covered by an object based on its center position and dimensions
	  ix0 - X index of the center/reference cell
	  iz0 - Z index of the center/reference cell
	  sx - Width span in cells (x-axis)
	  sz - Depth span in cells (z-axis)
	  return -> Array of covered cell coordinates
	  
	 Are necessary for computing: 
	 - the actual area occupied by the object
	 - verify collision
	 - implement the correct snap
	 - mange the positioning of different objects with different dimensions
	 */
	function cellsCovered(ix0, iz0, sx, sz) {
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

	/*
	  Updates height map with new elevation data for specified cells
	   cells - Array of grid cells to update
	   newH - New height value to set
	   top - Type of object at this height ('wall', 'house')
	 */
    function updateHeightMap(cells, newH, top) {
        cells.forEach(c => heightMap.set(mapKey(c.ix, c.iz), { height: newH, top }));
    }

	/*
	  Rebuilds the complete height map by scanning all relevant scene objects
	  Clears existing data and repopulates based on current object positions
	 */
	function updateHeightMapFromScene() {
		heightMap.clear();
		scene.traverse(obj => {
			if (obj.userData?.isWall || obj.userData?.isHouse) {
				const type = obj.userData.isWall ? 'wall' : 'house';
				const pos = obj.position;
				const { sx, sz } = getSpans(obj);

				//Calcola l'altezza attuale del blocco
				const bbox = new THREE.Box3().setFromObject(obj);
				const size = new THREE.Vector3();
				bbox.getSize(size);
				const topHeight = pos.y + size.y / 2;

				// Salva nella mesh per uso futuro
				obj.userData.topHeight = topHeight;

				const ix0 = worldToIndex(pos.x);
				const iz0 = worldToIndex(pos.z);
				const cells = cellsCovered(ix0, iz0, sx, sz);

				updateHeightMap(cells, topHeight, type);
			}
		});
	}


	/*
	  Checks if an object can be placed in the specified grid cells
	  cells - Array of grid cells to check {ix, iz}
	  return -> Reference height if placement is valid, null otherwise
	 */
	function canPlace(cells) {
		let refHeight = null;
		let valid = true;

		// Compute grid bounds 
		const halfDiv = grid.divisions / 2; 
		const minIndex = -halfDiv; 
		const maxIndex = halfDiv;  

		for (const c of cells) {
			// check if the cell is within grid bounds
			if (c.ix < minIndex || c.ix > maxIndex || c.iz < minIndex || c.iz > maxIndex) {
				valid = false;
				break;
			}

			// Check for height data in the height map
			const entry = heightMap.get(mapKey(c.ix, c.iz));
			const currentTop = entry ? entry.top : 'ground';
			const currentH = entry ? entry.height : 0;

			if (currentTop === 'house') {   
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
	/*
	  Initiates a drag operation for placing a new object
	  - Type of object to drag 
	  - Mouse/touch event that started the drag
	 */
    function startDrag(type, evt) {
		// Prevent multiple simultaneous drag operations
        if (dragging) return;

		// Update height map with current scene objects
        updateHeightMapFromScene();

		// Create preview mesh for dragging
        dragObject = createPreviewMesh(type);
        dragging = true;

		// Add to scene and disable camera controls
        scene.add(dragObject);
        controls.enabled = false;

		// Calculate cursor offset and initial position
        computeCursorOffset();
        updateDragPosition(evt);
		
		// Set up event listeners for drag operation
        window.addEventListener('pointermove', updateDragPosition);
        window.addEventListener('pointerup', finishDrag, { once: true });
        window.addEventListener('keydown', rotatePreview);
    }

	/*
	  Updates the position of the dragged object based on mouse movement
	  Handles all positioning logic, collision checking and visual feedback
	  return -> evt - Mouse movement event
	 */
    function updateDragPosition(evt) {
        if (!dragObject) return;

		// Convert mouse coordinates to normalized device coordinates (-1 to +1)
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width)* 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height)* 2 + 1;

		/*
		 Raycast from camera to grid plane, handles mouse movement during drag-and-drop operations by:
		 1. Converting 2D mouse coordinates to precise 3D grid positions using raycasting
		 2. Aligning objects to grid cells (snapping)
		 3. Validating placement positions
		 4. Updating the drag preview in real-time
		 */
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObject(grid.getPlaneMesh());
        if (!hit.length) return;                                        // Exit if not hitting the grid

        currentPos = hit[0].point.clone();
        const { sx, sz } = getSpans(dragObject);                        // Get object dimensions in grid cells

		// Calculate snapped position considering:
        const baseX = cellSnap(currentPos.x - cursorOffset.x + cellSize/ 2, sx);
        const baseZ = cellSnap(currentPos.z - cursorOffset.z + cellSize/ 2, sz);

		// Convert world coordinates to grid indices
        const ix0 = worldToIndex(baseX);
        const iz0 = worldToIndex(baseZ);
        const cells = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
		
		// Handle positioning based on validity
        const baseH = canPlace(cells);
        const objHeight = getObjectHeight(dragObject);
        if (baseH === null) {
            // Invalid position -> show red preview at ground level
            dragObject.material.color.set(0xff4444);
            dragObject.position.set(baseX, objHeight/2, baseZ);
        } else {
            // Valid position -> show normal color at correct height
            dragObject.material.color.set(objType === 'wall' ? 0x4caf50 : 0x2196f3);
            dragObject.position.set(baseX, baseH + objHeight/2, baseZ);
        }
    }

	// Rotates the preview object 90 degrees when spacebar is pressed
    function rotatePreview(evt) {
		// return if no object is being dragged or key isn't spacebar
        if (!dragObject || evt.code !== 'Space') return;
        dragObject.rotation.y += Math.PI / 2;

		// Recalculate cursor offset 
        computeCursorOffset();
		// Update position if valid current position exists
        if (currentPos) updateDragPosition(evt);
    }

	// Finalizes the drag operation
    function finishDrag() {
        window.removeEventListener('pointermove', updateDragPosition);  // for mouse movement or touchpad
        window.removeEventListener('keydown', rotatePreview);			// for keyboard

        placeOrCancel();
        controls.enabled = true;										// Re-enable camera controls	
        dragging = false;
        dragObject = null;
        currentPos = null;
    }

    // Finalizes object placement or cancels the operation
    function placeOrCancel() {
		// return if no valid drag object or position
		if (!dragObject || !currentPos) return;

		// Compute object spans and snapped grid position
		const { sx, sz } = getSpans(dragObject);
		const baseX = cellSnap(currentPos.x - cursorOffset.x + cellSize / 2, sx);
		const baseZ = cellSnap(currentPos.z - cursorOffset.z + cellSize / 2, sz);

		// Convert to grid indices and get covered cells
		const ix0 = worldToIndex(baseX);
		const iz0 = worldToIndex(baseZ);
		const cells = cellsCovered(ix0, iz0, sx, sz);

		const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
		const baseH = canPlace(cells);

		// Cancel operation if invalid position
		if (baseH === null) {
			scene.remove(dragObject);
			return;
		}

		const objHeight = getObjectHeight(dragObject);
		/*
			Need to add half of the height of the object becuse when we extract the dimension of the object
			we get the dimensions of object from the pivot of oject that is positined at the center 
		*/
		const finalY = baseH + (objHeight / 2);  			

		// Creazione oggetto con posizionamento corretto
		let realObject;
		if (objType === 'wall') {
			realObject = new Wall(scene, new THREE.Vector3(baseX, finalY, baseZ), cellSize);
		} else {
			realObject = new House(scene, new THREE.Vector3(baseX, finalY, baseZ), cellSize);
		}

		// Apply rotation from preview
		realObject.mesh.rotation.y = dragObject.rotation.y;

		updateHeightMapFromScene(); 
		scene.remove(dragObject);
	}

	/*
	  Computes the height of an object by creating a bounding box around it
	  and extracting the size of the box
	*/
    function getObjectHeight(obj) {
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        return size.y;
    }

	// Creates a translucent preview mesh for drag-and-drop operations.
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

    return { startDrag,updateHeightMapFromScene };
}

export { setupDragAndDrop  };