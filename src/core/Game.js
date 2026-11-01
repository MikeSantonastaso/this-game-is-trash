// Composition root and main loop. Every machine runs one Game: the static
// block, the local player, rendering, sound and UI. The host's Game also runs
// HostSim (the authoritative simulation); a client's Game mirrors the host from
// snapshots instead. See README "Multiplayer" for the message flow.
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { SaveSystem } from './SaveSystem.js';
import { Assets } from './Assets.js';
import { PhysicsWorld, CANNON, GROUP } from '../systems/PhysicsWorld.js';
import { computeStats } from '../systems/Stats.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Graphics } from '../render/Graphics.js';
import { Viewmodel } from '../entities/Viewmodel.js';
import { LocalPlayer } from '../entities/LocalPlayer.js';
import { Avatar } from '../entities/Avatar.js';
import { Truck } from '../entities/Truck.js';
import { PART_ORDER } from '../entities/Ragdoll.js';
import { Input } from '../input/Input.js';
import { LocalInputSource } from '../input/LocalInputSource.js';
import { buildBlock } from '../world/Block.js';
import { EntityFactory } from '../net/Entities.js';
import { createNet } from '../net/Net.js';
import { SampleBuffer, Clock } from '../net/Interp.js';
import { HostSim } from '../sim/HostSim.js';
import { Sfx } from '../audio/Sfx.js';
import { Fx } from '../render/Fx.js';
import { Hud } from '../ui/Hud.js';
import { ShopUI } from '../ui/ShopUI.js';
import * as B from '../data/block.js';

const IDLE_INTENT = {
  move: { x: 0, z: 0 }, jump: false, sprint: false, pick: false, pickHeld: false,
  grab: false, flop: false, interact: false, tie: false, throwBag: false, punch: false,
  axes: { x: 0, y: 0 }, brake: false,
};
const POSE_INTERVAL = 1 / 30;
const PLAYER_COLORS = ['#ffd23f', '#5ad1ff', '#ff6b9a', '#7dff6b', '#c49bff', '#ffa94d'];
const QUATS_E = [3];
const QUATS_R = PART_ORDER.map((_, i) => i * 7 + 3);

export class Game {
  static async create(canvas, onProgress) {
    const assets = new Assets();
    await assets.loadAll(onProgress);
    return new Game(canvas, assets);
  }

  constructor(canvas, assets) {
    this.canvas = canvas;
    this.assets = assets;
    this.events = new EventBus();
    this.state = new GameState(this.events);
    this.stats = computeStats(this.state);
    this.events.on('state:changed', () => {
      this.stats = computeStats(this.state);
      this.viewmodel?.setTool(this.stats.tool);
    });

    const params = new URLSearchParams(location.search);
    this.lowQuality = params.get('quality') === 'low';
    this.noRender = params.get('render') === '0'; // for automated tests: run the game without drawing
    this.graphics = new Graphics(canvas, { lowQuality: this.lowQuality });
    this.renderer = this.graphics.renderer;
    this.scene = this.graphics.scene;
    this.camera = this.graphics.camera;
    this.graphics.scene.fog.near = 60;
    this.graphics.scene.fog.far = 220;

    this.physics = new PhysicsWorld();
    this.ctx = { scene: this.scene, physics: this.physics, events: this.events, assets, graphics: this.graphics, lowQuality: this.lowQuality };
    this.layout = buildBlock(this.ctx);
    this.factory = new EntityFactory(this.ctx);
    this.entities = new Map();

    this.input = new Input(canvas);
    this.cameraRig = new CameraRig(this.camera);
    this.viewmodel = new Viewmodel(this.camera);
    this.viewmodel.setTool(this.stats.tool);
    this.localPlayer = new LocalPlayer(this);
    this.intentSource = new LocalInputSource(this.input, this.cameraRig);
    this.spawnPoint = new THREE.Vector3(B.PLAYER_SPAWNS[0].x, 0, B.PLAYER_SPAWNS[0].z);

    this.sfx = new Sfx(this.camera);
    this.fx = new Fx(this);
    this.hud = new Hud(this);
    this.shop = new ShopUI(this);

    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.48, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff35c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // Multiplayer bookkeeping
    this.roster = new Map(); // id -> { id, name, model, color, host }
    this.avatars = new Map(); // id -> Avatar (other players)
    this.proxies = new Map(); // id -> kinematic capsule for other players (clients)
    this.playerBufs = new Map(); // id -> SampleBuffer (clients)
    this.playerInfo = new Map(); // id -> latest discrete fields
    this.truckBuf = new SampleBuffer();
    this.clock = new Clock();
    this.poseTimer = 0;
    this.saveTimer = 0;
    this.connected = false;
    this.running = false;
    this.tmp = new Array(64).fill(0);

    this.cameraRig.yaw = B.PLAYER_SPAWNS[0].yaw;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------------------------------------------------------------- session

  // mode: 'solo' | 'host' | 'join'
  async begin({ mode, room, name, model }) {
    this.mode = mode;
    this.isHost = mode !== 'join';
    this.room = room;
    this.me = { name, model, color: PLAYER_COLORS[0] };
    this.net = await createNet({ mode, room, onError: (d) => this.hud.status(`Connection trouble: ${d?.error ?? 'unknown'}. Try again or check the room code.`) });
    this.selfId = this.net.selfId;
    this.localPlayer.body.userData.pid = this.selfId;
    this.truck = new Truck(this.ctx, { position: B.TRUCK_SPAWN, yaw: B.TRUCK_SPAWN.yaw, simulate: this.isHost });
    this.sfx.attachEngine(this.truck);

    if (this.isHost) {
      this.state.load(SaveSystem.load());
      this.sim = new HostSim(this);
      const spawn = B.PLAYER_SPAWNS[0];
      this.localPlayer.spawn(spawn, spawn.yaw);
      this.sim.addPlayer(this.selfId, this.me);
      let colorIdx = 1;
      this.net.on('hello', (d, from) => {
        if (this.sim.players.has(from)) return;
        if (this.sim.players.size >= 8) return;
        this.sim.welcome(from, { name: String(d?.name ?? 'Friend').slice(0, 16), model: d?.model ?? 'worker', color: PLAYER_COLORS[colorIdx++ % PLAYER_COLORS.length] });
      });
      this.net.on('pose', (d, from) => this.sim.onPose(from, d));
      this.net.on('act', (d, from) => this.sim.onAct(from, d));
      this.net.onPeerLeave = (id) => this.sim.removePlayer(id);
      this.connected = true;
    } else {
      this.hostId = null;
      for (const t of ['welcome', 'spawn', 'despawn', 'snap', 'state', 'inv', 'players', 'fx', 'cmd']) {
        this.net.on(t, (d, from) => {
          if (t === 'welcome') { if (this.hostId) return; this.hostId = from; }
          if (from !== this.hostId) return;
          this.receive(t, d, from);
        });
      }
      const hello = () => this.net.send('hello', { name, model });
      this.net.onPeerJoin = (id) => { if (!this.hostId) this.net.send('hello', { name, model }, id); };
      this.net.onPeerLeave = (id) => {
        if (id === this.hostId) this.hud.status('The host left the game. Reload to host or join another room.', true);
        else this.removeRosterEntry(id);
      };
      this.helloTimer = setInterval(() => { if (this.hostId) clearInterval(this.helloTimer); else hello(); }, 1500);
      hello();
      this.hud.status(`Looking for room ${room}...`);
      this.joinTimeout = setTimeout(() => {
        if (!this.hostId) this.hud.status(`Still looking for room ${room}. Make sure the host has the game open and the code is right. It can take a few seconds to find each other.`);
      }, 15000);
    }
    this.hud.setRoom(mode, room);
  }

  // Send an action to the host (or straight into the sim if we are the host).
  act(a) {
    if (this.isHost) this.sim.onAct(this.selfId, a);
    else if (this.hostId) this.net.send('act', a, this.hostId);
  }

  // Messages from the host (over the network, or directly when we are the host).
  receive(type, d) {
    switch (type) {
      case 'welcome': this.onWelcome(d); break;
      case 'spawn': if (!this.isHost) this.addEntity(d); break;
      case 'despawn': this.onDespawn(d); break;
      case 'snap': this.onSnapshot(d); break;
      case 'state': if (!this.isHost) this.state.load(d); break;
      case 'inv': this.localPlayer.inv = d; break;
      case 'players': this.setRoster(d); break;
      case 'fx': this.fx.onEvent(d); break;
      case 'cmd': this.localPlayer.onCmd(d); break;
      default: break;
    }
  }

  onWelcome(d) {
    clearTimeout(this.joinTimeout);
    this.connected = true;
    for (const info of d.entities) this.addEntity(info);
    this.state.load(d.state);
    this.setRoster(d.players);
    const t = d.truck;
    if (t?.pose) this.truck.setPose(t.pose.slice(0, 3), t.pose.slice(3, 7));
    this.truck.driver = t?.driver ?? null;
    this.truck.bedCount = t?.bed ?? 0;
    this.localPlayer.spawn(d.spawn, d.spawn.yaw);
    this.spawnPoint.set(d.spawn.x, 0, d.spawn.z);
    this.hud.status(null);
    const host = d.players.find((p) => p.host);
    this.toast(`Joined ${host?.name ?? 'the host'}'s block. Grab a friend with E!`, 'info');
  }

  addEntity(info) {
    if (this.entities.has(info.id)) return;
    const e = this.factory.create(info, false);
    e.buf = new SampleBuffer(8);
    const t = this.clock.offset === null ? performance.now() : this.clock.renderTime();
    if (e.ragdoll) {
      const row = [];
      for (const k of PART_ORDER) { const b = e.ragdoll.parts[k]; row.push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); }
      e.buf.push(t, row);
    } else e.buf.push(t, [...info.p, ...(info.q ?? [0, 0, 0, 1])]);
    this.entities.set(info.id, e);
  }

  onDespawn({ id, fx }) {
    const e = this.entities.get(id);
    if (!e) return;
    this.fx.onDespawn(e, fx);
    if (!this.isHost) { this.factory.destroy(e); this.entities.delete(id); }
  }

  onSnapshot(s) {
    this.clock.sample(s.t);
    const t = s.t;
    for (const row of s.e) {
      const e = this.entities.get(row[0]);
      if (e) e.buf.push(t, row.slice(1));
    }
    for (const row of s.r) {
      const e = this.entities.get(row[0]);
      if (e) e.buf.push(t, row.slice(1));
    }
    for (const row of s.p) {
      const [id, x, y, z, yaw, pitch, speed, state, drunk, fill, holding, tied, punch] = row;
      if (id === this.selfId) {
        if (performance.now() > (this.localPlayer.holdLock ?? 0)) this.localPlayer.holding = holding;
        continue;
      }
      let buf = this.playerBufs.get(id);
      if (!buf) this.playerBufs.set(id, (buf = new SampleBuffer(10)));
      buf.push(t, [x, y, z, yaw, pitch, speed]);
      this.playerInfo.set(id, { state, drunk, fill, holding, tied, punch });
    }
    if (s.tr) {
      this.truckBuf.push(t, s.tr.slice(0, 7).concat(s.tr[10]));
      this.truck.bedCount = s.tr[11];
      this.truck.driver = s.tr[12] || null;
    }
  }

  setRoster(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      this.roster.set(p.id, p);
      if (p.id === this.selfId) { this.me.color = p.color; continue; }
      if (!this.avatars.has(p.id)) {
        this.avatars.set(p.id, new Avatar(this, p));
        if (!this.isHost) {
          const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: GROUP.REMOTE, collisionFilterMask: GROUP.PLAYER });
          body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.45, 0));
          body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.45, 0));
          body.position.set(0, -50, 0);
          body.userData = { kind: 'player', pid: p.id };
          this.physics.add(body);
          this.proxies.set(p.id, body);
        }
      }
    }
    for (const id of [...this.roster.keys()]) if (!seen.has(id)) this.removeRosterEntry(id);
    this.hud.setPlayers([...this.roster.values()]);
  }

  removeRosterEntry(id) {
    this.roster.delete(id);
    this.avatars.get(id)?.dispose();
    this.avatars.delete(id);
    const b = this.proxies.get(id);
    if (b) this.physics.remove(b);
    this.proxies.delete(id);
    this.playerBufs.delete(id);
    this.hud.setPlayers([...this.roster.values()]);
  }

  // Bodies standing in for other players (what you grab them by).
  remoteBodies() {
    if (this.isHost) return [...this.sim.players.values()].filter((r) => !r.isLocal && r.state === 'foot').map((r) => r.body);
    return [...this.proxies.entries()].filter(([id]) => this.playerInfo.get(id)?.state === 0).map(([, b]) => b);
  }

  // ---------------------------------------------------------------- loop

  toast(text, kind, key) { this.hud.toast(text, kind, key); }
  save() { if (this.isHost) SaveSystem.save(this.state.toJSON()); }

  resetSave() {
    if (!this.isHost) { this.toast('Only the host can wipe the save', 'warn'); return; }
    SaveSystem.clear();
    this.state.reset();
    this.toast('Save wiped. Back to the stick.', 'warn');
  }

  resize() { this.graphics.resize(window.innerWidth, window.innerHeight); }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - this.lastT) / 1000, 1 / 20);
      this.lastT = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    const lp = this.localPlayer;
    const menu = this.shop.isOpen;
    this.input.enabled = !menu;
    const intent = { ...IDLE_INTENT, ...this.intentSource.read(dt) };
    if (menu || !this.connected) Object.assign(intent, IDLE_INTENT, { aimDir: intent.aimDir, aimOrigin: intent.aimOrigin, aimRight: intent.aimRight, yaw: intent.yaw, pitch: intent.pitch });
    this.lastIntent = intent;

    lp.update(dt, intent);
    if (this.isHost) this.sim.update(dt);
    else this.applyInterpolation(dt);

    this.physics.step(dt);

    const impact = this.truck.lateUpdate(dt);
    if (this.truck.driver === this.selfId) lp.afterDrive(impact);
    for (const e of this.entities.values()) if (e.ragdoll && e.simulate) e.ragdoll.sync();
    if (this.isHost) this.sim.lateUpdate(dt);
    lp.lateUpdate(dt);

    // Unhide anything we tried to pick that the host didn't hand over.
    const now = performance.now();
    for (const e of this.entities.values()) if (e.pending && now - e.pending > 1500) { e.pending = 0; e.mesh.visible = true; }

    if (!this.isHost && this.hostId) {
      this.poseTimer += dt;
      if (this.poseTimer >= POSE_INTERVAL) { this.poseTimer = 0; this.net.send('pose', lp.pose(), this.hostId); }
    }
    this.updateAvatars(dt);

    const chase = lp.state !== 'foot';
    this.cameraRig.setMode(chase ? 'chase' : 'first');
    this.cameraRig.roll = lp.drunk > 0.5 ? Math.sin(now / 900) * 0.025 * lp.drunk : 0;
    this.cameraRig.update(dt, lp.cameraTarget(), lp.grounded && lp.state === 'foot' ? lp.horizontalSpeed() : 0);
    if (this.debugCam) { this.camera.position.fromArray(this.debugCam.pos); this.camera.lookAt(...this.debugCam.look); }
    this.graphics.follow(this.debugCam ? new THREE.Vector3(...this.debugCam.look) : lp.cameraTarget());
    this.updateHighlight();
    this.fx.update(dt);
    this.sfx.update(dt, this);
    this.hud.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
    if (!this.noRender || this.forceRender) { this.graphics.render(dt); this.forceRender = false; }
    this.input.endFrame();
  }

  // Clients: move every stand-in to where the host says it was ~110 ms ago.
  applyInterpolation(dt) {
    const rt = this.clock.renderTime();
    const tmp = this.tmp;
    for (const e of this.entities.values()) {
      if (e.ragdoll) {
        if (!e.buf.at(rt, tmp, { quats: QUATS_R })) continue;
        PART_ORDER.forEach((k, i) => {
          const b = e.ragdoll.parts[k], o = i * 7;
          b.position.set(tmp[o], tmp[o + 1], tmp[o + 2]);
          b.quaternion.set(tmp[o + 3], tmp[o + 4], tmp[o + 5], tmp[o + 6]);
        });
        e.ragdoll.sync();
        continue;
      }
      if (!e.buf.at(rt, tmp, { quats: QUATS_E })) continue;
      e.body.position.set(tmp[0], tmp[1], tmp[2]);
      e.body.quaternion.set(tmp[3], tmp[4], tmp[5], tmp[6]);
    }
    // The truck, unless we're the one driving it.
    if (!this.truck.simulated && this.truckBuf.at(rt, tmp, { quats: QUATS_E })) {
      const b = this.truck.body;
      const k = 1 / Math.max(dt, 1 / 120);
      b.velocity.set((tmp[0] - b.position.x) * k, (tmp[1] - b.position.y) * k, (tmp[2] - b.position.z) * k);
      b.position.set(tmp[0], tmp[1], tmp[2]);
      b.quaternion.set(tmp[3], tmp[4], tmp[5], tmp[6]);
      this.truck.steer = tmp[7];
      const f = this.truck.forward();
      this.truck.speed = (b.velocity.x * f.x + b.velocity.z * f.z) * 0.5 + this.truck.speed * 0.5;
      b.velocity.set(0, 0, 0);
    }
  }

  updateAvatars(dt) {
    const rt = this.clock.renderTime();
    const tmp = this.tmp;
    for (const [id, avatar] of this.avatars) {
      let s;
      if (this.isHost) {
        const rec = this.sim.players.get(id);
        if (!rec?.view) continue;
        const inv = rec.inventory;
        s = { p: rec.view, yaw: rec.view[3], speed: rec.view[5], state: { foot: 0, ragdoll: 1, drive: 2 }[rec.state], drunk: rec.pose.drunk ?? 0,
          fill: Math.round(Math.min(1, inv.current.used / inv.capacity) * 100), holding: rec.holding, tied: inv.tied.length, punch: rec.pose.punch ?? 0 };
      } else {
        const buf = this.playerBufs.get(id);
        if (!buf?.at(rt, tmp, { angles: [3] })) continue;
        const info = this.playerInfo.get(id) ?? {};
        s = { p: [tmp[0], tmp[1], tmp[2]], yaw: tmp[3], speed: tmp[5], ...info };
        const proxy = this.proxies.get(id);
        if (proxy) {
          if (info.state === 0) proxy.position.set(tmp[0], tmp[1], tmp[2]);
          else proxy.position.set(0, -50, 0);
        }
      }
      avatar.update(dt, s);
    }
  }

  // What F does right now, in priority order. Hud.promptText mirrors this.
  interactTarget() {
    const lp = this.localPlayer;
    if (lp.state !== 'foot') return null;
    const f = lp.feet();
    const flat = (p) => Math.hypot(p.x - f.x, p.z - f.z);
    const L = this.layout;
    const dump = L.dumpsters.find((d) => flat(d.position) < d.interactRadius);
    if (dump) return { kind: 'sell', dumpster: dump };
    if (flat(L.shop.position) < L.shop.interactRadius) return { kind: 'shop' };
    if (flat(L.scratch.position) < L.scratch.interactRadius) return { kind: 'scratch' };
    if (flat(L.cooler.position) < L.cooler.interactRadius) return { kind: 'drink' };
    let bin = null, bestD = 2.4;
    for (const e of this.entities.values()) {
      if (e.kind !== 'prop' || e.info.type !== 'bin') continue;
      const d = flat(e.body.position);
      const q = e.body.quaternion;
      if (d < bestD && 1 - 2 * (q.x * q.x + q.z * q.z) > 0.7) { bestD = d; bin = e; }
    }
    if (bin) return { kind: 'bin', entity: bin };
    const t = this.truck;
    if (t && !t.driver) {
      if (flat(t.tailgatePoint()) < 2.6 && lp.hasBags) return { kind: 'load' };
      if (flat(t.position) < 4.2 || flat(t.doorPoint()) < 2) return { kind: 'drive' };
    }
    return null;
  }

  updateHighlight() {
    const t = this.localPlayer.target;
    this.highlight.visible = !!t && this.localPlayer.state === 'foot';
    if (this.highlight.visible) {
      const p = t.body.position;
      this.highlight.position.set(p.x, 0.04, p.z);
      const s = 1 + Math.sin(performance.now() / 120) * 0.08;
      this.highlight.scale.setScalar(t.kind === 'bag' || t.info.type === 'tire' || t.info.type === 'pizzaBox' ? s * 1.5 : s);
    }
  }
}
