// Physics hand: a kinematic anchor joined to whatever you grab with a
// point-to-point constraint. The anchor follows a target point every frame, so
// grabbed objects swing, dangle and lag behind naturally (very funny with a
// ragdoll held by one arm).
//
// The same class is meant to drive the garbage truck's lifting arm later: give
// it a different anchor (the claw tip) and a higher maxForce.
import { CANNON, GROUP, HELD_MASK } from '../systems/PhysicsWorld.js';

export class Grabber {
  constructor(physics, { maxForce = 1400, owner = null } = {}) {
    this.physics = physics;
    this.owner = owner; // player id, so thrown things know who threw them
    this.maxForce = maxForce;
    this.hand = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: GROUP.HAND,
      collisionFilterMask: 0,
    });
    this.hand.addShape(new CANNON.Sphere(0.05));
    physics.world.addBody(this.hand);
    this.constraint = null;
    this.held = null;
    this.pendingRestore = [];
  }

  get isHolding() { return !!this.held; }

  grab(body, worldPoint) {
    if (this.held) this.release();
    this.hand.position.set(worldPoint.x, worldPoint.y, worldPoint.z);
    this.hand.velocity.set(0, 0, 0);
    const local = body.pointToLocalFrame(new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z));
    this.constraint = new CANNON.PointToPointConstraint(this.hand, new CANNON.Vec3(), body, local, this.maxForce);
    this.physics.world.addConstraint(this.constraint);
    body.wakeUp();

    const ud = body.userData ?? {};
    this.held = { body, ud, mask: body.collisionFilterMask };
    ud.lastHeldBy = this.owner;
    if (ud.ragdoll) ud.ragdoll.setHeld(true);
    else body.collisionFilterMask = HELD_MASK;
    return this.held;
  }

  // Move the hand toward the target point (call every frame before physics step).
  update(dt, target) {
    for (let i = this.pendingRestore.length - 1; i >= 0; i--) {
      const p = this.pendingRestore[i];
      p.t -= dt;
      if (p.t <= 0) { p.restore(); this.pendingRestore.splice(i, 1); }
    }
    if (!this.held || !target) return;
    const h = this.hand.position;
    const inv = 1 / Math.max(dt, 1 / 120);
    this.hand.velocity.set((target.x - h.x) * inv, (target.y - h.y) * inv, (target.z - h.z) * inv);
    this.held.body.wakeUp();
  }

  release() {
    if (!this.held) return null;
    const held = this.held;
    held.ud.releasedAt = performance.now();
    this.physics.world.removeConstraint(this.constraint);
    this.constraint = null;
    this.held = null;
    this.hand.velocity.set(0, 0, 0);
    // Restore collisions with players a moment later so a dropped object
    // doesn't explode out of the player that was holding it.
    this.pendingRestore.push({
      t: 0.35,
      restore: () => {
        if (held.ud.ragdoll) held.ud.ragdoll.setHeld(false);
        else if (held.body.world) held.body.collisionFilterMask = held.mask;
      },
    });
    return held;
  }

  dispose() {
    this.release();
    for (const p of this.pendingRestore) p.restore();
    this.pendingRestore = [];
    this.physics.world.removeBody(this.hand);
  }

  throw(dir, speed = 14, lift = 4) {
    const held = this.release();
    if (!held) return null;
    held.ud.thrownAt = performance.now();
    const v = { x: dir.x * speed, y: dir.y * speed + lift, z: dir.z * speed };
    if (held.ud.ragdoll) { held.ud.ragdoll.setVelocity(v); held.ud.ragdoll.addSpin(6); }
    else {
      held.body.velocity.set(v.x, v.y, v.z);
      held.body.angularVelocity.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    }
    return held;
  }
}
