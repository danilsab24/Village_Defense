import * as THREE from 'https://esm.sh/three@0.150.1';

export class House {
  constructor(scene, position, cellSize = 1) {
    // Larghezza = 2 celle, Altezza = 0.75, Profondità = 1 cella
    const width = cellSize * 2;
    const height = 0.75;
    const depth = cellSize;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    this.mesh = new THREE.Mesh(geometry, material);

    // Centra verticalmente
    this.mesh.position.set(position.x, height / 2, position.z);

    scene.add(this.mesh);
  }
}
