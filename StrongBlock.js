import * as THREE from 'https://esm.sh/three@0.150.1';

const textureLoader = new THREE.TextureLoader();
const strongTexture = textureLoader.load('TEXTURE/STONE.png');

export class StrongBlock {
  constructor(scene, position, cellSize = 1) {
    const geometry = new THREE.BoxGeometry(cellSize, 1, cellSize);

    // materiale clonabile per evitare che tutti i blocchi cambino texture insieme
    const material = new THREE.MeshStandardMaterial({ 
        map: strongTexture
    });

    this.mesh = new THREE.Mesh(geometry, material);
    
    // lo stato per sapere se il blocco è danneggiato
    this.mesh.userData = {
      isStrongBlock: true,
      isWall: true, // Mantiene la compatibilità con la gravità
      type: 'strong',   
      isDamaged: false // Ogni blocco parte come "non danneggiato"
    };

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }
}