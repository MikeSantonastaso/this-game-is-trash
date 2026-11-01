// You. The only thing each machine simulates for itself is its own walking
// capsule (and the truck while you drive it), so moving always feels instant.
// Everything else you do (pick, grab, throw, punch, sell...) is sent to the
// host as an action, with instant local feedback (sound, claw snap, the item
// flying into your bag) so it doesn't feel laggy online.
//
// States: 'foot' (first person), 'ragdoll' (chase cam on your ragdoll, which
// the host simulates), 'drive' (chase cam behind the truck, you simulate it).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { TRASH_TYPES } from '../data/trash.js';

const HALF_HEIGHT = 0.8;
const EYE_HEIGHT = 1.62;
const PUNCH_COOLDOWN = 0.45;
const _v = new THREE.Vector3();
const _to = new THREE.Vector3();

export class LocalPlayer {
  constructor(game) {
    this.game = game;
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
    this.body.userData = { kind: 'player', pid: null };
    this.inWorld = false;

    this.state = 'foot';
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.minAirVy = 0;
    this.ragdollId = null;
    this.lastRagdollPos = new THREE.Vector3();
    this.flopTime = 0;
    this.pickCooldown = 0;
    this.autoTimer = 0;
    this.punchCooldown = 0;
    this.punchCount = 0;
    this.drunk = 0;
    this.drunkDecay = 0;
    this.stumbleTimer = 20;
    this.knock = new THREE.Vector3();
    this.target = null; // picker target entity
    this.holding = 0;
    this.inv = { used: 0, cap: 6, value: 0, tied: [], slots: 1 };
  }

  get stats() { return this.game.stats; }
  get isFlopped() { return this.state === 'ragdoll'; }
  get driving() { return this.state === 'drive'; }
  get invFull() { return this.inv.used >= this.inv.cap && this.inv.tied.length >= this.inv.slots; }
  get hasBags() { return this.inv.tied.length > 0 || this.inv.used > 0; }

  addToWorld() { if (!this.inWorld) { this.game.physics.world.addBody(this.body); this.inWorld = true; } }
  removeFromWorld() { if (this.inWorld) { this.game.physics.world.removeBody(this.body); this.inWorld = false; } }

  spawn(p, yaw = null) {
    this.body.position.set(p.x ?? p[0], (p.y ?? p[1] ?? 0) + HALF_HEIGHT + 0.05, p.z ?? p[2]);
    this.body.velocity.set(0, 0, 0);
    if (yaw !== null) { this.yaw = yaw; this.game.cameraRig.yaw = yaw; }
    this.minAirVy = 0;
    this.state = 'foot';
    this.addToWorld();
  }

  feet(out = new THREE.Vector3()) {
    if (this.state === 'drive') return out.copy(this.game.truck.position).setY(0);
    if (this.state === 'ragdoll') return out.copy(this.ragdollPos()).setY(0);
    return out.set(this.body.position.x, this.body.position.y - HALF_HEIGHT, this.body.position.z);
  }
  eye(out = new THREE.Vector3()) { return out.set(this.body.position.x, this.body.position.y - HALF_HEIGHT + EYE_HEIGHT, this.body.position.z); }
  horizontalSpeed() { return Math.hypot(this.body.velocity.x, this.body.velocity.z); }

  ragdollPos() {
    const e = this.game.entities.get(this.ragdollId);
    if (e) this.lastRagdollPos.copy(e.body.position);
    return this.lastRagdollPos;
  }

  cameraTarget(out = new THREE.Vector3()) {
    if (this.state === 'drive') return out.copy(this.game.truck.position).add(_v.set(0, 1.8, 0));
    if (this.state === 'ragdoll') return out.copy(this.ragdollPos()).add(_v.set(0, 0.5, 0));
    return this.eye(out);
  }

  // Where the host should hold whatever we're carrying.
  handTarget(intent) {
    const hand = this.eye().addScaledVector(intent.aimDir, 1.7);
    if (intent.aimRight) hand.addScaledVector(intent.aimRight, 0.35);
    hand.y = Math.max(hand.y - 0.35, 0.5);
    return hand;
  }

  pose() {
    const b = this.body.position, v = this.body.velocity;
    const pose = {
      p: [b.x, b.y, b.z], v: [v.x, v.y, v.z], yaw: this.yaw, pitch: this.pitch,
      hand: this.handPos ? [this.handPos.x, this.handPos.y, this.handPos.z] : null,
      drunk: Math.round(this.drunk), punch: this.punchCount,
    };
    if (this.state === 'drive') pose.tr = this.game.truck.pose();
    return pose;
  }

  // ---------------------------------------------------------------- per frame

  update(dt, intent) {
    const game = this.game;
    this.yaw = intent.yaw ?? this.yaw;
    this.pitch = intent.pitch ?? this.pitch;
    this.punchCooldown -= dt;
    this.updateDrunk(dt);

    if (this.state === 'drive') { this.updateDriving(dt, intent); return; }
    if (this.state === 'ragdoll') {
      this.flopTime += dt;
      this.handPos = null;
      if (intent.flop && this.flopTime > 0.5) game.act({ k: 'getUp' });
      return;
    }

    this.checkGround();
    this.move(dt, intent);
    this.handPos = this.handTarget(intent);

    if (intent.flop) { this.flop(); return; }

    // Grab / drop / throw (the host does the physics; we just ask).
    if (intent.grab) {
      if (this.holding) { game.act({ k: 'release' }); this.holding = 0; }
      else this.tryGrab(intent);
    }
    if (this.holding && intent.pick) {
      game.act({ k: 'throw', dir: intent.aimDir.toArray(), power: intent.sprint ? 17 : 13 });
      game.sfx.play('whoosh', { volume: 0.7 });
      this.holding = 0;
    }

    this.pickCooldown -= dt;
    this.target = this.holding ? null : this.findTarget(intent);
    if (!this.holding && intent.pickHeld) this.pick(intent);
    this.autoPick(dt);

    if (intent.punch && this.punchCooldown <= 0) this.punch(intent);
    if (intent.tie) game.act({ k: 'tie' });
    if (intent.throwBag) this.throwBag(intent);
    if (intent.interact) this.interact();

    game.viewmodel.update(dt, {
      speed: this.horizontalSpeed(), grounded: this.grounded, holding: !!this.holding, visible: true,
      fill: this.inv.used / Math.max(1, this.inv.cap), drunk: this.drunk,
    });
  }

  lateUpdate() {
    if (this.state !== 'foot') game_hideViewmodel(this.game);
    if (this.state === 'foot' && this.body.position.y < -10) this.spawn(this.game.spawnPoint, null);
  }

  checkGround() {
    const p = this.body.position;
    const hit = this.game.physics.raycast(
      { x: p.x, y: p.y, z: p.z },
      { x: p.x, y: p.y - HALF_HEIGHT - 0.12, z: p.z },
      MASK_ALL & ~(GROUP.PLAYER | GROUP.TRASH),
    );
    const wasGrounded = this.grounded;
    this.grounded = !!hit;
    if (!this.grounded) this.minAirVy = Math.min(this.minAirVy, this.body.velocity.y);
    else if (!wasGrounded) {
      if (this.minAirVy < -17) this.flop([this.body.velocity.x, -this.minAirVy * 0.25, this.body.velocity.z]);
      else if (this.minAirVy < -6) this.game.sfx.play('land', { volume: 0.5 });
      this.minAirVy = 0;
    }
  }

  move(dt, intent) {
    const v = this.body.velocity;
    let mx = intent.move.x, mz = intent.move.z;
    if (this.drunk > 0.5) {
      // Drunk steering: you drift, and it gets worse the more you drink.
      const a = Math.sin(performance.now() / 700) * 0.12 * this.drunk;
      const c = Math.cos(a), s = Math.sin(a);
      [mx, mz] = [mx * c - mz * s, mx * s + mz * c];
    }
    const speed = this.stats.moveSpeed * (intent.sprint ? 1.5 : 1) * (this.holding ? 0.85 : 1);
    const accel = this.grounded ? 14 : 3;
    const k = Math.min(1, accel * dt);
    v.x += (mx * speed - v.x) * k + this.knock.x;
    v.z += (mz * speed - v.z) * k + this.knock.z;
    v.y += this.knock.y;
    this.knock.set(0, 0, 0);
    if (intent.jump && this.grounded) { v.y = 7.5; this.grounded = false; this.game.sfx.play('jump', { volume: 0.4 }); }
  }

  updateDrunk(dt) {
    if (this.drunk <= 0) return;
    this.drunkDecay += dt;
    if (this.drunkDecay > 40) { this.drunkDecay = 0; this.drunk = Math.max(0, this.drunk - 1); }
    if (this.drunk >= 4 && this.state === 'foot') {
      this.stumbleTimer -= dt * (this.drunk - 3);
      if (this.stumbleTimer <= 0) {
        this.stumbleTimer = 18 + Math.random() * 20;
        this.flop(null, 'drunk');
      }
    }
  }

  // ---------------------------------------------------------------- picking

  // Trash or a loose bag under the crosshair, with generous aim assist.
  findTarget(intent) {
    const game = this.game;
    const reach = this.stats.reach;
    const eye = this.eye();
    _to.copy(eye).addScaledVector(intent.aimDir, reach + 0.5);
    const hit = game.physics.raycast(eye, _to, GROUP.TRASH | GROUP.BAG | GROUP.PROP | GROUP.GROUND | GROUP.VEHICLE);
    if (hit) {
      const e = game.entities.get(hit.body.userData?.netId);
      if (e && (e.kind === 'trash' || e.kind === 'bag') && !e.pending && hit.point.distanceTo(eye) <= reach) return e;
    }
    let best = null, bestScore = Infinity;
    for (const e of game.entities.values()) {
      if ((e.kind !== 'trash' && e.kind !== 'bag') || e.pending) continue;
      _v.copy(e.body.position).sub(eye);
      const d = _v.length();
      if (d > reach) continue;
      const dot = _v.divideScalar(d || 1).dot(intent.aimDir);
      if (dot < 0.8) continue;
      const score = (1 - dot) * 8 + d * 0.15;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  pick(intent) {
    if (this.pickCooldown > 0) return;
    this.pickCooldown = this.stats.cooldown;
    const game = this.game;
    game.viewmodel.clack();
    game.sfx.play('clack', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
    const t = this.target;
    if (!t) return;
    if (t.kind === 'bag') {
      if (this.inv.tied.length >= this.inv.slots) { game.toast('No room on your belt', 'warn', 'belt'); return; }
      this.collectLocally(t);
      game.act({ k: 'pickBag', id: t.id });
      return;
    }
    const ids = [t.id];
    if (!this.reserve(t)) return;
    // Multi-claw tiers scoop nearby extras.
    let extras = this.stats.pickCount - 1;
    if (extras > 0) {
      const near = [...game.entities.values()]
        .filter((e) => e.kind === 'trash' && !e.pending && e !== t && e.body.position.distanceTo(t.body.position) < 1.8)
        .sort((a, b) => a.body.position.distanceTo(t.body.position) - b.body.position.distanceTo(t.body.position));
      for (const e of near) { if (extras-- <= 0 || !this.reserve(e)) break; ids.push(e.id); }
    }
    game.act({ k: 'pick', ids });
    this.target = null;
  }

  // Magnet tier: vacuum trash around your feet.
  autoPick(dt) {
    const r = this.stats.autoRadius;
    if (!r) return;
    this.autoTimer -= dt;
    if (this.autoTimer > 0) return;
    this.autoTimer = this.stats.cooldown;
    const feet = this.feet();
    const ids = [];
    for (const e of this.game.entities.values()) {
      if (ids.length >= this.stats.pickCount) break;
      if (e.kind === 'trash' && !e.pending && e.body.position.distanceTo(feet) < r && this.reserve(e, true)) ids.push(e.id);
    }
    if (ids.length) this.game.act({ k: 'pick', ids });
  }

  // Predict the bag (so the meter moves instantly) and fly the item into it.
  reserve(e, quiet = false) {
    const def = TRASH_TYPES[e.info.type];
    if (this.inv.used + def.space > this.inv.cap) {
      if (this.inv.tied.length < this.inv.slots && this.inv.used > 0) {
        this.inv.tied = [...this.inv.tied, Math.round(this.inv.value)];
        this.inv.used = 0;
        this.inv.value = 0;
      } else {
        if (!quiet) this.game.toast('Bags full! Sell at the dumpster (F) or throw them in', 'warn', 'full');
        return false;
      }
    }
    this.inv.used += def.space;
    this.inv.value += def.value;
    this.collectLocally(e);
    return true;
  }

  collectLocally(e) {
    e.pending = performance.now();
    this.game.fx.collect(e, this.game.viewmodel.bagWorldPosition());
    const value = e.kind === 'trash' ? TRASH_TYPES[e.info.type].value : null;
    this.game.sfx.play('pick', { volume: 0.8, rate: 0.95 + Math.random() * 0.15 });
    if (value) this.game.hud.floatText(`+$${value}`, 'pick');
    this.game.hud.pulseBag();
  }

  // ---------------------------------------------------------------- grabbing

  tryGrab(intent) {
    const game = this.game;
    const reach = this.stats.reach + 0.8;
    const eye = this.eye();
    const to = eye.clone().addScaledVector(intent.aimDir, reach);
    const mask = GROUP.TRASH | GROUP.BAG | GROUP.PROP | GROUP.RAGDOLL | GROUP.REMOTE | GROUP.GROUND;
    const hit = game.physics.raycast(intent.aimOrigin, to, mask);
    const pick = (body, point) => {
      const ud = body.userData ?? {};
      if (ud.kind === 'player' && ud.pid) { game.act({ k: 'grab', pid: ud.pid, part: 'torso' }); return true; }
      const e = game.entities.get(ud.netId);
      if (!e || !ud.grabbable) return false;
      if (e.ragdoll && e.ragdoll.owner === game.selfId) return false;
      const lp = body.pointToLocalFrame(new CANNON.Vec3(point.x, point.y, point.z));
      game.act({ k: 'grab', id: e.id, part: ud.part, lp: [lp.x, lp.y, lp.z] });
      return true;
    };
    if (hit && pick(hit.body, hit.point)) { this.holding = -1; game.sfx.play('grab', { volume: 0.6 }); return; }
    // Assist: the closest grabbable roughly where you're looking.
    let best = null, bestScore = Infinity;
    const consider = (body) => {
      _v.set(body.position.x, body.position.y, body.position.z).sub(eye);
      const d = _v.length();
      if (d > reach) return;
      const dot = _v.normalize().dot(intent.aimDir);
      if (dot < 0.6) return;
      const score = d * (2 - dot) - (body.userData.part === 'torso' || body.userData.kind === 'player' ? 0.3 : 0);
      if (score < bestScore) { bestScore = score; best = body; }
    };
    for (const e of game.entities.values()) {
      if (e.ragdoll) { if (e.ragdoll.owner !== game.selfId) e.ragdoll.bodies.forEach(consider); }
      else if (e.body.userData.grabbable) consider(e.body);
    }
    for (const a of game.remoteBodies()) consider(a);
    if (best && pick(best, best.position)) { this.holding = -1; game.sfx.play('grab', { volume: 0.6 }); }
  }

  throwBag(intent) {
    if (!this.hasBags) { this.game.toast('No bags to throw', 'warn', 'nobag'); return; }
    const start = this.eye().addScaledVector(intent.aimDir, 0.9);
    start.y -= 0.3;
    const vel = intent.aimDir.clone().multiplyScalar(12).add(_v.set(0, 3, 0));
    this.game.act({ k: 'throwBag', p: start.toArray(), vel: vel.toArray() });
    if (this.inv.tied.length) this.inv.tied = this.inv.tied.slice(0, -1);
    else { this.inv.used = 0; this.inv.value = 0; }
    this.game.sfx.play('whoosh', { volume: 0.6 });
  }

  punch(intent) {
    this.punchCooldown = PUNCH_COOLDOWN;
    this.punchCount++;
    this.game.viewmodel.punch();
    this.game.sfx.play('whoosh', { volume: 0.4, rate: 1.4 });
    this.game.act({ k: 'punch', o: this.eye().toArray(), d: intent.aimDir.toArray(), sprint: intent.sprint && this.horizontalSpeed() > 6 });
  }

  // ---------------------------------------------------------------- F / use

  interact() {
    const game = this.game;
    const t = game.interactTarget();
    if (!t) return;
    if (t.kind === 'shop') { game.shop.open(); return; }
    if (t.kind === 'sell') game.act({ k: 'sell' });
    else if (t.kind === 'bin') game.act({ k: 'bin', id: t.entity.id });
    else if (t.kind === 'load') game.act({ k: 'load' });
    else if (t.kind === 'drive') game.act({ k: 'drive' });
    else if (t.kind === 'drink') game.act({ k: 'drink' });
    else if (t.kind === 'scratch') game.act({ k: 'scratch' });
  }

  // ---------------------------------------------------------------- ragdoll

  flop(vel = null, reason = null) {
    if (this.state === 'ragdoll') return;
    const v = vel ?? [
      this.body.velocity.x - Math.sin(this.yaw) * 3,
      Math.max(this.body.velocity.y, 0) + 2.5,
      this.body.velocity.z - Math.cos(this.yaw) * 3,
    ];
    const feet = this.feet();
    this.game.act({ k: 'flop', p: feet.toArray(), vel: v, reason });
    this.enterRagdoll();
  }

  enterRagdoll(id = null) {
    if (id) this.ragdollId = id;
    if (this.state === 'ragdoll') return;
    if (this.state === 'foot') this.lastRagdollPos.copy(this.body.position);
    this.removeFromWorld();
    this.state = 'ragdoll';
    this.flopTime = 0;
    this.holding = 0;
    this.target = null;
    this.game.sfx.play('fall', { volume: 0.6 });
  }

  // ---------------------------------------------------------------- driving

  startDriving(pose) {
    const truck = this.game.truck;
    if (!truck.simulated) {
      truck.setSimulated(true);
      if (pose) truck.setPose(pose.slice(0, 3), pose.slice(3, 7), null, pose.slice(7, 10));
    }
    this.removeFromWorld();
    this.state = 'drive';
    this.holding = 0;
    this.game.cameraRig.chaseDistance = 8;
    this.game.cameraRig.yaw = truck.yaw;
    this.game.cameraRig.pitch = -0.22;
  }

  updateDriving(dt, intent) {
    const game = this.game;
    const truck = game.truck;
    this.handPos = null;
    const a = intent.axes ?? { x: 0, y: 0 };
    // A few beers in and the wheel has a mind of its own.
    const wobble = this.drunk > 1 ? Math.sin(performance.now() / 500) * 0.12 * this.drunk : 0;
    truck.drive(dt, { throttle: a.y, steer: THREE.MathUtils.clamp(a.x + wobble, -1, 1), brake: intent.brake });
    this.body.position.set(truck.position.x, truck.position.y + 0.4, truck.position.z);
    game.cameraRig.follow(dt, truck.yaw);
    if (intent.flop) this.leaveTruck(true);
    else if (intent.interact) this.leaveTruck(false);
    else if (intent.grab) game.act({ k: 'sellTruck' });
    else if (intent.punch) game.act({ k: 'horn' });
  }

  // Called after the physics step while driving. Big impacts throw you out.
  afterDrive(impact) {
    if (this.state !== 'drive') return;
    if (impact > 4) this.game.sfx.play('crash', { volume: Math.min(1, impact / 12) });
    if (impact > 11) this.leaveTruck(true, true);
  }

  leaveTruck(eject = false, crash = false) {
    const game = this.game;
    const truck = game.truck;
    const tr = truck.pose();
    const prevSpeed = truck.speed;
    const door = truck.doorPoint();
    if (!game.isHost) truck.setSimulated(false);
    game.cameraRig.chaseDistance = 4.5;
    game.cameraRig.yaw = truck.yaw;
    this.yaw = truck.yaw;
    if (eject) {
      const f = truck.forward();
      const s = crash ? Math.max(Math.abs(prevSpeed), 10) : Math.abs(prevSpeed);
      const vel = [f.x * (s + 4), 9, f.z * (s + 4)];
      game.act({ k: 'eject', tr, vel, crash });
      this.state = 'foot'; // so enterRagdoll doesn't think we're already flopped
      this.enterRagdoll();
      this.lastRagdollPos.copy(truck.position);
      game.toast(crash ? 'CRASH! Through the windshield 💥' : (s > 8 ? 'YEET' : 'Ejected. Seatbelts are for quitters.'), 'gary');
    } else {
      game.act({ k: 'exit', tr, p: door.toArray() });
      this.spawn(door);
    }
  }

  // ---------------------------------------------------------------- host commands

  onCmd(c) {
    const game = this.game;
    switch (c.k) {
      case 'flop':
        if (this.state === 'drive' && !game.isHost) game.truck.setSimulated(false);
        this.state = this.state === 'ragdoll' ? 'ragdoll' : 'foot';
        this.enterRagdoll(c.id);
        if (c.reason) game.toast(c.reason, 'gary');
        break;
      case 'stand':
        this.ragdollId = null;
        this.spawn(c.p);
        this.game.sfx.play('land', { volume: 0.5 });
        break;
      case 'knock':
        this.knock.set(c.v[0], c.v[1], c.v[2]);
        game.sfx.play('punchHit', { volume: 0.8 });
        game.hud.flash('hit');
        break;
      case 'drive': this.startDriving(c.pose); break;
      case 'respawn': this.spawn(c.p); break;
      case 'toast': game.toast(c.text, c.kind, c.key); break;
      default: break;
    }
  }
}

function game_hideViewmodel(game) {
  game.viewmodel.update(0, { visible: false });
}
