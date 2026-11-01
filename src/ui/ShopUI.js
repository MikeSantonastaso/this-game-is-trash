// "Trash Mart": tools, upgrades, zones and property. Reads/writes GameState only.
import { TOOLS, TOOL_ORDER } from '../data/tools.js';
import { UPGRADES, UPGRADE_ORDER } from '../data/upgrades.js';
import { ZONES } from '../data/zones.js';
import { PROPERTIES } from '../data/properties.js';
import { checkRequirements, canUnlock, unlockFee } from '../core/requirements.js';

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
    if (action === 'unlockZone') res = s.unlockZone(id);
    if (action === 'buyProperty') res = s.buyProperty(id);
    if (action === 'reset') {
      if (confirm('Wipe your save and start over?')) this.game.resetSave();
    }
    if (!res.ok) {
      const msg = { money: 'Not enough cash. Go find more trash.', max: 'Maxed out!', soon: 'Coming in a future update!', missing: 'Requirements not met yet' }[res.reason];
      if (msg) this.game.toast(msg, 'warn', 'shop');
    } else if (action.startsWith('buy') || action === 'unlockZone') {
      this.game.toast('Purchased! 🎉', 'money');
      this.game.save();
    }
    this.render();
  }

  render() {
    const s = this.game.state;
    const tabs = [['tools', 'Tools'], ['upgrades', 'Upgrades'], ['areas', 'Zones'], ['property', 'Vehicles & Property']];
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
    return ZONES.map((z) => {
      const unlocked = s.isUnlocked(z.id);
      const check = canUnlock(s, z);
      const fee = unlockFee(z);
      const button = unlocked ? `<button disabled>${this.game.zones.zoneOf(this.game.localPlayer).id === z.id ? 'You are here' : 'Open'}</button>`
        : z.comingSoon ? '<button disabled>Coming soon</button>'
        : `<button class="buy" data-action="unlockZone" data-id="${z.id}" ${check.ok ? '' : 'disabled'}>Unlock · ${money(fee)}</button>`;
      const reqs = unlocked || !z.requirements.length ? ''
        : `<ul class="reqs">${checkRequirements(s, z).map((r) => `<li class="${r.met ? 'met' : 'miss'}">${r.label}${r.progress ? ` <span>${r.progress}</span>` : ''}</li>`).join('')}</ul>`;
      return `<div class="card zone" style="--zone:${z.color}"><div class="card-main"><h3>Zone ${z.order}: ${z.name}</h3><p>${z.tagline}. ${z.description ?? 'Where it all begins.'}</p><p class="meta">Trash pays ${z.valueMultiplier}×</p>${reqs}</div>${button}</div>`;
    }).join('') + '<p class="fineprint">You can also unlock a zone at any of its gates once the sign shows all green.</p>';
  }

  property() {
    const s = this.game.state;
    return PROPERTIES.map((p) => this.card({
      title: p.name, desc: p.description,
      button: s.ownsProperty(p.id) ? '<button disabled>Owned</button>'
        : p.available ? `<button class="buy" data-action="buyProperty" data-id="${p.id}" ${s.money < p.cost ? 'disabled' : ''}>${money(p.cost)}</button>`
        : `<button disabled>${money(p.cost)} · Soon</button>`,
    })).join('') + `<p class="fineprint">Lifetime earnings ${money(this.game.state.lifetimeEarned)} · ${this.game.state.stats.itemsPicked} items picked · Gary dunked ${this.game.state.stats.garyDunks}x
      <button class="link" data-action="reset">Wipe save</button></p>`;
  }
}
