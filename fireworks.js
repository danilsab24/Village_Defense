import * as THREE from 'https://esm.sh/three@0.150.1';

// A predefined color palette for the fireworks
const colorPalette = [
    new THREE.Color(0xff4444), // RED
    new THREE.Color(0x4444ff), // BLUE
    new THREE.Color(0x9933ff), // VIOLET
    new THREE.Color(0x44ff44), // GREEN
];
export class ShaderFireworksManager {
    constructor(scene) {
        this.scene = scene;
        this.fireWorkGroup = [];     // This array holds all currently active firework objects
        this.launchInterval = null;  // The handle for the interval that launches fireworks
        this.maxLength = 30;         // The maximum number of active fireworks at any given time
    }

    // Starts the firework display by periodically launching new fireworks
    start() {
        if (this.launchInterval) return;
        
        this.launchInterval = setInterval(() => {
            this.addNewOne(0.6); // // Each interval, there is a 60% chance of launching a new firewor
        }, 200); // Launch interval in milliseconds
    }

    // Stops the firework display and cleans up all associated objects from the scene
    stop() {
        clearInterval(this.launchInterval);
        this.launchInterval = null;
        
        // Dispose of all geometries and materials to prevent memory leaks
        this.fireWorkGroup.forEach(item => {
            this.scene.remove(item.points);
            item.points.geometry.dispose();
            item.points.material.dispose();
        });
        this.fireWorkGroup = [];
    }
    
    // Creates a single new firework at a random position with a given probability
    addNewOne(chance = 0.5) {
        if (this.fireWorkGroup.length > this.maxLength) return;

        if (Math.random() < chance) {
            const gridEdge = 20; 
            const angle = Math.random() * Math.PI * 2;

            // Launch fireworks in a circular ring around the center of the scene
            const radius = 5 + Math.random() * 20; 

            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Define the start (ground) and end (explosion) points for the firework's trail
            const endPoint = new THREE.Vector3(x, 20 + Math.random() * 5, z);
            const startPoint = new THREE.Vector3(x, 0, z);

            this.createOne(
                startPoint,
                endPoint,
                Math.floor(Math.random() * 500 + 200),  // Random number of particles
                Math.random() > 0.5  // 50% chance of being a rainbow firework
            );
        }
    }

    // Creates the THREE.Points object for a single firework and adds it to the scene
    createOne(startPoint, endPoint, pointsNumber, isRainBow = false) {
        const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];

        const points = this.createPoints(
            randomColor, 
            pointsNumber,
            endPoint,
            startPoint,
            isRainBow
        );
        points.scale.multiplyScalar(Math.random() * 4.0 + 2.8);
        this.fireWorkGroup.push({ points });
        this.scene.add(points);
    }
    
    // Prepares the BufferGeometry for the particle system
    createPoints(color, number = 400, endPoint, startPoint, isRainBow = false) {
        const pointsNumber = number;
        const times = 10;
        const step = 0.005;  // Base value for the delay attribute
        
        // Setup custom buffer attributes for the shader
        const positionAttribute = new THREE.Float32BufferAttribute(pointsNumber * 3 * times, 3);
        const vertexColorAttribute = new THREE.Float32BufferAttribute(pointsNumber * 4 * times, 4);
        const typeAttribute = new THREE.Float32BufferAttribute(pointsNumber * 2 * times, 2);

        for (let i = 0; i < pointsNumber; i++) {
            if (isRainBow) {
                const x = Math.random();
                const y = Math.random();
                const z = Math.random();
                for (let j = 0; j < times; j++) {
                    vertexColorAttribute.setXYZW(i * times + j, x, y, z, 1);
                }
            }
            // Random initial position seed for particle spread effect
            const x = Math.random();
            const y = Math.random();
            const z = Math.random();
            // Fill in the delay and position attributes for all time steps of this particle
            for (let j = 0; j < times; j++) {
                typeAttribute.setXY(i * times + j, j * step, 0);
                positionAttribute.setXYZ(i * times + j, x, y, z);
            }
        }
        // Create the buffer geometry and attach all the attributes
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", positionAttribute);
        geometry.setAttribute("delay", typeAttribute);
        if (isRainBow) {
            geometry.setAttribute("color", vertexColorAttribute);
        }
        // Prepare a uniform to drive the time animation in the shader
        let timeUniform = { value: 0 };
        // Create the custom shader-driven material
        const material = this.createMaterial(timeUniform, color);
        if (isRainBow) {
            material.vertexColors = true;
            material.color = new THREE.Color(1, 1, 1);
        }
        // Create the THREE.Points object and attach metadata for animation control
        const points = new THREE.Points(geometry, material);
        points.userData.time = timeUniform;
        points.userData.clock = new THREE.Clock();
        points.userData.startPoint = startPoint;
        points.userData.endPoint = endPoint;
        
        return points;
    }

    // Creates the custom PointsMaterial using Three.js's onBeforeCompile hook to inject GLSL code
    /*
        I use onBeforeCompile to inject GLSL code into Three.js's built-in shader.
        This allows me to customize how the fireworks particles behave:
    
        - In the vertex shader, I add a time uniform and a delay attribute to control animation.
        I implement random explosion directions on a sphere and apply gravity over time.
        This creates the effect of particles spreading out and falling.
    
        - In the fragment shader, I replace the default code to implement a fade-out effect
        that changes opacity over time, making particles gradually disappear.
    
        By injecting this code, I can keep using the standard PointsMaterial and renderer
        while adding realistic animation and effects for the fireworks.
     */
    createMaterial(timeUniform, color = new THREE.Color(1, 1, 1)) {
        const material = new THREE.PointsMaterial({
            size: 0.02,
            color: color,
            transparent: true,
            alphaTest: 0.05,
            sizeAttenuation: true,
            depthTest: false,
            blending: THREE.AdditiveBlending,
        });

        material.onBeforeCompile = (shader) => {
            shader.uniforms["uTime"] = timeUniform;

            // Vertex Shader Injection
            shader.vertexShader = shader.vertexShader.replace(
                "#include <common>",
                `
                #include <common>
                uniform float uTime;
                attribute vec2 delay;
                
                vec3 hash13( uint n ) {
                    n = (n << 13U) ^ n;
                    n = n * (n * n * 15731U + 789221U) + 1376312589U;
                    uvec3 k = n * uvec3(n,n*16807U,n*48271U);
                    return vec3( k & uvec3(0x7fffffffU))/float(0x7fffffff);
                }

                vec3 randomPositionInSphere(in float u, in float v, in float w){
                    float theta = u * 2. * PI;
                    float phi = acos(2. * v - 1.);
                    float r = pow(w, 1./3.)*0.2+0.9;
                    float sinTheta = sin(theta), cosTheta = cos(theta);
                    float sinPhi = sin(phi), cosPhi = cos(phi);
                    float x = r * sinPhi * cosTheta;
                    float y = r * sinPhi * sinTheta;
                    float z = r * cosPhi;
                    return vec3(x,y,z);
                }
                `
            );
            // Fragment Shader Replacement 
            // The default shader is replaced entirely to implement a custom fade-out effect
            shader.vertexShader = shader.vertexShader.replace(
                "#include <project_vertex>",
                `
                vec3 randomPosition = hash13( uint(position.x*65526.+position.y*65526.+position.z*65526.+floor(uTime)));
                vec3 randomOnSphere = randomPositionInSphere(randomPosition.x, randomPosition.y, randomPosition.z);
                
                float t = uTime-delay.x;
                if(t < 0.) t = 0.;
                
                float d1 = 1. - pow(1.0-t, 3.0);
                float grav = 0.7;
                vec3 gravityEffect = vec3(0.,-1.,0.) * (t*t*grav*grav) * 1.2;
                vec3 newPos = (randomOnSphere * d1) + gravityEffect;
                
                transformed = newPos;

                #include <project_vertex>
                `
            );
            
            shader.vertexShader = shader.vertexShader.replace(
                "gl_PointSize = size;",
                `gl_PointSize = size * (1.-delay.x*10.);`
            );

            shader.fragmentShader = `
                uniform vec3 diffuse;
                uniform float uTime; 

                #include <common>
                #include <color_pars_fragment>
                #include <map_particle_pars_fragment>
                #include <alphatest_pars_fragment>
                #include <fog_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                #include <clipping_planes_pars_fragment>

                void main() {
                    #include <clipping_planes_fragment>
                    vec3 outgoingLight = vec3( 0.0 );
                    
                    // Calcola l'opacità per la dissolvenza
                    float finalOpacity = (0.9 - fract(uTime) * fract(uTime)) * 1.6;
                    vec4 diffuseColor = vec4( diffuse, finalOpacity );
                    
                    #include <logdepthbuf_fragment>
                    #include <map_particle_fragment>
                    #include <color_fragment>
                    #include <alphatest_fragment>

                    outgoingLight = diffuseColor.rgb;

                    // Usa i chunk moderni di Three.js per l'output
                    #include <output_fragment>
                    #include <tonemapping_fragment>
                    #include <encodings_fragment>
                    #include <fog_fragment>
                }
            `;
        };

        return material;
    }

    // Updates the animation state of each active firework
    update() {
        const removeGroup = [];
        
        for (let item of this.fireWorkGroup) {
            const time = item.points.userData.clock.getElapsedTime() * 0.23;
            // 'bloomTime' is the time value for the explosion animation (driven by the shader)
            const bloomTime = Math.max(0, time * 2 - 1);
            // 'roundTime' is the time value for the initial rocket trail animation
            const roundTime = Math.min(time * 2, 1);
            // Pass the explosion time to the shader
            item.points.userData.time.value = bloomTime;

            if (bloomTime > 0) {
                if (item.points.material instanceof THREE.PointsMaterial) {
                    item.points.material.size = 0.03 * (1 - bloomTime) + 0.01;
                }
            } else {
                const endPosition = item.points.userData.endPoint;
                const startPoint = item.points.userData.startPoint;
                const currentPoint = startPoint.clone().add(
                    endPosition.clone().sub(startPoint).multiplyScalar(1 - Math.pow(1 - roundTime, 2))
                );
                item.points.position.copy(currentPoint);
                if (item.points.material instanceof THREE.PointsMaterial) {
                    item.points.material.size = 0.03;
                }
            }
            // If the firework's animation cycle is complete, flag it for removal
            if (item.points.userData.time.value >= 1) {
                removeGroup.push(item);
            }
        }
        
        // Remove and dispose of all finished fireworks
        for (let i = 0; i < removeGroup.length; i++) {
            const removeItem = removeGroup[i];
            const index = this.fireWorkGroup.indexOf(removeItem);
            if (index > -1) {
                this.fireWorkGroup.splice(index, 1);
                this.scene.remove(removeItem.points);
                removeItem.points.geometry.dispose();
                removeItem.points.material.dispose();
            }
        }
    }
}