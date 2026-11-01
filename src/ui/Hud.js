// DOM overlay: crew money, bag meter, belt, tool, room code + crew list,
// context prompt, toasts, big money pops, hit flash, scratch-off cards,
// connection status.
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Math.round(n).toLocaleString()}`;

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      money: $('hud-money'), bagRing: $('hud-bag-ring'), bagPanel: $('hud-bag'), bagCount: $('hud-bag-count'),
      belt: $('hud-belt'), tool: $('hud-tool'), prompt: $('hud-prompt'),
      toasts: $('toasts'), crosshair: $('crosshair'), help: $('help'),
      truck: $('hud-truck'), room: $('hud-room'), players: $('hud-players'), status: $('status'),
      flash: $('flash'), center: $('center-pop'), scratch: $('scratch'), drunk: $('drunk'),
    };
    this.cache = {};
    this.toastKeys = new Map();
    this.shownMoney = 0;
    game.events.on('money:earned', ({ amount }) => this.popMoney(amount));
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat) this.el.help.classList.toggle('hidden'); });
    this.el.room.addEventListener('click', (e) => {
      if (!e.target.closest('[data-copy]')) return;
      const url = `${location.origin}${location.pathname}?room=${this.game.room}${new URLSearchParams(location.search).get('net') === 'local' ? '&net=local' : ''}`;
      navigator.clipboard?.writeText(url).then(() => this.toast('Invite link copied. Send it to your friends!', 'info'), () => this.toast(url, 'info'));
    });
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  setRoom(mode, room) {
    if (mode === 'solo') { this.el.room.innerHTML = '<small>SOLO</small><b>Just you</b>'; return; }
    this.el.room.innerHTML = `<small>ROOM CODE</small><b>${room}</b><button data-copy>Copy invite link</button>`;
  }

  setPlayers(list) {
    this.el.players.innerHTML = list.map((p) => `<div><i style="background:${p.color}"></i>${escapeHtml(p.name)}${p.host ? ' <small>host</small>' : ''}${p.id === this.game.selfId ? ' <small>you</small>' : ''}</div>`).join('');
  }

  status(text, sticky = false) {
    const el = this.el.status;
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = `<div>${text}</div>${sticky ? '<button onclick="location.reload()">Back to the lobby</button>' : ''}`;
    el.classList.remove('hidden');
  }

  update(dt) {
    const { state, localPlayer: p, stats } = this.game;
    this.shownMoney += (state.money - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(state.money - this.shownMoney) < 0.5) this.shownMoney = state.money;
    this.set('money', this.el.money, Math.round(this.shownMoney).toLocaleString());

    const inv = p.inv;
    const pct = Math.min(100, (inv.used / Math.max(1, inv.cap)) * 100);
    this.set('bagRing', this.el.bagRing.style, `${pct} 100`, 'strokeDasharray');
    this.set('bagRingOn', this.el.bagRing.style, pct > 0 ? '1' : '0', 'opacity');
    this.set('bagFull', this.el.bagPanel, inv.used >= inv.cap ? 'panel full' : 'panel', 'className');
    this.set('bagCount', this.el.bagCount, `${inv.used}/${inv.cap}`);
    const belt = Array.from({ length: inv.slots }, (_, i) => `<span class="slot ${i < inv.tied.length ? 'on' : ''}"></span>`).join('');
    this.set('belt', this.el.belt, belt, 'innerHTML');
    this.set('tool', this.el.tool, stats.tool.name);
    const truck = this.game.truck;
    const showTruck = truck && (p.state === 'drive' || truck.bedCount > 0);
    this.set('truckOn', this.el.truck, showTruck ? 'panel' : 'panel hidden', 'className');
    if (showTruck) this.set('truck', this.el.truck, `<small>TRUCK BED</small><b>${truck.bedCount}/12</b>`, 'innerHTML');
    this.set('prompt', this.el.prompt, this.promptText(), 'innerHTML');
    this.set('cross', this.el.crosshair, p.target ? 'active' : (p.holding ? 'holding' : ''), 'className');
    const drunk = Math.min(1, p.drunk / 6);
    this.set('drunk', this.el.drunk.style, String(drunk * 0.8), 'opacity');
  }

  promptText() {
    const g = this.game, p = g.localPlayer, inv = p.inv;
    if (!g.connected) return '';
    if (p.state === 'drive') {
      const atDump = g.layout.dumpsters.some((d) => d.position.distanceTo(g.truck.position) < 13);
      if (atDump && (g.truck.bedCount || p.hasBags)) return '<kbd>E</kbd> sell the whole load · <kbd>F</kbd> get out';
      return '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> brake · <kbd>Q</kbd> horn · <kbd>F</kbd> get out · <kbd>R</kbd> eject';
    }
    if (p.state === 'ragdoll') return '<kbd>R</kbd> get up (mash it if someone is carrying you)';
    if (p.holding) return '<kbd>LMB</kbd> throw (<kbd>Shift</kbd> harder) · <kbd>E</kbd> drop';
    const it = g.interactTarget();
    const bags = inv.tied.length + (inv.used > 0 ? 1 : 0);
    if (it?.kind === 'sell') {
      if (!bags && !g.truck.bedCount) return 'Dumpster · bring trash here to sell (or throw it in)';
      const value = (inv.tied.reduce((s, v) => s + v, 0) + inv.value) * g.stats.valueMult;
      return `<kbd>F</kbd> sell ${bags} bag${bags === 1 ? '' : 's'}${g.truck.bedCount ? ' + the truck bed' : ''} · about <b>${money(value)}</b>`;
    }
    if (it?.kind === 'shop') return '<kbd>F</kbd> open Trash Mart';
    if (it?.kind === 'scratch') return '<kbd>F</kbd> buy a Scratch-It · <b>$25</b> · could win $2,000';
    if (it?.kind === 'drink') return '<kbd>F</kbd> crack open a Trash Panda Lager 🍺';
    if (it?.kind === 'bin') return '<kbd>F</kbd> dump this curb bin into your bag · or knock it over 😈';
    if (it?.kind === 'load') return `<kbd>F</kbd> load your bags into the truck bed (${g.truck.bedCount}/12)`;
    if (it?.kind === 'drive') return '<kbd>F</kbd> drive the Rusty Pickup';
    if (p.invFull) return '<b>Bags full!</b> Sell at the dumpster in the Dump-n-Go yard';
    const t = p.target;
    if (t?.kind === 'trash') return `<kbd>LMB</kbd> pick up ${t.body.userData.def.name}`;
    if (t?.kind === 'bag') return '<kbd>LMB</kbd> hang bag back on your belt';
    return '';
  }

  toast(text, kind = 'info', key = null) {
    const now = performance.now();
    if (key && now - (this.toastKeys.get(key) ?? -1e9) < 1500) return;
    if (key) this.toastKeys.set(key, now);
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    this.el.toasts.prepend(div);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastChild.remove();
    setTimeout(() => div.classList.add('out'), 3200);
    setTimeout(() => div.remove(), 3700);
  }

  popMoney(amount) {
    const div = document.createElement('div');
    div.className = 'money-pop';
    div.textContent = `+$${amount.toLocaleString()}`;
    this.el.money.parentElement.appendChild(div);
    this.el.money.parentElement.classList.remove('bump');
    void this.el.money.offsetWidth;
    this.el.money.parentElement.classList.add('bump');
    setTimeout(() => div.remove(), 1200);
  }

  // Little "+$2" that pops up under the crosshair.
  floatText(text, kind = 'pick') {
    const div = document.createElement('div');
    div.className = `float ${kind}`;
    div.textContent = text;
    div.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
    document.getElementById('hud').appendChild(div);
    setTimeout(() => div.remove(), 900);
  }

  bigMoney(amount) {
    const el = this.el.center;
    el.innerHTML = `<small>CHA-CHING</small><b>+$${amount.toLocaleString()}</b>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  pulseBag() {
    this.game.viewmodel.pulseBag();
    const el = this.el.bagPanel;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  pulseBelt() {
    const el = this.el.belt;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  flash(kind = 'hit') {
    const el = this.el.flash;
    el.className = '';
    void el.offsetWidth;
    el.className = kind;
  }

  scratchCard(prize) {
    const el = this.el.scratch;
    const symbols = ['🗑️', '🦝', '🥫', '💰', '🍕', '🚚'];
    const cells = Array.from({ length: 6 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    if (prize > 0) { const s = prize >= 300 ? '💰' : prize >= 50 ? '🦝' : '🥫'; [0, 2, 4].forEach((i) => { cells[i] = s; }); }
    el.innerHTML = `<small>SCRATCH-ITS</small><div class="cells">${cells.map((c, i) => `<span style="animation-delay:${i * 0.08}s">${c}</span>`).join('')}</div><b class="${prize ? 'win' : 'lose'}">${prize ? `WINNER! $${prize.toLocaleString()}` : 'Not a winner. Try again?'}</b>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
