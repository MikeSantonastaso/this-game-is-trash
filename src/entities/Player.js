// A trash collector. Reads a PlayerIntent each frame (from LocalInputSource
// today; from a network peer or second gamepad in co-op later) and drives:
// movement, the picker, the physics grabber, bags, and flopping into a ragdoll.
//
// On foot the local player is first person (you see your hands + picker via
// Viewmodel). When you flop, your rigged character model becomes a ragdoll and
// the camera pulls out to a chase view so you can watch yourself tumble.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { Ragdoll } from './Ragdoll.js';
import { Inventory } from '../systems/Inventory.js';
import { Picker } from '../tools/Picker.js';
import { Grabber } from '../tools/Grabber.js';

const HALF_HEIGHT = 0.8; // body center is this far above the feet
const EYE_HEIGHT = 1.62; // camera height above the feet
const _v = new THREE.Vector3();

export class Player {
  constructor(game, { id = 'p1', name = 'You', model = 'worker', viewmodel = null } = {}) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.modelId = model;
    this.viewmodel = viewmodel;

    this.body = new CANNON.Body({
      mass: 70,
      material: game.physics.materials.player,
      fixedRotation: true,
      linearDamping: 0,
      allowSleep: false,
      collisionFilterGroup: GROUP.PLAYER,
      collisionFilterMask: MASK_ALL,
    });
    this.body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.45, 0));
    this.body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.45, 0));
    this.body.userData = { kind: 'player', player: this };
    game.physics.add(this.body);

    this.inventory = new Inventory(() => this.stats);
    this.picker = new Picker(this);
    this.grabber = new Grabber(game.physics);

    this.yaw = 0;
    this.grounded = false;
    this.minAirVy = 0;
    this.ragdoll = null;
    this.flopTime = 0;
    this.thrownAway = false;
    this.applyStats();
  }

  get stats() { return this.game.stats; }
  get isFlopped() { return !!this.ragdoll; }

  applyStats() { this.viewmodel?.setTool(this.stats.tool); }

  spawn(pos, yaw = 0) {
    this.body.position.set(pos.x, pos.y + HALF_HEIGHT + 0.05, pos.z);
    this.body.velocity.set(0, 0, 0);
    this.yaw = yaw;
  }

  feet(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y - HALF_HEIGHT, this.body.position.z); }
  eye(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y - HALF_HEIGHT + EYE_HEIGHT, this.body.position.z); }
  chest(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y + 0.5, this.body.position.z); }
  facing(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  handPosition() { return this.viewmodel ? this.viewmodel.tipWorldPosition() : this.chest(); }

  // Where the camera should be (first person) or look at (chase).
  cameraTarget(out = new THREE.Vector3()) {
    if (this.ragdoll) return out.copy(this.ragdoll.position).add(_v.set(0, 0.5, 0));
    return this.eye(out);
  }

  horizontalSpeed() { return Math.hypot(this.body.velocity.x, this.body.velocity.z); }

  // ---- Per-frame (before physics step) ----
  update(dt, intent) {
    const game = this.game;
    if (intent.yaw !== undefined) this.yaw = intent.yaw;
    if (this.ragdoll) {
      this.flopTime += dt;
      if (intent.flop && this.flopTime > 0.4) this.getUp();
      this.grabber.update(dt, null);
      return;
    }

    this.checkGround();
    this.move(dt, intent);
    this.keepInWorld();

    if (intent.flop) { this.flop(); return; }

    // Grab / drop / throw with the physics hand.
    if (intent.grab) {
      if (this.grabber.isHolding) this.grabber.release();
      else this.tryGrab(intent);
    }
    const anchor = this.eye().addScaledVector(intent.aimDir, 1.7);
    if (intent.aimRight) anchor.addScaledVector(intent.aimRight, 0.35);
    anchor.y = Math.max(anchor.y - 0.35, 0.5);
    this.grabber.update(dt, anchor);

    this.picker.update(dt, game, intent);
    if (this.grabber.isHolding) {
      if (intent.pick) this.grabber.throw(intent.aimDir, 11);
    } else if (intent.pickHeld) {
      this.picker.pick(game);
    }

    if (intent.tie) {
      if (this.inventory.tie()) game.toast('Bag tied off! 🛍️', 'info');
      else if (this.inventory.current.used === 0) game.toast('Nothing in your bag yet', 'warn', 'tie');
      else game.toast('No room on your belt', 'warn', 'belt');
    }
    if (intent.throwBag) this.throwBag(intent);
  }

  // ---- After physics step ----
  lateUpdate(dt) {
    this.ragdoll?.sync();
    this.viewmodel?.update(dt, {
      speed: this.horizontalSpeed(),
      grounded: this.grounded,
      holding: this.grabber.isHolding,
      visible: !this.ragdoll,
    });
  }

  checkGround() {
    const p = this.body.position;
    const hit = this.game.physics.raycast(
      { x: p.x, y: p.y, z: p.z },
      { x: p.x, y: p.y - HALF_HEIGHT - 0.12, z: p.z },
      MASK_ALL & ~GROUP.PLAYER,
    );
    const wasGrounded = this.grounded;
    this.grounded = !!hit;
    if (!this.grounded) this.minAirVy = Math.min(this.minAirVy, this.body.velocity.y);
    else if (!wasGrounded) {
      if (this.minAirVy < -17) this.flop({ x: this.body.velocity.x, y: -this.minAirVy * 0.25, z: this.body.velocity.z });
      this.minAirVy = 0;
    }
  }

  move(dt, intent) {
    const v = this.body.velocity;
    const speed = this.stats.moveSpeed * (intent.sprint ? 1.5 : 1) * (this.grabber.isHolding ? 0.85 : 1);
    const tx = intent.move.x * speed, tz = intent.move.z * speed;
    const accel = this.grounded ? 14 : 3;
    const k = Math.min(1, accel * dt);
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;
    if (intent.jump && this.grounded) { v.y = 7.5; this.grounded = false; }
  }

  // The world is open, but only the park is built. Past the edge you get
  // gently turned around instead of hitting an invisible wall.
  keepInWorld() {
    const limit = this.game.layout.walkRadius;
    if (!limit) return;
    const p = this.body.position;
    const d = Math.hypot(p.x, p.z);
    if (d > limit) {
      const push = Math.min((d - limit) * 3, 12);
      this.body.velocity.x -= (p.x / d) * push;
      this.body.velocity.z -= (p.z / d) * push;
      this.game.toast('Nothing out there yet. The rest of the world is coming in a future update!', 'info', 'edge');
    }
  }

  tryGrab(intent) {
    const game = this.game;
    const reach = this.stats.reach + 0.6;
    const eye = this.eye();
    const to = eye.clone().addScaledVector(intent.aimDir, reach);
    const hit = game.physics.raycast(intent.aimOrigin, to, MASK_ALL & ~GROUP.PLAYER);
    if (hit?.body.userData?.grabbable) {
      this.grabber.grab(hit.body, hit.point);
      return true;
    }
    // Assist: closest grabbable body roughly where you're looking.
    let best = null, bestScore = Infinity;
    for (const body of game.grabbables()) {
      if (body.userData.ragdoll && body.userData.ragdoll === this.ragdoll) continue;
      _v.set(body.position.x, body.position.y, body.position.z).sub(eye);
      const d = _v.length();
      if (d > reach) continue;
      const dot = _v.normalize().dot(intent.aimDir);
      if (dot < 0.6) continue;
      // Prefer grabbing people by the torso or an arm, it's funnier.
      const score = d * (2 - dot) - (body.userData.part === 'torso' ? 0.3 : 0);
      if (score < bestScore) { bestScore = score; best = body; }
    }
    if (best) { this.grabber.grab(best, best.position); return true; }
    return false;
  }

  throwBag(intent) {
    const bag = this.inventory.popBag();
    if (!bag) { this.game.toast('No bags to throw', 'warn', 'nobag'); return; }
    const start = this.eye().addScaledVector(intent.aimDir, 0.8);
    start.y -= 0.3;
    const vel = intent.aimDir.clone().multiplyScalar(11).add(_v.set(0, 3, 0));
    this.game.looseBags.spawn(bag, start, vel);
  }

  // ---- Ragdoll ----
  flop(velocity = null) {
    if (this.ragdoll) return;
    this.grabber.release();
    const v = velocity ?? {
      x: this.body.velocity.x - Math.sin(this.yaw) * 3,
      y: Math.max(this.body.velocity.y, 0) + 2.5,
      z: this.body.velocity.z - Math.cos(this.yaw) * 3,
    };
    this.ragdoll = new Ragdoll(this.game.physics, this.game.scene, {
      model: this.game.assets.instance(this.modelId),
      name: this.name,
      position: this.feet(),
      yaw: this.yaw + Math.PI, // model faces +Z, camera faces -Z
    });
    this.ragdoll.owner = this;
    this.ragdoll.setVelocity(v);
    this.ragdoll.addSpin(3);
    this.game.physics.world.removeBody(this.body);
    this.flopTime = 0;
    this.thrownAway = false;
    this.game.events.emit('player:flopped', { player: this });
  }

  getUp() {
    if (!this.ragdoll) return;
    const p = this.ragdoll.position;
    // If another player is carrying our ragdoll, let go of it first.
    for (const other of this.game.players) {
      if (other.grabber.held?.ud.ragdoll === this.ragdoll) other.grabber.release();
    }
    this.body.position.set(p.x, Math.max(p.y, 0.2) + HALF_HEIGHT, p.z);
    this.body.velocity.set(0, 0, 0);
    this.game.physics.world.addBody(this.body);
    this.ragdoll.dispose();
    this.ragdoll = null;
    this.minAirVy = 0;
  }
}
