// "Trash Mart": tools and upgrades. The crew shares one wallet, so a purchase
// is an action sent to the host; the host's GameState is the one that changes
// and everyone sees the new state.
import { TOOLS, TOOL_ORDER } from '../data/tools.js';
import { UPGRADES, UPGRADE_ORDER } from '../data/upgrades.js';

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
    this.game.input.requestLock();
  }

  onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'close') return this.close();
    if (action === 'tab') { this.tab = id; return this.render(); }
    if (action === 'buyTool') this.game.act({ k: 'buy', what: 'tool', id });
    if (action === 'equipTool') this.game.act({ k: 'buy', what: 'equip', id });
    if (action === 'buyUpgrade') this.game.act({ k: 'buy', what: 'upgrade', id });
    if (action === 'reset' && confirm('Wipe the crew save and start over?')) this.game.resetSave();
  }

  render() {
    const s = this.game.state;
    const tabs = [['tools', 'Pickers'], ['upgrades', 'Upgrades'], ['crew', 'Crew stats']];
    document.getElementById('shop-money').textContent = `Crew wallet ${money(s.money)}`;
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
    }).join('') + '<p class="fineprint">Tools and upgrades are shared by the whole crew.</p>';
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

  crew() {
    const s = this.game.state;
    const st = s.stats;
    const rows = [
      ['Lifetime earnings', money(s.lifetimeEarned)], ['Items picked', st.itemsPicked], ['Bags sold', st.bagsSold],
      ['Curb bins emptied', st.binsEmptied], ['Gary dunked', st.garyDunks], ['Friends dunked', st.friendsDunked ?? 0],
      ['People yeeted', st.garyBonks], ['Punches thrown', st.punches ?? 0], ['Beers', st.beers ?? 0],
      ['Scratch-Its bought', st.scratchers ?? 0], ['Scratch-It winnings', money(st.scratchWon ?? 0)],
    ];
    return `<table class="stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <p class="fineprint">The host's browser keeps the crew save. ${this.game.isHost ? '<button class="link" data-action="reset">Wipe save</button>' : ''}</p>`;
  }
}
