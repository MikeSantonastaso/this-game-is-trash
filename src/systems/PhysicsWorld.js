// Thin wrapper around cannon-es. Owns the world, collision groups, and the
// body -> mesh sync list. Swapping physics engines (Rapier, Godot Jolt, PhysX)
// means rewriting this file and Ragdoll/Grabber, not gameplay code.
import * as CANNON from 'cannon-es';

export const GROUP = {
  GROUND: 1,
  PLAYER: 2,
  TRASH: 4,
  RAGDOLL: 8,
  PROP: 16,
  BAG: 32,
  HAND: 64,
  VEHICLE: 128,
};
export const MASK_ALL = 0xffff & ~GROUP.HAND;

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0.15;

    this.materials = {
      default: this.world.defaultMaterial,
      ground: new CANNON.Material('ground'),
      player: new CANNON.Material('player'),
      vehicle: new CANNON.Material('vehicle'),
    };
    // The player controller sets velocity directly, so zero friction keeps it
    // from sticking to walls and slopes.
    for (const other of [this.materials.ground, this.materials.default]) {
      this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.player, other, { friction: 0, restitution: 0 }));
    }
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.ground, this.materials.default, { friction: 0.5, restitution: 0.15 }));
    // Vehicles also set their own velocity: slide on the ground and walls, but
    // keep enough grip that cargo (bags, Gary) rides along in the bed. Mostly.
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.vehicle, this.materials.ground, { friction: 0, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.materials.vehicle, this.materials.default, { friction: 0.7, restitution: 0.05 }));

    this.links = new Map();
    this._ray = new CANNON.RaycastResult();
  }

  add(body, mesh = null) {
    this.world.addBody(body);
    if (mesh) this.links.set(body, mesh);
    return body;
  }

  remove(body) {
    this.world.removeBody(body);
    this.links.delete(body);
  }

  step(dt) {
    this.world.step(1 / 60, dt, 5);
    for (const [body, mesh] of this.links) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  // Closest hit between two points. Returns { body, point, distance } or null.
  raycast(from, to, mask = MASK_ALL) {
    const r = this._ray;
    r.reset();
    this.world.raycastClosest(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z),
      { collisionFilterMask: mask, skipBackfaces: true },
      r,
    );
    if (!r.hasHit) return null;
    return { body: r.body, point: r.hitPointWorld.clone(), distance: r.distance };
  }
}

export { CANNON };
