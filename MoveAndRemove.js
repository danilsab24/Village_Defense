import * as THREE from 'https://esm.sh/three@0.150.1';
import { isSupporting, computeTargetY, getRotatedSpans } from './Gravity.js';

function setupMoveAndRemove({ scene, camera, renderer, controls, dragManager }) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let animating = false;

    function pick(evt) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const pickables = [];
        scene.traverse(o => {
            if (o.userData?.isWall || o.userData?.isHouse) pickables.push(o);
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
        if (hit && hit !== highlighted && !isSupporting(scene, hit)) {
            clearOutline();
            highlighted = hit;
            addOutline(hit);
            renderer.domElement.style.cursor = 'pointer';
        }
        if (!hit || isSupporting(scene, hit)) clearOutline();
    }


    function onPointerDown(evt) {
        if (!controls.enabled || animating || evt.button !== 0) return;
        const obj = pick(evt);
        if (!obj) return;

        if (isSupporting(scene, obj)) return; // evita selezione se blocco è critico

        evt.preventDefault();
        const type = obj.userData.isWall ? 'cube' : 'house';
        clearOutline();
        dragManager.startDrag(type, evt);
        requestAnimationFrame(() => {
            scene.remove(obj);
        });
    }


    function onRightClick(evt) {
        evt.preventDefault();
        const obj = pick(evt);
        if (!obj) return;
        if (isSupporting(scene, obj)) {
            console.warn("Blocco non rimuovibile: supporta altri oggetti.");
            return;
        }

        scene.remove(obj);
        clearOutline();
        // passo l'oggetto rimosso a applyGravityAnimated
        requestAnimationFrame(() => applyGravityAnimated(obj));
    }

    function applyGravityAnimated(removed) {
        animating = true;

        const cellSize = 1;
        // calcolo span e celle del blocco rimosso
        const spansRem = removed.userData.isWall
            ? { sx: 1, sz: 1 }
            : getRotatedSpans(removed);
        const ixRem = Math.floor(removed.position.x / cellSize + 0.5);
        const izRem = Math.floor(removed.position.z / cellSize + 0.5);

        const cellsRem = [];
        for (let dx = 0; dx < spansRem.sx; dx++) {
            for (let dz = 0; dz < spansRem.sz; dz++) {
                cellsRem.push({
                    x: ixRem - Math.floor((spansRem.sx - 1) / 2) + dx,
                    z: izRem - Math.floor((spansRem.sz - 1) / 2) + dz
                });
            }
        }

        // seleziona solo i muri sopra la colonna del removed
        const candidates = [];
        scene.traverse(o => {
            if (!o.userData?.isWall) return;
            if (o.position.y <= removed.position.y) return;

            const ix = Math.floor(o.position.x / cellSize + 0.5);
            const iz = Math.floor(o.position.z / cellSize + 0.5);
            if (cellsRem.some(c => c.x === ix && c.z === iz)) {
                candidates.push(o);
            }
        });

        // ordina dal più basso al più alto
        candidates.sort((a, b) => a.position.y - b.position.y);

        // animazione sequenziale
        (function drop(i = 0) {
            if (i >= candidates.length) {
                dragManager.updateHeightMapFromScene();
                animating = false;
                return;
            }
            const obj     = candidates[i];
            const targetY = computeTargetY(scene, obj, { sx: 1, sz: 1 });
            const step    = 0.2;
            const dist    = obj.position.y - targetY;

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
