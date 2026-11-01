// The Rusty Pickup (Kenney "truck" model). An arcade vehicle: a dynamic body
// whose yaw and forward speed we set directly each frame (rotation locked to
// yaw), so it bumps into houses, plows through props, launches ragdolls and
// goes off the ramp.
//
// Networking: whoever is driving simulates it (snappy steering for them), and
// sends its pose. Everyone else, including the host, holds a kinematic copy
// that follows those poses and still shoves props and ragdolls around. With no
// driver the host simulates it.
//
// The bed is a real physics container (floor + rails), so Gary and loose trash
// ride along until they fall out. Bags in the bed are stored and sold at once.
//
// yaw follows the player convention: facing = (-sin yaw, 0, -cos yaw).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';

export const BED_CAPACITY = 12;
const RIDE_HEIGHT = 0.75; // body origin above the ground
const MAX_SPEED = 20, MAX_REVERSE = 7, ACCEL = 10, BRAKE = 24, DRAG = 1.2;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Truck {
  constructor({ physics, scene, assets }, { position, yaw = 0, simulate = true }) {
    this.physics = physics;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.driver = null; // player id
    this.bedCount = 0; // bags stored in the bed (host keeps the real list)
    this.wheelSpin = 0;
    this.crash = 0; // 0..1 how hard the last impact was (for the driver)
    this.home = { position: new THREE.Vector3(position.x, 0, position.z), yaw };

    const body = this.body = new CANNON.Body({
      mass: 900,
      material: physics.materials.vehicle,
      collisionFilterGroup: GROUP.VEHICLE,
      collisionFilterMask: MASK_ALL,
      allowSleep: false,
      linearDamping: 0.01,
    });
    body.angularFactor.set(0, 1, 0);
    const box = (hx, hy, hz, x, y, z) => body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z));
    for (const [x, z] of [[-0.85, -1.5], [0.85, -1.5], [-0.85, 1.5], [0.85, 1.5]]) body.addShape(new CANNON.Sphere(0.42), new CANNON.Vec3(x, 0.42 - RIDE_HEIGHT, z));
    box(1.15, 0.32, 2.45, 0, 0.05, 0); // chassis + bed floor
    box(1.05, 0.55, 0.8, 0, 0.85, -0.55); // cab
    box(0.06, 0.4, 1.1, -1.12, 0.75, 1.35); // bed rails
    box(0.06, 0.4, 1.1, 1.12, 0.75, 1.35);
    box(1.1, 0.4, 0.06, 0, 0.75, 2.45); // tailgate
    body.userData = { kind: 'vehicle', vehicle: this, grabbable: false, netId: 'truck' };

    this.mesh = this.buildMesh(assets, scene);
    physics.add(body, this.mesh);
    this.reset();
    this.setSimulated(simulate);
  }

  get position() { return this.mesh.position; }
  get yaw() { const q = this.body.quaternion; return 2 * Math.atan2(q.y, q.w); }
  forward(out = new THREE.Vector3()) { const y = this.yaw; return out.set(-Math.sin(y), 0, -Math.cos(y)); }
  left(out = new THREE.Vector3()) { const y = this.yaw; return out.set(-Math.cos(y), 0, Math.sin(y)); }
  doorPoint() { return this.position.clone().addScaledVector(this.forward(_v), 0.6).addScaledVector(this.left(), 1.8).setY(0); }
  tailgatePoint() { return this.position.clone().addScaledVector(this.forward(_v), -3.2).setY(0); }
  bedPoint() { return this.position.clone().addScaledVector(this.forward(_v), -1.3).setY(1.5); }
  horizontalSpeed() { return Math.hypot(this.body.velocity.x, this.body.velocity.z); }

  // Local simulation (dynamic) vs. following someone else's poses (kinematic).
  setSimulated(on) {
    this.simulated = on;
    this.body.type = on ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC;
    this.body.mass = on ? 900 : 0;
    this.body.updateMassProperties();
    this.body.wakeUp();
    if (!on) { this.body.velocity.set(0, 0, 0); this.body.angularVelocity.set(0, 0, 0); }
    this.target = null;
  }

  reset() {
    const { position, yaw } = this.home;
    this.setPose([position.x, RIDE_HEIGHT + 0.05, position.z], null, yaw);
    this.speed = 0;
  }

  setPose(p, q, yaw = null, vel = null) {
    this.body.position.set(p[0], p[1], p[2]);
    if (q) this.body.quaternion.set(q[0], q[1], q[2], q[3]);
    else this.body.quaternion.setFromEuler(0, yaw ?? 0, 0);
    if (vel) this.body.velocity.set(vel[0], vel[1], vel[2]);
    else this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    const f = this.forward(_v);
    this.speed = vel ? vel[0] * f.x + vel[2] * f.z : 0;
  }

  pose() {
    const b = this.body;
    return [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.velocity.x, b.velocity.y, b.velocity.z];
  }

  // Kinematic follow: move toward the latest pose from the driver, with real
  // velocity so whatever we hit gets launched.
  follow(dt, pose) {
    if (this.simulated || !pose) return;
    const b = this.body;
    const inv = 1 / Math.max(dt, 1 / 120);
    b.velocity.set((pose[0] - b.position.x) * inv, (pose[1] - b.position.y) * inv, (pose[2] - b.position.z) * inv);
    b.quaternion.set(pose[3], pose[4], pose[5], pose[6]);
    const f = this.forward(_v);
    this.speed = (pose[7] ?? 0) * f.x + (pose[9] ?? 0) * f.z;
  }

  // ---- Driving (simulated only) ----
  drive(dt, { throttle = 0, steer = 0, brake = false }) {
    this.throttle = throttle;
    if (throttle > 0) this.speed += (this.speed < 0 ? BRAKE : ACCEL) * throttle * dt;
    else if (throttle < 0) this.speed += (this.speed > 0 ? BRAKE : ACCEL * 0.7) * throttle * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), DRAG * dt * 3);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);
    this.steer += (steer - this.steer) * Math.min(1, dt * 6);
    this.apply();
  }

  // Parked: brakes on.
  idle(dt) {
    this.throttle = 0;
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    this.steer *= 0.9;
    this.apply();
  }

  apply() {
    if (!this.simulated) return;
    const f = this.forward(_v);
    const airborne = this.body.position.y > RIDE_HEIGHT + 0.35;
    if (!airborne) {
      this.body.velocity.x = f.x * this.speed;
      this.body.velocity.z = f.z * this.speed;
    }
    const k = THREE.MathUtils.clamp(this.speed / 5, -1, 1);
    this.body.angularVelocity.y = airborne ? this.body.angularVelocity.y * 0.98 : -this.steer * 1.6 * k;
  }

  // After the physics step. Returns the speed lost to an impact this frame (m/s).
  lateUpdate(dt) {
    let impact = 0;
    const f = this.forward(_v);
    const actual = this.body.velocity.x * f.x + this.body.velocity.z * f.z;
    if (this.simulated) {
      if (Math.abs(actual) < Math.abs(this.speed) - 0.5) {
        impact = Math.abs(this.speed - actual);
        this.speed = actual;
      }
      if (this.body.position.y < -10) this.reset();
      // Keep it upright-ish: only yaw is free, so just stop it sinking into the ground.
      if (this.body.position.y < RIDE_HEIGHT - 0.2) this.body.position.y = RIDE_HEIGHT;
    }
    this.wheelSpin += actual * dt / 0.42;
    for (const w of this.wheels) w.rotation.x = -this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = this.steer * 0.45;
    this.cargo.forEach((m, i) => { m.visible = i < this.bedCount; });
    return impact;
  }

  // Is a world point inside the bed?
  isInBed(p) {
    _v.set(p.x, p.y, p.z).sub(this.position).applyQuaternion(_q.copy(this.mesh.quaternion).invert());
    return Math.abs(_v.x) < 1.05 && _v.y > 0.2 && _v.y < 1.8 && _v.z > 0.2 && _v.z < 2.45;
  }

  // Is a world point inside the truck's footprint, grown by pad meters?
  contains(p, pad = 0) {
    _v.set(p.x, p.y, p.z).sub(this.position).applyQuaternion(_q.copy(this.mesh.quaternion).invert());
    return Math.abs(_v.x) < 1.25 + pad && Math.abs(_v.z) < 2.6 + pad && _v.y > -1.2 && _v.y < 2.2;
  }

  // ---- Visuals: the Kenney pickup, plus bags that appear in the bed ----
  buildMesh(assets, scene) {
    const root = new THREE.Group();
    const model = assets.instance('pickup');
    model.rotation.y = Math.PI; // the model faces +Z; our forward is -Z
    model.position.y = -RIDE_HEIGHT + 0.02;
    root.add(model);
    scene.add(root);
    this.wheels = [];
    this.frontWheels = [];
    model.traverse((o) => {
      if (!/^wheel/.test(o.name)) return;
      // Re-parent each wheel under a pivot at its center so it spins in place.
      const box = new THREE.Box3().setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      o.parent.updateMatrixWorld(true);
      const pivot = new THREE.Group();
      o.parent.add(pivot);
      pivot.position.copy(o.parent.worldToLocal(c.clone()));
      pivot.attach(o);
      pivot.rotation.order = 'YXZ';
      this.wheels.push(pivot);
      if (/front/.test(o.name)) this.frontWheels.push(pivot);
    });
    const bagGeo = new THREE.SphereGeometry(0.3, 10, 8);
    bagGeo.scale(1, 0.9, 1);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.1 });
    this.cargo = [];
    for (let i = 0; i < BED_CAPACITY; i++) {
      const col = i % 3, row = Math.floor(i / 3) % 4;
      const m = new THREE.Mesh(bagGeo, bagMat);
      m.position.set((col - 1) * 0.6, 0.2 + Math.floor(i / 12) * 0.4, 0.55 + row * 0.5);
      m.rotation.y = i;
      m.castShadow = true;
      m.visible = false;
      root.add(m);
      this.cargo.push(m);
    }
    return root;
  }
}
