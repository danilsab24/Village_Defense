// DragAndDrop.js - VERSIONE DEFINITIVA DI DEBUG
import * as THREE from 'https://esm.sh/three@0.150.1';
import { Wall } from './wall.js';
import { House } from './village.js';

function setupDragAndDrop({ scene, camera, renderer, grid, controls }) {

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const cellSize = grid.size / grid.divisions;
    const halfCells = grid.divisions / 2;

    let dragging = false;
    let dragObject = null;
    let currentPos = null;
    let lastSnappedX = 0;
    let lastSnappedZ = 0;

    const heightMap = new Map();
    const mapKey = (ix, iz) => `${ix}_${iz}`;
    const worldToIx = x => Math.floor(x / cellSize);
    const worldToIz = z => Math.floor(z / cellSize);

    function cellSnap(worldCoord, span) {
        if (span % 2 === 1) {
            const index = Math.floor(worldCoord / cellSize);
            return index * cellSize + (cellSize / 2);
        } else {
            const index = Math.round(worldCoord / cellSize);
            return index * cellSize;
        }
    }
    
    function getRotatedSpans(obj) {
        const rotationSteps = Math.round(obj.rotation.y / (Math.PI / 2)) % 4;
        const isRotated = rotationSteps % 2 !== 0;
        return isRotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
    }

    function getSpans(obj) {
        if (obj.userData?.isWall) return { sx: 1, sz: 1 };
        if (obj.userData?.isHouse) return getRotatedSpans(obj);
        return obj.userData?.type === 'cube' ? { sx: 1, sz: 1 } : getRotatedSpans(obj);
    }
    
    function cellsCovered(ix0, iz0, sx, sz) {
        const startX = ix0 - Math.floor(sx / 2);
        const startZ = iz0 - Math.floor(sz / 2);
        const cells = [];
        for (let dx = 0; dx < sx; dx++) {
            for (let dz = 0; dz < sz; dz++) {
                cells.push({ ix: startX + dx, iz: startZ + dz });
            }
        }
        return cells;
    }
    
    function updateHeightMapFromScene() {
        heightMap.clear();
        scene.traverse(obj => {
            if (!obj.userData?.isWall && !obj.userData?.isHouse) return;

            const spans = getSpans(obj);
            const ix0 = worldToIx(obj.position.x);
            const iz0 = worldToIz(obj.position.z);
            const covered = cellsCovered(ix0, iz0, spans.sx, spans.sz);
            
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const topH = obj.position.y + size.y / 2;

            covered.forEach(({ ix, iz }) => {
                heightMap.set(mapKey(ix, iz), {
                    top: obj.userData.isHouse ? 'house' : 'wall',
                    h: topH
                });
            });
        });
    }

    function canPlace(cells, objType) {
        let baseHeight = null;
        const supportSurfaces = [];

        for (const { ix, iz } of cells) {
            if (ix < -halfCells || ix >= halfCells || iz < -halfCells || iz >= halfCells) return null;

            const entry = heightMap.get(mapKey(ix, iz));
            const surfaceType = entry?.top ?? 'ground';
            const surfaceHeight = entry?.h ?? 0;
            
            if (surfaceType === 'house') return null;

            if (baseHeight === null) {
                baseHeight = surfaceHeight;
            } else if (Math.abs(surfaceHeight - baseHeight) > 0.01) {
                return null;
            }
            
            supportSurfaces.push(surfaceType);
        }

        if (objType === 'house') {
            const onGround = supportSurfaces.every(s => s === 'ground');
            const onWalls = supportSurfaces.every(s => s === 'wall');
            if (!onGround && !onWalls) return null;
        }

        return baseHeight;
    }

    function createPreviewMesh(type) {
        const geom = type === 'cube'
            ? new THREE.BoxGeometry(cellSize, 1, cellSize)
            : new THREE.BoxGeometry(cellSize * 2, 0.75, cellSize);
        const mat = new THREE.MeshStandardMaterial({
            color: type === 'cube' ? 0x4caf50 : 0x2196f3,
            transparent: true,
            opacity: 0.7
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.type = type === 'cube' ? 'cube' : 'house';
        return mesh;
    }

    function startDrag(type, evt) {
        if (dragging) return;
        updateHeightMapFromScene();
        dragObject = createPreviewMesh(type);
        dragging = true;
        scene.add(dragObject);
        controls.enabled = false;
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
        const hits = raycaster.intersectObject(grid.getPlaneMesh());
        if (!hits.length) return;
        currentPos = hits[0].point.clone();

        const { sx, sz } = getSpans(dragObject);
        const snappedX = cellSnap(currentPos.x, sx);
        const snappedZ = cellSnap(currentPos.z, sz);
        lastSnappedX = snappedX;
        lastSnappedZ = snappedZ;

        const ix0 = worldToIx(snappedX);
        const iz0 = worldToIz(snappedZ);
        const cells = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
        const baseH = canPlace(cells, objType);

        const box = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        const halfH = size.y / 2;

        if (baseH === null) {
            dragObject.material.color.set(0xff4444);
            dragObject.position.set(snappedX, grid.getPlaneMesh().position.y + halfH, snappedZ);
        } else {
            dragObject.material.color.set(objType === 'wall' ? 0x4caf50 : 0x2196f3);
            dragObject.position.set(snappedX, baseH + halfH, snappedZ);
        }
    }

    function rotatePreview(evt) {
        if (!dragObject || evt.code !== 'Space') return;
        evt.preventDefault();
        dragObject.rotation.y += Math.PI / 2;
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
        if (!dragObject) return;
        
        const { sx, sz } = getSpans(dragObject);
        const ix0 = worldToIx(lastSnappedX);
        const iz0 = worldToIz(lastSnappedZ);
        const cells = cellsCovered(ix0, iz0, sx, sz);
        const objType = dragObject.userData.type === 'cube' ? 'wall' : 'house';
        const baseH = canPlace(cells, objType);

        if (baseH === null) {
            scene.remove(dragObject);
            return;
        }

        const box = new THREE.Box3().setFromObject(dragObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        const halfH = size.y / 2;
        const finalY = baseH + halfH;

        let realObj;
        if (objType === 'wall') {
            realObj = new Wall(scene, new THREE.Vector3(lastSnappedX, finalY, lastSnappedZ), cellSize);
        } else {
            realObj = new House(scene, new THREE.Vector3(lastSnappedX, finalY, lastSnappedZ), cellSize);
        }
        realObj.mesh.rotation.y = dragObject.rotation.y;
        
        scene.remove(dragObject);
        updateHeightMapFromScene();
    }

    return { startDrag, updateHeightMapFromScene };
}

export { setupDragAndDrop };