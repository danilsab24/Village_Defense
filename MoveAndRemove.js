import * as THREE from 'https://esm.sh/three@0.150.1';
import { isSupporting, computeTargetY, getObjectSpans } from './Gravity.js';

function setupMoveAndRemove({ scene, camera, renderer, grid, dragManager, sessionState, updateUI }) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let animating = false;    // Flag to block input while gravity animations are running

    const cellSize = grid.buildAreaSize / grid.divisions;

    // Visual feedback for Highlighting
    let highlighted = null;
    let edgeHelper = null;
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });

    // == CORE LOGIC == 
    /*
        Processes the removal of an object from the scene. This includes refunding
        the cost to the player and updating the global state
    */      
    function handleRemoval(obj) {
        const type = obj.userData.type;
        const brush = obj.userData.brush || { w:1, h:1, d:1 };
        // Calculate the number of blocks being removed (for multi-block structures)
        const totalBlocks = (type === 'cube' || type === 'strong') ? (brush.w * brush.h * brush.d) : 1;

        // Refund the cost and update counts in the session state
        if (type && sessionState.costs[type] !== undefined) {
            sessionState.money += sessionState.costs[type] * totalBlocks;
            sessionState.placedCounts[type] -= totalBlocks;
            updateUI();
        }
        scene.remove(obj);
        clearOutline();
    }

    /*
        This function simulates gravity in a way that correctly handles chain reactions.
        It runs in iterative "passes" until the scene is stable
    */
    function applyGravityAnimated() {
        animating = true;
        let somethingFell = false;

        /*
            A single pass of the gravity simulation. It finds all unsupported blocks
            and animates their fall
        */
        function runGravityPass() {
            const candidatesToFall = [];
            
            // Find all objects that should fall
            scene.traverse(obj => {
                if (obj.userData?.isWall || obj.userData?.isHouse || obj.userData?.isStrongBlock) {
                    const currentY = obj.position.y;
                    // Calculate the Y position where the object should be resting
                    const targetY = computeTargetY(scene, obj, getObjectSpans(obj), cellSize);
                    
                    if (Math.abs(currentY - targetY) > 0.01) {
                        candidatesToFall.push({ obj, targetY });
                    }
                }
            });

            // If no objects need to fall, the simulation is finished
            if (candidatesToFall.length === 0) {
                // If any object fell during the simulation, update the height map for future placements
                if (somethingFell) {
                    dragManager.updateHeightMapFromScene();
                }
                animating = false;
                return;
            }

            somethingFell = true;
            let animationsRunning = candidatesToFall.length;

            // Animate the fall for all candidates
            candidatesToFall.forEach(candidate => {
                const { obj, targetY } = candidate;
                
                // Use a self-invoking function with requestAnimationFrame for smooth animation
                (function drop() {
                    const step = 0.2; // Fall velocity
                    const dist = obj.position.y - targetY;
                    
                    if (dist > step) {
                        obj.position.y -= step;
                        requestAnimationFrame(drop);
                    } else {
                        // Animation for this object is finished
                        obj.position.y = targetY;
                        animationsRunning--;
                        // When all animations in this pass are complete, run another pass
                        // to handle any new chain reactions.
                        if (animationsRunning === 0) {
                            runGravityPass();
                        }
                    }
                })();
            });
        }
        
        // Start the first gravity cycle
        runGravityPass();
    }

    // Handles the 'pointermove' event to highlight removable objects
    function onPointerMove(evt) {
        if (animating) return;
        const hit = pick(evt);
        // An object can only be highlighted if it's not supporting another object
        if (hit && hit !== highlighted && !isSupporting(scene, hit, cellSize)) {
            clearOutline();
            highlighted = hit;
            addOutline(hit);
            renderer.domElement.style.cursor = 'pointer';
        } else if (!hit || (hit && isSupporting(scene, hit, cellSize))) {
            clearOutline();
        }
    }

    // Handles the 'pointerdown' event (left-click) to initiate moving an object
    function onPointerDown(evt) {
        if (animating || evt.button !== 0) return;
        const obj = pick(evt);
        // An object can only be moved if it exists and is not supporting anything
        if (!obj || isSupporting(scene, obj, cellSize)) return;

        // Prevent moving 'wall' (cube) and 'strong' blocks with left-click.
        // These blocks can only be deleted with right-click (handled in onRightClick)
        if (obj.userData.type === 'cube' || obj.userData.type === 'strong') {
            return; // Interrompe l'esecuzione, non facendo nulla per questi blocchi
        }

        // Remove the existing object and begin drag-and-drop to reposition it
        const type = obj.userData.type;
        handleRemoval(obj);
        dragManager.startDrag(type, evt);
    }

    // Handles the 'contextmenu' event (right-click) to remove an object and apply gravity
    function onRightClick(evt) {
        evt.preventDefault();
        // An object can only be removed if it exists and is not supporting anything
        const obj = pick(evt);
        if (animating || !obj || isSupporting(scene, obj, cellSize)) return;
        handleRemoval(obj);
        applyGravityAnimated();  // Trigger the gravity simulation
    }

    // Uses a Raycaster to find the first valid, interactable object under the mouse cursor
    function pick(evt) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const pickables = [];
        scene.traverse(o => {
            // Only walls, houses, and strong blocks can be picked
            if (o.userData?.isWall || o.userData?.isHouse || o.userData?.isStrongBlock) pickables.push(o);
        });
        return raycaster.intersectObjects(pickables, false)[0]?.object ?? null;
    }

    // Adds a yellow outline to a mesh to show it's highlighted
    function addOutline(mesh) {
        const geo = new THREE.EdgesGeometry(mesh.geometry);
        edgeHelper = new THREE.LineSegments(geo, outlineMat);
        edgeHelper.position.copy(mesh.position);
        edgeHelper.rotation.copy(mesh.rotation);
        edgeHelper.scale.copy(mesh.scale);
        scene.add(edgeHelper);
    }

    // Removes the highlight outline from the scene
    function clearOutline() {
        if (edgeHelper) {
            scene.remove(edgeHelper);
            edgeHelper.geometry.dispose();
            edgeHelper = null;
        }
        highlighted = null;
        renderer.domElement.style.cursor = 'default';
    }

    // Cleans up all event listeners to prevent memory leaks
    function dispose() {
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('contextmenu', onRightClick);
        clearOutline();
    }

    // Attach event listeners when the module is initialized
    const canvas = renderer.domElement;
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onRightClick);

    return { dispose };
}

export { setupMoveAndRemove };