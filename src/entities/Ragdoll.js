// A floppy humanoid driven by physics. Six cannon bodies (torso, head, two
// arms, two legs) joined with cone-twist constraints, and a rigged glTF
// character whose bones follow those bodies every frame.
//
// The body layout is measured from the model's own skeleton, so any humanoid
// with the Quaternius bone names (Hips, Neck, Head, UpperArm.L, Hand.L,
// UpperLeg.L, Foot.L ...; GLTFLoader strips the dots) works. Used for the player when they flop (R) and
// for Gary the intern. Every body carries userData so the Grabber can pick up
// any limb: the foundation for grabbing friends in co-op and the truck arm.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL, HELD_MASK } from '../systems/PhysicsWorld.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const _ps = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const LIMBS = [
  { key: 'armL', from: 'UpperArmL', to: 'HandL', half: 0.055, mass: 3, angle: Math.PI / 1.7, twist: Math.PI / 4 },
  { key: 'armR', from: 'UpperArmR', to: 'HandR', half: 0.055, mass: 3, angle: Math.PI / 1.7, twist: Math.PI / 4 },
  { key: 'legL', from: 'UpperLegL', to: 'FootL', half: 0.075, mass: 7, angle: Math.PI / 3.2, twist: Math.PI / 8 },
  { key: 'legR', from: 'UpperLegR', to: 'FootR', half: 0.075, mass: 7, angle: Math.PI / 3.2, twist: Math.PI / 8 },
];

// Fixed body order, used to pack ragdoll poses into network snapshots.
export const PART_ORDER = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

export class Ragdoll {
  /**
   * @param {object} opts { model: Object3D (rigged instance from Assets), position: feet {x,y,z}, yaw, name,
   *   simulate: false makes a network puppet: kinematic bodies with no joints or
   *   collisions whose poses come from the host. They can still be raycast (to grab). }
   */
  constructor(physics, scene, opts) {
    this.physics = physics;
    this.simulate = opts.simulate !== false;
    this.scene = scene;
    this.name = opts.name ?? 'ragdoll';
    this.model = opts.model;
    this.parts = {};
    this.bodies = [];
    this.constraints = [];
    this.links = [];
    this.held = 0;

    const bones = {};
    this.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.bones = bones;
    this.restPose = Object.values(bones).map((b) => [b, b.position.clone(), b.quaternion.clone()]);
    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, 0, 0);
    this.model.updateMatrixWorld(true);
    scene.add(this.model);

    const pos = (name) => bones[name].getWorldPosition(new THREE.Vector3());
    const height = this.model.userData.size?.y ?? 1.8;

    // ---- Measure the skeleton and build bodies in model space ----
    this.layout = {};
    const hips = pos('Hips'), neck = pos('Neck'), head = pos('Head');
    const torsoH = neck.y - hips.y;
    this.addPart('torso', new CANNON.Box(new CANNON.Vec3(0.19, torsoH / 2, 0.11)), 20,
      hips.clone().lerp(neck, 0.5), new THREE.Quaternion());
    const headR = THREE.MathUtils.clamp((height - head.y) / 2, 0.1, 0.16);
    this.addPart('head', new CANNON.Sphere(headR), 5, new THREE.Vector3(head.x, head.y + headR, head.z), new THREE.Quaternion());

    const limbDirs = {};
    for (const l of LIMBS) {
      const a = pos(l.from), b = pos(l.to);
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      limbDirs[l.key] = { dir, pivot: a };
      this.addPart(l.key, new CANNON.Box(new CANNON.Vec3(l.half, len / 2, l.half)), l.mass,
        a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir));
    }

    // Bodies are at their rest layout right now (model space == world space).
    this.applyLayout(new THREE.Vector3(), 0);

    // ---- Joints ----
    const joint = (a, b, pivotWorld, axisWorld, angle, twist) => {
      const A = this.parts[a], B = this.parts[b];
      const pw = new CANNON.Vec3(pivotWorld.x, pivotWorld.y, pivotWorld.z);
      const aw = new CANNON.Vec3(axisWorld.x, axisWorld.y, axisWorld.z);
      const c = new CANNON.ConeTwistConstraint(A, B, {
        pivotA: A.pointToLocalFrame(pw), pivotB: B.pointToLocalFrame(pw),
        axisA: A.vectorToLocalFrame(aw), axisB: B.vectorToLocalFrame(aw),
        angle, twistAngle: twist, collideConnected: false,
      });
      if (!this.simulate) return;
      physics.world.addConstraint(c);
      this.constraints.push(c);
    };
    joint('torso', 'head', neck, UP, Math.PI / 5, Math.PI / 6);
    for (const l of LIMBS) joint('torso', l.key, limbDirs[l.key].pivot, limbDirs[l.key].dir, l.angle, l.twist);

    // ---- Bone links: rest offset between each body and the bone it drives ----
    const link = (part, boneName, withPosition = false) => {
      const body = this.parts[part];
      const bone = bones[boneName];
      const bq = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      const inv = bq.clone().invert();
      const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
      const entry = { body, bone, offQ: inv.clone().multiply(boneQ) };
      if (withPosition) {
        entry.offP = bone.getWorldPosition(new THREE.Vector3()).sub(_v.set(body.position.x, body.position.y, body.position.z)).applyQuaternion(inv);
      }
      this.links.push(entry);
    };
    link('torso', 'Hips', true);
    link('head', 'Head');
    link('armL', 'UpperArmL'); link('armR', 'UpperArmR');
    link('legL', 'UpperLegL'); link('legR', 'UpperLegR');

    this.teleport(opts.position ?? { x: 0, y: 0, z: 0 }, opts.yaw ?? 0);
  }

  addPart(key, shape, mass, position, quaternion) {
    const body = new CANNON.Body({
      mass: this.simulate ? mass : 0,
      type: this.simulate ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC,
      shape,
      linearDamping: 0.05,
      angularDamping: 0.4,
      collisionFilterGroup: GROUP.RAGDOLL,
      collisionFilterMask: this.simulate ? MASK_ALL : 0,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
    });
    body.userData = { kind: 'ragdoll', ragdoll: this, part: key, grabbable: true };
    this.physics.add(body);
    this.parts[key] = body;
    this.bodies.push(body);
    this.layout[key] = { position: position.clone(), quaternion: quaternion.clone() };
  }

  applyLayout(pos, yaw) {
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (const [key, l] of Object.entries(this.layout)) {
      const body = this.parts[key];
      const p = l.position.clone().applyQuaternion(rot).add(pos);
      const q = rot.clone().multiply(l.quaternion);
      body.position.set(p.x, p.y, p.z);
      body.quaternion.set(q.x, q.y, q.z, q.w);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();
    }
  }

  get torso() { return this.parts.torso; }
  get position() { return this.parts.torso.position; }

  // Stand the ragdoll up in its rest pose at a feet position.
  teleport(pos, yaw = 0) {
    for (const [bone, p, q] of this.restPose) { bone.position.copy(p); bone.quaternion.copy(q); }
    this.applyLayout(new THREE.Vector3(pos.x, pos.y, pos.z), yaw);
    this.sync();
  }

  // Copy physics bodies onto the skeleton. Call after each physics step.
  sync() {
    for (const l of this.links) {
      const b = l.body;
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const parent = l.bone.parent;
      parent.updateWorldMatrix(true, false);
      parent.matrixWorld.decompose(_pp, _pq, _ps);
      l.bone.quaternion.copy(_pq.invert().multiply(_q.clone().multiply(l.offQ)));
      if (l.offP) {
        _v.copy(l.offP).applyQuaternion(_q).add(b.position);
        l.bone.position.copy(parent.worldToLocal(_v));
      }
      l.bone.updateMatrixWorld(true);
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
    this.held = Math.max(0, this.held + (isHeld ? 1 : -1));
    if (!this.simulate || this.disposed) return;
    const mask = this.held > 0 ? HELD_MASK : MASK_ALL;
    for (const b of this.bodies) b.collisionFilterMask = mask;
  }

  dispose() {
    this.disposed = true;
    for (const c of this.constraints) this.physics.world.removeConstraint(c);
    for (const b of this.bodies) this.physics.remove(b);
    this.scene.remove(this.model); // geometry/materials are shared with the asset cache
  }
}
