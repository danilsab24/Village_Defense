import * as THREE from 'https://esm.sh/three@0.150.1';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';
import { getObjectSpans, computeTargetY } from './Gravity.js';

function normalizeAndCenterModel(gltfScene, targetSize) { 
    const box = new THREE.Box3().setFromObject(gltfScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const scale = targetSize / maxSize;
    gltfScene.position.sub(center).multiplyScalar(scale);
    gltfScene.scale.set(scale, scale, scale);
    const wrapper = new THREE.Group();
    wrapper.add(gltfScene);
    return wrapper;
}
const textureLoader = new THREE.TextureLoader();
const cannonballTexture = textureLoader.load('TEXTURE/CANNONBALL.png');
const crackedStoneTexture = textureLoader.load('TEXTURE/STONE_CRACKS.png');

export class CannonManager {
    constructor(scene, camera, controls) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.gltfLoader = new GLTFLoader();
        this.cannonAssembly = new THREE.Group();
        this.cannonAssembly.rotation.y = Math.PI;
        this.yawAssembly = new THREE.Group();
        this.pitchAssembly = new THREE.Group();
        this.cannonModel = null;
        this.sideGears = [];
        this.muzzle = new THREE.Object3D();
        this.keys = { w: false, a: false, s: false, d: false, c: false };
        this.chargePower = 0;
        this.powerBar = document.getElementById('power-bar');
        this.powerBarContainer = document.getElementById('power-bar-container');
        this.ammo = 20;
        this.activeProjectiles = [];
        this.projectileMaterial = new THREE.MeshStandardMaterial({ map: cannonballTexture });
        this.projectileGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        this.gravity = new THREE.Vector3(0, -9.8, 0);
        this.FIXED_TIME_STEP = 1 / 60;
        this.physicsAccumulator = 0;
        this.boundHandleKeyDown = this._handleKeyDown.bind(this);
        this.boundHandleKeyUp = this._handleKeyUp.bind(this);
        this.fallingBlocks = [];
    }

    async load() { 
        console.log("--- DEBUG: Assemblaggio finale del cannone ---");
        try {
            const [baseGltf, gearGltf, cannonGltf] = await Promise.all([
                this.gltfLoader.loadAsync('MODEL/COBBLESTONE_BASE.glb'),
                this.gltfLoader.loadAsync('MODEL/METAL_GEAR.glb'),
                this.gltfLoader.loadAsync('MODEL/CANNON.glb')
            ]);
            const normalizedBase = normalizeAndCenterModel(baseGltf.scene, 8);
            const horizontalGear = normalizeAndCenterModel(gearGltf.scene, 6);
            this.cannonModel = normalizeAndCenterModel(cannonGltf.scene, 5);
            const sideGearL = horizontalGear.clone();
            sideGearL.scale.set(0.4, 0.4, 0.4);
            const sideGearR = sideGearL.clone();
            this.sideGears.push(sideGearL, sideGearR);
            this.cannonAssembly.add(normalizedBase);
            const baseBox = new THREE.Box3().setFromObject(normalizedBase);
            const baseSize = baseBox.getSize(new THREE.Vector3());
            this.yawAssembly.position.y = baseSize.y / 2;
            this.cannonAssembly.add(this.yawAssembly);
            horizontalGear.rotation.z = Math.PI / 2;
            this.yawAssembly.add(horizontalGear);
            const hGearBox = new THREE.Box3().setFromObject(horizontalGear);
            const hGearSize = hGearBox.getSize(new THREE.Vector3());
            this.pitchAssembly.position.y = (hGearSize.y / 2) + 1.4;
            this.yawAssembly.add(this.pitchAssembly);
            this.pitchAssembly.add(this.cannonModel);
            this.pitchAssembly.add(sideGearL);
            this.pitchAssembly.add(sideGearR);
            const cannonBox = new THREE.Box3().setFromObject(this.cannonModel);
            const cannonSize = cannonBox.getSize(new THREE.Vector3());
            sideGearL.position.x = -cannonSize.x / 2;
            sideGearR.position.x = cannonSize.x / 2;
            this.muzzle.position.set(0, cannonSize.y * 0.1, -cannonSize.z / 2);
            this.cannonModel.add(this.muzzle);
            this.cannonAssembly.position.set(0, 0, 35);
            this.scene.add(this.cannonAssembly);
            console.log("--- DEBUG: Cannone completo assemblato e aggiunto alla scena. ---");
        } catch (error) {
            console.error("ERRORE CRITICO DURANTE IL CARICAMENTO DEI MODELLI:", error);
        }
    }
    startAttackMode() {
        this._setupAttackControls();
        this.powerBarContainer.style.display = 'block';
    }

    update(delta, collidables = []) { 
        this.collidables = collidables;
        this._updateCannonAim(delta);
        this._updateFallingBlocks(delta);
        this.physicsAccumulator += delta;
        while (this.physicsAccumulator >= this.FIXED_TIME_STEP) {
            this._updateProjectiles(this.FIXED_TIME_STEP);
            this.physicsAccumulator -= this.FIXED_TIME_STEP;
        }
    }

    _updateFallingBlocks(delta) {
        const fallSpeed = 15;
        for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
            const falling = this.fallingBlocks[i];
            const block = falling.block;
            const targetY = falling.targetY;
            const distanceToFall = block.position.y - targetY;
            const fallAmount = fallSpeed * delta;
            if (distanceToFall > fallAmount) {
                block.position.y -= fallAmount;
            } else {
                block.position.y = targetY;
                this.fallingBlocks.splice(i, 1);
            }
        }
    }

    _applyGravityAfterCollision(removedPosition, removedHeight) {
        const candidates = [];
        this.scene.traverse(obj => {
            if ((obj.userData.isWall || obj.userData.isStrongBlock) && obj.parent) { // Aggiunto controllo obj.parent
                const isSameColumn = Math.abs(obj.position.x - removedPosition.x) < 0.1 &&
                                     Math.abs(obj.position.z - removedPosition.z) < 0.1;
                if (isSameColumn && obj.position.y > removedPosition.y) {
                    candidates.push(obj);
                }
            }
        });

        candidates.sort((a, b) => a.position.y - b.position.y);

        let highestSupportY = 0; // Inizia dal terreno
        this.scene.traverse(obj => {
            if ((obj.userData.isWall || obj.userData.isStrongBlock) && obj.parent) {
                 const isSameColumn = Math.abs(obj.position.x - removedPosition.x) < 0.1 &&
                                     Math.abs(obj.position.z - removedPosition.z) < 0.1;
                if (isSameColumn && obj.position.y < removedPosition.y) {
                    highestSupportY = Math.max(highestSupportY, obj.position.y + obj.geometry.parameters.height / 2);
                }
            }
        });

        let currentSupportTopY = highestSupportY;

        candidates.forEach(blockToFall => {
            const blockHalfHeight = blockToFall.geometry.parameters.height / 2;
            const targetY = currentSupportTopY + blockHalfHeight;
            if (Math.abs(blockToFall.position.y - targetY) > 0.01) {
                if (!this.fallingBlocks.some(fb => fb.block === blockToFall)) {
                    this.fallingBlocks.push({ block: blockToFall, targetY: targetY });
                }
            }
            currentSupportTopY = targetY + blockHalfHeight;
        });
    }

    _checkHousesGravity() { 
        const houses = [];
        this.scene.traverse(obj => {
            if (obj.userData.isHouse && obj.parent) { // controllo obj.parent
                houses.push(obj);
            }
        });

        const cellSize = 40 / 30;
        houses.forEach(house => {
            const houseSpans = getObjectSpans(house);
            const targetY = computeTargetY(this.scene, house, houseSpans, cellSize);
            if (Math.abs(house.position.y - targetY) > 0.01) {
                if (!this.fallingBlocks.some(fb => fb.block === house)) {
                    this.fallingBlocks.push({ block: house, targetY: targetY });
                    console.log("Una casa ha perso il supporto e sta cadendo!");
                }
            }
        });
    }

    _handleDestruction(projectile, target) {
        console.log(`Colpito e distrutto: ${target.userData.type || 'Oggetto'}`);
        
        const removedPosition = target.position.clone();
        const removedHeight = target.geometry.parameters.height;

        this.scene.remove(projectile);
        this.scene.remove(target);
        
        this._applyGravityAfterCollision(removedPosition, removedHeight);
        this._checkHousesGravity();
    }
    
    _updateProjectiles(timeStep) {
        if (!this.raycaster) {
            this.raycaster = new THREE.Raycaster();
        }

        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.activeProjectiles[i];
            const oldPosition = projectile.position.clone();

            projectile.userData.lifetime -= timeStep;
            projectile.userData.velocity.add(this.gravity.clone().multiplyScalar(timeStep));
            projectile.position.add(projectile.userData.velocity.clone().multiplyScalar(timeStep));

            const direction = projectile.position.clone().sub(oldPosition);
            const distance = direction.length();
            if (distance === 0) continue;

            direction.normalize();
            this.raycaster.set(oldPosition, direction);
            this.raycaster.far = distance;
            const intersections = this.raycaster.intersectObjects(this.collidables);

            if (intersections.length > 0) {
                const closestHit = intersections[0];
                const target = closestHit.object;
                projectile.position.copy(closestHit.point);
                const isGround = target.geometry.type === 'BoxGeometry' && target.position.y < 0;

                // LOGICA DI COLLISIONE per STRONG BLOCK
                if (isGround) {
                    // Il terreno fa sempre rimbalzare
                    this._handleBounce(projectile, target);

                } else if (target.userData.isStrongBlock) {
                    // Se il blocco forte è già danneggiato...
                    if (target.userData.isDamaged) {
                        // distruggilo (secondo colpo).
                        console.log("Blocco forte distrutto al secondo colpo!");
                        this._handleDestruction(projectile, target);
                        this.activeProjectiles.splice(i, 1);
                        continue; 
                    } else {
                        // ..altrimenti, danneggialo e fai rimbalzare la palla (primo colpo).
                        console.log("Blocco forte danneggiato!");
                        target.userData.isDamaged = true;
                        target.material.map = crackedStoneTexture;
                        target.material.needsUpdate = true; 
                        this._handleBounce(projectile, target);
                    }

                } else if (target.userData.isWall || target.userData.isHouse) {
                    // I muri normali e le case si distruggono al primo colpo
                    this._handleDestruction(projectile, target);
                    this.activeProjectiles.splice(i, 1);
                    continue;
                }
            }

            const isStillActive = this.activeProjectiles.includes(projectile);
            if (isStillActive && (projectile.position.y < -10 || projectile.userData.lifetime <= 0)) {
                this.scene.remove(projectile);
                this.activeProjectiles.splice(i, 1);
            }
        }
    }

    _setupAttackControls() {
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);
    }

    _handleKeyDown(event) {
        const key = event.key.toLowerCase();

        if (key in this.keys) {
            this.keys[key] = true;
        }

        if (key === ' ') {
            event.preventDefault();
            this._fire();
        }
    }

    _handleKeyUp(event) {
        const key = event.key.toLowerCase();

        if (key in this.keys) {
            this.keys[key] = false;
        }
    }

    _updateCannonAim(delta) {
        const rotateSpeed = 1.0 * delta;
        const pitchSpeed = 1.0 * delta;
        const gearRotateSpeed = 2.0 * delta;

        if (this.keys.a) {
            this.yawAssembly.rotation.y += rotateSpeed;
        }
        if (this.keys.d) {
            this.yawAssembly.rotation.y -= rotateSpeed;
        }

        if (this.keys.w) {
            this.pitchAssembly.rotation.x += pitchSpeed;
            this.sideGears.forEach(g => g.rotation.x += gearRotateSpeed);
        }

        if (this.keys.s) {
            this.pitchAssembly.rotation.x -= pitchSpeed;
            this.sideGears.forEach(g => g.rotation.x -= gearRotateSpeed);
        }

        this.pitchAssembly.rotation.x = THREE.MathUtils.clamp(
            this.pitchAssembly.rotation.x,
            -0.6,
            Math.PI / 6
        );

        if (this.keys.c) {
            this.chargePower += 80 * delta;
            if (this.chargePower > 100) {
                this.chargePower = 0;
            }
            this.powerBar.style.width = this.chargePower + '%';
        }
    }

    _fire() {
        if (this.chargePower < 5 || this.ammo <= 0) return;

        this.ammo--;
        console.log(`SPARO! Potenza: ${this.chargePower.toFixed(0)}. Munizioni rimaste: ${this.ammo}`);

        const projectile = new THREE.Mesh(
            this.projectileGeometry,
            this.projectileMaterial
        );

        const muzzleWorldPosition = this.muzzle.getWorldPosition(new THREE.Vector3());
        const muzzleWorldDirection = this.muzzle.getWorldDirection(new THREE.Vector3());
        projectile.position.copy(muzzleWorldPosition);

        const minSpeed = 30;
        const maxSpeed = 80;
        const speed = minSpeed + (this.chargePower / 100) * (maxSpeed - minSpeed);
        projectile.userData.velocity = muzzleWorldDirection.multiplyScalar(speed);

        projectile.userData.lifetime = 7.0;

        this.scene.add(projectile);
        this.activeProjectiles.push(projectile);

        this.chargePower = 0;
        this.powerBar.style.width = '0%';
    }

    _handleBounce(projectile, target) {
        const collisionNormal = projectile.position.clone().sub(target.position).normalize();

        if (
            target === this.collidables.find(
                c => c.geometry.type === 'BoxGeometry' && c.position.y < 0
            )
        ) {
            collisionNormal.set(0, 1, 0);
        }

        projectile.userData.velocity
            .reflect(collisionNormal)
            .multiplyScalar(0.75);

        projectile.position.add(collisionNormal.multiplyScalar(0.1));
    }

}