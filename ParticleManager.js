import * as THREE from 'https://esm.sh/three@0.150.1';

const textureLoader = new THREE.TextureLoader();
const smokeTexture = textureLoader.load('TEXTURE/smoke.png');
const flameTexture = textureLoader.load('TEXTURE/flame.png');

export class ParticleManager {

    constructor(scene) {
        this.scene = scene;
        this.activeEffects = [];
    }


    // Creates a puff of smoke effect
    createSmokePuff(position, scale = 1.0) {
        const particleCount = Math.round(20 * scale);
        const particleSize = 2 * scale;

        // Setup geometry with all particles starting at the same origin point
        const particles = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < particleCount; i++) {
            positions.push(position.x, position.y, position.z);
        }
        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        // Setup material for the smoke particles
        const material = new THREE.PointsMaterial({
            map: smokeTexture, 
            color: 0xaaaaaa, 
            size: particleSize,
            transparent: true, 
            blending: THREE.AdditiveBlending,   // Additive blending gives a nice glow/cloud effect
            depthWrite: false,                  // Prevents particles from occluding each other incorrectly
        });
        const points = new THREE.Points(particles, material);
        // Store effect-specific data in the userData object for the update loop
        points.userData.isParticleEffect = true;
        points.userData.lifetime = 1.0 * scale;
        points.userData.initialLifetime = 1.0 * scale; // Used to calculate fade-out opacity
        points.userData.velocities = [];

        // Generate a random initial velocity for each particle to create an "explosion" puff
        const velocityScale = 4 * scale;
        for (let i = 0; i < particleCount; i++) {
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * velocityScale, (Math.random() - 0.5) * velocityScale, (Math.random() - 0.5) * velocityScale
            );
            points.userData.velocities.push(velocity);
        }
        this.scene.add(points);
        this.activeEffects.push(points);
    }
    
    // Creates a fire/explosion effect
    createFireEffect(position) {
        const particleCount = 60;
        const particles = new THREE.BufferGeometry();
        const positions = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push(position.x, position.y, position.z);
        }

        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            map: flameTexture,
            color: 0xffa500,
            size: 2.5,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const points = new THREE.Points(particles, material);
        points.userData.isParticleEffect = true;
        points.userData.lifetime = 1.5;
        points.userData.velocities = [];

        // Generate velocities biased upwards to simulate rising flames/embers
        for (let i = 0; i < particleCount; i++) {
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 4,   // Horizontal spread
                Math.random() * 5,           // Upward motion
                (Math.random() - 0.5) * 4    // Depth spread
            );
            points.userData.velocities.push(velocity);
        }

        this.scene.add(points);
        this.activeEffects.push(points);
    }

    //  The main update loop for all particle effects
    update(delta) {
        // Iterate backwards so we can safely remove items from the array without skipping elements
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const effect = this.activeEffects[i];
            effect.userData.lifetime -= delta;
            // If the effect's lifetime has expired, remove it
            if (effect.userData.lifetime <= 0) {
                this.scene.remove(effect);
                // Dispose of the geometry and material to free up GPU memory
                effect.geometry.dispose();
                effect.material.dispose();
                this.activeEffects.splice(i, 1);
                continue;
            }
            // If the effect is still active, update its particles
            const positions = effect.geometry.attributes.position.array;
            const velocities = effect.userData.velocities;
            for (let j = 0; j < positions.length; j += 3) {
                const velocityIndex = j / 3;
                positions[j] += velocities[velocityIndex].x * delta;
                positions[j + 1] += velocities[velocityIndex].y * delta;
                positions[j + 2] += velocities[velocityIndex].z * delta;
            }
            // Tell Three.js that the position buffer has changed and needs to be re-uploaded to the GPU
            effect.geometry.attributes.position.needsUpdate = true;
            // Dissolvenza basata sulla durata di vita
            if (effect.userData.initialLifetime) {
                // Update the material's opacity to create a fade-out effect over the lifetime
                effect.material.opacity = effect.userData.lifetime / effect.userData.initialLifetime;
            } else {
                effect.material.opacity = effect.userData.lifetime;
            }
        }
    }

    /* 
        Checks if there are any active particle effects currently running.
        This is useful for knowing when all animations have finished
    */
    areAllParticlesInactive() {
        // Restituisce true se non ci sono più effetti attivi nell'array
        return this.activeEffects.length === 0;
    }
}