// Runtime side of zones: which are open, fences and gate barriers (colliders
// on/off, boom arms lifting), the live requirement billboards, keeping
// players and vehicles out of locked zones, and "now entering" banners.
import { ZONES, WORLD, getZone, zoneAt, inRect } from '../data/zones.js';
import { checkRequirements, canUnlock, unlockFee } from '../core/requirements.js';

const money = (n) => `$${Math.round(n).toLocaleString()}`;

export class Zones {
  constructor(game, borders) {
    this.game = game;
    this.fences = borders.fences;
    this.gates = borders.gates;
    this.signKeys = new Map();
    this.current = new Map(); // player -> zone id
    this.refresh(true);
    game.events.on('state:changed', () => this.refresh());
  }

  isOpen(id) { return this.game.state.isUnlocked(id); }

  // Fences/gates follow unlock state. Signs redraw only when their text changes.
  refresh(instant = false) {
    const physics = this.game.physics;
    for (const f of this.fences) {
      const closed = !f.between.every((id) => this.isOpen(id));
      f.group.visible = closed;
      if (closed !== f.added) { for (const b of f.bodies) closed ? physics.world.addBody(b) : physics.world.removeBody(b); f.added = closed; }
    }
    for (const g of this.gates) {
      const open = g.between.every((id) => this.isOpen(id));
      if (open !== g.open && !instant && open) this.game.toast(`Gate open: ${getZone(g.leadsTo).name}`, 'money', `gate-${g.id}`);
      g.open = open;
      if (instant) g.liftAngle = open ? 1.45 : 0;
      const wantBody = !open;
      if (wantBody !== g.added) { wantBody ? physics.world.addBody(g.body) : physics.world.removeBody(g.body); g.added = wantBody; }
      this.drawSign(g);
    }
  }

  // The zone a gate's sign is about: the locked side, preferring leadsTo.
  gateZone(g) {
    if (!this.isOpen(g.leadsTo)) return getZone(g.leadsTo);
    const other = g.between.find((id) => id !== g.leadsTo);
    return this.isOpen(other) ? getZone(g.leadsTo) : getZone(other);
  }

  drawSign(g) {
    const state = this.game.state;
    const zone = this.gateZone(g);
    const reqs = checkRequirements(state, zone);
    const check = canUnlock(state, zone);
    const key = JSON.stringify([zone.id, g.open, check.ok, reqs.map((r) => [r.met, r.progress])]);
    if (this.signKeys.get(g) === key) return;
    this.signKeys.set(g, key);

    const c = g.canvas, x = c.getContext('2d');
    const W = c.width, H = c.height;
    x.fillStyle = '#16202b'; x.fillRect(0, 0, W, H);
    x.fillStyle = zone.color; x.fillRect(0, 0, W, 150);
    x.fillStyle = '#fff'; x.textBaseline = 'middle';
    x.font = 'bold 34px sans-serif'; x.fillText(`ZONE ${zone.order} · ${zone.tagline.toUpperCase()}`, 40, 42);
    x.font = 'bold 76px sans-serif'; x.fillText(zone.name.toUpperCase(), 40, 108);
    if (g.open) {
      x.fillStyle = '#7ee08a'; x.font = 'bold 88px sans-serif';
      x.fillText('OPEN', 40, 280);
      x.fillStyle = '#d7e0ea'; x.font = '40px sans-serif';
      x.fillText(`Trash here pays ${zone.valueMultiplier}×`, 40, 380);
    } else if (zone.comingSoon) {
      x.fillStyle = '#ffd166'; x.font = 'bold 64px sans-serif'; x.fillText('COMING SOON', 40, 220);
      x.font = 'bold 34px sans-serif'; x.fillStyle = '#d7e0ea'; x.fillText('Requirements:', 40, 300);
      reqs.forEach((r, i) => this.reqLine(x, r, 40, 360 + i * 70));
    } else {
      x.font = 'bold 36px sans-serif'; x.fillStyle = '#d7e0ea'; x.fillText('TO UNLOCK:', 40, 195);
      reqs.forEach((r, i) => this.reqLine(x, r, 40, 260 + i * 78));
      x.fillStyle = check.ok ? '#7ee08a' : '#9fb0c2';
      x.font = 'bold 40px sans-serif';
      x.fillText(check.ok ? `READY! Press F at the gate · pay ${money(unlockFee(zone))}` : `Trash pays ${zone.valueMultiplier}× in here`, 40, H - 50);
    }
    g.texture.needsUpdate = true;
  }

  reqLine(x, r, left, y) {
    x.fillStyle = r.met ? '#3cc65a' : '#e25555';
    x.beginPath(); x.arc(left + 26, y, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center';
    x.fillText(r.met ? '✓' : '✗', left + 26, y + 2);
    x.textAlign = 'left';
    x.font = 'bold 44px sans-serif'; x.fillText(r.label, left + 70, y);
    if (r.progress) { x.fillStyle = '#9fb0c2'; x.font = '34px sans-serif'; x.textAlign = 'right'; x.fillText(r.progress, 990, y); x.textAlign = 'left'; }
  }

  // Gate the player is standing at (locked ones only), or null.
  nearGate(pos, radius = 9) {
    let best = null, bestD = radius;
    for (const g of this.gates) {
      if (g.open) continue;
      const d = Math.hypot(pos.x - g.x, pos.z - g.z);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  tryUnlockAt(g) {
    const zone = this.gateZone(g);
    const res = this.game.state.unlockZone(zone.id);
    if (res.ok) {
      this.game.toast(`${zone.name} unlocked! Trash there pays ${zone.valueMultiplier}×`, 'money');
      this.game.save();
    } else if (res.reason === 'soon') this.game.toast(`${zone.name} is coming in a future update`, 'warn', 'gate');
    else if (res.reason === 'missing') this.game.toast(`Still need: ${res.missing.map((r) => r.label).join(', ')}`, 'warn', 'gate');
    return res;
  }

  gatePrompt(g) {
    const zone = this.gateZone(g);
    const check = canUnlock(this.game.state, zone);
    if (zone.comingSoon) return `<b>${zone.name}</b> · coming soon`;
    if (check.ok) return `<kbd>F</kbd> unlock <b>${zone.name}</b> · pay ${money(unlockFee(zone))}`;
    return `<b>${zone.name}</b> locked · need ${check.missing.map((r) => r.label + (r.type === 'stat' ? ` (${r.progress})` : '')).join(' · ')}`;
  }

  // Push a point out of locked zones and the world edge. Returns a corrected
  // {x, z} and the blocking zone (or 'edge'), or null if the point is fine.
  constrain(x, z, radius = 0.5) {
    let blocked = null;
    const W = WORLD;
    if (x < W.minX + radius) { x = W.minX + radius; blocked = 'edge'; }
    if (x > W.maxX - radius) { x = W.maxX - radius; blocked = 'edge'; }
    if (z < W.minZ + radius) { z = W.minZ + radius; blocked = 'edge'; }
    if (z > W.maxZ - radius) { z = W.maxZ - radius; blocked = 'edge'; }
    for (const zone of ZONES) {
      if (this.isOpen(zone.id) || !inRect(zone.rect, x, z, radius)) continue;
      const r = zone.rect;
      // Nearest way out that doesn't land in another locked zone.
      const exits = [
        { x: r.minX - radius - 0.01, z, d: x - r.minX + radius },
        { x: r.maxX + radius + 0.01, z, d: r.maxX + radius - x },
        { x, z: r.minZ - radius - 0.01, d: z - r.minZ + radius },
        { x, z: r.maxZ + radius + 0.01, d: r.maxZ + radius - z },
      ].filter((e) => inRect(W, e.x, e.z) && this.isOpen(zoneAt(e.x, e.z).id)).sort((a, b) => a.d - b.d);
      if (exits[0]) { x = exits[0].x; z = exits[0].z; }
      else { const s = this.game.layout.spawn; x = s.x; z = s.z; }
      blocked = zone;
    }
    return blocked ? { x, z, blocked } : null;
  }

  // Applies constrain() to a cannon body, killing velocity into the wall.
  constrainBody(body, radius, who = null) {
    const p = body.position;
    const res = this.constrain(p.x, p.z, radius);
    if (!res) return false;
    if (res.x !== p.x) body.velocity.x = 0;
    if (res.z !== p.z) body.velocity.z = 0;
    p.x = res.x; p.z = res.z;
    if (who) {
      if (res.blocked === 'edge') this.game.toast('That\'s the edge of town. Nothing out there but trees.', 'info', 'edge');
      else this.game.toast(`${res.blocked.name} is locked. Check the sign at its gate.`, 'warn', 'locked');
    }
    return true;
  }

  update(dt) {
    for (const g of this.gates) {
      const want = g.open ? 1.45 : 0;
      g.liftAngle += (want - g.liftAngle) * Math.min(1, dt * 2.5);
      g.lift.rotation.z = g.liftAngle;
    }
    // Banner when a player walks (or drives) into a different zone.
    for (const p of this.game.players) {
      const pos = p.cameraTarget();
      const zone = zoneAt(pos.x, pos.z);
      if (this.current.get(p) !== zone.id) {
        const first = !this.current.has(p);
        this.current.set(p, zone.id);
        if (p === this.game.localPlayer) this.game.events.emit('zone:entered', { zone, first });
      }
    }
  }

  zoneOf(player) { return getZone(this.current.get(player) ?? 'park'); }
}
