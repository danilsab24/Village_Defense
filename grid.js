import * as THREE from 'https://esm.sh/three@0.150.1';
import { textureLoader } from './assets.js';


export class Grid {
  constructor(scene, buildAreaSize = 40, divisions = 30) {
    this.scene = scene;
    this.buildAreaSize = buildAreaSize; // The size of the central, buildable grid
    this.divisions = divisions;
    this.platformSize = 120;            // The total size of the circular ground platform

    this.createPlatform();
    this.createGridHelper();
  }

  // Creates the large, circular ground platform for the entire level
  createPlatform() {
    const thickness = 1;
    const radius = this.platformSize / 2;
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 64);
    const groundTexture = textureLoader.load('TEXTURE/ground.png');
    // Use RepeatWrapping to tile the texture across the large surface
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(30, 30);

    const material = new THREE.MeshStandardMaterial({
      map: groundTexture,
    });

    this.plane = new THREE.Mesh(geometry, material);
    this.plane.position.y = -thickness / 2;
    this.plane.receiveShadow = true;    // The ground should receive shadows from other object
    
    // Set properties on the mesh's `userData` object for identification
    this.plane.userData.isGround = true;
    this.plane.name = "gridPlatform";

    this.scene.add(this.plane);
  }

  // Creates the visual grid helper that shows the buildable area
  createGridHelper() {
    const grid = new THREE.GridHelper(this.buildAreaSize, this.divisions, 0x555555, 0x888888);
    // Position the grid slightly above the platform to prevent Z-fighting
    grid.position.y = 0.01;
    this.scene.add(grid);
  }
  // A getter method to provide access to the platform mesh
  getPlaneMesh() {
    return this.plane;
  }
}