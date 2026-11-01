// Loads and normalizes glTF models listed in data/models.js.
// Every model is scaled to a target size and has its feet/base moved to y=0,
// so builders can place things in meters without caring how the source file
// was authored. Skinned characters are cloned with SkeletonUtils so each
// instance gets its own skeleton (needed for ragdolls).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../data/models.js';

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.models = new Map();
  }

  async loadAll(onProgress = () => {}) {
    const entries = Object.entries(MODELS);
    let done = 0;
    await Promise.all(entries.map(async ([id, def]) => {
      try {
        const gltf = await this.loader.loadAsync(def.url);
        this.models.set(id, this.normalize(gltf.scene, def));
      } catch (err) {
        console.warn(`Model "${id}" failed to load (${def.url}); using a placeholder.`, err);
        this.models.set(id, this.placeholder(def));
      }
      onProgress(++done / entries.length, id);
    }));
  }

  normalize(scene, def) {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    let scale = 1;
    if (def.height) scale = def.height / size.y;
    else if (def.width) scale = def.width / Math.max(size.x, size.z);
    else if (def.scale) scale = def.scale;
    const wrapper = new THREE.Group();
    wrapper.name = def.url;
    scene.scale.multiplyScalar(scale);
    scene.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(scene);
    const center = b2.getCenter(new THREE.Vector3());
    scene.position.x -= center.x;
    scene.position.z -= center.z;
    scene.position.y -= b2.min.y;
    wrapper.add(scene);
    wrapper.traverse((o) => {
      if (o.isMesh) {
        // These packs export every material as 40% metallic and fairly glossy,
        // which turns them chalky under sky lighting. Make them matte, keep
        // real metal and glass a little shiny, and liven up foliage.
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.userData.fixed) continue;
          m.userData.fixed = true;
          const name = (m.name || '').toLowerCase();
          const shiny = /metal|glass|steel|iron/.test(name);
          m.metalness = shiny ? 0.5 : 0;
          m.roughness = shiny ? 0.4 : 0.85;
          if (/green|leaf|leaves|grass|bush/.test(name)) m.color.offsetHSL(0.01, 0.12, 0.03);
        }
        o.castShadow = def.castShadow !== false;
        o.receiveShadow = true;
        if (o.isSkinnedMesh) o.frustumCulled = false;
      }
    });
    wrapper.userData.size = b2.getSize(new THREE.Vector3());
    wrapper.userData.skinned = !!scene.getObjectByProperty('isSkinnedMesh', true);
    return wrapper;
  }

  placeholder(def) {
    const h = def.height ?? def.width ?? 1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(h * 0.5, h, h * 0.5), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
    mesh.position.y = h / 2;
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.size = new THREE.Vector3(h * 0.5, h, h * 0.5);
    return g;
  }

  has(id) { return this.models.has(id); }

  // A fresh, independent copy you can add to the scene.
  instance(id) {
    const src = this.models.get(id);
    if (!src) throw new Error(`Unknown model "${id}"`);
    const copy = src.userData.skinned ? SkeletonUtils.clone(src) : src.clone();
    copy.userData = { ...src.userData };
    return copy;
  }

  // Many copies of a static model as InstancedMeshes (cheap trees, grass...).
  // matrices: array of THREE.Matrix4 placing each copy.
  instanced(id, matrices, { castShadow = true } = {}) {
    const src = this.models.get(id);
    const group = new THREE.Group();
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const inst = new THREE.InstancedMesh(geo, o.material, matrices.length);
      matrices.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = castShadow;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
    });
    return group;
  }

  size(id) { return this.models.get(id)?.userData.size ?? new THREE.Vector3(1, 1, 1); }
}
