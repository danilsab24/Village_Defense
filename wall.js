import * as THREE from 'https://esm.sh/three@0.150.1';

export class Wall {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Aggiungi userData direttamente nel costruttore
    this.mesh.userData = {
      isWall: true,
      topHeight: position.y + 0.5
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
    this.mesh.userData = {
      isWall   : true,
      type     : 'cube',   
      topHeight: position.y + 0.5
  };
  }
  
}