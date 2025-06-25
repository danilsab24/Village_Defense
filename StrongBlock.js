import * as THREE from 'https://esm.sh/three@0.150.1';

export class StrongBlock {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);
    // orange color
    const material = new THREE.MeshStandardMaterial({ color: 0xffa500 }); 
    this.mesh = new THREE.Mesh(geometry, material);
    

    this.mesh.userData = {
      isStrongBlock: true, // Proprietà specifica
      isWall: true,        // Lo trattiamo come un muro per la logica di supporto e gravità
      type: 'strong',   
      topHeight: position.y + 0.5
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}