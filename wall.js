import * as THREE from 'https://esm.sh/three@0.150.1';

const textureLoader = new THREE.TextureLoader();
const wallTexture = textureLoader.load('TEXTURE/DIRT.png'); // Carichiamo la nuova texture

export class Wall {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);


    const material = new THREE.MeshStandardMaterial({ 
        map: wallTexture 
    });

    this.mesh = new THREE.Mesh(geometry, material);
    
    this.mesh.userData = {
      isWall   : true,
      type     : 'cube',   
      topHeight: position.y + 0.5
    };
    
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}