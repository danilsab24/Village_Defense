import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';
import { StrongBlock } from './StrongBlock.js';

// CORREZIONE: Accetta 'getControls' invece di 'controls'
function setupDragAndDrop({ scene, camera, renderer, grid, getControls, getGameState, sessionState, updateUI }) {
    // Internal State 
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const cellSize = grid.buildAreaSize / grid.divisions; 
    const halfCells = grid.divisions / 2;

    let dragging = false;
    let dragObject = null;  // The semi-transparent preview mesh being dragged
    let currentPos = null;  // The last known intersection point on the grid plane
    let lastSnappedX = 0;   // The last snapped X coordinate on the grid
    let lastSnappedZ = 0;   // The last snapped Z coordinate on the grid

    /* 
        The heightMap is a critical data structure that stores the highest surface
        at each grid cell (ix, iz). This is used to determine where new objects can be placed.
        The key is a string like "ix_iz", and the value is an object { top: string, h: number }
    */
    const heightMap = new Map();
    const mapKey = (ix, iz) => `${ix}_${iz}`;

    // == HEIGHT MAP and PLACEMENT LOGIC
    /*
        Scans the entire scene to build or rebuild the heightMap. This should be called
        whenever an object is added or removed to ensure placement checks are accurate 
    */
    function updateHeightMapFromScene() {
        heightMap.clear();

        // Only consider placeable objects (walls, houses, strong blocks)
        scene.traverse(obj => {
            if ((!obj.userData?.isWall && !obj.userData?.isHouse && !obj.userData?.isStrongBlock) || !obj.geometry?.parameters) {
                return;
            }

            // Determine the object's size in grid cells
            const sx = Math.max(1, Math.round(obj.geometry.parameters.width / cellSize));
            const sz = Math.max(1, Math.round(obj.geometry.parameters.depth / cellSize));
            
            const covered = getCoveredCells(obj.position.x, obj.position.z, sx, sz);
            const topH = Math.round((obj.position.y + obj.geometry.parameters.height / 2) * 100) / 100;
            
            // Determine the surface type for the heightMap entry
            let topType = 'ground';
            if (obj.userData.isHouse) topType = 'house';
            else if (obj.userData.isStrongBlock) topType = 'strong';
            else if (obj.userData.isWall) topType = 'wall';
            
            // For each cell the object covers, update the heightMap if this object is higher
            covered.forEach(({ ix, iz }) => {
                const key = mapKey(ix, iz);
                const existingEntry = heightMap.get(key);
                if (!existingEntry || topH > existingEntry.h) {
                    heightMap.set(key, { top: topType, h: topH });
                }
            });
        });
    }

    /*
    Checks if an object can be placed on a given set of cells.
        cells -> The grid cells the object would cover.
        objType -> The type of object being placed (e.g., 'cube', 'house_h2').
        return -> The valid Y-coordinate for the base of the object, or null if placement is invalid.
     */
    function canPlace(cells, objType) {
        let baseHeight = null;
        const supportSurfaces = [];

        for (const { ix, iz } of cells) {
            // Check if the object is outside the grid area
            if (ix < -halfCells || ix >= halfCells || iz < -halfCells || iz >= halfCells) return null;
            const entry = heightMap.get(mapKey(ix, iz));
            const surfaceType = entry?.top ?? 'ground';
            const surfaceHeight = entry?.h ?? 0;

            // Placement Rule: Cannot place anything on top of a house.
            if (surfaceType === 'house') return null;
            
            // Placement Rule: The entire base of the object must rest on a flat surface
            if (baseHeight === null) {
                baseHeight = surfaceHeight;
            } else if (Math.abs(surfaceHeight - baseHeight) > 0.01) {
                return null; // The support surface is not flat
            }
            supportSurfaces.push(surfaceType);
        }

        // Placement Rule: Houses can only be placed on ground, walls, or strong blocks
        if (objType.startsWith('house')) {
            const allSupportsAreValid = supportSurfaces.every(s => s === 'ground' || s === 'wall' || s === 'strong');
            if (!allSupportsAreValid) return null;
        }
        return baseHeight;
    }

    // == DRAG and DROP WORKFLOW ==
    /*
        Starts the drag-and-drop process.
        type -> The type of object to create a preview for.
        event -> The pointer event that initiated the drag.
     */
    function startDrag(type, evt) {
        const gameState = getGameState();
        const isTutorialBuilding = sessionState.isTutorialBuilding === true;
        // Dragging is only allowed during the BUILDING phase or tutorial building.
        if (dragging || (gameState !== 'BUILDING' && !isTutorialBuilding)) {
            return;
        }

        updateHeightMapFromScene();   // Ensure the height map is up-to-date
        dragObject = createPreviewMesh(type);
        dragging = true;
        scene.add(dragObject);

        // Disable camera controls to prevent conflicts while dragging
        const controls = getControls();
        if (controls) {
            controls.enabled = false;
        }

        // Attach event listeners for the duration of the drag.
        onDrag(evt); 
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', finishDrag, { once: true });
        window.addEventListener('keydown', rotatePreview);
    }

    // Handles the `pointermove` event, updating the position of the preview object
    /*
        WebGL use Normalized Device Coordinates (NDC) for raycasting so I need to map mouse clicking
        from pixels to NDC 

        X_NDC = ((X - evt.clientX -rect.left)/(rect.width))*2 -1
        where:
        X - evt.clientX -rect.left -> position inside the canvas
        divide by width to normalize [0,1]
        multiply by 2 and substract 1 to map [0,1]->[-1,+1]

        Y_NDC = ((Y - evt.clientY -rect.top)/(rect.heigth))*2 +1
        same before but apply minus sign to flip vertical axis
     */
    function onDrag(evt) {
        if (!dragObject) return;
        // Raycast from the camera to the invisible ground plane
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(grid.getPlaneMesh());
        if (hits.length > 0) {
            updateDragObjectOnGrid(hits[0].point);
        }
    }

    // Snaps the preview object to the grid and updates its visual state (color, position)
    // The intersection point on the ground plane
    function updateDragObjectOnGrid(point) {
        if (!dragObject || !point) return;

        currentPos = point.clone();
        const { sx, sz } = getSpans(dragObject);

        //Snap the object's center to the grid
        lastSnappedX = cellSnap(currentPos.x, sx);
        lastSnappedZ = cellSnap(currentPos.z, sz);
        
        const cells = getCoveredCells(lastSnappedX, lastSnappedZ, sx, sz);
        const objType = dragObject.userData.type;
        const baseH = canPlace(cells, objType);
        const halfH = dragObject.geometry.parameters.height / 2;
        
        if (baseH === null) {
            // Invalid placement: color the object red
            dragObject.material.color.set(0xff4444);
            dragObject.position.set(lastSnappedX, grid.getPlaneMesh().position.y + halfH, lastSnappedZ);
        } else {
            // Valid placement: use the correct color and set the correct height
            const correctColor = objType === 'cube' ? 0x4caf50 : (objType === 'strong' ? 0xffa500 : 0x2196f3);
            dragObject.material.color.set(correctColor);
            dragObject.position.set(lastSnappedX, baseH + halfH, lastSnappedZ);
        }
    }

    // Handles the `keydown` event for rotating the preview object
    function rotatePreview(evt) {
        if (!dragObject || evt.code !== 'Space') return;
        evt.preventDefault();

        const objType = dragObject.userData.type;

        if (objType.startsWith('house')) {
            // Houses rotate around the Y-axis
            dragObject.rotation.y += Math.PI / 2;
        } else if (objType === 'cube' || objType === 'strong') {
            // Walls and strong blocks swap their width and depth dimensions
            const brush = dragObject.userData.brush;
            [brush.w, brush.d] = [brush.d, brush.w];
            
            dragObject.geometry.dispose();
            dragObject.geometry = new THREE.BoxGeometry(cellSize * brush.w, brush.h, cellSize * brush.d);
        }
        // Re-validate the position after rotation
        if (currentPos) {
            updateDragObjectOnGrid(currentPos);
        }
    }

    // Finalizes the drag operation
    function finishDrag() {
        window.removeEventListener('pointermove', onDrag);
        window.removeEventListener('keydown', rotatePreview);
        placeOrCancel();

        // Re-enable camera controls
        const controls = getControls();
        if (controls) {
            controls.enabled = true;
        }

        dragging = false;
        dragObject = null;
        currentPos = null;
    }

    // Either places the final object in the scene or cancels the operation
    function placeOrCancel() {
        if (!dragObject) return;

        const objType = dragObject.userData.type;
        const brush = dragObject.userData.brush;
        const isMultiBlock = objType === 'cube' || objType === 'strong';

        // Final validation check
        const { sx, sz } = getSpans(dragObject);
        const cells = getCoveredCells(lastSnappedX, lastSnappedZ, sx, sz);
        const baseH = canPlace(cells, objType);

        if (baseH === null) {
            scene.remove(dragObject); // Invalid: remove the preview mesh
            return;
        }

        // Check Costs and Limits
        const cost = sessionState.costs[objType];
        const totalBlocks = isMultiBlock ? brush.w * brush.h * brush.d : 1;
        const totalCost = cost * totalBlocks;

        if (sessionState.money < totalCost) {
            alert("Fondi insufficienti per piazzare questa selezione!");
            scene.remove(dragObject);
            return;
        }
        
        if (objType.startsWith('house')) {
             const limit = sessionState.limits[objType];
             const currentCount = sessionState.placedCounts[objType];
             if (limit !== undefined && currentCount >= limit) {
                alert(`Hai già piazzato il numero massimo di ${objType}.`);
                scene.remove(dragObject);
                return;
            }
        }
        
        // Update State and Create Final Object
        sessionState.money -= totalCost;
        sessionState.placedCounts[objType] += totalBlocks;
        updateUI();

        if (isMultiBlock) {
            // For walls/strong blocks, place a grid of individual blocks based on the brush size
            const startX = lastSnappedX - (brush.w - 1) * cellSize / 2;
            const startZ = lastSnappedZ - (brush.d - 1) * cellSize / 2;
            
            for (let y = 0; y < brush.h; y++) {
                for (let x = 0; x < brush.w; x++) {
                    for (let z = 0; z < brush.d; z++) {
                        const finalX = startX + x * cellSize;
                        const finalY = baseH + 0.5 + y;
                        const finalZ = startZ + z * cellSize;
                        const finalPos = new THREE.Vector3(finalX, finalY, finalZ);
                        
                        if (objType === 'cube') {
                            new Wall(scene, finalPos, cellSize);
                        } else if (objType === 'strong') {
                            new StrongBlock(scene, finalPos, cellSize);
                        }
                    }
                }
            }
        } else {
            // For houses, place a single object
            const halfH = dragObject.geometry.parameters.height / 2;
            const finalY = baseH + halfH;
            const finalPos = new THREE.Vector3(lastSnappedX, finalY, lastSnappedZ);
            const height = dragObject.geometry.parameters.height;
            const realObj = new House(scene, finalPos, cellSize, height);
            realObj.mesh.rotation.y = dragObject.rotation.y;
        }

        scene.remove(dragObject);   // Remove the preview mesh
        updateHeightMapFromScene(); // Update the map with the newly placed object
    }

    // == UTILITY FUNCTION ==
    // Creates the semi-transparent preview mesh for dragging
    function createPreviewMesh(type) {
        let geom;
        const brush = sessionState.buildBrush[type];
        
        if (type.startsWith('house_h')) {
            const height = parseInt(type.split('_h')[1], 10);
            geom = new THREE.BoxGeometry(cellSize * 2, height, cellSize * 2); 
        } else {
            geom = new THREE.BoxGeometry(cellSize * brush.w, brush.h, cellSize * brush.d);
        }

        const mat = new THREE.MeshStandardMaterial({
            color: type.startsWith('house') ? 0x2196f3 : (type === 'strong' ? 0xffa500 : 0x4caf50),
            transparent: true,
            opacity: 0.7
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.type = type;
        if (brush) {
            mesh.userData.brush = { ...brush };
        }
        return mesh;
    } 

    /*
        Calculates the world coordinate that corresponds to the center of a grid cell.
        worldCoord -> The world coordinate (X or Z).
        span -> The size of the object in grid cells along that axis

        example:
        1x1 or 3x3 their center is align with the center of cell
        2x2 they need to be align between cells
    */
    function cellSnap(worldCoord, span) {
        // Offset is needed to snap to the center of a cell for odd-spanned objects,
        // or to the edge between cells for even-spanned objects
        const isEven = span % 2 === 0;
        const offset = isEven ? 0 : 0.5;
        const index = Math.round(worldCoord / cellSize - offset);
        return index * cellSize + (isEven ? 0 : cellSize / 2);
    }

    // Gets the dimensions (span) of an object in grid cells
    function getSpans(obj) {
        if (obj.userData?.type?.startsWith('house')) return { sx: 2, sz: 2 };
        if (obj.userData?.brush) {
            return { sx: obj.userData.brush.w, sz: obj.userData.brush.d };
        }
        return { sx: 1, sz: 1 };
    }

    /**
        Calculates all grid cells covered by an object at a given position
        worldX -> The object's world X position.
        worldZ -> The object's world Z position.
        sx -> The object's span in X.
        sz -> The object's span in Z.
        returns -> An array of covered cell indices.
     */
    function getCoveredCells(worldX, worldZ, sx, sz) {
        const cornerX = worldX - (sx * cellSize) / 2;
        const cornerZ = worldZ - (sz * cellSize) / 2;
        const startIx = Math.floor(cornerX / cellSize);
        const startIz = Math.floor(cornerZ / cellSize);
        const cells = [];
        for (let dx = 0; dx < sx; dx++) {
            for (let dz = 0; dz < sz; dz++) {
                cells.push({ ix: startIx + dx, iz: startIz + dz });
            }
        }
        return cells;
    }

    return { startDrag, updateHeightMapFromScene };
}

export { setupDragAndDrop };