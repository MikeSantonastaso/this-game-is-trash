// Spawns trash in every unlocked zone from that zone's weighted table and
// refills over time. Items are light physics bodies so you can kick them, they
// tumble when a ragdoll lands on them, and they can be thrown into a dumpster.
// An item's value is baked in when it spawns (base value × zone multiplier),
// so trash keeps its price wherever you sell it.
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from './PhysicsWorld.js';
import { TRASH_TYPES, pickWeighted } from '../data/trash.js';
import { createTrashVisuals } from '../render/TrashModels.js';

let nextId = 1;

export class TrashSpawner {
  constructor({ scene, physics, events }, layout) {
    this.scene = scene;
    this.physics = physics;
    this.events = events;
    this.layout = layout;
    this.items = [];
    this.flying = [];
    this.zones = new Map(); // zone id -> { zone, region, count, timer }
    this.visuals = this.buildVisuals();
  }

  // Start littering a zone (on load for unlocked zones, and when one unlocks).
  addZone(zone, region, fill = true) {
    if (this.zones.has(zone.id) || !region) return;
    const z = { zone, region, count: 0, timer: 0 };
    this.zones.set(zone.id, z);
    if (fill) for (let i = 0; i < zone.trashMax; i++) this.spawn(z);
  }

  buildVisuals() {
    const models = createTrashVisuals();
    const out = {};
    for (const def of Object.values(TRASH_TYPES)) {
      const m = def.mesh;
      let half;
      if (m.shape === 'box') half = m.size.map((s) => Math.max(s / 2, 0.04));
      else if (m.shape === 'cylinder') { const r = Math.max(m.radiusTop, m.radiusBottom); half = [r, m.height / 2, r]; }
      else half = [m.radius + m.tube, m.tube, m.radius + m.tube];
      out[def.id] = { half, variants: models[def.id] };
    }
    return out;
  }

  randomSpot({ rect, accept }) {
    const { obstacles } = this.layout;
    for (let tries = 0; tries < 40; tries++) {
      const x = THREE.MathUtils.lerp(rect.minX, rect.maxX, Math.random());
      const z = THREE.MathUtils.lerp(rect.minZ, rect.maxZ, Math.random());
      if (accept && !accept(x, z)) continue;
      if (!obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) return { x, z };
    }
    return null;
  }

  spawn(z, typeId = pickWeighted(z.zone.trashWeights)) {
    const pos = this.randomSpot(z.region);
    if (!pos) return null;
    const def = TRASH_TYPES[typeId];
    const vis = this.visuals[typeId];
    const variant = vis.variants[Math.floor(Math.random() * vis.variants.length)];
    const mesh = new THREE.Group();
    mesh.add(variant.clone());
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: def.mass,
      shape: new CANNON.Box(new CANNON.Vec3(...vis.half)),
      collisionFilterGroup: GROUP.TRASH,
      collisionFilterMask: MASK_ALL,
      linearDamping: 0.1,
      angularDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.2,
    });
    // Lying on its side looks more like litter.
    const tipped = def.mesh.shape === 'cylinder' && Math.random() < 0.7;
    body.position.set(pos.x, tipped ? vis.half[0] + 0.02 : vis.half[1] + 0.02, pos.z);
    body.quaternion.setFromEuler(tipped ? Math.PI / 2 : 0, Math.random() * Math.PI * 2, 0, 'YXZ');
    const value = Math.round(def.value * z.zone.valueMultiplier * 10) / 10;
    const item = { id: nextId++, type: typeId, def, mesh, body, value, space: def.space, zone: z.zone.id };
    z.count++;
    body.userData = { kind: 'trash', item, grabbable: true, sellable: true };
    this.physics.add(body, mesh);
    body.sleep();
    this.items.push(item);
    return item;
  }

  // Remove from the world and fly the mesh into the player's hand.
  collect(item, getTarget) {
    this.detach(item);
    this.flying.push({ mesh: item.mesh, from: item.mesh.position.clone(), t: 0, getTarget });
  }

  // Remove instantly (sold in the dumpster, etc.).
  destroy(item) {
    this.detach(item);
    this.scene.remove(item.mesh);
  }

  detach(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    const z = this.zones.get(item.zone);
    if (z && i >= 0) z.count--;
    this.physics.remove(item.body);
  }

  update(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / 0.2;
      const k = Math.min(f.t, 1);
      f.mesh.position.lerpVectors(f.from, f.getTarget(), k * k);
      f.mesh.scale.setScalar(1 - k * 0.8);
      if (k >= 1) { this.scene.remove(f.mesh); this.flying.splice(i, 1); }
    }
    for (const z of this.zones.values()) {
      if (z.count >= z.zone.trashMax) continue;
      z.timer += dt;
      if (z.timer >= z.zone.respawnSeconds) { z.timer = 0; this.spawn(z); }
    }
  }
}
