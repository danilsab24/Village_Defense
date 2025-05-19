import * as THREE from 'https://esm.sh/three@0.150.1';

export class Wall {
  constructor(scene, position) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}
