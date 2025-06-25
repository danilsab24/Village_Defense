import * as THREE from 'https://esm.sh/three@0.150.1';

export class House {
  constructor(scene, position, cellSize = 1, height = 2) {
    const width = cellSize * 2;
    const depth = cellSize * 2; 
    // L'altezza non è più fissa, ma viene passata come argomento

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    this.mesh = new THREE.Mesh(geometry, material);
    
    this.mesh.userData = {
      isHouse  : true,
      type     : `house_h${height}`,
      height   : height,
      topHeight: position.y + height / 2
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}