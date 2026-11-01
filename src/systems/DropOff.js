// Dumpsters (one or more per zone): press F nearby to sell everything you
// carry, plus the truck bed if your truck is parked next to it, or throw stuff
// in. Anything sellable whose center lands inside a trigger box is sold. Gary
// the intern is not sellable, but dunking him pays a bonus anyway.
import * as THREE from 'three';

const GARY_BONUS = 25;
const TRUCK_RANGE = 12;
const _p = new THREE.Vector3();

export class DropOff {
  constructor(game, layout) {
    this.game = game;
    this.dumpsters = layout.dropOffs;
    this.garyCooldown = 0;
  }

  // Item values already include the zone multiplier; haggling applies here.
  saleValue(bags) {
    const raw = bags.reduce((s, b) => s + b.value, 0);
    return Math.round(raw * this.game.stats.valueMult);
  }

  // The dumpster within reach of a position, or null.
  at(pos, extra = 0) {
    for (const d of this.dumpsters) if (Math.hypot(pos.x - d.position.x, pos.z - d.position.z) < d.interactRadius + extra) return d;
    return null;
  }

  isNear(player) { return !!this.at(player.feet(_p)); }

  truckNear(dumpster) {
    const t = this.game.truck;
    return t && t.owned && t.bed.length && t.position.distanceTo(dumpster.position) < TRUCK_RANGE ? t : null;
  }

  sellCarried(player) {
    const game = this.game;
    const dumpster = this.at(player.feet(_p)) ?? this.at(player.feet(_p), TRUCK_RANGE);
    const truck = dumpster && this.truckNear(dumpster);
    const bags = player.inventory.takeAll();
    const truckBags = truck ? truck.unloadAll() : [];
    const all = [...bags, ...truckBags];
    if (!all.length) { game.toast('Nothing to sell. Go pick up some trash!', 'warn', 'nosell'); return 0; }
    const total = this.saleValue(all);
    game.state.addMoney(total, 'sell');
    game.state.stats.bagsSold += all.length;
    game.toast(`Sold ${all.length} bag${all.length > 1 ? 's' : ''}${truckBags.length ? ` (${truckBags.length} from the truck)` : ''} for $${total.toLocaleString()}`, 'money');
    // Toss the bags in for show.
    all.slice(0, 8).forEach((bag, i) => {
      const from = (i < bags.length ? player.chest() : truck.bedPoint()).add(new THREE.Vector3(0, 0.3 + i * 0.2, 0));
      const to = dumpster.position;
      const t = 0.7;
      const vel = { x: (to.x - from.x) / t, y: (1.2 - from.y) / t + 0.5 * 20 * t, z: (to.z - from.z) / t };
      game.looseBags.spawn(bag, from, vel, { decorative: true, life: 2.5 });
    });
    game.save();
    return total;
  }

  update(dt) {
    this.garyCooldown -= dt;
    for (const d of this.dumpsters) this.checkTrigger(d.trigger);
  }

  checkTrigger(box) {
    const game = this.game;
    for (const item of game.spawner.items) {
      if (!box.containsPoint(_p.copy(item.body.position))) continue;
      this.releaseIfHeld(item.body);
      const total = this.saleValue([{ value: item.value }]);
      game.spawner.destroy(item);
      game.state.addMoney(total, 'dunk');
      game.toast(`Nothing but net! ${item.def.name} +$${total}`, 'money');
      return; // one per frame keeps iteration simple
    }

    for (const entry of game.looseBags.bags) {
      if (entry.decorative || !box.containsPoint(_p.copy(entry.body.position))) continue;
      this.releaseIfHeld(entry.body);
      const total = this.saleValue([entry.bag]);
      game.looseBags.remove(entry);
      game.state.addMoney(total, 'dunk');
      game.state.stats.bagsSold++;
      game.toast(`Bag dunked! +$${total}`, 'money');
      game.save();
      return;
    }

    const gary = game.gary;
    if (gary && this.garyCooldown <= 0 && box.containsPoint(_p.copy(gary.position))) {
      this.garyCooldown = 3;
      game.state.stats.garyDunks++;
      game.state.addMoney(GARY_BONUS, 'gary');
      const lines = ['GARY HAS BEEN THROWN AWAY', 'Gary is trash now', 'Gary: "this is fine"', 'HR has been notified about Gary'];
      game.toast(`${lines[game.state.stats.garyDunks % lines.length]} +$${GARY_BONUS}`, 'gary');
      game.respawnGaryLater(2.5);
    }

    for (const player of game.players) {
      const rd = player.ragdoll;
      if (rd && !player.thrownAway && box.containsPoint(_p.copy(rd.position))) {
        player.thrownAway = true;
        game.toast('You threw yourself away. Respect.', 'gary');
      }
    }
  }

  releaseIfHeld(body) {
    for (const p of this.game.players) if (p.grabber.held?.body === body) p.grabber.release();
  }
}
