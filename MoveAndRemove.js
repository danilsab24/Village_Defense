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
        requestAnimationFrame(() => {
            applyGravityAnimated();
        });
    }

    function applyGravityAnimated() {
        animating = true;

        // Raccogli tutti i blocchi ordinati per altezza crescente
        const blocks = [];
        scene.traverse(o => {
            if (o.userData?.isWall || o.userData?.isHouse) blocks.push(o);
        });
        blocks.sort((a, b) => a.position.y - b.position.y);  // dal basso verso l’alto

        // Funzione ricorsiva che fa cadere un blocco per volta
        function dropBlock(i = 0) {
            if (i >= blocks.length) {
                dragManager.updateHeightMapFromScene();
                animating = false;
                return;
            }

            const obj   = blocks[i];
            const spans = obj.userData.isWall ? { sx: 1, sz: 1 } : getRotatedSpans(obj);
            const targetY  = computeTargetY(scene, obj, spans);
            const distance = obj.position.y - targetY;
            const step     = 0.2;

            if (distance > step) {
                obj.position.y -= step;
                requestAnimationFrame(() => dropBlock(i));       // continua sullo stesso blocco
            } else {
                obj.position.y = targetY;                        
                requestAnimationFrame(() => dropBlock(i + 1));   // passa al successivo
            }
        }


        dropBlock();  // inizia da i=0
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
