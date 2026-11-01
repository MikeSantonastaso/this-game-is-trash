// Composition root. Builds the renderer, physics, area, players and UI, then
// runs the loop. Gameplay systems are separate modules wired together here.
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { GameState } from './GameState.js';
import { SaveSystem } from './SaveSystem.js';
import { PhysicsWorld } from '../systems/PhysicsWorld.js';
import { computeStats } from '../systems/Stats.js';
import { ThirdPersonCamera } from '../systems/ThirdPersonCamera.js';
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
  constructor(canvas) {
    this.canvas = canvas;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3ff);
    this.scene.fog = new THREE.Fog(0x9fd3ff, 45, 110);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 300);
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4a6b2a, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(20, 35, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
    this.scene.add(sun);

    // ---- World ----
    this.physics = new PhysicsWorld();
    this.area = getArea(this.state.currentArea);
    const ctx = { scene: this.scene, physics: this.physics, events: this.events };
    this.layout = buildArea(ctx, this.area);
    this.spawner = new TrashSpawner(ctx, this.area, this.layout);
    this.looseBags = new LooseBags(ctx);
    this.dropOff = new DropOff(this, this.layout);

    // ---- Players ----
    // Co-op later: more Players, each with its own intent source.
    this.input = new Input(canvas);
    this.cameraRig = new ThirdPersonCamera(this.camera);
    this.cameraRig.yaw = this.layout.spawnYaw;
    const local = new Player(this, { id: 'p1', name: 'You' });
    local.spawn(this.layout.spawn, this.layout.spawnYaw);
    this.players = [local];
    this.localPlayer = local;
    this.intentSources = new Map([[local, new LocalInputSource(this.input, this.cameraRig)]]);

    // ---- Gary, the intern. A ragdoll NPC who exists to be thrown. ----
    this.gary = new Ragdoll(this.physics, this.scene, {
      name: 'Gary',
      position: this.layout.garySpawn,
      colors: { shirt: 0x2d6cdf, pants: 0x6b4f2a, skin: 0xe0ac69, hat: 0x2fbf71 },
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
    return out;
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
      this.frame(Math.min(this.clock.getDelta(), 1 / 20));
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
    this.updateGary(dt);
    this.updateHighlight();

    this.cameraRig.update(dt, this.localPlayer.cameraTarget());
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
