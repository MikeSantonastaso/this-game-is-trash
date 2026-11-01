// DOM overlay: money, bag meter, belt bags, tool name, context prompt, toasts.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      money: $('hud-money'), bagRing: $('hud-bag-ring'), bagPanel: $('hud-bag'), bagCount: $('hud-bag-count'),
      belt: $('hud-belt'), tool: $('hud-tool'), prompt: $('hud-prompt'),
      toasts: $('toasts'), crosshair: $('crosshair'), help: $('help'),
      zone: $('hud-zone'), zoneName: $('hud-zone-name'), zoneMult: $('hud-zone-mult'),
      banner: $('zone-banner'), truck: $('hud-truck'),
    };
    this.cache = {};
    this.toastKeys = new Map();
    this.shownMoney = game.state.money;
    game.events.on('money:earned', ({ amount }) => this.popMoney(amount));
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH') this.el.help.classList.toggle('hidden'); });
    game.events.on('zone:entered', ({ zone, first }) => { if (!first) this.banner(zone); });
    game.events.on('zone:unlocked', ({ zone }) => this.banner(zone, 'UNLOCKED'));
  }

  banner(zone, kicker = 'NOW ENTERING') {
    const el = this.el.banner;
    el.innerHTML = `<small>${kicker}</small><b>${zone.name}</b><span>${zone.tagline} · trash pays ${zone.valueMultiplier}×</span>`;
    el.style.setProperty('--zone', zone.color);
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  update(dt) {
    const { state, localPlayer: p, stats } = this.game;
    // Count money up smoothly.
    this.shownMoney += (state.money - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(state.money - this.shownMoney) < 0.5) this.shownMoney = state.money;
    this.set('money', this.el.money, Math.round(this.shownMoney).toLocaleString());

    const inv = p.inventory;
    const pct = Math.min(100, (inv.current.used / inv.capacity) * 100);
    this.set('bagRing', this.el.bagRing.style, `${pct} 100`, 'strokeDasharray');
    this.set('bagRingOn', this.el.bagRing.style, pct > 0 ? '1' : '0', 'opacity');
    this.set('bagFull', this.el.bagPanel, inv.current.used >= inv.capacity ? 'panel full' : 'panel', 'className');
    this.set('bagCount', this.el.bagCount, `${inv.current.used}/${inv.capacity}`);
    const belt = Array.from({ length: inv.slots }, (_, i) => `<span class="slot ${i < inv.tied.length ? 'on' : ''}"></span>`).join('');
    this.set('belt', this.el.belt, belt, 'innerHTML');
    this.set('tool', this.el.tool, stats.tool.name);
    const zone = this.game.zones.zoneOf(p);
    this.set('zoneName', this.el.zoneName, zone.name);
    this.set('zoneMult', this.el.zoneMult, `${zone.valueMultiplier}×`);
    this.set('zoneColor', this.el.zone.style, zone.color, 'borderColor');
    const truck = this.game.truck;
    const showTruck = truck.owned && (p.vehicle || truck.bed.length > 0);
    this.set('truckOn', this.el.truck, showTruck ? 'panel' : 'panel hidden', 'className');
    if (showTruck) this.set('truck', this.el.truck, `<small>TRUCK BED</small><b>${truck.bed.length}/12</b>`, 'innerHTML');

    this.set('prompt', this.el.prompt, this.promptText(), 'innerHTML');
    this.set('cross', this.el.crosshair, p.picker.target ? 'active' : '', 'className');
  }

  promptText() {
    const g = this.game, p = g.localPlayer, inv = p.inventory;
    const $$ = (n) => `$${Math.round(n).toLocaleString()}`;
    if (p.vehicle) {
      const t = p.vehicle;
      const atDump = g.dropOff.at(t.position, 8);
      if (atDump && (t.bed.length || !inv.isEmpty)) return `<kbd>E</kbd> sell the load for <b>${$$(g.dropOff.saleValue([...t.bed, ...inv.tied, inv.current]))}</b> · <kbd>F</kbd> get out`;
      return '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> brake · <kbd>F</kbd> get out · <kbd>R</kbd> eject';
    }
    if (p.isFlopped) return '<kbd>R</kbd> get up';
    if (p.grabber.isHolding) {
      const ud = p.grabber.held.ud;
      const what = ud.ragdoll ? ud.ragdoll.name : ud.kind === 'bag' ? 'bag' : ud.item?.def.name ?? ud.name ?? 'it';
      return `Holding ${what} · <kbd>LMB</kbd> throw · <kbd>E</kbd> drop`;
    }
    const it = g.interactTarget(p);
    if (it?.kind === 'sell') {
      const d = g.dropOff.at(p.feet());
      const truck = g.dropOff.truckNear(d);
      if (inv.isEmpty && !truck) return 'Dumpster · bring trash here to sell';
      const bags = [...inv.tied, ...(inv.current.used > 0 ? [inv.current] : []), ...(truck ? truck.bed : [])];
      return `<kbd>F</kbd> sell ${bags.length} bag${bags.length > 1 ? 's' : ''}${truck ? ' (incl. truck)' : ''} for <b>${$$(g.dropOff.saleValue(bags))}</b>`;
    }
    if (it?.kind === 'shop') return `<kbd>F</kbd> open ${it.shop.label === 'TRASH MART' ? 'Trash Mart' : 'Trash Mart Outlet'}`;
    if (it?.kind === 'bin') return `<kbd>F</kbd> empty curb bin · ${it.bin.items} items ≈ <b>${$$(g.bins.estimate(it.bin))}</b>`;
    if (it?.kind === 'load') return `<kbd>F</kbd> load your bags into the truck bed (${g.truck.bed.length}/12)`;
    if (it?.kind === 'drive') return `<kbd>F</kbd> drive the Rusty Pickup${g.truck.bed.length ? ` · bed ${g.truck.bed.length}/12` : ''}`;
    if (it?.kind === 'buyTruck') return g.state.money >= 4000 ? '<kbd>F</kbd> buy the Rusty Pickup for <b>$4,000</b>' : 'Rusty Pickup for sale · <b>$4,000</b>';
    if (it?.kind === 'gate') return g.zones.gatePrompt(it.gate);
    if (inv.isFull) return '<b>Bags full!</b> Sell at a dumpster';
    const t = p.picker.target;
    if (t?.kind === 'trash') return `<kbd>LMB</kbd> pick up ${t.ref.def.name} <b>$${+t.ref.value.toFixed(1)}</b>`;
    if (t?.kind === 'bag') return '<kbd>LMB</kbd> hang bag back on belt';
    return '';
  }

  // key: identical warnings within 1.5s are collapsed
  toast(text, kind = 'info', key = null) {
    const now = performance.now();
    if (key && now - (this.toastKeys.get(key) ?? -1e9) < 1500) return;
    if (key) this.toastKeys.set(key, now);
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    this.el.toasts.prepend(div);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastChild.remove();
    setTimeout(() => div.classList.add('out'), 2600);
    setTimeout(() => div.remove(), 3100);
  }

  popMoney(amount) {
    const div = document.createElement('div');
    div.className = 'money-pop';
    div.textContent = `+$${amount}`;
    this.el.money.parentElement.appendChild(div);
    setTimeout(() => div.remove(), 1200);
  }
}
