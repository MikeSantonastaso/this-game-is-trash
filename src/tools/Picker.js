// The trash picker: finds what you're aiming at (with generous aim assist),
// and puts trash in your bag. Stats come from the equipped tool tier.
import * as THREE from 'three';
import { GROUP } from '../systems/PhysicsWorld.js';

const _v = new THREE.Vector3();
const _to = new THREE.Vector3();

export class Picker {
  constructor(player) {
    this.player = player;
    this.cooldown = 0;
    this.autoTimer = 0;
    this.target = null;
  }

  // Candidate = { kind: 'trash' | 'bag', ref, body }
  findTarget(game, intent) {
    const { reach } = this.player.stats;
    const chest = this.player.chest();
    const camDist = intent.aimOrigin.distanceTo(chest);
    _to.copy(intent.aimOrigin).addScaledVector(intent.aimDir, camDist + reach + 1);
    const hit = game.physics.raycast(intent.aimOrigin, _to, GROUP.TRASH | GROUP.BAG | GROUP.PROP | GROUP.GROUND);
    if (hit) {
      const c = this.toCandidate(hit.body);
      if (c && _v.copy(hit.point).distanceTo(chest) <= reach) return c;
    }
    // Aim assist: nearest pickable in front of you within reach.
    const facing = this.player.facing();
    let best = null, bestScore = Infinity;
    for (const c of game.pickables()) {
      _v.copy(c.body.position);
      const d = _v.distanceTo(chest);
      if (d > reach) continue;
      _v.sub(this.player.feet()).setY(0);
      const flat = _v.length();
      const dot = flat > 0.01 ? _v.dot(facing) / flat : 1;
      if (dot < 0.25) continue;
      const score = d * (2 - dot);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  toCandidate(body) {
    const ud = body?.userData;
    if (!ud) return null;
    if (ud.kind === 'trash') return { kind: 'trash', ref: ud.item, body };
    if (ud.kind === 'bag' && ud.grabbable) return { kind: 'bag', ref: ud.entry, body };
    return null;
  }

  update(dt, game, intent) {
    this.cooldown -= dt;
    this.target = this.player.grabber.isHolding ? null : this.findTarget(game, intent);
    const { autoRadius, cooldown } = this.player.stats;

    if (autoRadius > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = cooldown;
        const feet = this.player.feet();
        const near = game.spawner.items
          .filter((it) => it.body.position.distanceTo(feet) < autoRadius)
          .slice(0, this.player.stats.pickCount);
        for (const it of near) this.collect(game, { kind: 'trash', ref: it, body: it.body }, true);
      }
    }
  }

  pick(game) {
    if (this.cooldown > 0) return false;
    this.cooldown = this.player.stats.cooldown;
    this.player.model.clack();
    const t = this.target;
    if (!t) return false;
    if (!this.collect(game, t)) return false;
    // Multi-claw tiers scoop nearby extras.
    let extras = this.player.stats.pickCount - 1;
    if (extras > 0 && t.kind === 'trash') {
      const origin = t.body.position;
      const near = game.spawner.items
        .map((it) => ({ it, d: it.body.position.distanceTo(origin) }))
        .filter((e) => e.d < 1.8)
        .sort((a, b) => a.d - b.d);
      for (const { it } of near) {
        if (extras-- <= 0) break;
        if (!this.collect(game, { kind: 'trash', ref: it, body: it.body }, true)) break;
      }
    }
    this.target = null;
    return true;
  }

  collect(game, c, quiet = false) {
    const p = this.player;
    if (c.kind === 'trash') {
      const res = p.inventory.tryAdd(c.ref);
      if (!res.ok) { if (!quiet) game.toast('Bags full! Sell at the dumpster (F)', 'warn', 'full'); return false; }
      if (p.grabber.held?.body === c.body) p.grabber.release();
      game.spawner.collect(c.ref, () => p.handPosition());
      game.state.stats.itemsPicked++;
      game.events.emit('trash:collected', { player: p, item: c.ref });
      if (res.tied) game.toast('Bag tied off! 🛍️', 'info');
      return true;
    }
    if (c.kind === 'bag') {
      if (!p.inventory.pushBag(c.ref.bag)) { if (!quiet) game.toast('No room on your belt', 'warn', 'belt'); return false; }
      if (p.grabber.held?.body === c.body) p.grabber.release();
      game.looseBags.remove(c.ref);
      return true;
    }
    return false;
  }
}
