// Curbside bins in the neighborhoods. A full bin has a bag poking out of the
// lid; press F next to it to dump its contents into your bag (as much as fits).
// Bins refill over time. Later, the garbage truck's arm empties these.
import * as THREE from 'three';
import { getZone } from '../data/zones.js';
import { TRASH_TYPES, pickWeighted } from '../data/trash.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const REACH = 2.4;

export class CurbBins {
  constructor(game, spots) {
    this.game = game;
    this.bins = spots.map((s, i) => {
      const zone = getZone(s.zone);
      // Start most bins full, a few mid-refill, so streets don't look identical.
      const full = Math.random() < 0.8;
      return { ...s, i, zone, items: full ? zone.bins.items : 0, timer: full ? 0 : Math.random() * zone.bins.refillSeconds };
    });
    const geo = new THREE.SphereGeometry(0.34, 10, 8);
    geo.scale(1, 0.8, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.3, metalness: 0.1 });
    this.lumps = new THREE.InstancedMesh(geo, mat, Math.max(1, this.bins.length));
    this.lumps.castShadow = true;
    game.scene.add(this.lumps);
    this.bins.forEach((b) => this.syncLump(b));
    this.lumps.instanceMatrix.needsUpdate = true;
    this.lumps.computeBoundingSphere();
  }

  syncLump(b) {
    const fill = b.items / b.zone.bins.items;
    _s.setScalar(fill > 0 ? 0.6 + fill * 0.5 : 0.0001);
    _q.setFromAxisAngle(UP, b.rotY + b.i);
    _m.compose(_p.set(b.x, 1.12 + fill * 0.08, b.z), _q, _s);
    this.lumps.setMatrixAt(b.i, _m);
  }

  // Closest bin with something in it, in an unlocked zone.
  near(player) {
    const feet = player.feet();
    let best = null, bestD = REACH;
    for (const b of this.bins) {
      if (b.items <= 0) continue;
      const d = Math.hypot(b.x - feet.x, b.z - feet.z);
      if (d < bestD && this.game.state.isUnlocked(b.zone.id)) { bestD = d; best = b; }
    }
    return best;
  }

  estimate(b) {
    const avg = Object.entries(b.zone.trashWeights).reduce((s, [id, w]) => s + TRASH_TYPES[id].value * w, 0)
      / Object.values(b.zone.trashWeights).reduce((s, w) => s + w, 0);
    return Math.round(avg * b.items * b.zone.valueMultiplier);
  }

  empty(player, b) {
    const inv = player.inventory;
    let got = 0;
    while (b.items > 0) {
      const id = pickWeighted(b.zone.trashWeights);
      const def = TRASH_TYPES[id];
      const res = inv.tryAdd({ type: id, space: def.space, value: Math.round(def.value * b.zone.valueMultiplier * 10) / 10 });
      if (!res.ok) break;
      b.items--; got++;
    }
    const game = this.game;
    if (!got) { game.toast('Bags full! Sell before emptying more bins', 'warn', 'full'); return 0; }
    game.state.stats.itemsPicked += got;
    game.state.stats.binsEmptied = (game.state.stats.binsEmptied ?? 0) + 1;
    game.toast(b.items ? `Emptied ${got} items, bag's full (${b.items} left in the bin)` : `Emptied the bin: +${got} items 🗑️`, 'info');
    player.viewmodel?.clack();
    if (b.items === 0) b.timer = 0;
    this.syncLump(b);
    this.lumps.instanceMatrix.needsUpdate = true;
    return got;
  }

  update(dt) {
    let dirty = false;
    for (const b of this.bins) {
      if (b.items >= b.zone.bins.items) continue;
      b.timer += dt;
      if (b.timer >= b.zone.bins.refillSeconds) {
        b.items = b.zone.bins.items; b.timer = 0;
        this.syncLump(b);
        dirty = true;
      }
    }
    if (dirty) this.lumps.instanceMatrix.needsUpdate = true;
  }
}
