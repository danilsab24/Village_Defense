import * as THREE from 'https://esm.sh/three@0.150.1';
import { textureLoader } from './assets.js'; // MODIFICATO

const wallTexture = textureLoader.load('TEXTURE/DIRT.png');

export class Wall {
  // A single wall block is a cube with a height of 1 uni
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);
    const material = new THREE.MeshStandardMaterial({ 
        map: wallTexture 
    });

    this.mesh = new THREE.Mesh(geometry, material);
    
    // Enable shadows for this object
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true; // Receive shadows from any blocks placed on top of them
    // Set userData for game logic and identification by other systems
    this.mesh.userData = {
      isWall   : true,
      type     : 'cube',   
      topHeight: position.y + 0.5  // The Y-coordinate of the top surface of the block
    };
    
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}