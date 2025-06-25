import * as THREE from 'https://esm.sh/three@0.150.1';
import { isSupporting, computeTargetY, getObjectSpans } from './Gravity.js';

function setupMoveAndRemove({ scene, camera, renderer, controls, dragManager, grid }) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let animating = false;

    const cellSize = grid.size / grid.divisions;

    function pick(evt) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const pickables = [];
        scene.traverse(o => {
            if (o.userData?.isWall || o.userData?.isHouse || o.userData?.isStrongBlock) pickables.push(o);
        });
        return raycaster.intersectObjects(pickables, false)[0]?.object ?? null;
    }

    let highlighted = null;
    let edgeHelper = null;
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });

    function addOutline(mesh) {
        const geo = new THREE.EdgesGeometry(mesh.geometry);
        edgeHelper = new THREE.LineSegments(geo, outlineMat);
        edgeHelper.position.copy(mesh.position);
        edgeHelper.rotation.copy(mesh.rotation);
        edgeHelper.scale.copy(mesh.scale);
        scene.add(edgeHelper);
    }

    function clearOutline() {
        if (edgeHelper) {
            scene.remove(edgeHelper);
            edgeHelper.geometry.dispose();
            edgeHelper = null;
        }
        highlighted = null;
        renderer.domElement.style.cursor = 'default';
    }

    function onPointerMove(evt) {
        if (!controls.enabled || animating) return;
        const hit = pick(evt);
        
        if (hit && hit !== highlighted && !isSupporting(scene, hit, cellSize)) {
            clearOutline();
            highlighted = hit;
            addOutline(hit);
            renderer.domElement.style.cursor = 'pointer';
        }
       
        if (!hit || isSupporting(scene, hit, cellSize)) clearOutline();
    }

    function onPointerDown(evt) {
        if (!controls.enabled || animating || evt.button !== 0) return;
        const obj = pick(evt);
        if (!obj) return;

        if (isSupporting(scene, obj, cellSize)) return;

        evt.preventDefault();
        
        const type = obj.userData.type;

        clearOutline();
        
        scene.remove(obj);
        
        dragManager.startDrag(type, evt);
    }

    function onRightClick(evt) {
        evt.preventDefault();
        const obj = pick(evt);
        if (!obj) return;

        if (isSupporting(scene, obj, cellSize)) {
            console.warn("Blocco non rimuovibile: supporta altri oggetti.");
            return;
        }

        scene.remove(obj);
        clearOutline();
        requestAnimationFrame(() => applyGravityAnimated(obj));
    }

    function applyGravityAnimated(removed) {
        animating = true;
        
        const spansRem = getObjectSpans(removed);
        const ixRem = Math.round(removed.position.x / cellSize);
        const izRem = Math.round(removed.position.z / cellSize);

        const cellsRem = [];
        for (let dx = 0; dx < spansRem.sx; dx++) {
            for (let dz = 0; dz < spansRem.sz; dz++) {
                cellsRem.push({
                    x: ixRem - Math.floor((spansRem.sx - 1) / 2) + dx,
                    z: izRem - Math.floor((spansRem.sz - 1) / 2) + dz
                });
            }
        }

        const candidates = [];
        scene.traverse(o => {
            if (!o.userData?.isWall && !o.userData?.isStrongBlock) return;
            if (o.position.y <= removed.position.y) return;

            const ix = Math.round(o.position.x / cellSize);
            const iz = Math.round(o.position.z / cellSize);
            if (cellsRem.some(c => c.x === ix && c.z === iz)) {
                candidates.push(o);
            }
        });

        candidates.sort((a, b) => a.position.y - b.position.y);

        (function drop(i = 0) {
            if (i >= candidates.length) {
                dragManager.updateHeightMapFromScene();
                animating = false;
                return;
            }
            const obj = candidates[i];
            const targetY = computeTargetY(scene, obj, getObjectSpans(obj), cellSize);
            const step = 0.2;
            const dist = obj.position.y - targetY;

            if (dist > step) {
                obj.position.y -= step;
                requestAnimationFrame(() => drop(i));
            } else {
                obj.position.y = targetY;
                requestAnimationFrame(() => drop(i + 1));
            }
        })();
    }

    const canvas = renderer.domElement;
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onRightClick);

    function dispose() {
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('contextmenu', onRightClick);
        clearOutline();
    }

    return { dispose };
}

export { setupMoveAndRemove };