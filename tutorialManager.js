import * as THREE from 'https://esm.sh/three@0.150.1';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';

// == HELPER FUNCTION ==
// An easing function that provides a smooth start and end
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Set the menu state (open or close)
function setSubmenuState(menuId, isOpen) {
    const submenu = document.getElementById(menuId);
    if (submenu) {
        if (isOpen) {
            document.querySelectorAll('.submenu').forEach(sm => sm.style.display = 'none');
        }
        submenu.style.display = isOpen ? 'flex' : 'none';
    }
}

/*  
    A utility function to programmatically open a specific submenu in the UI.
    It ensures other submenus are closed first
*/
function openSubmenuProgrammatically(menuId) {
    const submenu = document.getElementById(menuId);
    if (submenu) {
        submenu.style.display = 'flex';
    }
}


export class TutorialManager {
    constructor(scene, camera, controls, sessionState, cannonManager, particleManager, moveRemoveManager, onComplete) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.sessionState = sessionState;
        this.cannonManager = cannonManager;
        this.particleManager = particleManager;
        this.moveRemoveManager = moveRemoveManager;
        this.onComplete = onComplete; // Callback function when the tutorial finishes

        // Tutorial Actor & UI
        this.tutorBot = null;
        this.textBubble = null;

        // State flags
        this.isMoving = false;                      // True if the tutor bot or camera is currently moving
        this.isRotating = false;                    // True if the tutor bot is currently rotating
        this.isSpeaking = false;                    // True if a text bubble is currently displayed
        this.isWaitingForUser = false;              // Pauses the tutorial, waiting for the user to complete a build task
        this.isWaitingForDone = false;              // Pauses the tutorial, waiting for the user to press the 'DONE' button
        this.isWaitingForHousesDestroyed = false;   // Pauses the tutorial, waiting for the user to destroy all houses
        this.isWaitingForParticles = false;         // Pauses after destruction to let particle effects finish

        // Animation and timing
        this.stepTimer = 0;
        this.moveProgress = 0;
        this.rotationProgress = 0;
        this.currentStepIndex = -1;
        this.startPosition = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
        this.startRotation = new THREE.Euler();
        this.targetRotation = new THREE.Euler();
        this.startCamPosition = new THREE.Vector3();
        this.targetCamPosition = new THREE.Vector3();

        // Event Handler
        this.boundSkipStep = this.skipStep.bind(this);
        
        /**
            Defines the entire sequence of the tutorial. Each object in the array
            represents a step with properties that define actions, text, and animations
            - pos: Target position for the tutor bot
            - rotY: Target Y-axis rotation for the tutor bot
            - camPos: Target position for the camera
            - lookAt: Target point for the camera to look at
            - text: The dialogue to display in the text bubble
            - duration: The time in seconds the text should be displayed
            - action: A special command to execute (e.g., 'ENABLE_BUILDING', 'FADE_AND_SWITCH')
         */
        this.tutorialSteps = [
            // === BUILDING PHASE ===
            { pos: new THREE.Vector3(0, 5, 20), camPos: new THREE.Vector3(0, 8, 30), text: "Hi! Welcome to Village Defense. In this phase, you'll build your defenses. Let's see how!", duration: 7 },
            { pos: new THREE.Vector3(18, 5, 0), rotY: 5*Math.PI/6, camPos: new THREE.Vector3(25, 10, 15), lookAt: new THREE.Vector3(15, 0, 0) },
            { rotY: Math.PI/6, duration: 1.5 },
            { text: "On the right, you'll find 'Wall' and 'Strong Block' to build your defense...", duration: 6, action: 'OPEN_WALL_MENU' },
            { text: "...and the 'Houses', which are the objectives you need to protect!", duration: 6, action: 'OPEN_HOUSE_MENU' },
            { action: 'CLOSE_ALL_MENUS' },
            { pos: new THREE.Vector3(18, 5, 0), camPos: new THREE.Vector3(0, 8, 30), rotY: -Math.PI },
            { lookAtTarget: new THREE.Vector3(0, 0, 0), duration: 1.5 },
            { text: "Now you try! Place at least one 'Wall', one 'Strong Block', and all the houses. I'm enabling free camera and build controls now!", duration: 8, action: 'ENABLE_BUILDING' },
            { action: 'WAIT_FOR_PLACEMENT' },
            { pos: new THREE.Vector3(18, 2, -10), camPos: new THREE.Vector3(25, 8, 5), lookAt: new THREE.Vector3(15, 0, -5) },
            { rotY: Math.PI/6 , duration: 1.5 },
            { text: "Great job! When you're ready, press 'DONE' to move to the attack phase.", duration: 8 },
            { action: 'WAIT_FOR_DONE_PRESS' },
            { pos: new THREE.Vector3(0, 5, -80), rotY: -Math.PI/2, text: "Good luck! Now it's the second player's turn.", duration: 4, action: 'FADE_AND_SWITCH' },

            // === ATTACK PHASE ===
            { pos: new THREE.Vector3(25, 2, 0), rotY: 0, camPos: new THREE.Vector3(0, 8, 48), duration: 1.5 },
            { pos: new THREE.Vector3(0, 5, 30), rotY: -Math.PI/4 },
            { pos: new THREE.Vector3(0, 5, 30), rotY: Math.PI/12 },
            { text: "Hello, Player! It's your turn to attack. Let me show you how.", duration: 6 },
            { text: "Down here, you have 3 types of ammo: Base, Punch, and Area. Use them strategically!", duration: 8 },
            { text: "You can aim with W-A-S-D, fire with the spacebar, and toggle the camera view.", duration: 9 },
            { rotY: 5*Math.PI/6, text: "Your goal is to destroy all the houses that the other Player protected. Good luck!", duration: 2 },
            { pos: new THREE.Vector3(25, 2, 0), rotY: -Math.PI / 2, camPos: new THREE.Vector3(0, 8, 48), lookAt: new THREE.Vector3(0, 5, 0), text: "Now it's up to you! Destroy all the houses to complete the tutorial.", duration: 4, action: 'ENABLE_ATTACK' },
            { action: 'WAIT_FOR_HOUSES_DESTROYED' },
            { pos: new THREE.Vector3(0, 5, 20), rotY: Math.PI/36, camPos: new THREE.Vector3(0, 8, 30), text: "Congratulations! You've completed the attack phase.", duration: 4 },
            { rotY: Math.PI,},
            { pos: new THREE.Vector3(0, 5, -80), text: "The tutorial is over. See you next time!", duration: 4 },
            { action: 'FADE_AND_END' }
        ];
    }

    // Initializes the tutorial by loading the robot model and starting the first step
    async start() {
        const localGltfLoader = new GLTFLoader();
        try {
            const gltf = await localGltfLoader.loadAsync('MODEL/robot.glb');
            this.tutorBot = gltf.scene;
            this.tutorBot.scale.setScalar(3.8);
            this.tutorBot.traverse(node => { if (node.isMesh) { node.castShadow = true; } });
        } catch (error) {
            console.error("Failed to load robot model for tutorial, using a fallback cube.", error);
            const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
            const material = new THREE.MeshStandardMaterial({ color: 0x66fcf1, emissive: 0x45a29e });
            this.tutorBot = new THREE.Mesh(geometry, material);
        }

        this.tutorBot.position.set(0, -10, 20);
        this.scene.add(this.tutorBot);
        
        this.textBubble = document.getElementById('tutorial-text-bubble');
        this.fadeOverlay = document.getElementById('fade-overlay');
        this.controls.enabled = false;
        window.addEventListener('pointerdown', this.boundSkipStep);
        this.nextStep();
    }

    /*
        The main update loop for the tutorial, called every frame. It manages the
        state that drives the tutorial forward
    */
    update(delta) {
        if (!this.tutorBot) return;
        
        // Handle Waiting States
        if (this.isWaitingForUser) {
            if (this.checkIfBlocksArePlaced()) {
                this.isWaitingForUser = false;
                this.nextStep();
            }
            return;
        }

        if (this.isWaitingForHousesDestroyed) {
            const collidables = [];
            this.scene.traverse(node => {
                if (node.userData.isWall || node.userData.isHouse || node.userData.isStrongBlock || node.userData.isDecorativeHouse) {
                    collidables.push(node);
                }
            });
            const gridMesh = this.scene.getObjectByName("gridPlatform");
            if (gridMesh) collidables.push(gridMesh);
            
            this.cannonManager.update(delta, collidables);
            this.particleManager.update(delta);

            if (this.checkIfHousesAreDestroyed()) {
                this.isWaitingForHousesDestroyed = false;
                this.isWaitingForParticles = true;
            }
            return;
        }
        
        if (this.isWaitingForParticles) {
            this.particleManager.update(delta);

            if (this.particleManager.areAllParticlesInactive && this.particleManager.areAllParticlesInactive()) {
                this.isWaitingForParticles = false;
                this.nextStep();
            }
            return;
        }

        // Handle Animation and Dialogue 
        if (this.isWaitingForDone) return;
        
        const step = this.tutorialSteps[this.currentStepIndex];
        if (!step) return;

        let motionCompleted = false;

        if (this.isMoving) {
            this.moveProgress += delta * 0.5; // Animation speed
            const easedProgress = easeInOutCubic(Math.min(1, this.moveProgress));
            if (step.pos) this.tutorBot.position.lerpVectors(this.startPosition, this.targetPosition, easedProgress);
            if (step.camPos) this.camera.position.lerpVectors(this.startCamPosition, this.targetCamPosition, easedProgress);
            if (step.lookAt) this.controls.target.lerp(step.lookAt, 0.1);

            if (this.moveProgress >= 1) {
                this.isMoving = false;
                motionCompleted = true;
            }
        }
        
        if (this.isRotating) {
            this.rotationProgress += delta * (step.duration ? 1 / step.duration : 1.5);
            const easedProgress = easeInOutCubic(Math.min(1, this.rotationProgress));
            const newY = this.startRotation.y + (this.targetRotation.y - this.startRotation.y) * easedProgress;
            this.tutorBot.rotation.set(this.startRotation.x, newY, this.startRotation.z);
            
            if (this.rotationProgress >= 1) {
                this.isRotating = false;
                motionCompleted = true;
            }
        }
        
        if (motionCompleted && !this.isMoving && !this.isRotating) {
            // If movement/rotation is done, either show text or move to the next step
            if (step.text) {
                this.isSpeaking = true;
                this.stepTimer = 0;
                this.showText(step.text);
            } else {
                this.nextStep();
            }
            return;
        }
        
        if (this.isSpeaking) {
            this.stepTimer += delta;
            if (step.duration && this.stepTimer >= step.duration) {
                this.isSpeaking = false;
                this.nextStep();
            }
        }

        this.updateBubblePosition();
    }
    
    // Advances the tutorial to the next step in the sequence
    nextStep() {
        this.hideText();
        this.isSpeaking = false;

        if (this.isWaitingForUser || this.isWaitingForDone || this.isWaitingForHousesDestroyed || this.isWaitingForParticles) return;
        
        this.currentStepIndex++;
        if (this.currentStepIndex >= this.tutorialSteps.length) {
            this.dispose();
            return;
        }
        
        const step = this.tutorialSteps[this.currentStepIndex];
        if (!step) return;

        /*
            Special action are like Open/close menus
            Enable building menu
            Wait for user input
            Switch phase 
        */
        if (step.action) {
            const isWaiting = this.handleStepAction(step);
            if (isWaiting) return;
        }

        const hasMovement = step.pos || step.camPos;
        const hasRotation = step.rotY !== undefined || step.lookAtTarget !== undefined;
        const hasText = step.text !== undefined;

        if (step.action && !hasMovement && !hasRotation && !hasText) {
            this.nextStep();
            return;
        }
        
        // Set up animations for the current step
        this.isMoving = hasMovement;
        if (hasMovement) {
            this.moveProgress = 0;
            this.startPosition.copy(this.tutorBot.position);
            this.startCamPosition.copy(this.camera.position);
            if (step.pos) this.targetPosition.copy(step.pos);
            if (step.camPos) this.targetCamPosition.copy(step.camPos);
        }

        this.isRotating = hasRotation;
        if (hasRotation) {
            this.rotationProgress = 0;
            this.startRotation.copy(this.tutorBot.rotation);
            if (step.lookAtTarget) {
                const direction = new THREE.Vector3().subVectors(step.lookAtTarget, this.tutorBot.position);
                this.targetRotation.y = Math.atan2(direction.x, direction.z);
            } else if (step.rotY !== undefined) {
                this.targetRotation.y = step.rotY;
            }
        }
        
        // If there's no animation, just show the tex
        if (!hasMovement && !hasRotation && hasText) {
            this.isSpeaking = true;
            this.stepTimer = 0;
            this.showText(step.text);
        }
    }
    

    /*
        Executes special commands defined in a tutorial step.
        step -> The current tutorial step object.
        return -> True if the action requires the tutorial to pause and wait.
     */
    handleStepAction(step) {
        let isWaitingAction = false;
        
        switch (step.action) {
            case 'OPEN_WALL_MENU':
                document.querySelectorAll('.submenu').forEach(sm => sm.style.display = 'none');
                openSubmenuProgrammatically('wall-submenu');
                setTimeout(() => { openSubmenuProgrammatically('strong-submenu'); }, 1000);
                this.controls.enabled = false;
                break;
            case 'OPEN_HOUSE_MENU':
                setSubmenuState('house-submenu', true);
                this.controls.enabled = false;
                break;
            case 'CLOSE_ALL_MENUS':
                setSubmenuState('build-submenu', false);
                setSubmenuState('house-submenu', false);
                setSubmenuState('wall-submenu', false);
                setSubmenuState('strong-submenu', false);
                this.controls.enabled = false;
                break;
            case 'ENABLE_BUILDING':
                this.controls.enabled = true;
                this.sessionState.isTutorialBuilding = true;
                break;
            case 'WAIT_FOR_PLACEMENT':
                this.isWaitingForUser = true;
                isWaitingAction = true;
                break;
            case 'WAIT_FOR_DONE_PRESS':
                this.sessionState.isTutorialBuilding = false;
                this.isWaitingForDone = true;
                isWaitingAction = true;
                break;
            case 'FADE_AND_SWITCH':
                this.fadeAndSwitchPhase();
                isWaitingAction = true;
                break;
            case 'ENABLE_ATTACK':
                this.cannonManager.startAttackMode();
                break;
            case 'WAIT_FOR_HOUSES_DESTROYED':
                this.isWaitingForHousesDestroyed = true;
                isWaitingAction = true;
                break;
            case 'FADE_AND_END':
                 this.fadeAndEnd();
                 isWaitingAction = true;
                 break;
        }
        return isWaitingAction;
    }

    // Allows the user to skip the text portion of a step by clicking
    skipStep(event) {
        // Only allow skipping dialogue, not animations or waiting periods
        if (event.button !== 0 || this.isMoving || this.isRotating || this.isWaitingForUser || this.isWaitingForDone || !this.isSpeaking || this.isWaitingForHousesDestroyed || this.isWaitingForParticles) {
            return;
        }
        const step = this.tutorialSteps[this.currentStepIndex];
        if (step && step.duration) {
            this.stepTimer = step.duration;  // Fast-forward the timer to end the text display
        }
    }

    /*
        Called from `main.js` when the user presses the 'DONE' button.
        Un-pauses the tutorial if it's in the `isWaitingForDone` state 
    */
    userPressedDone() {
        if (this.isWaitingForDone) {
            this.isWaitingForDone = false;
            this.nextStep();
        }
    }

    // Checks if the player has met the building requirements for the tutorial
    checkIfBlocksArePlaced() {
        const state = this.sessionState;
        const allHousesPlaced = Object.keys(state.limits)
            .filter(k => k.startsWith('house'))
            .every(k => state.placedCounts[k] >= state.limits[k]);
        return state.placedCounts.cube > 0 && state.placedCounts.strong > 0 && allHousesPlaced;
    }

    // Checks if all objective houses have been destroyed
    checkIfHousesAreDestroyed() {
        let houseCount = 0;
        this.scene.traverse(obj => { if (obj.userData.isHouse) { houseCount++; } });
        return houseCount === 0;
    }

    // Manages the screen fade transition between the build and attack phases
    fadeAndSwitchPhase() {
        this.fadeOverlay.style.opacity = '1';
        setTimeout(() => {
            if (this.moveRemoveManager) {
                this.moveRemoveManager.dispose();
            }
            document.getElementById('sidebar').style.display = 'none';
            document.getElementById('game-stats').style.display = 'none';
            document.getElementById('attack-ui').style.display = 'block';
            this.fadeOverlay.style.opacity = '0';
            this.nextStep();
        }, 1000);
    }
    
    // Manages the final fade out at the end of the tutorial
    fadeAndEnd() {
        this.fadeOverlay.style.opacity = '1';
        setTimeout(() => {
            this.dispose();
        }, 1000);
    }

    // Displays the text bubble with the specified message
    showText(text) {
        this.textBubble.textContent = text;
        this.textBubble.style.display = 'block';
    }

    // Hides the text bubble
    hideText() {
        this.textBubble.style.display = 'none';
    }

    // Updates the 2D position of the text bubble to follow the 3D tutor bot
    updateBubblePosition() {
        if (!this.tutorBot || this.textBubble.style.display === 'none') return;
        const pos = new THREE.Vector3();
        const box = new THREE.Box3().setFromObject(this.tutorBot);
        box.getCenter(pos);
        pos.y = box.max.y;
        pos.project(this.camera);
        const width = window.innerWidth, height = window.innerHeight;
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-pos.y * 0.5 + 0.5) * height;
        this.textBubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }

    // Cleans up all resources used by the tutorial manager to prevent memory leaks
    dispose() {
        window.removeEventListener('pointerdown', this.boundSkipStep);
        if (this.tutorBot) this.scene.remove(this.tutorBot);
        this.hideText();
        this.tutorBot = null;
        if (this.onComplete) this.onComplete();
    }
}