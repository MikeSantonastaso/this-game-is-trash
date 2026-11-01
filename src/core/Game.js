// Composition root. Builds the renderer, physics, world, players and UI, then
// runs the loop. Gameplay systems are separate modules wired together here.
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { SaveSystem } from './SaveSystem.js';
import { PhysicsWorld } from '../systems/PhysicsWorld.js';
import { computeStats } from '../systems/Stats.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Assets } from './Assets.js';
import { Graphics } from '../render/Graphics.js';
import { Viewmodel } from '../entities/Viewmodel.js';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { TrashSpawner } from '../systems/TrashSpawner.js';
import { LooseBags } from '../systems/LooseBags.js';
import { DropOff } from '../systems/DropOff.js';
import { Input } from '../input/Input.js';
import { LocalInputSource } from '../input/LocalInputSource.js';
import { Player } from '../entities/Player.js';
import { Ragdoll } from '../entities/Ragdoll.js';
import { buildWorld } from '../world/World.js';
import { ZONES, getZone } from '../data/zones.js';
import { Zones } from '../systems/Zones.js';
import { CurbBins } from '../systems/CurbBins.js';
import { Truck } from '../entities/Truck.js';
import { getProperty } from '../data/properties.js';
import { Hud } from '../ui/Hud.js';
import { MapUI } from '../ui/MapUI.js';
import { ShopUI } from '../ui/ShopUI.js';
import { nameTag } from '../ui/nameTag.js';

const IDLE_INTENT = {
  move: { x: 0, z: 0 }, jump: false, sprint: false, pick: false, pickHeld: false,
  grab: false, flop: false, interact: false, tie: false, throwBag: false,
  axes: { x: 0, y: 0 }, brake: false,
};

export class Game {
  // Async because models load first: `const game = await Game.create(canvas, onProgress)`
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
    this.state.load(SaveSystem.load());
    this.stats = computeStats(this.state);
    this.events.on('state:changed', () => {
      this.stats = computeStats(this.state);
      for (const p of this.players ?? []) p.applyStats();
    });

    // ---- Rendering ----
    // ?quality=low turns off shadows, post-processing and most grass for weaker machines.
    this.lowQuality = new URLSearchParams(location.search).get('quality') === 'low';
    this.graphics = new Graphics(canvas, { lowQuality: this.lowQuality });
    this.renderer = this.graphics.renderer;
    this.scene = this.graphics.scene;
    this.camera = this.graphics.camera;

    // ---- World: one big map, zones unlock as you progress ----
    this.physics = new PhysicsWorld();
    const ctx = { scene: this.scene, physics: this.physics, events: this.events, assets: this.assets, graphics: this.graphics };
    this.layout = buildWorld(ctx);
    this.zones = new Zones(this, this.layout.borders);
    this.spawner = new TrashSpawner(ctx, this.layout);
    for (const zone of ZONES) if (this.state.isUnlocked(zone.id)) this.spawner.addZone(zone, this.layout.trashRegions[zone.id]);
    this.events.on('zone:unlocked', ({ zone }) => this.spawner.addZone(zone, this.layout.trashRegions[zone.id]));
    this.looseBags = new LooseBags(ctx);
    this.dropOff = new DropOff(this, this.layout);
    this.bins = new CurbBins(this, this.layout.bins);
    this.props = this.layout.dynamicProps.map((p) => this.spawnProp(p));

    // ---- The Rusty Pickup: parked at the motor pool, for sale until you buy it ----
    const pool = this.layout.motorPool;
    this.truck = new Truck(this, { position: pool.truckSpawn, yaw: pool.truckYaw, owned: this.state.ownsProperty('pickup'), sign: pool.sign });
    this.events.on('property:bought', ({ property }) => {
      if (property.id === 'pickup') { this.truck.setOwned(true); this.toast('The Rusty Pickup is yours! It\'s at the motor pool by Park Ave.', 'money'); }
    });

    // ---- Players ----
    // Co-op later: more Players, each with its own intent source.
    this.input = new Input(canvas);
    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.yaw = this.layout.spawnYaw;
    this.viewmodel = new Viewmodel(this.camera);
    const local = new Player(this, { id: 'p1', name: 'You', model: 'worker', viewmodel: this.viewmodel });
    local.spawn(this.layout.spawn, this.layout.spawnYaw);
    this.players = [local];
    this.localPlayer = local;
    this.intentSources = new Map([[local, new LocalInputSource(this.input, this.cameraRig)]]);
    this.events.on('player:entered', ({ player }) => {
      if (player !== this.localPlayer) return;
      this.cameraRig.chaseDistance = 8;
      this.cameraRig.yaw = player.vehicle.yaw;
      this.cameraRig.pitch = -0.22;
    });
    this.events.on('player:exited', ({ player, vehicle }) => {
      if (player !== this.localPlayer) return;
      this.cameraRig.chaseDistance = 4.5;
      this.cameraRig.yaw = vehicle.yaw;
      this.cameraRig.pitch = -0.1;
    });

    // ---- Gary, the intern. A ragdoll NPC who exists to be thrown. ----
    this.gary = new Ragdoll(this.physics, this.scene, {
      name: 'Gary',
      model: this.assets.instance('gary'),
      position: this.layout.garySpawn,
    });
    this.garyTag = nameTag('Gary (intern)');
    this.scene.add(this.garyTag);
    this.garyRespawnTimer = -1;

    // ---- Highlight ring under the current pick target ----
    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.48, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff35c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // ---- UI ----
    this.hud = new Hud(this);
    this.shop = new ShopUI(this);
    this.map = new MapUI(this);

    this.saveTimer = 0;
    this.clock = new THREE.Clock();
    this.running = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.updateLod(0, true);
  }

  // ---- Queries used by tools ----
  pickables() {
    const out = [];
    for (const it of this.spawner.items) out.push({ kind: 'trash', ref: it, body: it.body });
    for (const e of this.looseBags.bags) if (!e.decorative) out.push({ kind: 'bag', ref: e, body: e.body });
    return out;
  }

  grabbables() {
    const out = [];
    for (const it of this.spawner.items) out.push(it.body);
    for (const e of this.looseBags.bags) if (!e.decorative) out.push(e.body);
    out.push(...this.gary.bodies);
    for (const p of this.players) if (p.ragdoll) out.push(...p.ragdoll.bodies);
    out.push(...this.grabbablesExtra());
    return out;
  }

  grabbablesExtra() { return this.props.map((p) => p.body); }

  // Physics prop (park bins): a body plus the model offset so its base sits on the ground.
  spawnProp({ id, x, z }) {
    const size = this.assets.size(id);
    const body = new CANNON.Body({
      mass: 12,
      shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
      position: new CANNON.Vec3(x, size.y / 2 + 0.01, z),
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: MASK_ALL,
      allowSleep: true,
    });
    body.userData = { kind: 'prop', grabbable: true, name: 'trash can' };
    const holder = new THREE.Group();
    const model = this.assets.instance(id);
    model.position.y = -size.y / 2;
    holder.add(model);
    this.scene.add(holder);
    this.physics.add(body, holder);
    body.sleep();
    return { id, body, holder, home: new THREE.Vector3(x, size.y / 2 + 0.01, z) };
  }

  toast(text, kind, key) { this.hud.toast(text, kind, key); }

  save() { SaveSystem.save(this.state.toJSON()); }

  resetSave() {
    SaveSystem.clear();
    this.state.reset();
    for (const p of this.players) { if (p.vehicle) p.exitVehicle(); p.inventory.takeAll(); p.spawn(this.layout.spawn, this.layout.spawnYaw); }
    this.truck.unloadAll();
    this.truck.setOwned(false);
    this.truck.reset();
    this.toast('Save wiped. Back to the stick.', 'warn');
  }

  respawnGaryLater(seconds) { this.garyRespawnTimer = seconds; }

  resize() {
    this.graphics.resize(window.innerWidth, window.innerHeight);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 1 / 20);
      if (!this.paused) this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    const menu = this.shop.isOpen || this.map.isOpen;
    this.input.enabled = !menu;
    for (const player of this.players) {
      const src = this.intentSources.get(player);
      const intent = src ? { ...IDLE_INTENT, ...src.read(dt) } : IDLE_INTENT;
      if (menu) Object.assign(intent, IDLE_INTENT);
      this.lastIntent = intent;
      const wasDriving = !!player.vehicle;
      player.update(dt, intent);
      // F while driving means "get out", handled by the player.
      if (intent.interact && !wasDriving) this.interact(player);
    }
    if (!this.truck.driver) this.truck.idle(dt);

    this.physics.step(dt);

    for (const player of this.players) {
      player.lateUpdate(dt);
      if (!player.isFlopped && !player.vehicle && player.body.position.y < -10) player.spawn(this.layout.spawn, this.layout.spawnYaw);
    }
    this.truck.lateUpdate(dt);
    this.zones.update(dt);
    this.spawner.update(dt);
    this.looseBags.update(dt);
    this.dropOff.update(dt);
    this.bins.update(dt);
    this.gary.sync();
    this.updateGary(dt);
    this.updateHighlight();

    const me = this.localPlayer;
    this.cameraRig.setMode(me.isFlopped || me.vehicle ? 'chase' : 'first');
    if (me.vehicle) this.cameraRig.follow(dt, me.vehicle.yaw);
    this.cameraRig.update(dt, me.cameraTarget(), me.grounded && !me.isFlopped && !me.vehicle ? me.horizontalSpeed() : 0);
    this.graphics.follow(me.cameraTarget());
    this.hud.update(dt);
    this.map.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }

    this.updateLod(dt);
    this.graphics.render(dt);
    this.input.endFrame();
  }

  // Hide far-away chunks of instanced scenery (houses, trees, bins). The fog
  // covers the pop-in, and it keeps the big map cheap to draw.
  updateLod(dt, force = false) {
    this.lodTimer = (this.lodTimer ?? 0) - dt;
    if (this.lodTimer > 0 && !force) return;
    this.lodTimer = 0.25;
    const cam = this.camera.position;
    for (const l of this.layout.lod) {
      const d = Math.hypot(l.center.x - cam.x, l.center.z - cam.z);
      l.object.visible = d < l.far;
    }
  }

  // What F does on foot, in priority order. Hud.promptText mirrors this.
  interactTarget(player) {
    if (player.isFlopped || player.vehicle) return null;
    const feet = player.feet();
    if (this.dropOff.isNear(player)) return { kind: 'sell' };
    const shop = this.layout.shops.find((s) => feet.distanceTo(s.position) < s.interactRadius);
    if (shop) return { kind: 'shop', shop };
    const bin = this.bins.near(player);
    if (bin) return { kind: 'bin', bin };
    const t = this.truck;
    const tail = feet.distanceTo(t.tailgatePoint()) < 2.4, close = feet.distanceTo(t.position.clone().setY(0)) < 4;
    if (t.owned && tail && !player.inventory.isEmpty) return { kind: 'load' };
    if (close || tail) return { kind: t.owned ? 'drive' : 'buyTruck' };
    const gate = this.zones.nearGate(feet);
    if (gate) return { kind: 'gate', gate };
    return null;
  }

  interact(player) {
    const t = this.interactTarget(player);
    if (!t) return;
    if (t.kind === 'sell') this.dropOff.sellCarried(player);
    else if (t.kind === 'shop') this.shop.open();
    else if (t.kind === 'bin') this.bins.empty(player, t.bin);
    else if (t.kind === 'load') {
      const n = this.truck.loadFrom(player);
      this.toast(n ? `Loaded ${n} bag${n > 1 ? 's' : ''} into the truck (${this.truck.bed.length}/12)` : 'The truck bed is full', n ? 'info' : 'warn', 'bed');
    } else if (t.kind === 'drive') player.enterVehicle(this.truck);
    else if (t.kind === 'buyTruck') {
      const res = this.state.buyProperty('pickup');
      if (!res.ok) this.toast(`The Rusty Pickup costs $${getProperty('pickup').cost.toLocaleString()}. Keep picking!`, 'warn', 'truck');
      else this.save();
    } else if (t.kind === 'gate') this.zones.tryUnlockAt(t.gate);
  }

  // E while driving: sell the bed (and your belt) at a dumpster you've pulled up to.
  sellFromTruck(player) {
    const d = this.dropOff.at(this.truck.position, 8);
    if (!d) { this.toast('Pull up next to a dumpster to sell the load', 'warn', 'truck-sell'); return; }
    this.dropOff.sellCarried(player);
  }

  updateGary(dt) {
    if (this.garyRespawnTimer > 0) {
      this.garyRespawnTimer -= dt;
      if (this.garyRespawnTimer <= 0) {
        this.dropOff.releaseIfHeld(this.gary.torso);
        for (const p of this.players) if (p.grabber.held?.ud.ragdoll === this.gary) p.grabber.release();
        this.gary.teleport(this.layout.garySpawn, Math.random() * Math.PI * 2);
        this.toast('Gary is back. Gary is always back.', 'info');
      }
    }
    // Fell out of the world, or got thrown over a fence into a locked zone? Bring him home.
    const gp = this.gary.position;
    if (gp.y < -10) this.gary.teleport(this.layout.garySpawn);
    else if (this.gary.held === 0 && this.garyRespawnTimer <= 0 && this.zones.constrain(gp.x, gp.z, 0)) {
      this.toast('Gary wandered somewhere he shouldn\'t. Gary is back.', 'info', 'gary-lost');
      this.respawnGaryLater(2);
    }
    this.garyTag.position.set(this.gary.position.x, this.gary.position.y + 1.0, this.gary.position.z);
    this.garyTag.visible = this.gary.held === 0 && this.camera.position.distanceTo(this.garyTag.position) > 3;
  }

  updateHighlight() {
    const t = this.localPlayer.picker.target;
    this.highlight.visible = !!t;
    if (t) {
      const p = t.body.position;
      this.highlight.position.set(p.x, 0.03, p.z);
      const s = 1 + Math.sin(performance.now() / 120) * 0.08;
      this.highlight.scale.setScalar(t.kind === 'bag' || t.ref?.type === 'tire' || t.ref?.type === 'pizzaBox' ? s * 1.5 : s);
    }
  }
}
