import * as THREE from 'https://esm.sh/three@0.150.1';
import { OrbitControls } from 'https://esm.sh/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';
import { Grid } from './grid.js';
import { setupDragAndDrop } from './DragAndDrop.js';
import { setupMoveAndRemove } from './MoveAndRemove.js';
import { CannonManager } from './cannon.js';
import { ParticleManager } from './ParticleManager.js';
import { loadingManager, gltfLoader } from './assets.js';
import { TutorialManager } from './tutorialManager.js';
import { ShaderFireworksManager } from './fireworks.js';

//== Global Variable and State ==
// -- Three.js Components --
let scene, camera, renderer, controls;
let clock = new THREE.Clock();

// -- Game-Specific Managers --
let grid, dragManager, moveRemoveManager, cannonManager, particleManager, tutorialManager, fireworksManager;

// -- Game State --
let gameState = 'MENU'; // Tracks the current phase of the game (e.g., MENU, BUILDING, ATTACKING)
let victoryTimer = 0; // Timer for the victory sequence duration.

// -- Game Assets --
let trophyModel = null;
let gameOverBot = null;

// --- Elementi UI ---
const loadingScreen = document.getElementById('loading-screen');
const mainMenu = document.getElementById('main-menu');
const difficultySelection = document.getElementById('difficulty-selection');
const playContainer = document.getElementById('play-container');
const gameStatsUI = document.getElementById('game-stats');
const sidebarUI = document.getElementById('sidebar');
const attackUI = document.getElementById('attack-ui');
const customAlertOverlay = document.getElementById('custom-alert-overlay');
const fadeOverlay = document.getElementById('fade-overlay');

// -- Player and Session Data --
const sessionState = {
    difficulty: 'EASY',
    money: 1000,
    costs: {
        cube: 1,
        strong: 2,
        house_h2: 0,
        house_h4: 0,
        house_h6: 0,
    },
    limits: {
        house_h2: 1,
        house_h4: 1,
        house_h6: 1,
    },
    placedCounts: {
        cube: 0,
        strong: 0,
        house_h2: 0,
        house_h4: 0,
        house_h6: 0,
    },
    buildBrush: {
        cube: { h: 1, w: 1, d: 1 },
        strong: { h: 1, w: 1, d: 1 }
    }
};

const attackState = {
    money: 100,
    selectedBall: 'base'
};

// -- Player Controls --
const moveKeys = { w: false, a: false, s: false, d: false, q: false, e: false, r: false, f: false };
const moveSpeed = 0.5;
const rotateStep = 0.04;

// -- Decorative Scenery Data --
const decorativeHousesData = [
    {
        path: 'MODEL/decorative_house1.glb',
        id: 'house1',
        position: new THREE.Vector3(-35, 6.2, -15),
        rotationY: Math.PI / 6,
        scale: 1,
        exclusionRadius: 8
    },
    {
        path: 'MODEL/decorative_house2.glb',
        id: 'house2',
        position: new THREE.Vector3(40, 0, 10),
        rotationY: -Math.PI / 8,
        scale: 0.15,
        exclusionRadius: 8
    }
];

//== LOADING SCREEN ==

// Handles actions to be performed when all assets are loaded.
loadingManager.onLoad = function () {
    console.log('Main loading complete!');
    loadingScreen.style.display = 'none';
    mainMenu.style.display = 'block';
    startHomepageAnimation();
    initMenu();
};
/*
  Handles actions when loading begins.
  url -> The URL of the file being loaded.
  itemsLoaded -> The number of items loaded so far.
  itemsTotal -> The total number of items to load.
 */
loadingManager.onStart = function (url, itemsLoaded, itemsTotal) {
    console.log(`Started loading: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`);
    document.body.classList.add('loading');
};

/*
  Handles errors that occur during loading.
  url - The URL of the file that failed to load.
 */
loadingManager.onError = function (url) {
    console.error(`Error while loading ${url}`);
};

//== INITIALIZATION ==
/*
  Main initialization function. Sets up the scene, camera, renderer,
  lights, and all game managers
 */
function init() {
    // -- Scene and Camera --
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);

    // -- Render --
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x1a1a1d);
    document.body.appendChild(renderer.domElement);
    
    // -- Lighting --
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(-50, 40, 40);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    const shadowAreaSize = 60;
    directionalLight.shadow.camera.left = -shadowAreaSize;
    directionalLight.shadow.camera.right = shadowAreaSize;
    directionalLight.shadow.camera.top = shadowAreaSize;
    directionalLight.shadow.camera.bottom = -shadowAreaSize;
    scene.add(directionalLight);
    
    // -- Game Managers --
    grid = new Grid(scene);
    grid.getPlaneMesh().userData.isGround = true;
    particleManager = new ParticleManager(scene);
    fireworksManager = new ShaderFireworksManager(scene);
    dragManager = setupDragAndDrop({ scene, camera, renderer, grid, getControls: () => controls, getGameState: () => gameState, sessionState, updateUI });
    moveRemoveManager = setupMoveAndRemove({ scene, camera, renderer, grid, dragManager, sessionState, updateUI });
    const cellSize = grid.buildAreaSize / grid.divisions;
    cannonManager = new CannonManager(scene, camera, () => controls, () => attackState, updateUI, cellSize, particleManager);
    cannonManager.load();

    // -- Scenery and Assets --
    setupScenery(scene, grid.platformSize / 2, grid.buildAreaSize / 2);
    setupDecorativeHouses(scene);

    // -- Event Listeners and UI --
    window.addEventListener('keydown', e => { (e.key.toLowerCase() in moveKeys) && (moveKeys[e.key.toLowerCase()] = true); });
    window.addEventListener('keyup', e => { (e.key.toLowerCase() in moveKeys) && (moveKeys[e.key.toLowerCase()] = false); });

    // -- Load Model --
    gltfLoader.load('MODEL/trophy.glb', (gltf) => {
        trophyModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(trophyModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = 5 / size.y;
        trophyModel.scale.set(scale, scale, scale);
        trophyModel.traverse(node => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });
    }, undefined, (error) => {
        console.error('An error occurred while loading the trophy model:', error);
    });

    gltfLoader.load('MODEL/robot.glb', (gltf) => {
        gameOverBot = gltf.scene;
        gameOverBot.scale.setScalar(3.8);
        gameOverBot.traverse(node => { if (node.isMesh) { node.castShadow = true; } });
        gameOverBot.visible = false; // will appear only when is necessary
        scene.add(gameOverBot);
    }, undefined, (error) => {
        console.error('Failed to preload game over robot:', error);
        // fallback in case of fail
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const material = new THREE.MeshStandardMaterial({ color: 0x66fcf1 });
        gameOverBot = new THREE.Mesh(geometry, material);
        gameOverBot.visible = false;
        scene.add(gameOverBot);
    });

    initUI();
}

// == GAME ==
// Main animation, called every frame
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // The game loop is controlled by the current `gameState`
    switch (gameState) {
        case 'TUTORIAL':
            if (tutorialManager) tutorialManager.update(delta);
            if (controls && (!cannonManager || cannonManager.cameraMode !== 'first-person')) {
                controls.update();
            }
            break;

        case 'BUILDING':
            keyboardControl();
            if (controls) controls.update();
            break;

        case 'ATTACKING':
            updateAttackPhase(delta);
            break;

        case 'VICTORY_PENDING':
            particleManager.update(delta);
            // Wait for particles to finish before triggering victory
            if (particleManager.areAllParticlesInactive()) {
                triggerVictorySequence();
            }
            renderer.render(scene, camera);
            break;

        case 'VICTORY':
            updateVictorySequence(delta);
            break;

        case 'GAME_OVER':
            updateGameOverBubblePosition();
            break;
    }

    renderer.render(scene, camera);
}

/*
Handles all logic for the 'ATTACKING' game state.
delta - Time elapsed since the last frame.
 */
function updateAttackPhase(delta) {
    const collidables = [];
    scene.traverse(node => {
        if (node.userData.isWall || node.userData.isHouse || node.userData.isStrongBlock || node.userData.isDecorativeHouse) {
            collidables.push(node);
        }
    });
    collidables.push(grid.getPlaneMesh());

    if (cannonManager) {
        cannonManager.update(delta, collidables);
        if (cannonManager.cameraMode === 'third-person' && controls) {
            controls.update();
        }
    }
    particleManager.update(delta);

    if (checkIfAllHousesAreDestroyed()) {
        console.log("All houses destroyed. Waiting for particle animations to finish...");
        gameState = 'VICTORY_PENDING';
    } else {
        // Check for game over condition
        const cheapestBallCost = cannonManager.ballTypes.base.cost;
        if (attackState.money < cheapestBallCost && cannonManager.activeProjectiles.length === 0) {
            console.log("Game Over: Out of ammo and projectiles.");
            triggerGameOverSequence();
        }
    }
}

/*
Handles the logic and animations for the 'VICTORY' game state.
delta - Time elapsed since the last frame.
 */
function updateVictorySequence(delta) {
    victoryTimer += delta;

    if (trophyModel) {
        if (trophyModel.position.y < 5) trophyModel.position.y += 8 * delta;
        trophyModel.rotation.y += 0.4 * delta;
    }

    if (fireworksManager) fireworksManager.update();
    if (controls) controls.update();

    // After 8 seconds, fade out and reload the page
    if (victoryTimer > 8 && !document.body.classList.contains('fading-out')) {
        document.body.classList.add('fading-out');
        if (fireworksManager) fireworksManager.stop();

        fadeOverlay.style.transition = 'opacity 1.5s ease-in-out';
        fadeOverlay.style.opacity = 1;

        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }
}

// == GAME STATE TRANSITIONS ==
// Starts the main game after difficulty selection
function startGame() {
    gameState = 'BUILDING';
    mainMenu.style.display = 'none';
    scene.background = new THREE.Color(0x87CEEB);
    renderer.setClearColor(0x87CEEB);
    gameStatsUI.style.display = 'block';
    sidebarUI.style.display = 'block';
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
}

// Starts the tutorial mode
function startTutorial() {
    gameState = 'TUTORIAL';
    mainMenu.style.display = 'none';
    scene.background = new THREE.Color(0x87CEEB);
    renderer.setClearColor(0x87CEEB);
    gameStatsUI.style.display = 'block';
    sidebarUI.style.display = 'block';
    attackUI.style.display = 'none';

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    tutorialManager = new TutorialManager(scene, camera, controls, sessionState, cannonManager, particleManager, moveRemoveManager, () => {
        console.log("Tutorial completed!");
        window.location.reload();
    });
    tutorialManager.start();
}

// Transitions the game from the BUILDING phase to the ATTACK phase
/*
async is used to enable the use of await in your code: 
it doesn't block the execution thread and preserves 
the state of variables
*/ 
async function startAttackPhase() {
    if (gameState === 'TUTORIAL' && tutorialManager) {
        tutorialManager.userPressedDone();
        return;
    }

    const allMandatoryPlaced = Object.keys(sessionState.limits).every(type => {
        if (!type.startsWith('house')) return true;
        return sessionState.placedCounts[type] >= sessionState.limits[type];
    });
    if (!allMandatoryPlaced) {
        alert("You must place all mandatory blocks before continuing!");
        return;
    }

    const overlay = document.getElementById('fade-overlay');
    const duration = 500;
    overlay.style.transition = `opacity ${duration / 1000}s ease-in-out`;
    overlay.style.opacity = 1;
    await new Promise(resolve => setTimeout(resolve, duration));

    console.log("Switching to ATTACK mode...");
    gameState = 'ATTACKING';
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('game-stats').style.display = 'none';
    attackUI.style.display = 'block';

    moveRemoveManager.dispose();
    controls.enabled = true;
    Object.keys(moveKeys).forEach(k => moveKeys[k] = false);

    camera.position.set(0, 8, 48);
    camera.lookAt(0, 5, 0);
    controls.target.set(0, 5, 0);
    cannonManager.startAttackMode();
    overlay.style.opacity = 0;
}

// Initiates the victory sequence
function triggerVictorySequence() {
    if (gameState === 'TUTORIAL') return;
    
    gameState = 'VICTORY';
    victoryTimer = 0;
    console.log("Victory! Starting Shader-based fireworks sequence.");

    if (controls) {
        controls.enabled = true;
    }

    document.getElementById('attack-ui').style.display = 'none';
    document.getElementById('power-bar-container').style.display = 'none';

    if (trophyModel) {
        trophyModel.position.set(0, -20, -30);
        trophyModel.rotation.y = 0;
        scene.add(trophyModel);
    }
    
    if (fireworksManager) {
        fireworksManager.start();
    }
}

// Initiates the game over sequence
function triggerGameOverSequence() {
    if (gameState !== 'ATTACKING') return;
    gameState = 'GAME_OVER';

    if (controls) controls.enabled = false;
    attackUI.style.display = 'none';
    document.getElementById('power-bar-container').style.display = 'none';
    
    if (gameOverBot) {
        // Posiziona il robot di fronte alla telecamera
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const robotPosition = camera.position.clone().add(cameraDirection.multiplyScalar(20));
        robotPosition.y = 1; 
        gameOverBot.position.copy(robotPosition);
        gameOverBot.lookAt(camera.position);
        gameOverBot.visible = true;

        const textBubble = document.getElementById('tutorial-text-bubble');
        textBubble.textContent = "You ran out of money and didn't destroy all the houses. You lost!";
        textBubble.style.display = 'block';
        updateGameOverBubblePosition();
    }

    setTimeout(() => {
        const fadeOverlay = document.getElementById('fade-overlay');
        fadeOverlay.style.transition = 'opacity 1.5s ease-in-out';
        fadeOverlay.style.opacity = 1;
        setTimeout(() => window.location.reload(), 1500);
    }, 5000); // Message for 5 sec
}

// == UI and Event == 
// Initializes all UI and event listener
function initUI(){
    // Sidebar toggles
	document.querySelectorAll('.toggle').forEach(el => {
        el.addEventListener('click', () => {
            const targetId = el.dataset.target;
            const targetSubmenu = document.getElementById(targetId);
            const isAlreadyOpen = targetSubmenu.style.display === 'flex';
            document.querySelectorAll('.submenu').forEach(submenu => {
                submenu.style.display = 'none';
            });
            if (!isAlreadyOpen) {
                targetSubmenu.style.display = 'flex';
            }
        });
    });

    // Dimensions of Block controls
    document.querySelectorAll('.dim-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const dim = btn.dataset.dim;
            const op = btn.dataset.op;
            const currentValue = sessionState.buildBrush[type][dim];
            
            let newValue = currentValue;
            if (op === '+') {
                newValue = Math.min(10, currentValue + 1);
            } else {
                newValue = Math.max(1, currentValue - 1);
            }
            sessionState.buildBrush[type][dim] = newValue;
            updateUI();
        });
    });

    // Preview canvas
    document.querySelectorAll('.preview, .mini-preview, .ball-preview').forEach(canvas => {
		initPreviewCanvas(canvas, dragManager.startDrag);
	});

    // Ball selector
    document.querySelectorAll('.ball-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.ball-option').forEach(opt => opt.classList.remove('selected'));
            el.classList.add('selected');
            attackState.selectedBall = el.dataset.ballType;
            console.log(`Proiettile selezionato: ${attackState.selectedBall}`);
        });
    });

    // Event Lister for DONE button
	document.getElementById('done-button').addEventListener('click', startAttackPhase);

    // Event Listener for First/Third person
    document.getElementById('toggle-view-btn').addEventListener('click', () => {
        if (cannonManager) {
            cannonManager.toggleCameraView();
        }
    });
    // for closing pop-up 
    document.getElementById('custom-alert-close-btn').addEventListener('click', () => {
        customAlertOverlay.style.display = 'none';
    });
    customAlertOverlay.addEventListener('click', (e) => {
        if(e.target === customAlertOverlay) {
            customAlertOverlay.style.display = 'none';
        }
    });
}

// Initializes Menu button
function initMenu() {
    document.getElementById('easy-btn').addEventListener('click', () => selectDifficulty('EASY'));
    document.getElementById('tutorial-btn').addEventListener('click', startTutorial);
    document.getElementById('hard-btn').addEventListener('click', () => selectDifficulty('HARD'));
    document.getElementById('play-btn').addEventListener('click', startGame);
}

// Updates all UI displays with the latest game state data
function updateUI() {
    document.getElementById('money-display').textContent = sessionState.money;
    document.getElementById('cube-count').textContent = sessionState.placedCounts.cube;
    document.getElementById('strong-count').textContent = sessionState.placedCounts.strong;

    // Update brush dimension displays -> create CUBE etc
    for (const type in sessionState.buildBrush) {
        for (const dim in sessionState.buildBrush[type]) {
            const display = document.getElementById(`${type}-${dim}-display`);
            if (display) display.textContent = sessionState.buildBrush[type][dim];
        }
    }

    // Update mandatory items -> chage the color
    const mandatoryItemsContainer = document.getElementById('mandatory-items');
    mandatoryItemsContainer.className = `difficulty-${sessionState.difficulty.toLowerCase()}`;
    document.querySelectorAll('.mandatory-item').forEach(item => {
        const type = item.dataset.type;
        const limit = sessionState.limits[type] || 0;
        const count = sessionState.placedCounts[type] || 0;
        if (item.dataset.req) {
            const requiredCount = parseInt(item.dataset.req, 10);
            const isFulfilled = count >= requiredCount;
            item.classList.toggle('status-green', isFulfilled);
            item.classList.toggle('status-red', !isFulfilled);
        } else {
            const isFulfilled = count >= limit;
            item.classList.toggle('status-green', isFulfilled);
            item.classList.toggle('status-red', !isFulfilled);
        }
    });
    for (const type in sessionState.limits) {
        if (type.startsWith('house')) {
            const countDisplay = document.getElementById(`${type}-count`);
            if(countDisplay) countDisplay.textContent = `${sessionState.placedCounts[type]}/${sessionState.limits[type]}`;
        }
    }

    // Update attack phase UI
    const attackMoneyDisplay = document.getElementById('attack-money-display');
    if (attackMoneyDisplay) attackMoneyDisplay.textContent = attackState.money;

    const ballOptions = document.querySelectorAll('.ball-option');
    if (ballOptions.length > 0) {
        ballOptions[0].querySelector('span').textContent = `Base (${cannonManager.ballTypes.base.cost}$)`;
        ballOptions[1].querySelector('span').textContent = `Area (${cannonManager.ballTypes.area.cost}$)`;
        ballOptions[2].querySelector('span').textContent = `Perforante (${cannonManager.ballTypes.punch.cost}$)`;
    }
}

/*
Initializes a small 3D preview canvas for an item.
canvas - The canvas element to render on.
onClick - The callback function to execute on click.
 */
function initPreviewCanvas(c, onClick) {
    const type = c.dataset.type;
    if (!type) return;

    // Setup a mini-scene for the preview
    const previewLoader = new GLTFLoader();
    const previewTextureLoader = new THREE.TextureLoader();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
    
    if (c.clientWidth === 0 || c.clientHeight === 0) {
        setTimeout(() => initPreviewCanvas(c, onClick), 100);
        return;
    }

    renderer.setSize(c.clientWidth, c.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    let previewObject;

    // Function to frame the object in the preview camera
    const frameObject = (target, scaleFactor = 1.5) => {
        const box = new THREE.Box3().setFromObject(target);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= scaleFactor;
        camera.position.set(center.x, center.y, center.z + cameraZ);
        camera.lookAt(center);
    };

    // For rotate the object
    (function loop() {
        if (previewObject) previewObject.rotation.y += 0.01;
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    })();
    
    // Load the appropriate model or create a primitive based on type
    if (type.startsWith('house_h')) {
        const height = type.split('_h')[1];
		const houseModelPaths = { '2': 'MODEL/2H_house.glb', '4': 'MODEL/4H_house.glb', '6': 'MODEL/6H_house.glb' };
		previewLoader.load(houseModelPaths[height], (gltf) => {
			previewObject = gltf.scene;
			scene.add(previewObject);
			frameObject(previewObject);
		});
    } else if (type === 'base' || type === 'punch' || type === 'area') {
		const geometry = new THREE.SphereGeometry(1, 16, 16);
		let material;
		if (type === 'punch') {
            material = new THREE.MeshStandardMaterial({
                color: 0xff8c00,
                emissive: 0xffa500,
                emissiveIntensity: 1.5
            });
        } else {
			const textures = {
				base: 'TEXTURE/CANNONBALL.png',
				area: 'TEXTURE/AREA_CANNONBALL.png'
			};
			material = new THREE.MeshStandardMaterial({ map: previewTextureLoader.load(textures[type]) });
		}
		previewObject = new THREE.Mesh(geometry, material);
		scene.add(previewObject);
		frameObject(previewObject, 2.5);
    } else {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        let map;
        if (type === 'cube') { map = previewTextureLoader.load('TEXTURE/DIRT.png'); } 
        else if (type === 'strong') { map = previewTextureLoader.load('TEXTURE/STONE.png'); }
        const material = new THREE.MeshStandardMaterial({ map: map });
        previewObject = new THREE.Mesh(geometry, material);
        scene.add(previewObject);
        frameObject(previewObject, 2.0);
    }
    
    // Attach click listener if it's a main build preview
    if(c.classList.contains('preview')) {
        c.addEventListener('pointerdown', e => onClick(type, e));
    }
}

// == HELPER FUNCTION == 
// Handles keyboard controls for camera movement during the build phase
function keyboardControl(){
	const dir = new THREE.Vector3();
	if (moveKeys.w) dir.z -= 1; if (moveKeys.s) dir.z += 1;
	if (moveKeys.a) dir.x -= 1; if (moveKeys.d) dir.x += 1;

	if (dir.lengthSq() > 0) {
		dir.normalize().applyQuaternion(camera.quaternion);
		camera.position.addScaledVector(dir, moveSpeed);
		controls.target.addScaledVector(dir, moveSpeed);
	}

	if (moveKeys.q) rotateAroundTarget(new THREE.Vector3(0, 1, 0),  rotateStep);
	if (moveKeys.e) rotateAroundTarget(new THREE.Vector3(0, 1, 0), -rotateStep);
	
    const right = new THREE.Vector3().crossVectors(camera.up, new THREE.Vector3().subVectors(camera.position, controls.target)).normalize();
	if (moveKeys.r) rotateAroundTarget(right,  rotateStep);
	if (moveKeys.f) rotateAroundTarget(right, -rotateStep);
}

/*
    Rotates the camera around its target point.
    axis -> The axis to rotate around.
    angle -> The angle to rotate by.
 */
function rotateAroundTarget(axis, angle){
	const pos = camera.position.clone().sub(controls.target);
	pos.applyAxisAngle(axis, angle);
	camera.position.copy(controls.target).add(pos);
	camera.lookAt(controls.target);
}

/*
    Populates the scene with procedurally placed decorative meshes.
    scene -> The main scene.
    platformRadius -> The radius of the entire circular platform.
    gridExclusionRadius -> The radius of the central build area to exclude.
 */
function setupScenery(scene, platformRadius, gridExclusionRadius) {
    const sceneryItems = [
        { path: 'MODEL/tree1.glb', count: 300, minScale: 5.5, maxScale: 7.0 },
        { path: 'MODEL/tree1.glb', count: 350, minScale: 4.0, maxScale: 5.0 },
        { path: 'MODEL/stone.glb', count: 200, minScale: 1.3, maxScale: 1.8 },
        { path: 'MODEL/grass.glb', count: 4000, minScale: 1.0, maxScale: 1.5 },
        { path: 'MODEL/flower.glb', count: 1000, minScale: 0.8, maxScale: 1.2 }
    ];

    const houseExclusionZones = decorativeHousesData.map(data => ({
        pos: new THREE.Vector2(data.position.x, data.position.z),
        radiusSq: data.exclusionRadius * data.exclusionRadius
    }));

    sceneryItems.forEach(item => {
        gltfLoader.load(item.path, (gltf) => {
            let sourceMesh = null;
            gltf.scene.traverse(child => { if (child.isMesh) sourceMesh = child; });

            if (!sourceMesh) {
                console.error(`Model  ${item.path} does not contain a valid Mesh`);
                return;
            }
            const box = new THREE.Box3().setFromObject(sourceMesh);
            const size = box.getSize(new THREE.Vector3());
            const maxSize = Math.max(size.x, size.y, size.z);
            if (maxSize > 0) {
                 sourceMesh.geometry.scale(1.0 / maxSize, 1.0 / maxSize, 1.0 / maxSize);
            }
            
            sourceMesh.castShadow = true;
            const instancedMesh = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, item.count);
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            scene.add(instancedMesh);

            const dummy = new THREE.Object3D();
            const cannonPos = new THREE.Vector2(0, 30);
            const cannonExclusionRadiusSq = 14 * 14;

            for (let i = 0; i < item.count; i++) {
                let x, z, posVec2, isInvalid;
                
                do {
                    const r = Math.sqrt(Math.random()) * platformRadius;
                    const theta = Math.random() * 2 * Math.PI;
                    x = r * Math.cos(theta);
                    z = r * Math.sin(theta);
                    posVec2 = new THREE.Vector2(x, z);

                    const isInsideGrid = (Math.abs(x) < gridExclusionRadius && Math.abs(z) < gridExclusionRadius);
                    const isNearCannon = (posVec2.distanceToSquared(cannonPos) < cannonExclusionRadiusSq);
                    const isNearHouse = houseExclusionZones.some(zone =>
                        posVec2.distanceToSquared(zone.pos) < zone.radiusSq
                    );
                    isInvalid = isInsideGrid || isNearCannon || isNearHouse;
                } while (isInvalid);
                
                dummy.position.set(x, 0, z);
                dummy.rotation.y = Math.random() * 2 * Math.PI;
                const scale = item.minScale + Math.random() * (item.maxScale - item.minScale);
                dummy.scale.setScalar(scale);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
            }
        });
    });
}

/*
    Loads and places decorative house models around the main play area.
    scene - The main scene.
 */
function setupDecorativeHouses(scene) {
    decorativeHousesData.forEach(data => {
        gltfLoader.load(data.path, (gltf) => {
            const model = gltf.scene;
            model.traverse(node => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            // for the house1 there is an hitbox beacuse is the EASTEREGG of game
            if (data.id === 'house1') {
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                const hitboxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
                const hitboxMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
                const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
                model.position.sub(center);
                hitbox.add(model);
                hitbox.position.copy(data.position);
                hitbox.rotation.y = data.rotationY;
                hitbox.scale.setScalar(data.scale);
                hitbox.userData = { isDecorativeHouse: true, houseId: data.id };
                scene.add(hitbox);
            } else {
                model.position.copy(data.position);
                model.rotation.y = data.rotationY;
                model.scale.setScalar(data.scale);
                model.userData = { isDecorativeHouse: true, houseId: data.id };
                scene.add(model);
            }
        });
    });
}

// Animate the main menu elemets
function startHomepageAnimation() {
    const cannon = document.getElementById('cannon-img');
    const castle = document.getElementById('castle-img');
    const cannonball = document.getElementById('ball-img');
    const kaboom = document.getElementById('kaboom-img');
    const buttons = document.getElementById('difficulty-selection');
    
    setTimeout(() => {
        cannon.classList.add('recoil');
        cannonball.classList.add('fire');

        setTimeout(() => {
            cannonball.style.display = 'none';
            kaboom.classList.add('explode');
            castle.classList.add('castle-hit-effect');

            setTimeout(() => {
                kaboom.style.display = 'none';
                buttons.classList.add('buttons-fade-in');

            }, 300);

        }, 1300);

    }, 1200);
}

/*
    Checks if all player-built houses have been destroyed.
    return -> True if no houses remain, false otherwise.
 */
function checkIfAllHousesAreDestroyed() {
    if (gameState !== 'ATTACKING') return false;

    let houseCount = 0;
    scene.traverse(obj => {
        if (obj.userData && obj.userData.isHouse) {
            houseCount++;
        }
    });
    return houseCount === 0;
}

/*
    Updates the game state based on the selected difficulty.
    difficulty -> The selected difficulty ('EASY' or 'HARD').
 */
function selectDifficulty(difficulty) {
    sessionState.difficulty = difficulty;
    if (difficulty === 'EASY') {
        sessionState.money = 200;
        attackState.money = 60;
        sessionState.limits = { house_h2: 1, house_h4: 1, house_h6: 1 };
    } else if (difficulty === 'HARD') {
        sessionState.money = 150;
        attackState.money = 50;
        sessionState.limits = { house_h2: 2, house_h4: 2, house_h6: 1 };
    }
    console.log(`Difficulty set: ${difficulty}`);
    updateUI();
    
    // Logic for show PLAY button
    difficultySelection.style.display = 'none';
    playContainer.style.display = 'flex';
}

// Updates the position of the game over text bubble to follow the robot model (for GameOver)
function updateGameOverBubblePosition() {
    if (!gameOverBot || !gameOverBot.visible) return;
    const textBubble = document.getElementById('tutorial-text-bubble');
    if (textBubble.style.display === 'none') return;

    const pos = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(gameOverBot);
    box.getCenter(pos);
    pos.y = box.max.y;
    pos.project(camera);

    const width = window.innerWidth, height = window.innerHeight;
    const x = (pos.x * 0.5 + 0.5) * width;
    const y = (-pos.y * 0.5 + 0.5) * height;
    textBubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
}

// Start Everithing
init();
animate();