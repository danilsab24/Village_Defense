import * as THREE from 'https://esm.sh/three@0.150.1';

export class House {
  constructor(scene, position, cellSize = 1) {
    const width = cellSize * 2;
    // MODIFICATO: La profondità (depth) è ora uguale alla larghezza (width) per fare un cubo 2x2
    const depth = cellSize * 2; 
    const height = 1.5; // Aumentiamo l'altezza per renderla cubica (2x1.5x2 in unità di scena)

    // MODIFICATO: La geometria ora usa la nuova profondità
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    this.mesh = new THREE.Mesh(geometry, material);
    
    this.mesh.userData = {
      isHouse  : true,
      type     : 'house',  
      // MODIFICATO: L'altezza va ricalcolata in base alla nuova `height`
      topHeight: position.y + height / 2
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}