import * as THREE from 'https://esm.sh/three@0.150.1';
import { textureLoader } from './assets.js';

const flameTexture = textureLoader.load('TEXTURE/flame.png');


export class Fireball extends THREE.Group {
    constructor() {
        super();

        const coreRadius = 0.4;
        // The `userData` object is inherited from THREE.Object3D and is used by
        // the CannonManager to store physics properties like velocity and lifetime
        this.userData = {}; 

        // The glowing core of the fireball
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8c00,        // Dark orange
            emissive: 0xffa500,     // Bright orange glow
            emissiveIntensity: 2    // Strength of the glow
        });
        const coreGeometry = new THREE.SphereGeometry(coreRadius, 16, 16);
        this.core = new THREE.Mesh(coreGeometry, coreMaterial);
        this.add(this.core);

        // The surrounding fire particle system
        const particleCount = 50;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        this.particleData = [];  // This array will hold the state (velocity, lifetime) for each individual particle.

        const particleMaterial = new THREE.PointsMaterial({
            map: flameTexture,
            color: 0xffa500,
            size: 1,
            blending: THREE.AdditiveBlending,  // Makes colors blend for a fiery look
            transparent: true,
            depthWrite: false   // Helps with rendering transparent objects correctly
        });

        for (let i = 0; i < particleCount; i++) {
            // Store the unique state for each particle
            this.particleData.push({
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.5,
                    (Math.random() - 0.5) * 1.5,
                    (Math.random() - 0.5) * 1.5
                ),
                lifetime: Math.random() * 1.0, // Start with a random lifetime for a chaotic look
                maxLifetime: 0.5 + Math.random() * 0.8
            });
            // All particles start at the center of the group
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particles = new THREE.Points(particleGeometry, particleMaterial);
        this.add(this.particles);
    }
    /*
        Animates the particle system for the fireball.
        This method should be called every frame
    */
    update(delta) {
        const positions = this.particles.geometry.attributes.position.array;
        
        for (let i = 0; i < this.particleData.length; i++) {
            const data = this.particleData[i];
            data.lifetime -= delta;

            // If a particle's lifetime ends, reset it at the center
            // This creates a continuous, churning fire effect without creating/destroying objects
            if (data.lifetime <= 0) {
                data.lifetime = data.maxLifetime;
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
            }

            // This line scales all particles uniformly based on the lifetime of the last
            // particle processed in the loop. It creates a flickering effect
            positions[i * 3] += data.velocity.x * delta;
            positions[i * 3 + 1] += data.velocity.y * delta;
            positions[i * 3 + 2] += data.velocity.z * delta;

            const scale = data.lifetime / data.maxLifetime;
            this.particles.material.size = scale * 2;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
    }
}