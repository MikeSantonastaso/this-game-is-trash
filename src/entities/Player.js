// A trash collector. Reads a PlayerIntent each frame (from LocalInputSource
// today; from a network peer or second gamepad in co-op later) and drives:
// movement, the picker, the physics grabber, bags, and flopping into a ragdoll.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { CharacterModel } from './CharacterModel.js';
import { Ragdoll } from './Ragdoll.js';
import { Inventory } from '../systems/Inventory.js';
import { Picker } from '../tools/Picker.js';
import { Grabber } from '../tools/Grabber.js';

const HALF_HEIGHT = 0.8; // body center is this far above the feet
const _v = new THREE.Vector3();

export class Player {
  constructor(game, { id = 'p1', name = 'You', colors = {} } = {}) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.colors = { shirt: 0xff7a1a, skin: 0xf1c27d, pants: 0x34495e, hat: 0xd64545, ...colors };

    this.body = new CANNON.Body({
      mass: 70,
      material: game.physics.materials.player,
      fixedRotation: true,
      linearDamping: 0,
      allowSleep: false,
      collisionFilterGroup: GROUP.PLAYER,
      collisionFilterMask: MASK_ALL,
    });
    this.body.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(0, -0.4, 0));
    this.body.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(0, 0.4, 0));
    this.body.userData = { kind: 'player', player: this };
    game.physics.add(this.body);

    this.model = new CharacterModel(this.colors);
    game.scene.add(this.model.root);

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

  applyStats() { this.model.setTool(this.stats.tool); }

  spawn(pos, yaw = 0) {
    this.body.position.set(pos.x, pos.y + HALF_HEIGHT + 0.05, pos.z);
    this.body.velocity.set(0, 0, 0);
    this.yaw = yaw;
  }

  feet(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y - HALF_HEIGHT, this.body.position.z); }
  chest(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y + 0.5, this.body.position.z); }
  facing(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  handPosition() { return this.model.handWorldPosition(); }

  cameraTarget(out = new THREE.Vector3()) {
    if (this.ragdoll) return out.copy(this.ragdoll.position).add(_v.set(0, 0.6, 0));
    return out.set(this.body.position.x, this.body.position.y + 0.9, this.body.position.z);
  }

  // ---- Per-frame (before physics step) ----
  update(dt, intent) {
    const game = this.game;
    if (this.ragdoll) {
      this.flopTime += dt;
      if (intent.flop && this.flopTime > 0.4) this.getUp();
      this.grabber.update(dt, null);
      return;
    }

    this.checkGround();
    this.move(dt, intent);

    if (intent.flop) { this.flop(); return; }

    // Grab / drop / throw with the physics hand.
    if (intent.grab) {
      if (this.grabber.isHolding) this.grabber.release();
      else this.tryGrab(intent);
    }
    const anchor = this.chest().addScaledVector(intent.aimDir, 1.6);
    anchor.y = Math.max(anchor.y, 0.5);
    this.grabber.update(dt, anchor);

    this.picker.update(dt, game, intent);
    if (this.grabber.isHolding) {
      if (intent.pick) {
        const thrown = this.grabber.throw(intent.aimDir, 11);
        if (thrown?.ud.ragdoll && thrown.ud.ragdoll !== this.ragdoll) game.events.emit('ragdoll:thrown', { by: this, ragdoll: thrown.ud.ragdoll });
      }
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
    const m = this.model;
    m.root.visible = !this.ragdoll;
    if (this.ragdoll) return;
    m.root.position.copy(this.feet(_v));
    m.root.rotation.y = this.yaw;
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    m.setBeltBags(this.inventory.tied.length);
    m.animate(dt, speed, this.grounded, this.grabber.isHolding);
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
    const speed = this.stats.moveSpeed * (intent.sprint ? 1.5 : 1) * (this.grabber.isHolding ? 0.8 : 1);
    const tx = intent.move.x * speed, tz = intent.move.z * speed;
    const accel = this.grounded ? 14 : 3;
    const k = Math.min(1, accel * dt);
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;
    if (intent.jump && this.grounded) { v.y = 7.5; this.grounded = false; }

    // Face where you aim while holding something; otherwise where you walk.
    let targetYaw = this.yaw;
    if (this.grabber.isHolding || intent.pickHeld) targetYaw = Math.atan2(-intent.aimDir.x, -intent.aimDir.z);
    else if (intent.move.x * intent.move.x + intent.move.z * intent.move.z > 0.01) targetYaw = Math.atan2(-intent.move.x, -intent.move.z);
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, 12 * dt);
  }

  tryGrab(intent) {
    const game = this.game;
    const reach = this.stats.reach + 0.6;
    const chest = this.chest();
    const camDist = intent.aimOrigin.distanceTo(chest);
    const to = intent.aimOrigin.clone().addScaledVector(intent.aimDir, camDist + reach + 1);
    const hit = game.physics.raycast(intent.aimOrigin, to, MASK_ALL & ~GROUP.PLAYER);
    if (hit?.body.userData?.grabbable && _v.copy(hit.point).distanceTo(chest) <= reach) {
      this.grabber.grab(hit.body, hit.point);
      return true;
    }
    // Assist: closest grabbable body in front of you.
    const facing = this.facing();
    let best = null, bestD = Infinity;
    for (const body of game.grabbables()) {
      if (body.userData.ragdoll && body.userData.ragdoll === this.ragdoll) continue;
      _v.copy(body.position);
      const d = _v.distanceTo(chest);
      if (d > reach) continue;
      _v.sub(chest).setY(0);
      if (_v.lengthSq() > 0.01 && _v.normalize().dot(facing) < 0.2) continue;
      // Prefer grabbing people by the torso or an arm, it's funnier.
      const bias = body.userData.part === 'torso' ? -0.3 : 0;
      if (d + bias < bestD) { bestD = d + bias; best = body; }
    }
    if (best) { this.grabber.grab(best, best.position); return true; }
    return false;
  }

  throwBag(intent) {
    const bag = this.inventory.popBag();
    if (!bag) { this.game.toast('No bags to throw', 'warn', 'nobag'); return; }
    const start = this.chest().addScaledVector(intent.aimDir, 0.9);
    const vel = intent.aimDir.clone().multiplyScalar(11).add(_v.set(0, 3.5, 0));
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
    this.ragdoll = new Ragdoll(this.game.physics, this.game.scene, { colors: this.colors, name: this.name, position: this.feet(), yaw: this.yaw });
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
