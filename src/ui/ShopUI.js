// "Trash Mart": tools, upgrades, areas and property. Reads/writes GameState only.
import { TOOLS, TOOL_ORDER } from '../data/tools.js';
import { UPGRADES, UPGRADE_ORDER } from '../data/upgrades.js';
import { AREAS } from '../data/areas.js';
import { PROPERTIES } from '../data/properties.js';

const money = (n) => `$${n.toLocaleString()}`;

export class ShopUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('shop');
    this.body = document.getElementById('shop-body');
    this.tab = 'tools';
    this.isOpen = false;
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyF' || e.code === 'Tab') { e.preventDefault(); this.close(); }
    });
    game.events.on('state:changed', () => { if (this.isOpen) this.render(); });
  }

  open() {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.game.input.exitLock();
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.game.save();
  }

  onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const s = this.game.state;
    let res = { ok: true };
    if (action === 'close') return this.close();
    if (action === 'tab') { this.tab = id; return this.render(); }
    if (action === 'buyTool') res = s.buyTool(id);
    if (action === 'equipTool') s.equipTool(id);
    if (action === 'buyUpgrade') res = s.buyUpgrade(id);
    if (action === 'buyArea') res = s.buyArea(id);
    if (action === 'reset') {
      if (confirm('Wipe your save and start over?')) this.game.resetSave();
    }
    if (!res.ok) {
      const msg = { money: 'Not enough cash. Go find more trash.', max: 'Maxed out!', soon: 'Coming in a future update!' }[res.reason];
      if (msg) this.game.toast(msg, 'warn', 'shop');
    } else if (action.startsWith('buy')) {
      this.game.toast('Purchased! 🎉', 'money');
      this.game.save();
    }
    this.render();
  }

  render() {
    const s = this.game.state;
    const tabs = [['tools', 'Tools'], ['upgrades', 'Upgrades'], ['areas', 'Areas'], ['property', 'Property']];
    document.getElementById('shop-money').textContent = money(s.money);
    document.getElementById('shop-tabs').innerHTML = tabs
      .map(([id, label]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-action="tab" data-id="${id}">${label}</button>`)
      .join('');
    this.body.innerHTML = this[this.tab]();
  }

  card({ title, desc, meta = '', button }) {
    return `<div class="card"><div class="card-main"><h3>${title}</h3><p>${desc}</p>${meta ? `<p class="meta">${meta}</p>` : ''}</div>${button}</div>`;
  }

  tools() {
    const s = this.game.state;
    return TOOL_ORDER.map((id) => {
      const t = TOOLS[id];
      const owned = s.ownsTool(id);
      const equipped = s.equippedTool === id;
      const button = equipped ? '<button disabled>Equipped</button>'
        : owned ? `<button data-action="equipTool" data-id="${id}">Equip</button>`
        : `<button class="buy" data-action="buyTool" data-id="${id}" ${s.money < t.cost ? 'disabled' : ''}>${money(t.cost)}</button>`;
      const meta = `Reach ${t.reach}m · ${(1 / t.cooldown).toFixed(1)} picks/s${t.pickCount > 1 ? ` · ${t.pickCount} per pick` : ''}${t.autoRadius ? ` · auto-collect ${t.autoRadius}m` : ''}`;
      return this.card({ title: `Tier ${t.tier}: ${t.name}`, desc: t.description, meta, button });
    }).join('');
  }

  upgrades() {
    const s = this.game.state;
    return UPGRADE_ORDER.map((id) => {
      const u = UPGRADES[id];
      const lvl = s.upgradeLevel(id);
      const cost = s.upgradeCost(id);
      const now = u.value(lvl);
      const next = cost === null ? null : u.value(lvl + 1);
      const button = cost === null ? '<button disabled>MAX</button>'
        : `<button class="buy" data-action="buyUpgrade" data-id="${id}" ${s.money < cost ? 'disabled' : ''}>${money(cost)}</button>`;
      const meta = `Level ${lvl}/${u.maxLevel} · ${now} ${u.unit}${next !== null ? ` → ${next}` : ''}`;
      return this.card({ title: u.name, desc: u.description, meta, button });
    }).join('');
  }

  areas() {
    const s = this.game.state;
    return AREAS.map((a) => {
      const unlocked = s.unlockedAreas.includes(a.id);
      const button = unlocked ? `<button disabled>${s.currentArea === a.id ? 'You are here' : 'Unlocked'}</button>`
        : a.comingSoon ? `<button disabled title="Coming soon">${money(a.unlockCost)} · Soon</button>`
        : `<button class="buy" data-action="buyArea" data-id="${a.id}" ${s.money < a.unlockCost ? 'disabled' : ''}>${money(a.unlockCost)}</button>`;
      return this.card({ title: a.name, desc: a.description, meta: `${a.valueMultiplier}x trash value`, button });
    }).join('');
  }

  property() {
    return PROPERTIES.map((p) => this.card({
      title: p.name, desc: p.description,
      button: `<button disabled>${money(p.cost)} · Soon</button>`,
    })).join('') + `<p class="fineprint">Lifetime earnings ${money(this.game.state.lifetimeEarned)} · ${this.game.state.stats.itemsPicked} items picked · Gary dunked ${this.game.state.stats.garyDunks}x
      <button class="link" data-action="reset">Wipe save</button></p>`;
  }
}
