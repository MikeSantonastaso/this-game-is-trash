// The host's authoritative simulation. Exactly one machine runs this (the
// player who created the room, or you in solo). It owns:
//   - money and upgrades (shared by the crew), every player's bags
//   - every physics object except each player's own walking capsule and the
//     truck while someone else drives it
//   - ragdolls (yours, your friends', Gary's), grabbing and throwing
//   - trash spawning, the dumpster, curb bins, the cooler, the scratch-offs
//
// Clients send poses (where they are, where their hand is) and actions ("pick
// trash #12", "grab Dave's left arm", "throw"). The host applies them and sends
// back spawn/despawn events, 20 Hz snapshots, and fx events for sound/visuals.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { Grabber } from '../tools/Grabber.js';
import { Inventory } from '../systems/Inventory.js';
import { PART_ORDER } from '../entities/Ragdoll.js';
import { TRASH_TYPES, pickWeighted } from '../data/trash.js';
import { BED_CAPACITY } from '../entities/Truck.js';
import { SampleBuffer } from '../net/Interp.js';
import * as B from '../data/block.js';

const SNAP_INTERVAL = 0.05;
const KEYFRAME_EVERY = 20; // full snapshot once a second
const DUMP_BONUS = { gary: 25, friend: 50 };
const SCRATCH_COST = 25;
const SCRATCH_PRIZES = [ // [chance, prize]
  [0.5, 0], [0.27, 20], [0.13, 50], [0.07, 100], [0.025, 300], [0.005, 2000],
];
const STATE_CODE = { foot: 0, ragdoll: 1, drive: 2 };
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class HostSim {
  constructor(game) {
    this.game = game;
    this.net = game.net;
    this.physics = game.physics;
    this.factory = game.factory;
    this.entities = game.entities;
    this.state = game.state;
    this.layout = game.layout;
    this.players = new Map();
    this.nextId = 1;
    this.snapTimer = 0;
    this.snapCount = 0;
    this.trashTimer = 0;
    this.timers = [];
    this.truckBed = [];
    this.stateDirty = true;
    game.events.on('state:changed', () => { this.stateDirty = true; });

    for (const p of B.PROPS) this.spawnProp(p);
    for (let i = 0; i < B.TRASH_TARGET; i++) this.spawnTrash();
    this.spawnGary();
  }

  get selfId() { return this.game.selfId; }
  get stats() { return this.game.stats; }

  // ---------------------------------------------------------------- players

  addPlayer(id, { name, model, color }) {
    if (this.players.has(id)) return this.players.get(id);
    const isLocal = id === this.selfId;
    const spawn = B.PLAYER_SPAWNS[this.players.size % B.PLAYER_SPAWNS.length];
    let body;
    if (isLocal) body = this.game.localPlayer.body;
    else {
      body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: GROUP.REMOTE, collisionFilterMask: MASK_ALL });
      body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.45, 0));
      body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.45, 0));
      body.position.set(spawn.x, 0.85, spawn.z);
      this.physics.add(body);
    }
    body.userData = { kind: 'player', pid: id };
    const rec = {
      id, name, model, color, isLocal, body, spawn,
      grabber: new Grabber(this.physics, { owner: id, maxForce: 1600 }),
      inventory: new Inventory(() => this.stats),
      state: 'foot', ragdollId: null, flopAt: 0, struggle: 0, holding: 0,
      pose: { p: [spawn.x, 0.85, spawn.z], v: [0, 0, 0], yaw: spawn.yaw, pitch: 0, hand: null, drunk: 0 },
      hits: [], hitCooldown: 0, dunkCooldown: 0,
      buf: new SampleBuffer(10), trBuf: new SampleBuffer(10), view: null, trView: null,
    };
    this.players.set(id, rec);
    this.broadcastPlayers();
    return rec;
  }

  removePlayer(id) {
    const rec = this.players.get(id);
    if (!rec) return;
    rec.grabber.dispose();
    if (rec.state === 'drive') this.releaseTruck(rec);
    if (rec.ragdollId) this.despawn(rec.ragdollId);
    if (!rec.isLocal) this.physics.remove(rec.body);
    // Anyone carrying this player's ragdoll lets go (it's gone).
    this.players.delete(id);
    this.toastAll(`${rec.name} left`, 'info');
    this.broadcastPlayers();
  }

  playerList() {
    return [...this.players.values()].map((r) => ({ id: r.id, name: r.name, model: r.model, color: r.color, host: r.isLocal }));
  }

  broadcastPlayers() { this.emit('players', this.playerList()); }

  // A client said hello: add them and send everything they need.
  welcome(id, hello) {
    const rec = this.addPlayer(id, hello);
    const ents = [];
    for (const e of this.entities.values()) ents.push(this.infoWithPose(e));
    this.send(id, 'welcome', {
      you: id,
      players: this.playerList(),
      entities: ents,
      state: this.state.toJSON(),
      spawn: rec.spawn,
      truck: { pose: this.game.truck.pose(), driver: this.game.truck.driver, bed: this.truckBed.length },
      t: performance.now(),
    });
    this.sendInv(rec);
    this.toastAll(`${rec.name} clocked in 👷`, 'info');
  }

  infoWithPose(e) {
    const b = e.body;
    return { ...e.info, p: [b.position.x, b.position.y, b.position.z], q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], vel: undefined };
  }

  onPose(id, pose) {
    const rec = this.players.get(id);
    if (!rec || !pose) return;
    rec.pose = pose;
    const now = performance.now();
    rec.lastPoseAt = now;
    if (pose.p) rec.buf.push(now, [pose.p[0], pose.p[1], pose.p[2], pose.yaw ?? 0, pose.pitch ?? 0, Math.hypot(pose.v?.[0] ?? 0, pose.v?.[2] ?? 0)]);
    if (pose.tr) rec.trBuf.push(now, pose.tr);
  }

  feet(rec) { const p = rec.body.position; return _v.set(p.x, p.y - 0.8, p.z); }
  playerPos(rec) {
    if (rec.state === 'ragdoll') { const e = this.entities.get(rec.ragdollId); if (e) return e.body.position; }
    if (rec.state === 'drive') return this.game.truck.body.position;
    return rec.body.position;
  }

  near(rec, point, radius) {
    const p = this.playerPos(rec);
    return Math.hypot(p.x - point.x, p.z - point.z) < radius;
  }

  // ---------------------------------------------------------------- messaging

  send(id, type, data) {
    if (id === this.selfId) this.game.receive(type, data, this.selfId);
    else this.net.send(type, data, id);
  }

  emit(type, data) {
    this.net.send(type, data);
    this.game.receive(type, data, this.selfId);
  }

  fx(data) { this.emit('fx', data); }
  cmd(id, k, data = {}) { this.send(id, 'cmd', { k, ...data }); }
  toast(id, text, kind = 'info', key) { this.cmd(id, 'toast', { text, kind, key }); }
  toastAll(text, kind = 'info') { this.fx({ k: 'toast', text, kind }); }

  sendInv(rec) {
    const inv = rec.inventory;
    this.send(rec.id, 'inv', {
      used: inv.current.used, cap: inv.capacity, value: inv.current.value,
      tied: inv.tied.map((b) => Math.round(b.value)), slots: inv.slots,
    });
  }

  // ---------------------------------------------------------------- entities

  spawn(info, meta = {}) {
    info.id = this.nextId++;
    const e = this.factory.create(info, true);
    e.meta = meta;
    this.entities.set(info.id, e);
    const { vel, ...wire } = info;
    this.net.send('spawn', { ...wire, vel });
    return e;
  }

  despawn(id, fx = null) {
    const e = this.entities.get(id);
    if (!e) return;
    for (const rec of this.players.values()) {
      const held = rec.grabber.held;
      if (held && (held.body === e.body || (e.ragdoll && held.ud.ragdoll === e.ragdoll))) { rec.grabber.release(); rec.holding = 0; }
    }
    this.emit('despawn', { id, fx });
    this.factory.destroy(e);
    this.entities.delete(id);
  }

  spawnProp(p) {
    const t = B.PROP_TYPES[p.kind];
    const size = t.model ? this.game.assets.size(t.model) : new THREE.Vector3(0.4, 0.7, 0.4);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0);
    const pos = [p.x, (p.y ?? 0) + size.y / 2 + 0.02, p.z];
    const e = this.spawn({ kind: 'prop', type: p.kind, p: pos, q: [q.x, q.y, q.z, q.w] }, { home: { p: pos, q: [q.x, q.y, q.z, q.w] }, fill: t.spills ? 4 : 0, refill: 0 });
    e.body.sleep();
    return e;
  }

  spawnTrash(typeId = null, at = null, vel = null) {
    let region = null;
    let x, z;
    if (at) { x = at.x; z = at.z; }
    else {
      region = pickRegion();
      let ok = false;
      for (let tries = 0; tries < 30 && !ok; tries++) {
        x = THREE.MathUtils.lerp(region.rect.minX, region.rect.maxX, Math.random());
        z = THREE.MathUtils.lerp(region.rect.minZ, region.rect.maxZ, Math.random());
        ok = !this.layout.isBlocked(x, z, 0.3);
      }
      if (!ok) return null;
    }
    typeId ??= pickWeighted(region?.types ?? { can: 1, wrapper: 1 });
    const def = TRASH_TYPES[typeId];
    const half = this.factory.trash[typeId].half;
    const tipped = def.mesh.shape === 'cylinder' && Math.random() < 0.7;
    const y = at?.y ?? (tipped ? half[0] + 0.02 : half[1] + 0.02);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tipped ? Math.PI / 2 : 0, Math.random() * Math.PI * 2, 0, 'YXZ'));
    const e = this.spawn({ kind: 'trash', type: typeId, v: Math.floor(Math.random() * 10), p: [x, y, z], q: [q.x, q.y, q.z, q.w], vel }, { value: def.value, space: def.space });
    if (!vel) e.body.sleep();
    return e;
  }

  trashCount() { let n = 0; for (const e of this.entities.values()) if (e.kind === 'trash') n++; return n; }

  spawnGary() {
    const e = this.spawn({ kind: 'ragdoll', model: 'gary', name: 'Gary', owner: 'gary', p: [B.GARY_SPAWN.x, 0, B.GARY_SPAWN.z], yaw: Math.random() * 6 });
    this.garyId = e.id;
    e.meta.dunkCooldown = 0;
    return e;
  }

  respawnGary(delay = 2.5, line = 'Gary is back. Gary is always back.') {
    if (this.garyRespawning) return;
    this.garyRespawning = true;
    this.later(delay, () => {
      this.garyRespawning = false;
      if (this.garyId) this.despawn(this.garyId);
      this.spawnGary();
      this.toastAll(line, 'gary');
    });
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  // ---------------------------------------------------------------- ragdolls

  flopPlayer(rec, vel = null, pos = null, reason = null) {
    if (rec.state === 'ragdoll') return null;
    if (rec.state === 'drive') this.releaseTruck(rec);
    rec.grabber.release();
    rec.holding = 0;
    const p = pos ?? [rec.body.position.x, rec.body.position.y - 0.8, rec.body.position.z];
    const v = vel ?? [rec.pose.v?.[0] ?? 0, 3, rec.pose.v?.[2] ?? 0];
    const e = this.spawn({ kind: 'ragdoll', model: rec.model, name: rec.name, owner: rec.id, p: [p[0], Math.max(p[1], 0) + 0.05, p[2]], yaw: (rec.pose.yaw ?? 0) + Math.PI, vel: v });
    rec.state = 'ragdoll';
    rec.ragdollId = e.id;
    rec.flopAt = performance.now();
    rec.struggle = 0;
    this.setProxyEnabled(rec, false);
    this.cmd(rec.id, 'flop', { id: e.id, reason });
    return e;
  }

  standPlayer(rec) {
    const e = this.entities.get(rec.ragdollId);
    const p = e ? e.body.position : rec.body.position;
    const pos = [p.x, Math.max(0, p.y - 0.55), p.z];
    for (const other of this.players.values()) {
      if (e && other.grabber.held?.ud.ragdoll === e.ragdoll) { other.grabber.release(); other.holding = 0; }
    }
    if (e) this.despawn(e.id);
    rec.state = 'foot';
    rec.ragdollId = null;
    rec.buf = new SampleBuffer(10); // forget poses from before the flop
    rec.view = null;
    if (!rec.isLocal) {
      rec.body.position.set(pos[0], pos[1] + 0.85, pos[2]);
      rec.pose.p = [pos[0], pos[1] + 0.85, pos[2]];
    }
    this.setProxyEnabled(rec, true);
    this.cmd(rec.id, 'stand', { p: pos });
  }

  setProxyEnabled(rec, on) {
    if (rec.isLocal) return; // the local player adds/removes its own capsule
    rec.body.collisionFilterGroup = on ? GROUP.REMOTE : 0;
    rec.body.collisionFilterMask = on ? MASK_ALL : 0;
    rec.body.velocity.set(0, 0, 0);
  }

  ragdollOwner(ragdoll) {
    if (!ragdoll) return null;
    return ragdoll.owner === 'gary' ? 'gary' : this.players.get(ragdoll.owner) ?? null;
  }

  // ---------------------------------------------------------------- truck

  releaseTruck(rec, pose = null, eject = false) {
    const truck = this.game.truck;
    if (truck.driver !== rec.id) return;
    truck.driver = null;
    if (!truck.simulated) {
      truck.setSimulated(true);
      const tp = pose ?? rec.pose.tr;
      if (tp) truck.setPose(tp.slice(0, 3), tp.slice(3, 7), null, tp.slice(7, 10));
    }
    if (!eject) rec.state = 'foot';
    this.fx({ k: 'truck', driver: null });
  }

  // ---------------------------------------------------------------- actions

  onAct(id, a) {
    const rec = this.players.get(id);
    if (!rec || !a) return;
    const fn = this['act_' + a.k];
    if (fn) fn.call(this, rec, a);
  }

  act_pick(rec, a) {
    if (rec.state !== 'foot') return;
    const reach = this.stats.reach + 2.5;
    let tied = false, full = false;
    for (const id of (a.ids ?? []).slice(0, 4)) {
      const e = this.entities.get(id);
      if (!e || e.kind !== 'trash') continue;
      if (e.body.position.distanceTo(rec.body.position) > reach) continue;
      const res = rec.inventory.tryAdd({ type: e.info.type, space: e.meta.space, value: e.meta.value });
      if (!res.ok) { full = true; break; }
      tied ||= res.tied;
      this.state.stats.itemsPicked++;
      this.despawn(id, { k: 'pick', pid: rec.id, type: e.info.type, value: e.meta.value });
    }
    if (full) this.toast(rec.id, 'Bags full! Sell at the dumpster (F) or throw them in', 'warn', 'full');
    if (tied) this.fx({ k: 'tie', pid: rec.id });
    this.sendInv(rec);
  }

  act_pickBag(rec, a) {
    const e = this.entities.get(a.id);
    if (!e || e.kind !== 'bag' || e.body.position.distanceTo(rec.body.position) > this.stats.reach + 2.5) return;
    if (!rec.inventory.pushBag(e.meta.bag)) { this.toast(rec.id, 'No room on your belt', 'warn', 'belt'); return; }
    this.despawn(e.id, { k: 'pick', pid: rec.id, type: 'bag' });
    this.sendInv(rec);
  }

  act_grab(rec, a) {
    if (rec.state !== 'foot') return;
    let body = null, point = null;
    if (a.pid) {
      // Grabbing a standing friend knocks them into a ragdoll first.
      const victim = this.players.get(a.pid);
      if (!victim || victim === rec || victim.state === 'drive') return;
      if (victim.state === 'foot') {
        if (victim.body.position.distanceTo(rec.body.position) > 3.5) return;
        this.flopPlayer(victim, [0, 2, 0], null, `${rec.name} grabbed you!`);
        this.toastAll(`${rec.name} grabbed ${victim.name}`, 'gary');
      }
      const e = this.entities.get(victim.ragdollId);
      if (!e) return;
      body = e.ragdoll.parts[a.part] ?? e.ragdoll.torso;
      point = body.position;
    } else {
      const e = this.entities.get(a.id);
      if (!e) return;
      if (e.ragdoll) {
        if (e.ragdoll.owner === rec.id) return; // can't carry yourself
        body = e.ragdoll.parts[a.part] ?? e.ragdoll.torso;
      } else body = e.body;
      point = a.lp ? body.pointToWorldFrame(new CANNON.Vec3(a.lp[0], a.lp[1], a.lp[2])) : body.position;
    }
    if (body.position.distanceTo(rec.body.position) > this.stats.reach + 3) return;
    rec.grabber.grab(body, point);
    rec.holding = body.userData.netId ?? 0;
    this.fx({ k: 'grab', pid: rec.id, x: point.x, y: point.y, z: point.z });
  }

  act_release(rec) { rec.grabber.release(); rec.holding = 0; }

  act_throw(rec, a) {
    if (!rec.grabber.isHolding) return;
    const d = new THREE.Vector3(...(a.dir ?? [0, 0, -1])).normalize();
    const held = rec.grabber.throw(d, a.power ?? 13, 4);
    rec.holding = 0;
    if (!held) return;
    held.ud.thrownBy = rec.id;
    this.fx({ k: 'throw', pid: rec.id, x: held.body.position.x, y: held.body.position.y, z: held.body.position.z });
    const victim = this.ragdollOwner(held.ud.ragdoll);
    if (victim && victim !== 'gary') {
      this.toastAll(`${rec.name} yeeted ${victim.name}!`, 'gary');
      this.state.stats.garyBonks++;
    }
  }

  act_tie(rec) {
    const inv = rec.inventory;
    if (inv.tie()) { this.fx({ k: 'tie', pid: rec.id }); this.sendInv(rec); }
    else if (inv.current.used === 0) this.toast(rec.id, 'Nothing in your bag yet', 'warn', 'tie');
    else this.toast(rec.id, 'No room on your belt', 'warn', 'belt');
  }

  act_throwBag(rec, a) {
    if (rec.state !== 'foot') return;
    const bag = rec.inventory.popBag();
    if (!bag) { this.toast(rec.id, 'No bags to throw', 'warn', 'nobag'); return; }
    const e = this.spawn({ kind: 'bag', used: bag.used, value: bag.value, p: a.p, vel: a.vel }, { bag });
    e.body.userData.lastHeldBy = rec.id;
    e.body.userData.thrownBy = rec.id;
    e.body.userData.thrownAt = performance.now();
    this.fx({ k: 'throw', pid: rec.id, x: a.p[0], y: a.p[1], z: a.p[2] });
    this.sendInv(rec);
  }

  // Punch / shove. A few quick hits (or one sprinting) knocks a friend over.
  act_punch(rec, a) {
    if (rec.state !== 'foot') return;
    const o = new THREE.Vector3(...a.o), d = new THREE.Vector3(...a.d).normalize();
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
    let hit = false;
    this.state.stats.punches++;
    for (const victim of this.players.values()) {
      if (victim === rec || victim.state !== 'foot') continue;
      _v.copy(victim.body.position).sub(o);
      const dist = _v.length();
      if (dist > 2.3 || _v.normalize().dot(d) < 0.55) continue;
      hit = true;
      const now = performance.now();
      victim.hits = victim.hits.filter((t) => now - t < 3000);
      victim.hits.push(now);
      if (victim.hits.length >= 3 || a.sprint) {
        victim.hits = [];
        this.flopPlayer(victim, [flat.x * 8, 5, flat.z * 8], null, `${rec.name} knocked you out!`);
        this.toastAll(`${rec.name} knocked out ${victim.name} 🥊`, 'gary');
      } else {
        this.cmd(victim.id, 'knock', { v: [flat.x * 4.5, 2, flat.z * 4.5], from: rec.name });
      }
      break;
    }
    if (!hit) {
      // Anything physical in front of you gets shoved.
      const to = o.clone().addScaledVector(d, 2.2);
      const r = this.physics.raycast(o, to, GROUP.TRASH | GROUP.PROP | GROUP.BAG | GROUP.RAGDOLL);
      if (r?.body.type === CANNON.Body.DYNAMIC) {
        const k = r.body.userData.kind === 'ragdoll' ? 220 : Math.min(r.body.mass * 7, 140);
        r.body.wakeUp();
        r.body.applyImpulse(new CANNON.Vec3(flat.x * k, k * 0.35, flat.z * k), r.point);
        hit = true;
      }
    }
    this.fx({ k: 'punch', pid: rec.id, hit, x: o.x + d.x, y: o.y + d.y, z: o.z + d.z });
  }

  act_sell(rec) {
    const reach = rec.state === 'drive' ? 10 : 0;
    const d = this.layout.dumpsters.find((x) => this.near(rec, x.position, x.interactRadius + 1 + reach));
    if (!d) return;
    const bags = rec.inventory.takeAll();
    let fromTruck = [];
    const truck = this.game.truck;
    if (this.truckBed.length && truck.position.distanceTo(d.position) < 12) { fromTruck = this.truckBed; this.truckBed = []; truck.bedCount = 0; }
    const all = [...bags, ...fromTruck];
    if (!all.length) { this.toast(rec.id, 'Nothing to sell. Go pick up some trash!', 'warn', 'nosell'); return; }
    const total = Math.round(all.reduce((s, b) => s + b.value, 0) * this.stats.valueMult);
    this.state.addMoney(total, 'sell');
    this.state.stats.bagsSold += all.length;
    this.fx({ k: 'sold', pid: rec.id, amount: total, bags: all.length, truck: fromTruck.length, x: d.position.x, y: 1.4, z: d.position.z });
    this.sendInv(rec);
    this.game.save();
  }

  act_sellTruck(rec) {
    const truck = this.game.truck;
    if (truck.driver !== rec.id) return;
    const d = this.layout.dumpsters.find((x) => x.position.distanceTo(truck.position) < 13);
    if (!d) { this.toast(rec.id, 'Pull up next to the dumpster to sell the load', 'warn', 'truck-sell'); return; }
    this.act_sell(rec);
  }

  act_bin(rec, a) {
    const e = this.entities.get(a.id);
    if (!e || e.info.type !== 'bin' || e.body.position.distanceTo(rec.body.position) > 3.2) return;
    if (e.meta.fill <= 0) { this.toast(rec.id, 'This bin is empty. It refills over time.', 'warn', 'bin'); return; }
    let n = 0;
    const types = ['can', 'bottle', 'cup', 'wrapper', 'pizzaBox', 'beer'];
    while (e.meta.fill > 0) {
      const type = types[Math.floor(Math.random() * types.length)];
      const def = TRASH_TYPES[type];
      if (!rec.inventory.tryAdd({ type, space: def.space, value: def.value }).ok) break;
      e.meta.fill--;
      n++;
    }
    if (!n) { this.toast(rec.id, 'Bags full! Go sell first.', 'warn', 'full'); return; }
    this.state.stats.binsEmptied++;
    this.fx({ k: 'bin', pid: rec.id, n, x: e.body.position.x, y: e.body.position.y + 0.6, z: e.body.position.z });
    this.sendInv(rec);
  }

  act_load(rec) {
    const truck = this.game.truck;
    if (!this.near(rec, truck.tailgatePoint(), 3.2)) return;
    let n = 0;
    while (this.truckBed.length < BED_CAPACITY) {
      const bag = rec.inventory.popBag();
      if (!bag) break;
      this.truckBed.push(bag);
      n++;
    }
    truck.bedCount = this.truckBed.length;
    this.toast(rec.id, n ? `Loaded ${n} bag${n > 1 ? 's' : ''} into the truck (${this.truckBed.length}/${BED_CAPACITY})` : 'The truck bed is full', n ? 'info' : 'warn', 'bed');
    this.sendInv(rec);
  }

  act_drive(rec) {
    const truck = this.game.truck;
    if (rec.state !== 'foot' || truck.driver) { if (truck.driver) this.toast(rec.id, 'Someone is already driving. Hop in the back!', 'warn', 'drive'); return; }
    if (truck.position.distanceTo(rec.body.position) > 5.5) return;
    rec.grabber.release();
    rec.holding = 0;
    truck.driver = rec.id;
    rec.state = 'drive';
    rec.trBuf = new SampleBuffer(10);
    rec.trView = null;
    this.setProxyEnabled(rec, false);
    if (!rec.isLocal) truck.setSimulated(false);
    this.cmd(rec.id, 'drive', { pose: truck.pose() });
    this.fx({ k: 'truck', driver: rec.id });
  }

  act_exit(rec, a) {
    if (this.game.truck.driver !== rec.id) return;
    this.releaseTruck(rec, a.tr);
    rec.buf = new SampleBuffer(10);
    rec.view = null;
    if (!rec.isLocal && a.p) { rec.body.position.set(a.p[0], a.p[1] + 0.85, a.p[2]); rec.pose.p = [a.p[0], a.p[1] + 0.85, a.p[2]]; }
    this.setProxyEnabled(rec, true);
  }

  act_eject(rec, a) {
    if (this.game.truck.driver !== rec.id) return;
    this.releaseTruck(rec, a.tr, true);
    const t = this.game.truck.position;
    this.flopPlayer(rec, a.vel ?? [0, 9, 0], [t.x, t.y + 1.6, t.z]);
    if (a.crash) this.toastAll(`${rec.name} went through the windshield 💥`, 'gary');
  }

  act_flop(rec, a) {
    if (rec.state === 'ragdoll') return;
    if (a.reason === 'drunk') this.toastAll(`${rec.name} tripped over nothing 🍺`, 'gary');
    this.flopPlayer(rec, a.vel, a.p);
  }

  act_getUp(rec) {
    if (rec.state !== 'ragdoll') return;
    const e = this.entities.get(rec.ragdollId);
    if (performance.now() - rec.flopAt < 600) return;
    if (e?.ragdoll.held > 0) {
      rec.struggle++;
      if (rec.struggle < 5) {
        this.toast(rec.id, `Struggling! (${rec.struggle}/5) keep mashing R`, 'warn', 'struggle');
        for (const other of this.players.values()) if (other.grabber.held?.ud.ragdoll === e.ragdoll) this.toast(other.id, `${rec.name} is struggling!`, 'gary', 'struggle');
        return;
      }
      this.toastAll(`${rec.name} broke free!`, 'info');
    }
    this.standPlayer(rec);
  }

  act_buy(rec, a) {
    const s = this.state;
    let res = { ok: false };
    let label = '';
    if (a.what === 'tool') { res = s.buyTool(a.id); label = a.id; }
    else if (a.what === 'equip') { s.equipTool(a.id); return; }
    else if (a.what === 'upgrade') { res = s.buyUpgrade(a.id); label = a.id; }
    if (!res.ok) {
      const msg = { money: 'Not enough cash. Go find more trash.', max: 'Maxed out!', owned: 'Already owned' }[res.reason];
      if (msg) this.toast(rec.id, msg, 'warn', 'shop');
      return;
    }
    for (const r of this.players.values()) this.sendInv(r); // bag size may have changed
    this.fx({ k: 'bought', pid: rec.id, what: a.what, id: label });
    this.game.save();
  }

  act_drink(rec) {
    if (rec.state !== 'foot' || !this.near(rec, this.layout.cooler.position, 3)) return;
    this.state.stats.beers++;
    this.fx({ k: 'drink', pid: rec.id });
    // Finish it, then litter. Somebody's got to pick that up.
    this.later(2.4, () => {
      if (!this.players.has(rec.id) || rec.state !== 'foot') return;
      const p = rec.body.position;
      const yaw = rec.pose.yaw ?? 0;
      this.spawnTrash('beer', { x: p.x - Math.sin(yaw) * 0.6, y: p.y + 0.6, z: p.z - Math.cos(yaw) * 0.6 }, [-Math.sin(yaw) * 3 + (Math.random() - 0.5) * 2, 3, -Math.cos(yaw) * 3]);
    });
  }

  act_scratch(rec) {
    if (rec.state !== 'foot' || !this.near(rec, this.layout.scratch.position, 3)) return;
    if (!this.state.spend(SCRATCH_COST)) { this.toast(rec.id, `Scratch-Its cost $${SCRATCH_COST}. The crew is broke.`, 'warn', 'scratch'); return; }
    let roll = Math.random(), prize = 0;
    for (const [chance, p] of SCRATCH_PRIZES) { if (roll < chance) { prize = p; break; } roll -= chance; }
    this.state.stats.scratchers++;
    if (prize) { this.state.addMoney(prize, 'scratch'); this.state.stats.scratchWon += prize; }
    this.fx({ k: 'scratch', pid: rec.id, prize });
    if (prize >= 100) this.toastAll(`${rec.name} won $${prize.toLocaleString()} on a Scratch-It! 🎰`, 'money');
  }

  act_horn(rec) { if (this.game.truck.driver === rec.id) this.fx({ k: 'horn' }); }

  // ---------------------------------------------------------------- tick

  // Before the physics step.
  update(dt) {
    const truck = this.game.truck;
    const me = this.players.get(this.selfId);
    if (me) me.pose = this.game.localPlayer.pose();
    const renderT = performance.now() - 80;

    for (const rec of this.players.values()) {
      // Remote capsules follow their owner's reported position, slightly in the
      // past so there are always two poses to blend between (smooth, no jitter).
      if (!rec.isLocal) rec.view = rec.buf.at(renderT, rec.view ?? [], { angles: [3] });
      if (!rec.isLocal && rec.state === 'foot' && rec.view) {
        const [x, y, z] = rec.view;
        const b = rec.body;
        const dx = x - b.position.x, dy = y - b.position.y, dz = z - b.position.z;
        if (dx * dx + dy * dy + dz * dz > 36) { b.position.set(x, y, z); b.velocity.set(0, 0, 0); }
        else {
          const k = 1 / Math.max(dt, 1 / 120);
          b.velocity.set(THREE.MathUtils.clamp(dx * k, -30, 30), THREE.MathUtils.clamp(dy * k, -30, 30), THREE.MathUtils.clamp(dz * k, -30, 30));
        }
      }
      const hand = rec.state === 'foot' && rec.pose?.hand ? _w.fromArray(rec.pose.hand) : null;
      if (!hand && rec.grabber.isHolding) { rec.grabber.release(); rec.holding = 0; }
      rec.grabber.update(dt, hand);
      rec.hitCooldown -= dt;
      rec.dunkCooldown -= dt;
    }

    // The truck: driven by someone remote (follow their poses), or by nobody (parked).
    if (truck.driver && truck.driver !== this.selfId) {
      const rec = this.players.get(truck.driver);
      if (rec) rec.trView = rec.trBuf.at(renderT, rec.trView ?? [], { quats: [3] });
      truck.follow(dt, rec?.trView);
    }
    else if (!truck.driver) truck.idle(dt);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    this.trashTimer += dt;
    if (this.trashTimer > B.TRASH_RESPAWN_SECONDS) {
      this.trashTimer = 0;
      if (this.trashCount() < B.TRASH_TARGET) this.spawnTrash();
    }
  }

  // After the physics step.
  lateUpdate(dt) {
    this.checkEntities(dt);
    this.checkPlayers(dt);
    this.snapTimer += dt;
    if (this.snapTimer >= SNAP_INTERVAL) {
      this.snapTimer = 0;
      this.sendSnapshot();
    }
    if (this.stateDirty) {
      this.stateDirty = false;
      this.net.send('state', this.state.toJSON());
    }
  }

  checkEntities(dt) {
    const truck = this.game.truck;
    const dumpsters = this.layout.dumpsters;
    for (const e of [...this.entities.values()]) {
      const b = e.body;
      const p = b.position;
      // Lost: fell through the world or flew over the hedges.
      const lost = p.y < -5 || p.x < B.BOUNDS.minX - 12 || p.x > B.BOUNDS.maxX + 12 || p.z < B.BOUNDS.minZ - 12 || p.z > B.BOUNDS.maxZ + 12;
      if (lost) { this.recover(e); continue; }

      const ud = b.userData;
      const held = this.isHeld(e);
      // Dumpster: anything sellable that lands inside is sold.
      if (!held) {
        for (const d of dumpsters) {
          if (!d.trigger.containsPoint(p)) continue;
          if (e.kind === 'trash' || e.kind === 'bag') {
            const raw = e.kind === 'bag' ? e.meta.bag.value : e.meta.value;
            const amount = Math.max(1, Math.round(raw * this.stats.valueMult));
            this.state.addMoney(amount, 'dunk');
            if (e.kind === 'bag') this.state.stats.bagsSold++;
            const by = this.players.get(ud.thrownBy ?? ud.lastHeldBy);
            this.despawn(e.id, { k: 'dunkSell', amount, by: by?.id, x: p.x, y: p.y, z: p.z });
          } else if (e.kind === 'ragdoll') this.dunkRagdoll(e);
          break;
        }
      }
      if (!this.entities.has(e.id)) continue;

      // Bags that land in the truck bed are stored.
      if (e.kind === 'bag' && !held && this.truckBed.length < BED_CAPACITY && truck.isInBed(p)) {
        this.truckBed.push(e.meta.bag);
        truck.bedCount = this.truckBed.length;
        this.despawn(e.id, { k: 'toBed', x: p.x, y: p.y, z: p.z });
        continue;
      }

      // Curb bins: knock one over and the trash spills out. They refill slowly.
      if (e.kind === 'prop' && e.info.type === 'bin') {
        const q = b.quaternion;
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
        if (upY < 0.35 && e.meta.fill > 0) {
          const n = e.meta.fill;
          e.meta.fill = 0;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            this.spawnTrash(null, { x: p.x + Math.cos(a) * 0.6, y: 0.5, z: p.z + Math.sin(a) * 0.6 }, [Math.cos(a) * 2.5, 2.5, Math.sin(a) * 2.5]);
          }
          this.fx({ k: 'spill', x: p.x, y: p.y, z: p.z });
        } else if (e.meta.fill < 6 && upY > 0.8) {
          e.meta.refill += dt;
          if (e.meta.refill > 15) { e.meta.refill = 0; e.meta.fill++; }
        }
      }

      // Ragdoll impacts make a thud for everyone nearby.
      if (e.kind === 'ragdoll') {
        const v = b.velocity;
        const last = e.meta.lastV ?? [v.x, v.y, v.z];
        const dv = Math.hypot(v.x - last[0], v.y - last[1], v.z - last[2]);
        e.meta.lastV = [v.x, v.y, v.z];
        e.meta.thud = (e.meta.thud ?? 0) - dt;
        if (dv > 6 && e.meta.thud <= 0) {
          e.meta.thud = 0.18;
          this.fx({ k: 'thud', x: p.x, y: p.y, z: p.z, s: Math.min(1, dv / 18) });
        }
        if (e.id === this.garyId && !held && p.y < 0.6 && !this.garyRespawning) {
          // Gary wanders off the map edge sometimes; bring him back.
          if (Math.abs(p.x) > B.BOUNDS.maxX + 1 || p.z < B.BOUNDS.minZ - 1 || p.z > B.BOUNDS.maxZ + 1) this.respawnGary(1);
        }
      }

      // Thrown things knock over whoever they hit.
      const speed = b.velocity.length();
      if (speed > 8 && b.type === CANNON.Body.DYNAMIC && (e.kind !== 'trash' || b.mass >= 2)) {
        const thrower = ud.thrownBy ?? ud.lastHeldBy;
        for (const rec of this.players.values()) {
          if (rec.state !== 'foot' || rec.id === thrower || rec.hitCooldown > 0) continue;
          if (e.ragdoll && e.ragdoll.owner === rec.id) continue;
          const c = rec.body.position;
          const dy = THREE.MathUtils.clamp(p.y - c.y, -0.45, 0.45);
          if (Math.hypot(p.x - c.x, p.y - (c.y + dy), p.z - c.z) > 0.85) continue;
          rec.hitCooldown = 1.5;
          this.flopPlayer(rec, [b.velocity.x * 0.6, 4, b.velocity.z * 0.6]);
          const by = this.players.get(thrower);
          const what = e.kind === 'ragdoll' ? e.info.name : (e.kind === 'prop' ? B.PROP_TYPES[e.info.type].name : e.kind === 'bag' ? 'a trash bag' : 'trash');
          this.toastAll(by ? `${by.name} beaned ${rec.name} with ${e.kind === 'ragdoll' ? what : 'a ' + what}` : `${rec.name} got hit by a flying ${what}`, 'gary');
        }
      }
    }
  }

  isHeld(e) {
    for (const rec of this.players.values()) {
      const h = rec.grabber.held;
      if (h && (h.body === e.body || (e.ragdoll && h.ud.ragdoll === e.ragdoll))) return true;
    }
    return false;
  }

  dunkRagdoll(e) {
    const owner = this.ragdollOwner(e.ragdoll);
    const thrower = this.players.get(e.ragdoll.torso.userData.thrownBy ?? [...e.ragdoll.bodies].map((b) => b.userData.thrownBy ?? b.userData.lastHeldBy).find(Boolean));
    if ((e.meta.dunkCooldown ?? 0) > performance.now()) return;
    e.meta.dunkCooldown = performance.now() + 6000;
    if (owner === 'gary') {
      this.state.addMoney(DUMP_BONUS.gary, 'gary');
      this.state.stats.garyDunks++;
      this.fx({ k: 'dunk', victim: 'Gary', by: thrower?.id, amount: DUMP_BONUS.gary, x: e.body.position.x, y: 1.5, z: e.body.position.z });
      this.toastAll(`${thrower ? thrower.name + ' dunked' : 'Somebody dunked'} Gary! +$${DUMP_BONUS.gary} 🗑️`, 'gary');
      this.respawnGary(2.5);
    } else if (owner) {
      this.state.addMoney(DUMP_BONUS.friend, 'friend');
      this.state.stats.friendsDunked++;
      this.fx({ k: 'dunk', victim: owner.name, by: thrower?.id, amount: DUMP_BONUS.friend, x: e.body.position.x, y: 1.5, z: e.body.position.z });
      this.toastAll(`${thrower ? thrower.name : 'Somebody'} threw ${owner.name} in the dumpster! +$${DUMP_BONUS.friend}`, 'gary');
    }
  }

  recover(e) {
    if (e.kind === 'trash' || e.kind === 'bag') { this.despawn(e.id); return; }
    if (e.kind === 'prop') {
      const { p, q } = e.meta.home;
      e.body.position.set(p[0], p[1] + 1, p[2]);
      e.body.quaternion.set(q[0], q[1], q[2], q[3]);
      e.body.velocity.set(0, 0, 0);
      e.body.angularVelocity.set(0, 0, 0);
      return;
    }
    if (e.kind === 'ragdoll') {
      if (e.id === this.garyId) { this.respawnGary(0.5, 'Gary flew off into the sunset. Gary is back.'); return; }
      const rec = this.players.get(e.ragdoll.owner);
      if (rec) {
        const s = rec.spawn;
        e.ragdoll.teleport({ x: s.x, y: 0.2, z: s.z }, s.yaw);
      } else this.despawn(e.id);
    }
  }

  checkPlayers(dt) {
    const truck = this.game.truck;
    const speed = truck.horizontalSpeed();
    for (const rec of this.players.values()) {
      if (rec.state !== 'foot') continue;
      // Run over by the truck.
      if (speed > 4.5 && rec.hitCooldown <= 0 && truck.driver !== rec.id && truck.contains(rec.body.position, 0.35)) {
        rec.hitCooldown = 1.5;
        const v = truck.body.velocity;
        this.flopPlayer(rec, [v.x * 1.3, 6 + speed * 0.25, v.z * 1.3]);
        const driver = this.players.get(truck.driver);
        this.toastAll(driver ? `${driver.name} ran over ${rec.name} 🚚` : `${rec.name} got hit by a runaway truck`, 'gary');
      }
      // Fell out of the world.
      if (rec.body.position.y < -8) this.cmd(rec.id, 'respawn', { p: [rec.spawn.x, 0, rec.spawn.z] });
    }
  }

  sendSnapshot() {
    const key = (this.snapCount++ % KEYFRAME_EVERY) === 0;
    const e = [], r = [];
    for (const ent of this.entities.values()) {
      if (ent.ragdoll) {
        const rag = ent.ragdoll;
        if (!key && rag.torso.sleepState === CANNON.Body.SLEEPING) continue;
        const row = [ent.id];
        for (const k of PART_ORDER) {
          const b = rag.parts[k];
          row.push(r3(b.position.x), r3(b.position.y), r3(b.position.z), r4(b.quaternion.x), r4(b.quaternion.y), r4(b.quaternion.z), r4(b.quaternion.w));
        }
        r.push(row);
        continue;
      }
      const b = ent.body;
      if (!key && b.sleepState === CANNON.Body.SLEEPING) continue;
      e.push([ent.id, r3(b.position.x), r3(b.position.y), r3(b.position.z), r4(b.quaternion.x), r4(b.quaternion.y), r4(b.quaternion.z), r4(b.quaternion.w)]);
    }
    const p = [];
    for (const rec of this.players.values()) {
      const pose = rec.pose ?? {};
      const pp = rec.isLocal ? rec.body.position : null;
      const pos = pp ? [pp.x, pp.y, pp.z] : (pose.p ?? [0, 0, 0]);
      const inv = rec.inventory;
      p.push([rec.id, r3(pos[0]), r3(pos[1]), r3(pos[2]), r3(pose.yaw ?? 0), r3(pose.pitch ?? 0), r3(Math.hypot(pose.v?.[0] ?? 0, pose.v?.[2] ?? 0)),
        STATE_CODE[rec.state], pose.drunk ?? 0, Math.round(Math.min(1, inv.current.used / inv.capacity) * 100), rec.holding ?? 0, inv.tied.length, pose.punch ?? 0]);
    }
    const t = this.game.truck;
    const tp = t.pose().map((v, i) => (i >= 3 && i < 7 ? r4(v) : r3(v)));
    this.net.send('snap', { t: performance.now(), e, r, p, tr: [...tp, r3(t.steer), t.bedCount, t.driver ?? 0] });
  }
}

const TOTAL_WEIGHT = B.TRASH_REGIONS.reduce((s, r) => s + r.weight, 0);
function pickRegion() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const r of B.TRASH_REGIONS) { roll -= r.weight; if (roll <= 0) return r; }
  return B.TRASH_REGIONS[0];
}
