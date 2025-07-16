// cannon.js
import * as THREE from 'https://esm.sh/three@0.150.1';
import { getObjectSpans, computeTargetY } from './Gravity.js';
import { Fireball } from './Fireball.js';
import { gltfLoader, textureLoader } from './assets.js';

/*
    Normalizes a model's size to a target dimension and centers its pivot.
    This helper function ensures that loaded models have a consistent scale and origin.
    gltfScene -> The scene group from a loaded GLTF model.
    targetSize -> The desired maximum dimension (width, height, or depth) for the model.
    returns -> A new wrapper group containing the scaled and centered model.
 */
function normalizeAndCenterModel(gltfScene, targetSize) { 
    const box = new THREE.Box3().setFromObject(gltfScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = targetSize / maxSize;

    // First, move the model's geometry so its center is at the origin (0,0,0).
    // Then, apply the calculated scale.
    gltfScene.position.sub(center).multiplyScalar(scale);
    gltfScene.scale.set(scale, scale, scale);

    // Return the model inside a new wrapper group. This prevents transform
    // issues with the original loaded scene object.
    const wrapper = new THREE.Group();
    wrapper.add(gltfScene);
    return wrapper;
}

// Pre-load textures for different projectile types
const cannonballTexture = textureLoader.load('TEXTURE/CANNONBALL.png');
const punchballTexture = textureLoader.load('TEXTURE/PUNCH_CANNONBALL.png');
const areaballTexture = textureLoader.load('TEXTURE/AREA_CANNONBALL.png');

/*
    Manages the player's cannon, including its model, controls, firing logic,
    and projectile physics during the attack phase.
 */
export class CannonManager {
    constructor(scene, camera, getControls, getAttackState, updateUIAttack, cellSize, particleManager) {
        this.scene = scene;
        this.camera = camera;
        this.getControls = getControls; // Function to get the latest OrbitControls instance
        
        // State Management
        this.getAttackState = getAttackState; // Function to get the attack phase state (money, selected ball)
        this.updateUIAttack = updateUIAttack; // Function to update the UI

        // For smoke and fire particle
        this.particleManager = particleManager;

        // Cannon Model & Assembly 
        this.cannonAssembly = new THREE.Group();            // The root object for the entire cannon
        this.yawAssembly = new THREE.Group();               // Rotates horizontally (left/right)
        this.pitchAssembly = new THREE.Group();             // Rotates vertically (up/down)
        this.cannonModel = null;                            // The main cannon barrel model
        this.muzzle = new THREE.Object3D();                 // An invisible object marking the barrel's tip
        this.firstPersonViewAnchor = new THREE.Object3D();  // Anchor point for the first-person camera
        this.cannonAssembly.rotation.y = Math.PI;           // Correct position of model gear
        this.sideGears = [];

        // Camera control
        this.cameraMode = 'third-person';
        this.thirdPersonCameraPos = new THREE.Vector3(); // Stores camera position for third-person view
        this.thirdPersonTarget = new THREE.Vector3();    // Stores camera target for third-person view

        // Player Input 
        this.keys = { w: false, a: false, s: false, d: false, c: false };
        this.boundHandleKeyDown = this._handleKeyDown.bind(this);
        this.boundHandleKeyUp = this._handleKeyUp.bind(this);

        // Firing Mechanics
        this.isCharging = false; 
        this.chargePower = 0;
        this.powerBar = document.getElementById('power-bar');
        this.powerBarContainer = document.getElementById('power-bar-container');
        this.ballTypes = {
            base: { cost: 1, type: 'standard' },
            punch: { cost: 10, type: 'fireball' },
            area: { cost: 5, type: 'standard' }
        };

        // Projectile and Phisics
        this.activeProjectiles = [];
        this.projectileGeometry = new THREE.SphereGeometry(0.4,16,16);
        this.gravity = new THREE.Vector3(0,-9.8,0);
        this.FIXED_TIME_STEP = 1/60;
        this.physicsAccumulator = 0;

        // Gravity Destruction
        this.fallingBlocks = [];
        this.cellSize = cellSize;
    }
    
    // Asynchronously loads all 3D models required for the cannon and assembles them
    async load() {
        console.log('[Cannon] caricamento modelli');
        try {
            // Load all models in parallel
            const [baseGltf, gearGltf, cannonGltf] = await Promise.all([
                gltfLoader.loadAsync('MODEL/COBBLESTONE_BASE.glb'),
                gltfLoader.loadAsync('MODEL/METAL_GEAR.glb'),
                gltfLoader.loadAsync('MODEL/CANNON.glb')
            ]);
            const enableShadows = (root) => { root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } }); };

            // Normalize and Configure each part
            const normalizedBase = normalizeAndCenterModel(baseGltf.scene, 8);
            const horizontalGear = normalizeAndCenterModel(gearGltf.scene, 6);
            this.cannonModel = normalizeAndCenterModel(cannonGltf.scene, 5);

            // For activate the shadows
            enableShadows(normalizedBase); 
            enableShadows(horizontalGear); 
            enableShadows(this.cannonModel);


            const sideGearL = horizontalGear.clone(); 
            sideGearL.scale.setScalar(0.4);
            const sideGearR = sideGearL.clone(); 
            
            // Assemble the cannon Hierarchy
            // the stand base
            this.cannonAssembly.add(normalizedBase);
            const baseBox = new THREE.Box3().setFromObject(normalizedBase);
            const baseSize = baseBox.getSize(new THREE.Vector3());

            // Yaw assembly (rotates horizontally)
            this.yawAssembly.position.y = baseSize.y / 2;
            this.cannonAssembly.add(this.yawAssembly);
            horizontalGear.rotation.z = Math.PI / 2;
            this.yawAssembly.add(this.pitchAssembly);
            const hGearBox = new THREE.Box3().setFromObject(horizontalGear);
            const hGearSize = hGearBox.getSize(new THREE.Vector3());

            // Pitch Assembly (rotates vertically)
            this.pitchAssembly.position.y = hGearSize.y / 2 + 1.4;
            this.pitchAssembly.add(this.cannonModel, sideGearL, sideGearR);

            this.yawAssembly.add(horizontalGear);
            this.sideGears.push(sideGearL, sideGearR);
            
            // Position gear and muzzle
            const cannonBox = new THREE.Box3().setFromObject(this.cannonModel);
            const cannonSize = cannonBox.getSize(new THREE.Vector3());
            sideGearL.position.x = -cannonSize.x / 2;
            sideGearR.position.x = cannonSize.x / 2;
            this.muzzle.position.set(0, cannonSize.y * 0.25, -cannonSize.z / 2);
            this.cannonModel.add(this.muzzle);

            // Position the entire cannon assembly in the world
            this.cannonAssembly.position.set(0, 0, 35);
            this.scene.add(this.cannonAssembly);

            // First person camera anchor
            this.pitchAssembly.add(this.firstPersonViewAnchor);
            this.firstPersonViewAnchor.position.set(0, 2.2, 0.2);
            this.firstPersonViewAnchor.rotation.y = Math.PI
            console.log('[Cannon] modelli caricati');
        } catch (err) {
            console.error('[Cannon] ERRORE caricamento modelli:', err);
        }
    }
    
    // Activates the cannon's controls for the attack phase
    startAttackMode() {
        this._setupAttackControls();
        this.powerBarContainer.style.display = 'block';
    }

    /*
        Main update loop for the cannon, called every frame.
        delta -> Time elapsed since the last frame.
        collidables -> A list of objects that can be hit.
     */
    update(delta, collidables) {
        this.collidables = collidables;
        this._updateCannonAim(delta);

        //Use a fixed timestep for physics calculations to ensure stability
        this.physicsAccumulator += delta;
        while (this.physicsAccumulator >= this.FIXED_TIME_STEP) {
            this._updateProjectiles(this.FIXED_TIME_STEP);
            this.physicsAccumulator -= this.FIXED_TIME_STEP;
        }
        this._updateFallingBlocks(delta);
    }

    // Toggles the camera between firtst-person and third-person view
    toggleCameraView() {
        const btn = document.getElementById('toggle-view-btn');
        const controls = this.getControls();
        if (!controls) {
            console.error("Controlli non inizializzati");
            return;
        }

        if (this.cameraMode === 'third-person') {
            this.cameraMode = 'first-person';
            if (btn) btn.textContent = 'Terza Persona';

            // Save current third-person view
            this.thirdPersonCameraPos.copy(this.camera.position);
            this.thirdPersonTarget.copy(controls.target);
            controls.enabled = false;

            // Attach camera to the first-person anchor on the cannon
            this.firstPersonViewAnchor.add(this.camera);
            this.camera.position.set(0, 0, 0);
            this.camera.rotation.set(0, 0, 0);
        } else {
            this.cameraMode = 'third-person';
            if (btn) btn.textContent = 'Prima Persona';

            // Detach camera and restore third-person view
            this.firstPersonViewAnchor.remove(this.camera);
            this.camera.position.copy(this.thirdPersonCameraPos);
            controls.target.copy(this.thirdPersonTarget);
            controls.enabled = true;
        }
    }

    // == PRIVATE INTERNALS METHOD == 
    // Sets up keyboard event lister for aiming and firing
    _setupAttackControls() {
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);
    }

    // The two functions below handle firing the shot:
    // one starts charging the projectile, the other releases it with the accumulated power
    // Handles key down events (charge the power)
    _handleKeyDown(event) {
        const key = event.key.toLowerCase();
        if (key in this.keys) this.keys[key] = true;
        
        if (event.code === 'Space' || key === 'c') {
            event.preventDefault();
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargePower = 0;
            }
        }
    }

    // Handles key up events (release the power)
    _handleKeyUp(event) {
        const key = event.key.toLowerCase();
        if (key in this.keys) this.keys[key] = false;

        if (event.code === 'Space' || key === 'c') {
            if (this.isCharging) {
                this._fire();
                this.isCharging = false;
            }
        }
    }

    // Updates the cannon's aim based on keyboard
    _updateCannonAim(delta) {
        const rotateSpeed = 1.0 * delta;
        const pitchSpeed = 1.0 * delta;

        if (this.keys.a) this.yawAssembly.rotation.y += rotateSpeed;
        if (this.keys.d) this.yawAssembly.rotation.y -= rotateSpeed;
        if (this.keys.w) this.pitchAssembly.rotation.x -= pitchSpeed;
        if (this.keys.s) this.pitchAssembly.rotation.x += pitchSpeed;
        
        this.pitchAssembly.rotation.x = THREE.MathUtils.clamp(this.pitchAssembly.rotation.x, -0.6, Math.PI / 6);
        
        if (this.isCharging) {
            this.chargePower = Math.min(100, this.chargePower + 80 * delta);
            this.powerBar.style.width = this.chargePower + '%';
        }
    }

    // Create fires and the projectile
    _fire() {
        if (this.chargePower < 5) {  // Prevent firing with no power
            this.chargePower = 0;
            this.powerBar.style.width = '0%';
            return;
        }

        const attackState = this.getAttackState();
        const selectedType = attackState.selectedBall;
        const ballInfo = this.ballTypes[selectedType];

        if (attackState.money < ballInfo.cost) return; // Check for sufficient money
        attackState.money -= ballInfo.cost;
        this.updateUIAttack();

        // Create the correct ball type
        let projectile;
        if (ballInfo.type === 'fireball') {
            projectile = new Fireball();
        } else {
            const mat = new THREE.MeshStandardMaterial({ map: selectedType==='punch' ? punchballTexture : (selectedType==='area' ? areaballTexture : cannonballTexture)});
            projectile = new THREE.Mesh(this.projectileGeometry, mat);
        }
        projectile.castShadow = true;

        // Get world position and direction from the muzzle 
        const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
        const muzzleDir = this.muzzle.getWorldDirection(new THREE.Vector3()).normalize();
        
        projectile.position.copy(muzzlePos).add(muzzleDir.clone().multiplyScalar(2.0)); 

        // Set initial velocity and other properties
        const speed = this.chargePower * 0.6;
        projectile.userData.velocity = muzzleDir.multiplyScalar(speed);
        projectile.userData.lifetime = 7.0;
        projectile.userData.type = selectedType;
        if (selectedType === 'punch') projectile.userData.penetrationCount = 4;

        this.scene.add(projectile);
        this.activeProjectiles.push(projectile);

        // Reset the charge
        this.chargePower = 0;
        this.powerBar.style.width = '0%';
    }

    // Updates the position and checks for collisions for all active projectiles
    _updateProjectiles(timeStep) {
        if (!this.raycaster) this.raycaster = new THREE.Raycaster();

        // Iterate over all active projectiles (backwards to allow safe removal)
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.activeProjectiles[i];
            const oldPosition = projectile.position.clone();
            // Decrease the projectile's lifetime
            projectile.userData.lifetime -= timeStep;
            // Apply gravity to the projectile's velocity
            projectile.userData.velocity.add(this.gravity.clone().multiplyScalar(timeStep));
            // Update the projectile's position based on its velocity
            projectile.position.add(projectile.userData.velocity.clone().multiplyScalar(timeStep));

            if (projectile instanceof Fireball) {
                projectile.update(timeStep);
            }

            const pos = projectile.position;
            const platformRadius = 60;
            const platformRadiusSq = platformRadius * platformRadius;
            const distanceFromCenterSq = pos.x * pos.x + pos.z * pos.z;

            if (pos.y < -10 || projectile.userData.lifetime <= 0) {
                // Create a smoke effect and remove the projectile
                this.particleManager.createSmokePuff(pos.clone());
                this.scene.remove(projectile);
                this.activeProjectiles.splice(i, 1);
                continue;
            }

            // Check if the projectile has fallen outside the platform area
            if (pos.y < 0 && distanceFromCenterSq > platformRadiusSq) {
                // Create a smoke effect and remove the projectile
                this.particleManager.createSmokePuff(pos.clone());
                this.scene.remove(projectile);
                this.activeProjectiles.splice(i, 1);
                continue;
            }
            
            // Calculate the movement direction since last frame
            const direction = projectile.position.clone().sub(oldPosition);
            const distance = direction.length();
            if (distance === 0) continue;

            // Perform a raycast to detect collisions along the path
            direction.normalize();
            this.raycaster.set(oldPosition, direction);
            this.raycaster.far = distance;
            const intersections = this.raycaster.intersectObjects(this.collidables);

            // Handle collision if any intersection is detected
            if (intersections.length > 0) {
                const closestHit = intersections[0];
                const target = closestHit.object;
                // Dispatch to the correct collision handler based on projectile type
                switch (projectile.userData.type) {
                    case 'punch':
                        this._handlePunchCollision(projectile, target, closestHit, i);
                        break;
                    case 'area':
                        this._handleAreaCollision(projectile, target, closestHit, i);
                        break;
                    case 'base':
                    default:
                        this._handleBaseCollision(projectile, target, closestHit, i);
                        break;
                }
            }
        }
    }

    // Handles collision logic for the standard 'base' BALL
    _handleBaseCollision(projectile, target, hit, index) {
        projectile.position.copy(hit.point);

        let effectiveTarget = target;
        while (effectiveTarget.parent && !effectiveTarget.userData.isGround && !effectiveTarget.userData.isWall && !effectiveTarget.userData.isHouse && !effectiveTarget.userData.isStrongBlock && !effectiveTarget.userData.isDecorativeHouse) {
            effectiveTarget = effectiveTarget.parent;
        }

        const isGround = effectiveTarget.userData.isGround === true;
        const isDecorative = effectiveTarget.userData.isDecorativeHouse === true;
        
        // The grid radius is used to determine if the projectile should bounce or be destroyed.
        const buildAreaRadius = 20;
        // Bounce if it hits the ground inside the grid, otherwise destroy it
        if (isGround) {
            const distanceFromCenter = Math.sqrt(hit.point.x * hit.point.x + hit.point.z * hit.point.z);
            // If it hits inside the grid, it bounces.
            if (distanceFromCenter < buildAreaRadius) {
                this._handleBounce(projectile, effectiveTarget);
            } else {
                // If it hits the ground outside the grid, it's destroyed.
                this.particleManager.createSmokePuff(projectile.position.clone());
                this.scene.remove(projectile);
                this.activeProjectiles.splice(index, 1);
            }
        } else if (isDecorative) {
            // Handle easter egg
            if (effectiveTarget.userData.houseId === 'house1') {
                const attackState = this.getAttackState();
                attackState.money += 500;
                this.updateUIAttack();
                console.log("Easter Egg Trovato! +500 monete!");
            }
            this.particleManager.createSmokePuff(effectiveTarget.position.clone(), 3.0);
            this._handleDestruction(effectiveTarget);
            this.scene.remove(projectile);
            this.activeProjectiles.splice(index, 1);
        } else if (effectiveTarget.userData.isStrongBlock) {
            // Strong blocks require two hits
            if (effectiveTarget.userData.isDamaged) {
                this._handleDestruction(effectiveTarget);
                this.scene.remove(projectile);
                this.activeProjectiles.splice(index, 1);
                this._recalculateAllGravity();
            } else {
                effectiveTarget.userData.isDamaged = true;
                if(effectiveTarget.userData.updateVisuals) effectiveTarget.userData.updateVisuals();
                this._handleBounce(projectile, effectiveTarget);
            }
        } else if (effectiveTarget.userData.isWall || effectiveTarget.userData.isHouse) {
            this.particleManager.createSmokePuff(effectiveTarget.position.clone());
            this._handleDestruction(effectiveTarget);
            this.scene.remove(projectile);
            this.activeProjectiles.splice(index, 1);
            this._recalculateAllGravity();
        } else {
            this._handleBounce(projectile, effectiveTarget);
        }
    }

    // Handles collision logic for the punch BALL
    _handlePunchCollision(projectile, target, hit, index) {
        const isGround = target.userData.isGround === true;
        const buildAreaRadius = 20;
        
        if (isGround) {
            const distanceFromCenter = Math.sqrt(hit.point.x * hit.point.x + hit.point.z * hit.point.z);
            if (distanceFromCenter < buildAreaRadius) {
                this._handleBounce(projectile, target);
            } else {
                this.particleManager.createFireEffect(projectile.position.clone());
                this.scene.remove(projectile);
                this.activeProjectiles.splice(index, 1);
            }
            return;
        }

        let blockWasDestroyed = false;
        if (target.userData.isStrongBlock || target.userData.isWall || target.userData.isHouse) {
            this.particleManager.createFireEffect(target.position.clone());
            this._handleDestruction(target);
            blockWasDestroyed = true;
            // The projectile loses all penetration power against a strong block
            if (target.userData.isStrongBlock) {
                 projectile.userData.penetrationCount = 0;
            } else {
                 projectile.userData.penetrationCount--;
            }
        }
        
        if (blockWasDestroyed) {
             this._recalculateAllGravity();
        }
        // Remove the projectile if it has no penetration power left
        if (projectile.userData.penetrationCount <= 0) {
            this.scene.remove(projectile);
            this.activeProjectiles.splice(index, 1);
        }
    }

    // Handles collision logic for the 'area' (splash damage) BALL
    _handleAreaCollision(projectile, targetObject, hit, index) {
        const isGround = targetObject.userData.isGround === true;
        if (isGround) {
            this._handleBounce(projectile, targetObject);
            return;
        }

        const impactPoint = hit.point;
        const areaRadius = 2.5;
        const areaRadiusSq = areaRadius * areaRadius;
        const blocksToDestroy = new Set();
        const blocksToDamage = new Set();

        // Add the primary target
        if (targetObject.userData.isStrongBlock) {
            blocksToDamage.add(targetObject);
        } else if (targetObject.userData.isWall || targetObject.userData.isHouse) {
            blocksToDestroy.add(targetObject);
        }

        // Find all other blocks within the splash radius
        this.collidables.forEach(obj => {
            if (obj === targetObject || !obj.parent) return;
            if (obj.position.distanceToSquared(impactPoint) <= areaRadiusSq) {
                if (obj.userData.isStrongBlock) blocksToDamage.add(obj);
                else if (obj.userData.isWall || obj.userData.isHouse) blocksToDestroy.add(obj);
            }
        });
        
        // Process destruction and damage
        blocksToDestroy.forEach(block => {
            this.particleManager.createSmokePuff(block.position.clone());
            this._handleDestruction(block);
        });
        blocksToDamage.forEach(block => {
            if (!block.userData.isDamaged) {
                block.userData.isDamaged = true;
                if (block.userData.updateVisuals) block.userData.updateVisuals();
            }
        });

        // Recalculate gravity if any blocks were destroyed
        if (blocksToDestroy.size > 0) {
            this._recalculateAllGravity();
            this.scene.remove(projectile);
            this.activeProjectiles.splice(index, 1);
        } else {
            // If nothing was destroyed, the projectile just bounces
            this._handleBounce(projectile, targetObject);
        }
    }

    // Makes a projectile bounce off a surface
    // FORMULA
    /* 
        d = V*N
        V -> the ball's velocity before the impact
        N -> the normal vector of the surface it hit

        Reflection formula:
        V' = V - 2*d*N
        V' = V - 2*(V*N)*N

        Also applied a damping effect (0.75) that simulates the energy loss
        mean that each bounce loss 25% of energy

    */
    _handleBounce(projectile, target) {
        const isGround = (target && target.userData) ? target.userData.isGround === true : false;
        let collisionNormal;

        if (isGround) {
            collisionNormal = new THREE.Vector3(0, 1, 0); // if is ground the normal vector is perpendicular to the surface
        } else if (target) {
            collisionNormal = projectile.position.clone().sub(target.position); // If there’s another object
            // Particular case BALL hit exaclty at the center
            // lenghtSq -> compute the magnitude |v| = rad(x^2+y^2+z^2) 
            if (collisionNormal.lengthSq() < 0.0001) {   // calculates the direction from the target's center to the projectile
                collisionNormal.set(0, 1, 0);
            } else {
                collisionNormal.normalize();
            }
        } else {
            collisionNormal = new THREE.Vector3(0, 1, 0);
        }
        // Reflect velocity and apply a damping factor
        projectile.userData.velocity.reflect(collisionNormal).multiplyScalar(0.75);   
        // Nudge the projectile out of the surface to prevent getting stuck
        projectile.position.add(collisionNormal.multiplyScalar(0.1));
    }

    // Removes a target object from the scene
    _handleDestruction(target) {
        if (!target.parent) return;
        console.log(`Removing: ${target.userData.type || 'Object'}`);
        this.scene.remove(target);
    }

    // Smoothly animates the Y position of blocks that need to fall
    _updateFallingBlocks(delta) {
        const fallSpeed = 15;
        for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
            const falling = this.fallingBlocks[i];
            const block = falling.block;
            const targetY = falling.targetY;
            const distanceToFall = block.position.y - targetY; // how far the block still needs to fall
            const fallAmount = fallSpeed * delta;
            if (distanceToFall > fallAmount) {
                block.position.y -= fallAmount;
            } else {
                block.position.y = targetY;
                this.fallingBlocks.splice(i, 1); // Remove from animation list once it has landed
            }
        }
    }

    // Iteratively recalculates the resting Y-position for all blocks to handle chain reactions
    _recalculateAllGravity() {
        console.log("Inizio ricalcolo gravità a catena");
        const maxIterations = 100;
        let iterations = 0;
        let changedInLastPass;

        // Create a map to track the final calculated Y position of each block
        const knownPositions = new Map();
        this.scene.traverse(obj => {
            if (obj.userData.isWall || obj.userData.isStrongBlock || obj.userData.isHouse) {
                knownPositions.set(obj, { y: obj.position.y });
            }
        });

        // Loop until no blocks change position in a full pass
        do {
            changedInLastPass = false;
            // check from the bottom up
            const objectsToCheck = Array.from(knownPositions.keys());
            objectsToCheck.sort((a, b) => a.position.y - b.position.y);

            for (const obj of objectsToCheck) {
                const currentY = knownPositions.get(obj).y;
                // span = the size of the block at its base
                const spans = getObjectSpans(obj);
                const newTargetY = computeTargetY(this.scene, obj, spans, this.cellSize, knownPositions, currentY);

                if (Math.abs(currentY - newTargetY) > 0.01) {
                    knownPositions.set(obj, { y: newTargetY });
                    changedInLastPass = true;
                }
            }
            iterations++;
        } while (changedInLastPass && iterations < maxIterations);

        // Add any blocks that moved to the falling animation list
        knownPositions.forEach((finalState, block) => {
            if (Math.abs(block.position.y - finalState.y) > 0.01) {
                const alreadyFalling = this.fallingBlocks.find(fb => fb.block === block);
                if (alreadyFalling) {
                    alreadyFalling.targetY = finalState.y;
                } else {
                    this.fallingBlocks.push({ block: block, targetY: finalState.y });
                }
            }
        });

        if (iterations >= maxIterations) {
            console.warn("Ricalcolo gravità ha raggiunto il limite di iterazioni.");
        } else {
            console.log(`Gravità stabilizzata in ${iterations} passate.`);
        }
    }
    
}
    
