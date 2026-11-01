// The town map: a small north-up minimap in the corner and a full map on M.
// Both draw from one pre-rendered layer (zones, streets, sell points, gates)
// that is redrawn only when a zone unlocks.
import { WORLD, ZONES, ROADS, ROAD_HALF, CUL_DE_SAC_R, culDeSacCenter, GATES } from '../data/zones.js';

const PX = 2; // static layer pixels per meter
const MINI_RANGE = 130; // meters from the player to the minimap edge

export class MapUI {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.root = document.getElementById('map');
    this.big = document.getElementById('map-canvas');
    this.mini = document.getElementById('minimap-canvas');
    this.layer = document.createElement('canvas');
    this.layer.width = (WORLD.maxX - WORLD.minX) * PX;
    this.layer.height = (WORLD.maxZ - WORLD.minZ) * PX;
    this.timer = 0;
    this.drawLayer();
    game.events.on('state:changed', () => { const k = game.state.unlockedAreas.join(); if (k !== this.key) this.drawLayer(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !game.shop.isOpen) this.toggle();
      else if (e.code === 'Escape' && this.isOpen) this.toggle(false);
    });
    this.root.addEventListener('click', (e) => { if (e.target.closest('[data-action="close"]') || e.target === this.root) this.toggle(false); });
    document.getElementById('map-legend').innerHTML = [
      ['#7ee081', 'You'], ['#e07b39', 'Your truck'], ['#2f9d5a', 'Dumpster (sell)'], ['#d64545', 'Trash Mart'],
      ['#f2c14e', 'Open gate'], ['#e25555', 'Locked gate'], ['#3a3f45', 'Locked zone'],
    ].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  }

  toggle(force = !this.isOpen) {
    this.isOpen = force;
    this.root.classList.toggle('hidden', !force);
    if (force) { this.game.input.exitLock(); this.drawBig(); }
  }

  wx(x) { return (x - WORLD.minX) * PX; }
  wz(z) { return (z - WORLD.minZ) * PX; }

  drawLayer() {
    const state = this.game.state;
    this.key = state.unlockedAreas.join();
    const c = this.layer.getContext('2d');
    c.fillStyle = '#4d6e36'; c.fillRect(0, 0, this.layer.width, this.layer.height);
    const rectOf = (r) => [this.wx(r.minX), this.wz(r.minZ), (r.maxX - r.minX) * PX, (r.maxZ - r.minZ) * PX];

    // Streets
    c.fillStyle = '#9aa0a6';
    for (const road of ROADS) {
      const lo = Math.min(road.from, road.to), hi = Math.max(road.from, road.to);
      if (road.axis === 'x') c.fillRect(this.wx(lo), this.wz(road.at - ROAD_HALF), (hi - lo) * PX, ROAD_HALF * 2 * PX);
      else c.fillRect(this.wx(road.at - ROAD_HALF), this.wz(lo), ROAD_HALF * 2 * PX, (hi - lo) * PX);
      if (road.culDeSac) {
        const p = culDeSacCenter(road);
        c.beginPath(); c.arc(this.wx(p.x), this.wz(p.z), CUL_DE_SAC_R * PX, 0, Math.PI * 2); c.fill();
      }
    }
    // Park paths + houses hint
    c.strokeStyle = '#b89a78'; c.lineWidth = 3 * PX;
    c.beginPath(); c.arc(this.wx(0), this.wz(4), 18.5 * PX, 0, Math.PI * 2); c.stroke();

    // Zones: tint open ones, hatch locked ones.
    for (const zone of ZONES) {
      const open = state.isUnlocked(zone.id);
      const [x, y, w, h] = rectOf(zone.rect);
      c.save();
      c.beginPath(); c.rect(x, y, w, h); c.clip();
      if (open) { c.fillStyle = zone.color + '22'; c.fillRect(x, y, w, h); }
      else {
        c.fillStyle = 'rgba(30,34,40,0.62)'; c.fillRect(x, y, w, h);
        c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 6;
        for (let i = -h; i < w; i += 22) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + h, y + h); c.stroke(); }
      }
      c.restore();
      c.strokeStyle = zone.color; c.lineWidth = 4; c.strokeRect(x + 2, y + 2, w - 4, h - 4);
      c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center';
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 6;
      const label = open ? zone.name.toUpperCase() : `🔒 ${zone.name.toUpperCase()}`;
      c.fillText(label, x + w / 2, y + (zone.id === 'park' ? h - 30 : 44));
      if (!open) { c.font = 'bold 20px sans-serif'; c.fillText(zone.comingSoon ? 'COMING SOON' : `${zone.valueMultiplier}× trash value`, x + w / 2, y + (zone.id === 'park' ? h - 6 : 72)); }
      c.shadowBlur = 0;
    }

    // Gates, dumpsters, shops, motor pool
    for (const g of GATES) {
      const open = g.between.every((id) => state.isUnlocked(id));
      c.fillStyle = open ? '#f2c14e' : '#e25555';
      const [w, h] = g.across === 'x' ? [13 * PX, 4 * PX] : [4 * PX, 13 * PX];
      c.fillRect(this.wx(g.x) - w / 2, this.wz(g.z) - h / 2, w, h);
    }
    const icon = (p, color, text) => {
      c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = 3;
      c.beginPath(); c.roundRect(this.wx(p.x) - 13, this.wz(p.z) - 13, 26, 26, 6); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, this.wx(p.x), this.wz(p.z) + 1);
      c.textBaseline = 'alphabetic';
    };
    for (const d of this.game.layout.dropOffs) icon(d.position, '#2f9d5a', '$');
    for (const s of this.game.layout.shops) icon(s.position, '#d64545', 'M');
    icon(this.game.layout.motorPool.position, '#b5562b', 'P');
  }

  marker(c, x, y, yaw, color, size) {
    c.save();
    c.translate(x, y);
    c.rotate(-yaw);
    c.fillStyle = color; c.strokeStyle = '#102030'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -size); c.lineTo(size * 0.75, size * 0.8); c.lineTo(0, size * 0.4); c.lineTo(-size * 0.75, size * 0.8); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }

  drawMini() {
    const g = this.game, me = g.localPlayer;
    const pos = me.cameraTarget();
    const c = this.mini.getContext('2d');
    const W = this.mini.width;
    const span = MINI_RANGE * 2 * PX;
    c.fillStyle = '#1d2a18'; c.fillRect(0, 0, W, W);
    c.drawImage(this.layer, this.wx(pos.x) - span / 2, this.wz(pos.z) - span / 2, span, span, 0, 0, W, W);
    const k = W / (MINI_RANGE * 2);
    const t = g.truck;
    if (t.owned && !me.vehicle) {
      const dx = (t.position.x - pos.x) * k, dz = (t.position.z - pos.z) * k;
      const r = Math.min(Math.hypot(dx, dz), W / 2 - 8), a = Math.atan2(dz, dx);
      c.fillStyle = '#e07b39'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    this.marker(c, W / 2, W / 2, me.vehicle ? me.vehicle.yaw : g.cameraRig.yaw, me.vehicle ? '#e07b39' : '#7ee081', 8);
  }

  drawBig() {
    const g = this.game, me = g.localPlayer;
    const c = this.big.getContext('2d');
    c.drawImage(this.layer, 0, 0, this.big.width, this.big.height);
    const k = this.big.width / this.layer.width;
    const t = g.truck;
    if (t.owned) this.marker(c, this.wx(t.position.x) * k, this.wz(t.position.z) * k, t.yaw, '#e07b39', 10);
    const p = me.cameraTarget();
    this.marker(c, this.wx(p.x) * k, this.wz(p.z) * k, me.vehicle ? me.vehicle.yaw : g.cameraRig.yaw, '#7ee081', 12);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / 15;
    this.drawMini();
    if (this.isOpen) this.drawBig();
  }
}
