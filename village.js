import * as THREE from 'https://esm.sh/three@0.150.1';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';

// A separate loader instance is used specifically for house models.
// This prevents potential conflicts with a global loading manager
const houseLoader = new GLTFLoader();

// Maps the logical height of a house to its corresponding 3D model file
const houseModels = {
    2: 'MODEL/2H_house.glb',
    4: 'MODEL/4H_house.glb',
    6: 'MODEL/6H_house.glb'
};

export class House {
  constructor(scene, position, cellSize = 1, height = 2) {
    // All houses occupy a 2x2 grid area
    const width = cellSize * 2;
    const depth = cellSize * 2; 

    // Create an invisible mesh to act as the primary object.
    // This mesh serves as the hitbox for collisions and raycasting
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshBasicMaterial({ 
        transparent: true, 
        opacity: 0,
        depthWrite: false
    }); 
    this.mesh = new THREE.Mesh(geometry, material);

    // The invisible hitbox should not cast or receive shadows
    this.mesh.castShadow = false; 
    this.mesh.receiveShadow = false;

    // Set userData for game logic identification
    this.mesh.userData = {
      isHouse  : true,
      type     : `house_h${height}`,
      height   : height,
    };
    this.mesh.position.copy(position);

    // Load the corresponding visible 3D model
    const modelPath = houseModels[height];
    if (modelPath) {
        // Enable shadows for all meshes within the loaded model
        houseLoader.load(modelPath, (gltf) => {
            const model = gltf.scene;

            model.traverse(function (node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true; 
                }
            });

            // Calculate the correct scale to make the model fit perfectly inside the invisible hitbox
            const box = new THREE.Box3().setFromObject(model);
            const modelSize = box.getSize(new THREE.Vector3());

            const scaleX = width / modelSize.x;
            const scaleY = height / modelSize.y;
            const scaleZ = depth / modelSize.z;
      
            let scale;
            // Apply model-specific adjustments to fix pivot points or scaling issues
            if (modelPath == 'MODEL/6H_house.glb'){
              model.position.y = height / 32;
              scale = Math.min(scaleX, scaleY, scaleZ) * 1.3;
            }else{
              model.position.y = -height/2; // Center the model vertically inside the hitbox
              scale = Math.min(scaleX, scaleY, scaleZ) * 1.1;
            }
            model.scale.set(scale, scale, scale);
            // Add the visible model as a child of the invisible hitbox mesh
            this.mesh.add(model);
        });
    }
    // Add the main container mesh (the hitbox) to the scene
    scene.add(this.mesh);
  }
}