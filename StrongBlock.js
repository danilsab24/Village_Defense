import * as THREE from 'https://esm.sh/three@0.150.1';
import { textureLoader } from './assets.js'; 

const strongTexture = textureLoader.load('TEXTURE/STONE.png');
const crackedStoneTexture = textureLoader.load('TEXTURE/STONE_CRACKS.png');


export class StrongBlock {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);

    const material = new THREE.MeshStandardMaterial({ 
        map: strongTexture
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Set userData for game logic and identification
    this.mesh.userData = {
      isStrongBlock: true,
      isWall: true, 
      type: 'strong',   
      isDamaged: false,// This flag tracks the block's damage state
      // A function to update the block's appearance based on its state
      updateVisuals: this.updateVisuals.bind(this) 
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  /*
    Updates the block's visual appearance by swapping its texture
    based on the `isDamaged` state
  */
  updateVisuals() {
    if (this.mesh.userData.isDamaged) {
      this.mesh.material.map = crackedStoneTexture;
    } else {
      this.mesh.material.map = strongTexture;
    }
    // Re-rendered beacause the material has changed
    this.mesh.material.needsUpdate = true;
  }
}