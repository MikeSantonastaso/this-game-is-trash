// The single source of truth for progression: money, owned tools and upgrade
// levels. In co-op the host owns it (shared wallet) and broadcasts it. No rendering or physics here, so it is easy to unit
// test, sync over the network for co-op, and port to another engine.
import { TOOLS } from '../data/tools.js';
import { UPGRADES } from '../data/upgrades.js';

const fresh = () => ({
  money: 0,
  lifetimeEarned: 0,
  ownedTools: ['picker_basic'],
  equippedTool: 'picker_basic',
  upgrades: { bagSize: 0, bagSlots: 0, moveSpeed: 0, haggle: 0 },
  stats: { itemsPicked: 0, bagsSold: 0, garyDunks: 0, binsEmptied: 0, garyBonks: 0, friendsDunked: 0, beers: 0, scratchers: 0, scratchWon: 0, punches: 0 },
});

export class GameState {
  constructor(events) {
    this.events = events;
    Object.assign(this, fresh());
  }

  load(data) {
    if (!data) return;
    const base = fresh();
    for (const key of Object.keys(base)) {
      if (data[key] === undefined) continue;
      this[key] = typeof base[key] === 'object' && !Array.isArray(base[key])
        ? { ...base[key], ...data[key] }
        : data[key];
    }
    if (!TOOLS[this.equippedTool]) this.equippedTool = 'picker_basic';
    this.changed();
  }

  reset() { Object.assign(this, fresh()); this.changed(); }

  toJSON() {
    const { events, ...rest } = this;
    return JSON.parse(JSON.stringify(rest));
  }

  changed() { this.events?.emit('state:changed', this); }

  addMoney(amount, reason = '') {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    this.money += amount;
    this.lifetimeEarned += amount;
    this.events?.emit('money:earned', { amount, reason });
    this.changed();
    return amount;
  }

  spend(amount) {
    if (this.money < amount) return false;
    this.money -= amount;
    this.changed();
    return true;
  }

  // ---- Tools ----
  ownsTool(id) { return this.ownedTools.includes(id); }

  buyTool(id) {
    const tool = TOOLS[id];
    if (!tool || this.ownsTool(id)) return { ok: false, reason: 'owned' };
    if (!this.spend(tool.cost)) return { ok: false, reason: 'money' };
    this.ownedTools.push(id);
    this.equippedTool = id;
    this.changed();
    return { ok: true };
  }

  equipTool(id) {
    if (!this.ownsTool(id)) return false;
    this.equippedTool = id;
    this.changed();
    return true;
  }

  // ---- Upgrades ----
  upgradeLevel(id) { return this.upgrades[id] ?? 0; }

  upgradeCost(id) {
    const up = UPGRADES[id];
    const lvl = this.upgradeLevel(id);
    return lvl >= up.maxLevel ? null : up.cost(lvl);
  }

  buyUpgrade(id) {
    const cost = this.upgradeCost(id);
    if (cost === null) return { ok: false, reason: 'max' };
    if (!this.spend(cost)) return { ok: false, reason: 'money' };
    this.upgrades[id] = this.upgradeLevel(id) + 1;
    this.changed();
    return { ok: true };
  }
}
