// DragAndDrop.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';

function setupDragAndDrop({ scene, camera, renderer, grid, controls }) {
    // Configurazione iniziale
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    const cellSize  = grid.size / grid.divisions;
    const halfCells = grid.divisions / 2;

    let dragging      = false;
    let dragObject    = null;
    let currentPos    = null;
    let cursorOffset  = new THREE.Vector3();
    let lastSnappedX  = 0;
    let lastSnappedZ  = 0;

    const heightMap = new Map();
    const mapKey    = (ix, iz) => `${ix}_${iz}`;
    const worldToIx = x => Math.round(x / cellSize);
    const worldToIz = z => Math.round(z / cellSize);

    // Helper: snapshot della scena
    function updateHeightMapFromScene() {
        heightMap.clear();
        scene.traverse(obj => {
            if (!obj.userData?.isWall && !obj.userData?.isHouse) return;
            const ix = worldToIx(obj.position.x);
            const iz = worldToIz(obj.position.z);
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const topH = obj.position.y + size.y / 2;
            heightMap.set(mapKey(ix, iz), {
                top: obj.userData.isHouse ? 'house' : 'wall',
                h:   topH
            });
        });
    }

    // Helper: cursor offset per anteprima 
    function computeCursorOffset() {
        const box = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        cursorOffset.set(size.x / 2, 0, size.z / 2);
    }

    // Snap su griglia
    function cellSnap(value, span = 1) {
        if (span % 2 === 0) {
            const idx = Math.round(value / cellSize - 0.5);
            return idx * cellSize + (span / 2) * cellSize;
        } else {
            const idx = Math.round(value / cellSize);
            return idx * cellSize + cellSize / 2;
        }
    }

    // Dimensioni in celle per oggetto 
    function getRotatedSpans(obj) {
        const steps = Math.round(obj.rotation.y / (Math.PI / 2));
        const odd   = steps % 2 !== 0;
        return odd ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
    }
    function getSpans(obj) {
        if (obj.userData?.isWall) return { sx: 1, sz: 1 };
        if (obj.userData?.isHouse) return getRotatedSpans(obj);
        // anteprima
        return obj.userData?.type === 'cube'
            ? { sx: 1, sz: 1 }
            : getRotatedSpans(obj);
    }

    // Celle occupate da un oggetto 
    function cellsCovered(ix0, iz0, sx, sz) {
        const startX = ix0 - Math.floor((sx - 1) / 2);
        const startZ = iz0 - Math.floor((sz - 1) / 2);
        const cells  = [];
        for (let dx = 0; dx < sx; dx++) {
            for (let dz = 0; dz < sz; dz++) {
                cells.push({ ix: startX + dx, iz: startZ + dz });
            }
        }
        return cells;
    }

    // Verifica se posso piazzare 
    function canPlace(cells, objType) {
        let refH = null;
        for (const { ix, iz } of cells) {
            // dentro i confini?
            if (ix < -halfCells || ix >= halfCells ||
                iz < -halfCells || iz >= halfCells) {
                return null;
            }
            const entry = heightMap.get(mapKey(ix, iz));
            const top   = entry?.top ?? 'ground';
            const h     = entry?.h   ?? 0;
            // mai sopra una house
            if (top === 'house') return null;
            // uniformità di quota
            if (refH === null) refH = h;
            else if (Math.abs(h - refH) > 0.01) return null;
        }
        return refH;
    }

    // Creazione anteprima 
    function createPreviewMesh(type) {
        const geom = type === 'cube'
            ? new THREE.BoxGeometry(cellSize, 1, cellSize)
            : new THREE.BoxGeometry(cellSize * 2, 0.75, cellSize);
        const mat = new THREE.MeshStandardMaterial({
            color:       type === 'cube' ? 0x4caf50 : 0x2196f3,
            transparent: true,
            opacity:     0.7
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.type = type === 'cube' ? 'cube' : 'house';
        return mesh;
    }

    // Drag & Drop 
    function startDrag(type, evt) {
        if (dragging) return;
        updateHeightMapFromScene();
        dragObject = createPreviewMesh(type);
        dragging   = true;
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

        // 1. NDC del mouse
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top)  / rect.height) * 2 + 1;

        // 2. Raycast sulla griglia
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(grid.getPlaneMesh());
        if (!hits.length) return;
        currentPos = hits[0].point.clone();

        // 3. Span e snap
        const { sx, sz } = getSpans(dragObject);
        const snappedX = cellSnap(currentPos.x - cursorOffset.x + cellSize/2, sx);
        const snappedZ = cellSnap(currentPos.z - cursorOffset.z + cellSize/2, sz);
        lastSnappedX = snappedX;
        lastSnappedZ = snappedZ;

        // 4. Celle e altezza di appoggio
        const ix0     = worldToIx(snappedX);
        const iz0     = worldToIz(snappedZ);
        const cells   = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
        const baseH   = canPlace(cells, objType);

        // 5. Half-height per anteprima
        const box  = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3(); box.getSize(size);
        const halfH = size.y / 2;

        // 6. Colore e posizione anteprima
        if (baseH === null) {
            dragObject.material.color.set(0xff4444);
            dragObject.position.set(snappedX, halfH, snappedZ);
        } else {
            dragObject.material.color.set(
                objType === 'wall' ? 0x4caf50 : 0x2196f3
            );
            dragObject.position.set(snappedX, baseH + halfH, snappedZ);
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
        dragging   = false;
        dragObject = null;
        currentPos = null;
    }

    function placeOrCancel() {
        if (!dragObject) return;
        const finalX = lastSnappedX;
        const finalZ = lastSnappedZ;

        const { sx, sz } = getSpans(dragObject);
        const ix0     = worldToIx(finalX);
        const iz0     = worldToIz(finalZ);
        const cells   = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
        const baseH   = canPlace(cells, objType);
        if (baseH === null) {
            scene.remove(dragObject);
            return;
        }

        // calcola posizione Y definitiva
        const box  = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3(); box.getSize(size);
        const halfH = size.y / 2;
        const finalY = baseH + halfH;

        // crea l’oggetto reale
        let realObj;
        if (objType === 'wall') {
            realObj = new Wall(
                scene,
                new THREE.Vector3(finalX, finalY, finalZ),
                cellSize
            );
        } else {
            realObj = new House(
                scene,
                new THREE.Vector3(finalX, finalY, finalZ),
                cellSize
            );
        }
        realObj.mesh.rotation.y = dragObject.rotation.y;

        updateHeightMapFromScene();
        scene.remove(dragObject);
    }

    return { startDrag, updateHeightMapFromScene };
}

export { setupDragAndDrop };
