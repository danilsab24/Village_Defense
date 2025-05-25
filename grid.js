// grid.js
import * as THREE from 'https://unpkg.com/three@0.150.1/build/three.module.js';

export class Grid {
  constructor(scene, size = 40, divisions = 30) {
    this.scene = scene;
    this.size = size;
    this.divisions = divisions;

    this.createPlatform();
    this.createGridHelper();
  }

  createPlatform() {
    // BoxGeometry con spessore lungo l’asse Y
    const thickness = 1; // per una piattaforma più alta
    const geometry = new THREE.BoxGeometry(this.size, thickness, this.size);
    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
    });

    this.plane = new THREE.Mesh(geometry, material);

    // Abbassa la piattaforma per tenere il piano superiore allineato a y=0
    this.plane.position.y = -thickness / 2;

    this.plane.receiveShadow = true;
    this.scene.add(this.plane);
  }

  createGridHelper() {
    const grid = new THREE.GridHelper(this.size, this.divisions, 0x000000, 0x000000);
    grid.position.y = 0.01; // leggermente sopra per evitare z-fighting
    this.scene.add(grid);
  }

  getPlaneMesh() {
    return this.plane;
  }
}
