// Composition root. Builds the renderer, physics, area, players and UI, then
// runs the loop. Gameplay systems are separate modules wired together here.
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { SaveSystem } from './SaveSystem.js';
import { PhysicsWorld } from '../systems/PhysicsWorld.js';
import { computeStats } from '../systems/Stats.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Assets } from './Assets.js';
import { Viewmodel } from '../entities/Viewmodel.js';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { TrashSpawner } from '../systems/TrashSpawner.js';
import { LooseBags } from '../systems/LooseBags.js';
import { DropOff } from '../systems/DropOff.js';
import { Input } from '../input/Input.js';
import { LocalInputSource } from '../input/LocalInputSource.js';
import { Player } from '../entities/Player.js';
import { Ragdoll } from '../entities/Ragdoll.js';
import { buildArea } from '../world/AreaBuilder.js';
import { getArea } from '../data/areas.js';
import { Hud } from '../ui/Hud.js';
import { ShopUI } from '../ui/ShopUI.js';
import { nameTag } from '../ui/nameTag.js';

const IDLE_INTENT = {
  move: { x: 0, z: 0 }, jump: false, sprint: false, pick: false, pickHeld: false,
  grab: false, flop: false, interact: false, tie: false, throwBag: false,
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // ?quality=low turns off shadows and high-DPI rendering for weaker machines.
    this.lowQuality = new URLSearchParams(location.search).get('quality') === 'low';
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa8d4f5);
    this.scene.fog = new THREE.Fog(0xc4e2f7, 70, 320);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1200);
    this.scene.add(this.camera); // the first-person hands are parented to it
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4a6b2a, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = new THREE.Vector3(30, 50, 20);

    // ---- World ----
    this.physics = new PhysicsWorld();
    this.area = getArea(this.state.currentArea);
    const ctx = { scene: this.scene, physics: this.physics, events: this.events, assets: this.assets };
    this.layout = buildArea(ctx, this.area);
    this.spawner = new TrashSpawner(ctx, this.area, this.layout);
    this.looseBags = new LooseBags(ctx);
    this.dropOff = new DropOff(this, this.layout);
    this.props = this.layout.dynamicProps.map((p) => this.spawnProp(p));

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

    this.saveTimer = 0;
    this.clock = new THREE.Clock();
    this.running = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
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
    for (const p of this.players) p.inventory.takeAll();
    this.toast('Save wiped. Back to the stick.', 'warn');
  }

  respawnGaryLater(seconds) { this.garyRespawnTimer = seconds; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    this.input.enabled = !this.shop.isOpen;
    for (const player of this.players) {
      const src = this.intentSources.get(player);
      const intent = src ? { ...IDLE_INTENT, ...src.read(dt) } : IDLE_INTENT;
      if (this.shop.isOpen) Object.assign(intent, IDLE_INTENT);
      this.lastIntent = intent;
      player.update(dt, intent);
      if (intent.interact) this.interact(player);
    }

    this.physics.step(dt);

    for (const player of this.players) {
      player.lateUpdate(dt);
      if (!player.isFlopped && player.body.position.y < -10) player.spawn(this.layout.spawn, this.layout.spawnYaw);
    }
    this.spawner.update(dt);
    this.looseBags.update(dt);
    this.dropOff.update(dt);
    this.gary.sync();
    this.updateGary(dt);
    this.updateHighlight();

    const me = this.localPlayer;
    this.cameraRig.setMode(me.isFlopped ? 'chase' : 'first');
    this.cameraRig.update(dt, me.cameraTarget(), me.grounded && !me.isFlopped ? me.horizontalSpeed() : 0);
    const focus = me.cameraTarget();
    this.sun.target.position.set(Math.round(focus.x), 0, Math.round(focus.z));
    this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    this.hud.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  interact(player) {
    if (player.isFlopped) return;
    if (this.dropOff.isNear(player)) this.dropOff.sellCarried(player);
    else if (player.feet().distanceTo(this.layout.shop.position) < this.layout.shop.interactRadius) this.shop.open();
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
    // Fell out of the world somehow? Bring him home.
    if (this.gary.position.y < -10) this.gary.teleport(this.layout.garySpawn);
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
