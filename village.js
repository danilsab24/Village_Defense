import * as THREE from 'https://esm.sh/three@0.150.1';

export class House {
  constructor(scene, position, cellSize = 1) {
    const width = cellSize * 2;
    const height = 0.75;
    const geometry = new THREE.BoxGeometry(width, height, cellSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Aggiungi userData direttamente nel costruttore
    this.mesh.userData = {
      isHouse: true,
      topHeight: position.y + 0.375 // Metà dell'altezza della casa (0.75 unità)
    };
    this.mesh.userData = {
      isHouse  : true,
      type     : 'house',  
      topHeight: position.y + height / 2   // 0.75 / 2 = 0.375
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}