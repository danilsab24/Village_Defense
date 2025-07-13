import * as THREE from 'https://esm.sh/three@0.150.1';
import { GLTFLoader } from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';

// A single, shared LoadingManager to monitor all assets
export const loadingManager = new THREE.LoadingManager();

// A shared TextureLoader instance for loading image textures
export const gltfLoader = new GLTFLoader(loadingManager);
export const textureLoader = new THREE.TextureLoader(loadingManager);