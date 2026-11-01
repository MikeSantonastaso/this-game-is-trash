// DOM overlay: money, bag meter, belt bags, tool name, context prompt, toasts.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      money: $('hud-money'), bagFill: $('hud-bag-fill'), bagCount: $('hud-bag-count'),
      belt: $('hud-belt'), tool: $('hud-tool'), prompt: $('hud-prompt'),
      toasts: $('toasts'), crosshair: $('crosshair'), help: $('help'),
    };
    this.cache = {};
    this.toastKeys = new Map();
    this.shownMoney = game.state.money;
    game.events.on('money:earned', ({ amount }) => this.popMoney(amount));
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH') this.el.help.classList.toggle('hidden'); });
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
    this.set('money', this.el.money, `$${Math.round(this.shownMoney).toLocaleString()}`);

    const inv = p.inventory;
    const pct = Math.min(100, (inv.current.used / inv.capacity) * 100);
    this.set('bagFill', this.el.bagFill.style, `${pct}%`, 'width');
    this.set('bagFull', this.el.bagFill, inv.current.used >= inv.capacity ? 'fill full' : 'fill', 'className');
    this.set('bagCount', this.el.bagCount, `${inv.current.used}/${inv.capacity}`);
    const belt = Array.from({ length: inv.slots }, (_, i) => `<span class="slot ${i < inv.tied.length ? 'on' : ''}"></span>`).join('');
    this.set('belt', this.el.belt, belt, 'innerHTML');
    this.set('tool', this.el.tool, stats.tool.name);

    this.set('prompt', this.el.prompt, this.promptText(), 'innerHTML');
    this.set('cross', this.el.crosshair, p.picker.target ? 'active' : '', 'className');
  }

  promptText() {
    const g = this.game, p = g.localPlayer, inv = p.inventory;
    if (p.isFlopped) return '<kbd>R</kbd> get up';
    if (p.grabber.isHolding) {
      const ud = p.grabber.held.ud;
      const what = ud.ragdoll ? ud.ragdoll.name : ud.kind === 'bag' ? 'bag' : ud.item?.def.name ?? 'it';
      return `Holding ${what} · <kbd>LMB</kbd> throw · <kbd>E</kbd> drop`;
    }
    if (g.dropOff.isNear(p)) {
      if (inv.isEmpty) return 'Dumpster · bring trash here to sell';
      const bags = inv.tied.length + (inv.current.used > 0 ? 1 : 0);
      return `<kbd>F</kbd> sell ${bags} bag${bags > 1 ? 's' : ''} for <b>$${g.dropOff.saleValue([...inv.tied, inv.current])}</b>`;
    }
    if (p.feet().distanceTo(g.layout.shop.position) < g.layout.shop.interactRadius) return '<kbd>F</kbd> open Trash Mart';
    if (inv.isFull) return '<b>Bags full!</b> Sell at the dumpster';
    const t = p.picker.target;
    if (t?.kind === 'trash') return `<kbd>LMB</kbd> pick up ${t.ref.def.name} <b>$${t.ref.value}</b>`;
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
