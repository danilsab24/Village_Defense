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
        if (hit && hit !== highlighted) {
            clearOutline();
            highlighted = hit;
            addOutline(hit);
            renderer.domElement.style.cursor = 'pointer';
        }
        if (!hit) clearOutline();
    }

    function onPointerDown(evt) {
        if (!controls.enabled || animating || evt.button !== 0) return;
        const obj = pick(evt);
        if (!obj) return;
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
        requestAnimationFrame(() => {
            applyGravityAnimated();
        });
    }

    function applyGravityAnimated() {
        animating = true;

        function animateFallingBlocks(callback) {
            const falling = [];

            scene.traverse(obj => {
                if (obj.userData?.isWall || obj.userData?.isHouse) {
                    const spans = obj.userData.isWall ? { sx: 1, sz: 1 } : getRotatedSpans(obj);
                    const targetY = computeTargetY(scene, obj, spans);
                    const dy = obj.position.y - targetY;
                    if (dy > 0.01) {
                        falling.push({ obj, targetY });
                    }
                }
            });

            if (falling.length === 0) {
                callback?.();
                return;
            }

            function step() {
                let allDone = true;
                for (const { obj, targetY } of falling) {
                    const dy = obj.position.y - targetY;
                    if (dy > 0.01) {
                        obj.position.y -= Math.min(0.2, dy);
                        allDone = false;
                    } else {
                        obj.position.y = targetY;
                    }
                }

                if (!allDone) {
                    requestAnimationFrame(step);
                } else {
                    animateFallingBlocks(callback);
                }
            }

            step();
        }

        animateFallingBlocks(() => {
            dragManager?.updateHeightMapFromScene();
            animating = false;
        });
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
