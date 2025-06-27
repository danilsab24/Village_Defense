import * as THREE from 'https://esm.sh/three@0.150.1';
// per gestire i file .glb -> sono i modelli 
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';


const loader = new GLTFLoader();
const houseModels = {
    2: 'MODEL/2H_house.glb',
    4: 'MODEL/4H_house.glb',
    6: 'MODEL/6H_house.glb'
};

export class House {
  constructor(scene, position, cellSize = 1, height = 2) {
    const width = cellSize * 2;
    const depth = cellSize * 2; 

    // CREA IL CONTENITORE INVISIBILE
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Il materiale è trasparente e non visibile
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }); 
    this.mesh = new THREE.Mesh(geometry, material);
    
    this.mesh.userData = {
      isHouse  : true,
      type     : `house_h${height}`,
      height   : height,
    };
    this.mesh.position.copy(position);

    // CARICA E AGGIUNGI IL MODELLO VISIBILE
    const modelPath = houseModels[height]; // Seleziona il modello corretto
    if (modelPath) {
        loader.load(modelPath, (gltf) => {
            const model = gltf.scene;

            // Adatta il modello al contenitore. Potrebbe essere necessario
            // fare delle prove con scala e posizione per un allineamento perfetto.
            const box = new THREE.Box3().setFromObject(model);
            const modelSize = box.getSize(new THREE.Vector3());

            // Calcola la scala per far entrare il modello nel contenitore
            const scaleX = width / modelSize.x;
            const scaleY = height / modelSize.y;
            const scaleZ = depth / modelSize.z;
      
            // Centra e appoggia il modello alla base del contenitore
            if (modelPath == 'MODEL/6H_house.glb'){
              model.position.y = height / 32;
              var scale = Math.min(scaleX, scaleY, scaleZ) * 1.3;
            }else{
              model.position.y = -height/2;
              var scale = Math.min(scaleX, scaleY, scaleZ) * 1.1;
            }
            model.scale.set(scale, scale, scale);
            
            this.mesh.add(model);
        });
    }
    
    scene.add(this.mesh);
  }
}