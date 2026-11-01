// The dumpster: press F nearby to sell everything you carry, or throw stuff in.
// Anything sellable whose center lands inside the trigger box is sold. Gary
// the intern is not sellable, but dunking him pays a bonus anyway.
import * as THREE from 'three';

const GARY_BONUS = 25;
const _p = new THREE.Vector3();

export class DropOff {
  constructor(game, layout) {
    this.game = game;
    this.def = layout.dropOff;
    this.garyCooldown = 0;
  }

  saleValue(bags) {
    const raw = bags.reduce((s, b) => s + b.value, 0);
    return Math.round(raw * this.game.stats.valueMult * this.game.area.valueMultiplier);
  }

  isNear(player) { return player.feet(_p).distanceTo(this.def.position) < this.def.interactRadius; }

  sellCarried(player) {
    const game = this.game;
    const bags = player.inventory.takeAll();
    if (!bags.length) { game.toast('Nothing to sell. Go pick up some trash!', 'warn', 'nosell'); return 0; }
    const total = this.saleValue(bags);
    game.state.addMoney(total, 'sell');
    game.state.stats.bagsSold += bags.length;
    game.toast(`Sold ${bags.length} bag${bags.length > 1 ? 's' : ''} for $${total}`, 'money');
    // Toss the bags in for show.
    bags.forEach((bag, i) => {
      const from = player.chest().add(new THREE.Vector3(0, 0.3 + i * 0.2, 0));
      const to = this.def.position;
      const t = 0.7;
      const vel = { x: (to.x - from.x) / t, y: (1.2 - from.y) / t + 0.5 * 20 * t, z: (to.z - from.z) / t };
      game.looseBags.spawn(bag, from, vel, { decorative: true, life: 2.5 });
    });
    game.save();
    return total;
  }

  update(dt) {
    const game = this.game;
    const box = this.def.trigger;
    this.garyCooldown -= dt;

    for (const item of [...game.spawner.items]) {
      if (!box.containsPoint(_p.copy(item.body.position))) continue;
      this.releaseIfHeld(item.body);
      const total = this.saleValue([{ value: item.value }]);
      game.spawner.destroy(item);
      game.state.addMoney(total, 'dunk');
      game.toast(`Nothing but net! ${item.def.name} +$${total}`, 'money');
    }

    for (const entry of [...game.looseBags.bags]) {
      if (entry.decorative || !box.containsPoint(_p.copy(entry.body.position))) continue;
      this.releaseIfHeld(entry.body);
      const total = this.saleValue([entry.bag]);
      game.looseBags.remove(entry);
      game.state.addMoney(total, 'dunk');
      game.state.stats.bagsSold++;
      game.toast(`Bag dunked! +$${total}`, 'money');
      game.save();
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
