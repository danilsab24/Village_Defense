import * as THREE from 'https://esm.sh/three@0.150.1';

export class House {
  constructor(scene, position) {
    const geometry = new THREE.BoxGeometry(1.5, 0.75, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}
