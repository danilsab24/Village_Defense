import * as THREE from 'https://esm.sh/three@0.150.1';

const textureLoader = new THREE.TextureLoader();
const strongTexture = textureLoader.load('TEXTURE/STONE.png'); // texture

export class StrongBlock {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);

    const material = new THREE.MeshStandardMaterial({ 
        map: strongTexture
    });

    this.mesh = new THREE.Mesh(geometry, material);
    
    this.mesh.userData = {
      isStrongBlock: true,
      isWall: true,
      type: 'strong',   
      topHeight: position.y + 0.5
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}