// The Rusty Pickup. An arcade vehicle: a dynamic body whose yaw and forward
// speed we set directly each frame (rotation locked to yaw), so it bumps into
// houses and trees, pushes trash around, launches Gary, and goes off ramps.
//
// The bed is a real physics container (floor + walls), so Gary and loose
// trash ride along until they fall out. Bags thrown into the bed are stored
// (up to BED_CAPACITY) and sold all at once at a dumpster.
//
// yaw follows the player convention: facing = (-sin yaw, 0, -cos yaw).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { signTexture } from '../world/textures.js';

export const BED_CAPACITY = 12;
const RIDE_HEIGHT = 0.75; // body origin above the ground
const MAX_SPEED = 19, MAX_REVERSE = 7, ACCEL = 9, BRAKE = 22, DRAG = 1.2;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Truck {
  constructor(game, { position, yaw = 0, owned = false, sign = null }) {
    this.game = game;
    this.owned = owned;
    this.sign = sign;
    this.speed = 0;
    this.steer = 0;
    this.driver = null;
    this.bed = [];
    this.wheelSpin = 0;
    this.home = { position: position.clone(), yaw };

    const body = this.body = new CANNON.Body({
      mass: 900,
      material: game.physics.materials.vehicle,
      collisionFilterGroup: GROUP.VEHICLE,
      collisionFilterMask: MASK_ALL,
      allowSleep: false,
      linearDamping: 0.01,
    });
    body.angularFactor.set(0, 1, 0);
    const box = (hx, hy, hz, x, y, z) => body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z));
    for (const [x, z] of [[-0.85, -1.45], [0.85, -1.45], [-0.85, 1.45], [0.85, 1.45]]) body.addShape(new CANNON.Sphere(0.42), new CANNON.Vec3(x, 0.42 - RIDE_HEIGHT, z));
    box(1.0, 0.3, 2.45, 0, 0.05, 0); // chassis + bed floor (top at y 1.1)
    box(0.95, 0.5, 0.75, 0, 0.85, -0.85); // cab
    box(0.06, 0.28, 1.27, -0.94, 0.63, 1.18); // bed sides
    box(0.06, 0.28, 1.27, 0.94, 0.63, 1.18);
    box(0.95, 0.28, 0.06, 0, 0.63, 2.4); // tailgate
    body.userData = { kind: 'vehicle', vehicle: this, grabbable: false };
    body.addEventListener('collide', (e) => this.onCollide(e));

    this.mesh = this.buildMesh();
    game.scene.add(this.mesh);
    game.physics.add(body, this.mesh);
    this.reset();
    this.updateSign();
  }

  get position() { return this.mesh.position; }
  get yaw() { const q = this.body.quaternion; return 2 * Math.atan2(q.y, q.w); }
  forward(out = new THREE.Vector3()) { const y = this.yaw; return out.set(-Math.sin(y), 0, -Math.cos(y)); }
  left(out = new THREE.Vector3()) { const y = this.yaw; return out.set(-Math.cos(y), 0, Math.sin(y)); }
  doorPoint() { return this.position.clone().addScaledVector(this.forward(_v), 0.85).addScaledVector(this.left(), 1.6).setY(0); }
  tailgatePoint() { return this.position.clone().addScaledVector(this.forward(_v), -3.1).setY(0); }
  bedPoint() { return this.position.clone().addScaledVector(this.forward(_v), -1.2).setY(1.4); }

  reset() {
    const { position, yaw } = this.home;
    this.body.position.set(position.x, RIDE_HEIGHT + 0.05, position.z);
    this.body.quaternion.setFromEuler(0, yaw, 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.speed = 0;
  }

  setOwned(owned) { this.owned = owned; this.updateSign(); }

  updateSign() {
    if (!this.sign) return;
    const text = this.owned ? 'TRASH CO. MOTOR POOL · YOUR TRUCK' : 'RUSTY PICKUP FOR SALE · $4,000';
    this.sign.material.map = signTexture(text, { bg: this.owned ? '#1f5a38' : '#b5562b', w: 1024, h: 256, font: 'bold 64px sans-serif' });
    this.sign.material.needsUpdate = true;
  }

  // ---- Driving ----
  drive(dt, { throttle = 0, steer = 0, brake = false }) {
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
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    this.steer *= 0.9;
    this.apply();
  }

  apply() {
    const f = this.forward(_v);
    const airborne = this.body.position.y > RIDE_HEIGHT + 0.35;
    if (!airborne) {
      this.body.velocity.x = f.x * this.speed;
      this.body.velocity.z = f.z * this.speed;
    }
    // Turn rate scales with speed (and flips in reverse) like a real car.
    const k = THREE.MathUtils.clamp(this.speed / 5, -1, 1);
    this.body.angularVelocity.y = airborne ? this.body.angularVelocity.y * 0.98 : -this.steer * 1.5 * k;
  }

  // After the physics step: if we hit something, our speed is what we actually moved at.
  lateUpdate(dt) {
    const f = this.forward(_v);
    const actual = this.body.velocity.x * f.x + this.body.velocity.z * f.z;
    if (Math.abs(actual) < Math.abs(this.speed) - 0.5) this.speed = actual;
    this.wheelSpin += actual * dt / 0.42;
    for (const w of this.wheels) w.rotation.x = -this.wheelSpin;
    for (const w of this.frontWheels) w.parent.rotation.y = -this.steer * 0.45;
    this.game.zones.constrainBody(this.body, 2.6, this.driver);
    if (this.body.position.y < -10) this.reset();
    this.absorbBags();
    this.syncCargo();
  }

  onCollide(e) {
    const other = e.body;
    const game = this.game;
    if (Math.abs(this.speed) < 6) return;
    if (other.userData?.ragdoll === game.gary && (this.garyCooldown ?? 0) < performance.now()) {
      this.garyCooldown = performance.now() + 2500;
      const lines = ['Gary has been collected', 'Gary: "I\'m okay!!"', 'Workplace incident #' + (++game.state.stats.garyBonks), 'Gary got the bumper'];
      game.toast(lines[Math.floor(Math.random() * lines.length)], 'gary');
    }
  }

  // ---- Bed ----
  isInBed(p) {
    _v.set(p.x, p.y, p.z).sub(this.position).applyQuaternion(_q.copy(this.mesh.quaternion).invert());
    return Math.abs(_v.x) < 0.9 && _v.y > 0.3 && _v.y < 1.6 && _v.z > -0.1 && _v.z < 2.4;
  }

  // Loose bags that land in the bed are stored.
  absorbBags() {
    if (!this.owned) return;
    for (const entry of [...this.game.looseBags.bags]) {
      if (entry.decorative || this.bed.length >= BED_CAPACITY) continue;
      if (this.game.players.some((p) => p.grabber.held?.body === entry.body)) continue;
      if (!this.isInBed(entry.body.position)) continue;
      this.game.looseBags.remove(entry);
      this.bed.push(entry.bag);
      this.game.toast(`Bag in the truck (${this.bed.length}/${BED_CAPACITY})`, 'info', 'bed');
    }
  }

  // Move bags from a player's belt to the bed. Returns how many moved.
  loadFrom(player) {
    let n = 0;
    while (this.bed.length < BED_CAPACITY) {
      const bag = player.inventory.popBag();
      if (!bag) break;
      this.bed.push(bag);
      n++;
    }
    return n;
  }

  unloadAll() { const bags = this.bed; this.bed = []; return bags; }
  get bedValue() { return this.bed.reduce((s, b) => s + b.value, 0); }

  syncCargo() {
    this.cargo.forEach((m, i) => { m.visible = i < this.bed.length; });
  }

  // ---- Visuals (procedural, low-poly) ----
  buildMesh() {
    const root = new THREE.Group();
    const add = (geo, mat, x, y, z, parent = root) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const paint = new THREE.MeshStandardMaterial({ color: 0xa8532b, roughness: 0.75, metalness: 0.2 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.8 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.3, metalness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x23394d, roughness: 0.1, metalness: 0.4 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff1b8, emissiveIntensity: 0.6 });
    const tail = new THREE.MeshStandardMaterial({ color: 0xc0262d, emissive: 0x80151a, emissiveIntensity: 0.5 });
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    add(B(2.0, 0.55, 1.8), paint, 0, 0.12, -1.55); // hood
    add(B(2.0, 0.35, 4.9), paint, 0, -0.08, 0); // lower body
    add(B(1.9, 1.0, 1.5), paint, 0, 0.85, -0.85); // cab
    add(B(1.92, 0.42, 1.25), glass, 0, 1.08, -0.86); // side windows
    add(B(1.7, 0.45, 0.04), glass, 0, 1.06, -1.62); // windshield
    add(B(1.7, 0.4, 0.04), glass, 0, 1.08, -0.09); // rear window
    add(B(2.04, 0.08, 1.6), dark, 0, 1.38, -0.85); // roof edge
    add(B(1.9, 0.08, 2.5), dark, 0, 0.36, 1.18); // bed floor
    add(B(0.12, 0.56, 2.54), paint, -0.94, 0.63, 1.18); // bed sides
    add(B(0.12, 0.56, 2.54), paint, 0.94, 0.63, 1.18);
    add(B(1.9, 0.56, 0.12), paint, 0, 0.63, 2.4); // tailgate
    add(B(2.1, 0.22, 0.2), chrome, 0, -0.12, -2.5); // bumpers
    add(B(2.1, 0.2, 0.2), dark, 0, -0.12, 2.5);
    add(B(0.95, 0.3, 0.05), dark, 0, 0.15, -2.46); // grille
    for (const s of [-1, 1]) {
      add(B(0.3, 0.18, 0.05), lamp, s * 0.72, 0.18, -2.47);
      add(B(0.18, 0.22, 0.05), tail, s * 0.85, 0.65, 2.47);
    }
    // Rust patches, because it's the Rusty Pickup.
    for (const [x, y, z, w, h, d] of [[-1.005, 0.0, 0.6, 0.02, 0.25, 0.7], [1.005, 0.1, -1.6, 0.02, 0.2, 0.5], [0.5, 0.42, -1.9, 0.5, 0.02, 0.4], [-0.96, 0.7, 1.6, 0.02, 0.2, 0.5]]) add(B(w, h, d), rust, x, y, z);
    // "TRASH CO." door decals
    const decal = new THREE.MeshBasicMaterial({ map: signTexture('TRASH CO.', { bg: '#e9dcc1', fg: '#6b3a1e', w: 256, h: 64, font: 'bold 40px sans-serif' }) });
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), decal);
      d.position.set(s * 0.962, 0.5, -0.85);
      d.rotation.y = s * Math.PI / 2;
      root.add(d);
    }
    // Wheels (front ones steer)
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 10);
    hubGeo.rotateZ(Math.PI / 2);
    this.wheels = [];
    this.frontWheels = [];
    for (const [x, z] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
      const holder = new THREE.Group();
      holder.position.set(x, 0.42 - RIDE_HEIGHT, z);
      root.add(holder);
      const w = add(tireGeo, dark, 0, 0, 0, holder);
      add(hubGeo, chrome, 0, 0, 0, w);
      this.wheels.push(w);
      if (z < 0) this.frontWheels.push(w);
    }
    // Bags in the bed (shown as the bed fills)
    const bagGeo = new THREE.SphereGeometry(0.3, 10, 8);
    bagGeo.scale(1, 0.9, 1);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.1 });
    this.cargo = [];
    for (let i = 0; i < BED_CAPACITY; i++) {
      const col = i % 3, row = Math.floor(i / 3) % 4, layer = Math.floor(i / 12);
      const m = add(bagGeo, bagMat, (col - 1) * 0.58, 0.66 + layer * 0.45, 0.25 + row * 0.6);
      m.rotation.y = i;
      m.visible = false;
      this.cargo.push(m);
    }
    return root;
  }
}
