// A floppy 6-part humanoid: torso, head, 2 arms, 2 legs joined with
// cone-twist constraints. Used for the player when they flop (R), and for Gary
// the intern NPC. Every body carries userData so the Grabber can pick up any
// limb, which is the foundation for grabbing/carrying/throwing friends in co-op
// and for the garbage truck's lifting arm.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';

const PARTS = {
  torso: { shape: 'box', half: [0.25, 0.35, 0.15], pos: [0, 1.15, 0], mass: 18, color: 'shirt' },
  head:  { shape: 'sphere', radius: 0.2, pos: [0, 1.7, 0], mass: 4, color: 'skin' },
  armL:  { shape: 'box', half: [0.08, 0.3, 0.08], pos: [-0.35, 1.15, 0], mass: 3, color: 'skin' },
  armR:  { shape: 'box', half: [0.08, 0.3, 0.08], pos: [0.35, 1.15, 0], mass: 3, color: 'skin' },
  legL:  { shape: 'box', half: [0.1, 0.4, 0.1], pos: [-0.13, 0.4, 0], mass: 6, color: 'pants' },
  legR:  { shape: 'box', half: [0.1, 0.4, 0.1], pos: [0.13, 0.4, 0], mass: 6, color: 'pants' },
};

const DOWN = [0, -1, 0];
const JOINTS = [
  { a: 'torso', b: 'head', pivotA: [0, 0.35, 0], pivotB: [0, -0.2, 0], axis: [0, 1, 0], angle: Math.PI / 5, twist: Math.PI / 6 },
  { a: 'torso', b: 'armL', pivotA: [-0.35, 0.3, 0], pivotB: [0, 0.3, 0], axis: DOWN, angle: Math.PI / 1.6, twist: Math.PI / 4 },
  { a: 'torso', b: 'armR', pivotA: [0.35, 0.3, 0], pivotB: [0, 0.3, 0], axis: DOWN, angle: Math.PI / 1.6, twist: Math.PI / 4 },
  { a: 'torso', b: 'legL', pivotA: [-0.13, -0.35, 0], pivotB: [0, 0.4, 0], axis: DOWN, angle: Math.PI / 3.5, twist: Math.PI / 8 },
  { a: 'torso', b: 'legR', pivotA: [0.13, -0.35, 0], pivotB: [0, 0.4, 0], axis: DOWN, angle: Math.PI / 3.5, twist: Math.PI / 8 },
];

const v3 = (a) => new CANNON.Vec3(a[0], a[1], a[2]);

export class Ragdoll {
  /**
   * @param {object} opts { position: {x,y,z} feet position, yaw, colors: {shirt, skin, pants, hat}, name }
   */
  constructor(physics, scene, opts = {}) {
    this.physics = physics;
    this.scene = scene;
    this.name = opts.name ?? 'ragdoll';
    this.colors = { shirt: 0xff7a1a, skin: 0xf1c27d, pants: 0x34495e, hat: null, ...opts.colors };
    this.parts = {};
    this.bodies = [];
    this.meshes = [];
    this.constraints = [];
    this.held = 0;

    for (const [key, def] of Object.entries(PARTS)) {
      const shape = def.shape === 'box' ? new CANNON.Box(v3(def.half)) : new CANNON.Sphere(def.radius);
      const body = new CANNON.Body({
        mass: def.mass,
        shape,
        linearDamping: 0.05,
        angularDamping: 0.45,
        collisionFilterGroup: GROUP.RAGDOLL,
        collisionFilterMask: MASK_ALL,
        allowSleep: true,
        sleepSpeedLimit: 0.15,
      });
      body.userData = { kind: 'ragdoll', ragdoll: this, part: key, grabbable: true };

      const material = new THREE.MeshStandardMaterial({ color: this.colors[def.color], roughness: 0.8 });
      const geo = def.shape === 'box'
        ? new THREE.BoxGeometry(def.half[0] * 2, def.half[1] * 2, def.half[2] * 2)
        : new THREE.SphereGeometry(def.radius, 16, 12);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      if (key === 'head') this.decorateHead(mesh, def.radius);
      if (key === 'torso') this.decorateTorso(mesh, def.half);

      scene.add(mesh);
      physics.add(body, mesh);
      this.parts[key] = body;
      this.bodies.push(body);
      this.meshes.push(mesh);
    }

    for (const j of JOINTS) {
      const c = new CANNON.ConeTwistConstraint(this.parts[j.a], this.parts[j.b], {
        pivotA: v3(j.pivotA), pivotB: v3(j.pivotB),
        axisA: v3(j.axis), axisB: v3(j.axis),
        angle: j.angle, twistAngle: j.twist,
        collideConnected: false,
      });
      physics.world.addConstraint(c);
      this.constraints.push(c);
    }

    this.teleport(opts.position ?? { x: 0, y: 0, z: 0 }, opts.yaw ?? 0);
  }

  decorateHead(mesh, r) {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
      eye.position.set(x, 0.04, -r + 0.01);
      mesh.add(eye);
    }
    if (this.colors.hat != null) {
      const hat = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: this.colors.hat }),
      );
      hat.position.y = r * 0.55;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.18), hat.material);
      brim.position.set(0, -0.04, -r);
      hat.add(brim);
      mesh.add(hat);
    }
  }

  decorateTorso(mesh, half) {
    // Hi-vis stripe so every trash collector looks the part.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(half[0] * 2 + 0.01, 0.06, half[2] * 2 + 0.01),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x333333 }),
    );
    stripe.position.y = 0.05;
    mesh.add(stripe);
  }

  get torso() { return this.parts.torso; }
  get position() { return this.parts.torso.position; }

  // Put the ragdoll in its standing rest pose at a feet position.
  teleport(pos, yaw = 0) {
    const q = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    for (const [key, def] of Object.entries(PARTS)) {
      const body = this.parts[key];
      const offset = q.vmult(v3(def.pos));
      body.position.set(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z);
      body.quaternion.copy(q);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();
    }
  }

  setVelocity(v) {
    for (const b of this.bodies) { b.velocity.set(v.x, v.y, v.z); b.wakeUp(); }
  }

  addSpin(strength = 4) {
    for (const b of this.bodies) {
      b.angularVelocity.set((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
    }
  }

  speed() { return this.parts.torso.velocity.length(); }

  // While someone is holding us, don't collide with players (or we'd shove the
  // carrier around). Counted so multiple grabbers (co-op) work.
  setHeld(isHeld) {
    this.held += isHeld ? 1 : -1;
    const mask = this.held > 0 ? MASK_ALL & ~GROUP.PLAYER : MASK_ALL;
    for (const b of this.bodies) b.collisionFilterMask = mask;
  }

  setVisible(visible) { for (const m of this.meshes) m.visible = visible; }

  dispose() {
    for (const c of this.constraints) this.physics.world.removeConstraint(c);
    for (const b of this.bodies) this.physics.remove(b);
    for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); }
  }
}
