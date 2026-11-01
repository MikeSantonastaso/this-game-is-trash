// The single source of truth for progression: money, owned tools, upgrade
// levels, unlocked areas. No rendering or physics here, so it is easy to unit
// test, sync over the network for co-op, and port to another engine.
import { TOOLS } from '../data/tools.js';
import { UPGRADES } from '../data/upgrades.js';
import { getZone } from '../data/zones.js';
import { getProperty } from '../data/properties.js';
import { canUnlock, unlockFee } from './requirements.js';

const fresh = () => ({
  money: 0,
  lifetimeEarned: 0,
  ownedTools: ['picker_basic'],
  equippedTool: 'picker_basic',
  upgrades: { bagSize: 0, bagSlots: 0, moveSpeed: 0, haggle: 0 },
  unlockedAreas: ['park'], // zone ids (key kept from the first prototype's saves)
  ownedProperties: [],
  stats: { itemsPicked: 0, bagsSold: 0, garyDunks: 0, binsEmptied: 0, garyBonks: 0 },
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

  // ---- Zones ----
  isUnlocked(id) { return this.unlockedAreas.includes(id); }

  // Checks every requirement, pays the fee, opens the zone.
  unlockZone(id) {
    const zone = getZone(id);
    if (!zone) return { ok: false, reason: 'unknown' };
    const check = canUnlock(this, zone);
    if (!check.ok) return check;
    if (!this.spend(unlockFee(zone))) return { ok: false, reason: 'money', missing: [] };
    this.unlockedAreas.push(id);
    this.events?.emit('zone:unlocked', { zone });
    this.changed();
    return { ok: true };
  }

  // ---- Property & vehicles ----
  ownsProperty(id) { return this.ownedProperties.includes(id); }

  buyProperty(id) {
    const prop = getProperty(id);
    if (!prop || this.ownsProperty(id)) return { ok: false, reason: 'owned' };
    if (!prop.available) return { ok: false, reason: 'soon' };
    if (!this.spend(prop.cost)) return { ok: false, reason: 'money' };
    this.ownedProperties.push(id);
    this.events?.emit('property:bought', { property: prop });
    this.changed();
    return { ok: true };
  }
}
