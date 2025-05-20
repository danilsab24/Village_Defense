import * as THREE from 'https://esm.sh/three@0.150.1';


export class Wall {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    this.mesh = new THREE.Mesh(geometry, material);

    // centra sull'altezza
    this.mesh.position.set(position.x, 0.5, position.z);

    scene.add(this.mesh);
  }
}