// Tied trash bags that exist in the world as physics objects: thrown with G,
// grabbed with E, picked back onto your belt with the picker, or tossed into
// the dumpster to sell.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from './PhysicsWorld.js';

export class LooseBags {
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.bags = [];
    this.geo = new THREE.SphereGeometry(0.32, 14, 10);
    this.geo.scale(1, 1.15, 1);
    this.knotGeo = new THREE.ConeGeometry(0.1, 0.22, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.1 });
  }

  makeMesh() {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    const knot = new THREE.Mesh(this.knotGeo, this.mat);
    knot.position.y = 0.42;
    mesh.add(knot);
    mesh.castShadow = true;
    return mesh;
  }

  spawn(bag, position, velocity = { x: 0, y: 0, z: 0 }, { decorative = false, life = Infinity } = {}) {
    const mesh = this.makeMesh();
    this.scene.add(mesh);
    const body = new CANNON.Body({
      mass: 2 + bag.used * 0.3,
      shape: new CANNON.Sphere(0.34),
      collisionFilterGroup: GROUP.BAG,
      collisionFilterMask: MASK_ALL,
      linearDamping: 0.15,
      angularDamping: 0.5,
    });
    body.position.set(position.x, position.y, position.z);
    body.velocity.set(velocity.x, velocity.y, velocity.z);
    const entry = { bag, body, mesh, life, decorative };
    body.userData = { kind: 'bag', entry, grabbable: !decorative, sellable: !decorative };
    this.physics.add(body, mesh);
    this.bags.push(entry);
    return entry;
  }

  remove(entry) {
    const i = this.bags.indexOf(entry);
    if (i >= 0) this.bags.splice(i, 1);
    this.physics.remove(entry.body);
    this.scene.remove(entry.mesh);
  }

  update(dt) {
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const e = this.bags[i];
      e.life -= dt;
      if (e.life <= 0) this.remove(e);
    }
  }
}
