// Networked entities: trash, physics props, loose bags, ragdolls. The host
// creates them with simulate = true (real dynamic bodies). Clients create the
// same thing from the host's spawn message with simulate = false: a kinematic
// stand-in with no collisions whose pose comes from snapshots. Stand-ins keep
// their collision group, so clients can still raycast them (to aim the picker
// or grab something).
import * as THREE from 'three';
import { CANNON, GROUP, MASK_ALL } from '../systems/PhysicsWorld.js';
import { TRASH_TYPES } from '../data/trash.js';
import { PROP_TYPES } from '../data/block.js';
import { createTrashVisuals } from '../render/TrashModels.js';
import { Ragdoll } from '../entities/Ragdoll.js';

export class EntityFactory {
  constructor({ scene, physics, assets }) {
    this.scene = scene;
    this.physics = physics;
    this.assets = assets;
    this.trash = this.buildTrashVisuals();
    this.bagGeo = new THREE.SphereGeometry(0.32, 14, 10);
    this.bagGeo.scale(1, 1.15, 1);
    this.knotGeo = new THREE.ConeGeometry(0.1, 0.22, 8);
    this.bagMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.1 });
    this.coneMats = [new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 })];
  }

  buildTrashVisuals() {
    const procedural = createTrashVisuals();
    const out = {};
    for (const def of Object.values(TRASH_TYPES)) {
      const m = def.mesh;
      let half;
      if (m.shape === 'box') half = m.size.map((s) => Math.max(s / 2, 0.04));
      else if (m.shape === 'cylinder') { const r = Math.max(m.radiusTop, m.radiusBottom); half = [r, m.height / 2, r]; }
      else half = [m.radius + m.tube, m.tube, m.radius + m.tube];
      let variants = procedural[def.id] ?? [];
      if (def.models) {
        variants = def.models.filter((id) => this.assets.has(id)).map((id) => {
          const g = this.assets.instance(id);
          g.position.y = -half[1]; // models sit on y=0; bodies are centered
          const wrap = new THREE.Group();
          wrap.add(g);
          return wrap;
        });
      }
      out[def.id] = { half, variants };
    }
    return out;
  }

  // Build an entity from its spawn info. Returns { id, kind, info, body, mesh, ... }.
  create(info, simulate) {
    const e = { id: info.id, kind: info.kind, info, simulate, samples: [] };
    if (info.kind === 'trash') this.makeTrash(e);
    else if (info.kind === 'prop') this.makeProp(e);
    else if (info.kind === 'bag') this.makeBag(e);
    else if (info.kind === 'ragdoll') this.makeRagdoll(e);
    else throw new Error(`unknown entity kind ${info.kind}`);
    return e;
  }

  body(e, { mass, shape, group, damping = 0.1, angular = 0.3, sleep = 0.2, material }) {
    const sim = e.simulate;
    const body = new CANNON.Body({
      mass: sim ? mass : 0,
      type: sim ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC,
      shape,
      material,
      collisionFilterGroup: group,
      collisionFilterMask: sim ? MASK_ALL : 0,
      linearDamping: damping,
      angularDamping: angular,
      allowSleep: true,
      sleepSpeedLimit: sleep,
    });
    const { p, q, vel } = e.info;
    if (p) body.position.set(p[0], p[1], p[2]);
    if (q) body.quaternion.set(q[0], q[1], q[2], q[3]);
    if (vel && sim) body.velocity.set(vel[0], vel[1], vel[2]);
    return body;
  }

  makeTrash(e) {
    const def = TRASH_TYPES[e.info.type];
    const vis = this.trash[e.info.type];
    const variant = vis.variants[(e.info.v ?? 0) % Math.max(1, vis.variants.length)];
    e.mesh = new THREE.Group();
    if (variant) e.mesh.add(variant.clone());
    e.body = this.body(e, { mass: def.mass, shape: new CANNON.Box(new CANNON.Vec3(...vis.half)), group: GROUP.TRASH });
    e.body.userData = { kind: 'trash', netId: e.id, type: e.info.type, def, grabbable: true, sellable: true };
    this.add(e);
  }

  makeProp(e) {
    const t = PROP_TYPES[e.info.type];
    let size;
    const holder = new THREE.Group();
    if (t.model && this.assets.has(t.model)) {
      size = this.assets.size(t.model).clone();
      const model = this.assets.instance(t.model);
      model.position.y = -size.y / 2;
      holder.add(model);
    } else {
      size = new THREE.Vector3(0.4, 0.7, 0.4);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 14), this.coneMats[0]);
      cone.position.y = -0.02;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.12, 14), this.coneMats[1]);
      band.position.y = 0.0;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), this.coneMats[0]);
      base.position.y = -0.33;
      holder.add(cone, band, base);
      holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
    // Slightly smaller box than the visual so things settle without hovering.
    const half = new CANNON.Vec3(size.x * 0.46, size.y / 2, size.z * 0.46);
    e.mesh = holder;
    e.size = size;
    e.body = this.body(e, { mass: t.mass, shape: new CANNON.Box(half), group: GROUP.PROP, damping: 0.05, angular: 0.2, sleep: 0.25 });
    e.body.userData = { kind: 'prop', netId: e.id, type: e.info.type, name: t.name, grabbable: true };
    this.add(e);
  }

  makeBag(e) {
    const mesh = new THREE.Mesh(this.bagGeo, this.bagMat);
    const knot = new THREE.Mesh(this.knotGeo, this.bagMat);
    knot.position.y = 0.42;
    mesh.add(knot);
    mesh.castShadow = true;
    const s = 0.75 + Math.min(1, (e.info.used ?? 6) / 12) * 0.35;
    mesh.scale.setScalar(s);
    e.mesh = mesh;
    e.body = this.body(e, { mass: 2 + (e.info.used ?? 6) * 0.3, shape: new CANNON.Sphere(0.34 * s), group: GROUP.BAG, damping: 0.15, angular: 0.5 });
    e.body.userData = { kind: 'bag', netId: e.id, grabbable: true, sellable: true };
    this.add(e);
  }

  makeRagdoll(e) {
    const { model, name, p, yaw } = e.info;
    const r = new Ragdoll(this.physics, this.scene, {
      model: this.assets.instance(model),
      name,
      position: { x: p[0], y: p[1], z: p[2] },
      yaw: yaw ?? 0,
      simulate: e.simulate,
    });
    r.netId = e.id;
    r.owner = e.info.owner;
    for (const b of r.bodies) b.userData.netId = e.id;
    if (e.info.vel && e.simulate) { r.setVelocity({ x: e.info.vel[0], y: e.info.vel[1], z: e.info.vel[2] }); r.addSpin(3); }
    e.ragdoll = r;
    e.body = r.torso;
    e.mesh = r.model;
  }

  add(e) {
    this.scene.add(e.mesh);
    this.physics.add(e.body, e.mesh);
    e.mesh.position.copy(e.body.position);
    e.mesh.quaternion.copy(e.body.quaternion);
  }

  destroy(e) {
    if (e.ragdoll) { e.ragdoll.dispose(); return; }
    this.physics.remove(e.body);
    this.scene.remove(e.mesh);
  }
}
