// Juice: items flying into bags, coin bursts, dust puffs, bags arcing into the
// dumpster, floating "+$12" text, plus the handler for the host's fx events
// (who sold what, punches, thuds, spills, drinks, scratch-offs...).
import * as THREE from 'three';

const GRAVITY = -14;
const _v = new THREE.Vector3();

function dustTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fx {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.items = []; // { update(dt) -> false when done }
    this.dustMat = new THREE.SpriteMaterial({ map: dustTexture(), color: 0xb8a588, transparent: true, depthWrite: false });
    this.textLayer = document.getElementById('world-text');
    this.bagGeo = new THREE.SphereGeometry(0.3, 10, 8);
    this.bagMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35 });
  }

  get me() { return this.game.selfId; }
  nameOf(id) { return this.game.roster.get(id)?.name ?? 'Someone'; }

  // Where a player is, for positional sound and effects.
  playerPos(id, out = new THREE.Vector3()) {
    const g = this.game;
    if (id === this.me) return g.localPlayer.cameraTarget(out);
    const a = g.avatars.get(id);
    if (a?.visible) return out.copy(a.root.position).setY(a.root.position.y + 1.2);
    if (g.truck?.driver === id) return out.copy(g.truck.position);
    return a ? out.copy(a.root.position) : null;
  }

  handPos(id) {
    if (id === this.me) return () => this.game.viewmodel.bagWorldPosition();
    const a = this.game.avatars.get(id);
    if (!a) return null;
    return () => a.bag.getWorldPosition(new THREE.Vector3());
  }

  // ---------------------------------------------------------------- primitives

  // Fly an entity's mesh into a hand/bag. target: Vector3 or () => Vector3.
  collect(e, target) {
    const src = e.mesh;
    src.visible = false;
    if (!target) return;
    const m = src.clone(true);
    m.visible = true;
    m.position.copy(src.position);
    m.quaternion.copy(src.quaternion);
    this.scene.add(m);
    const from = src.position.clone();
    const get = typeof target === 'function' ? target : () => target;
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt / 0.22;
        const k = Math.min(t, 1);
        const to = get();
        m.position.lerpVectors(from, to, k * k);
        m.position.y += Math.sin(k * Math.PI) * 0.35;
        m.scale.setScalar(Math.max(0.05, 1 - k * 0.85));
        m.rotation.y += dt * 12;
        if (k >= 1) { this.scene.remove(m); return false; }
        return true;
      },
    });
  }

  coins(pos, n = 10, power = 1) {
    if (!this.game.assets.has('coin')) return;
    for (let i = 0; i < n; i++) {
      const c = this.game.assets.instance('coin');
      c.position.copy(pos);
      c.scale.multiplyScalar(0.8 + Math.random() * 0.4);
      this.scene.add(c);
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2.5) * power, (5 + Math.random() * 4) * power, Math.sin(a) * (1 + Math.random() * 2.5) * power);
      const spin = 8 + Math.random() * 10;
      let life = 1.1 + Math.random() * 0.5;
      this.items.push({
        update: (dt) => {
          life -= dt;
          vel.y += GRAVITY * dt;
          c.position.addScaledVector(vel, dt);
          if (c.position.y < 0.05) { c.position.y = 0.05; vel.y *= -0.4; vel.x *= 0.6; vel.z *= 0.6; }
          c.rotation.y += spin * dt;
          if (life < 0.25) c.scale.multiplyScalar(0.85);
          if (life <= 0) { this.scene.remove(c); return false; }
          return true;
        },
      });
    }
  }

  dust(pos, size = 1, n = 5) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.dustMat.clone());
      s.position.copy(pos).add(_v.set((Math.random() - 0.5) * 0.6 * size, 0.1, (Math.random() - 0.5) * 0.6 * size));
      s.scale.setScalar(0.4 * size);
      this.scene.add(s);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5).multiplyScalar(size);
      let t = 0;
      this.items.push({
        update: (dt) => {
          t += dt / 0.9;
          s.position.addScaledVector(vel, dt);
          vel.multiplyScalar(0.95);
          s.scale.setScalar((0.4 + t * 1.4) * size);
          s.material.opacity = 0.7 * (1 - t);
          if (t >= 1) { this.scene.remove(s); s.material.dispose(); return false; }
          return true;
        },
      });
    }
  }

  // A bag tossed in an arc (selling: from the seller into the dumpster).
  bagArc(from, to, delay = 0) {
    const m = new THREE.Mesh(this.bagGeo, this.bagMat);
    m.visible = false;
    this.scene.add(m);
    let t = -delay;
    const dur = 0.6;
    this.items.push({
      update: (dt) => {
        t += dt;
        if (t < 0) return true;
        m.visible = true;
        const k = Math.min(t / dur, 1);
        m.position.lerpVectors(from, to, k);
        m.position.y += Math.sin(k * Math.PI) * 2.2;
        m.rotation.x += dt * 6;
        if (k >= 1) { this.scene.remove(m); this.dust(to, 0.7, 3); return false; }
        return true;
      },
    });
  }

  // Floating text in the world ("+$12").
  text(pos, str, cls = '') {
    if (!this.textLayer) return;
    const el = document.createElement('div');
    el.className = `wt ${cls}`;
    el.textContent = str;
    this.textLayer.appendChild(el);
    const p = pos.clone();
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt / 1.3;
        p.y += dt * 0.8;
        _v.copy(p).project(this.game.camera);
        const behind = _v.z > 1;
        el.style.display = behind ? 'none' : '';
        el.style.transform = `translate(-50%, -50%) translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) scale(${1 + Math.sin(Math.min(t * 6, Math.PI)) * 0.2})`;
        el.style.opacity = String(1 - Math.max(0, t - 0.6) / 0.4);
        if (t >= 1) { el.remove(); return false; }
        return true;
      },
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) if (!this.items[i].update(dt)) this.items.splice(i, 1);
  }

  // ---------------------------------------------------------------- events

  onDespawn(e, f) {
    if (!f) return;
    const g = this.game;
    const at = e.body.position.clone();
    if (f.k === 'pick') {
      if (f.pid === this.me) {
        if (!e.pending) this.collect(e, this.handPos(this.me));
        return;
      }
      this.collect(e, this.handPos(f.pid) ?? at);
      g.sfx.play('pick', { at, volume: 0.8 });
    } else if (f.k === 'dunkSell') {
      e.mesh.visible = false;
      this.coins(at, 4, 0.7);
      g.sfx.play('coin', { at, volume: 1, rate: 1.1 });
      this.text(at.add(_v.set(0, 0.6, 0)), `+$${f.amount}`, 'money');
      if (f.by === this.me) g.hud.floatText(`+$${f.amount}`, 'money');
    } else if (f.k === 'toBed') {
      g.sfx.play('thud', { at, volume: 0.7 });
    }
  }

  onEvent(f) {
    const g = this.game;
    const mine = f.pid === this.me;
    const at = f.x !== undefined ? new THREE.Vector3(f.x, f.y, f.z) : (f.pid ? this.playerPos(f.pid) : null);
    switch (f.k) {
      case 'toast': g.toast(f.text, f.kind); break;
      case 'tie':
        g.sfx.play('tie', { at: mine ? null : at, volume: mine ? 0.9 : 0.6 });
        if (mine) { g.toast('Bag tied off! 🛍️', 'info', 'tie'); g.hud.pulseBelt(); }
        break;
      case 'sold': {
        const from = this.playerPos(f.pid) ?? at;
        for (let i = 0; i < Math.min(f.bags, 6); i++) this.bagArc(from.clone().setY(1.3), at.clone().setY(1.2), i * 0.12);
        setTimeout(() => {
          this.coins(at.clone().setY(1.6), Math.min(28, 8 + f.bags * 3), 1.1);
          g.sfx.play('chaching', { at: mine ? null : at, volume: mine ? 1 : 0.8 });
          this.text(at.clone().setY(2.6), `+$${f.amount.toLocaleString()}`, 'money big');
          if (mine) g.hud.bigMoney(f.amount);
        }, 600);
        g.toast(`${mine ? 'You' : this.nameOf(f.pid)} sold ${f.bags} bag${f.bags > 1 ? 's' : ''}${f.truck ? ` (${f.truck} from the truck)` : ''} for $${f.amount.toLocaleString()}`, 'money');
        break;
      }
      case 'dunk':
        this.coins(at, 14, 1);
        g.sfx.play('chaching', { at, volume: 0.9 });
        this.text(at.clone().setY(2.4), `DUNK! +$${f.amount}`, 'money big');
        break;
      case 'punch':
        if (!mine) g.sfx.play('whoosh', { at, volume: 0.5, rate: 1.4 });
        if (f.hit) { g.sfx.play('punchHit', { at, volume: 0.9 }); this.dust(at, 0.4, 3); }
        break;
      case 'thud':
        g.sfx.play('thud', { at, volume: 0.4 + f.s * 0.8 });
        if (f.s > 0.4 && at.y < 1) this.dust(at.clone().setY(0.1), 0.6 + f.s, 4);
        break;
      case 'spill':
        g.sfx.play('spill', { at });
        this.dust(at, 1, 6);
        break;
      case 'grab': if (!mine) g.sfx.play('grab', { at, volume: 0.6 }); break;
      case 'throw': if (!mine) g.sfx.play('whoosh', { at, volume: 0.7 }); break;
      case 'bin':
        g.sfx.play('tie', { at, volume: 0.7 });
        this.dust(at, 0.5, 3);
        if (mine) { g.hud.floatText(`+${f.n} items`, 'pick'); g.hud.pulseBag(); }
        break;
      case 'drink':
        g.sfx.play('glug', { at: mine ? null : at, volume: 0.9 });
        setTimeout(() => g.sfx.play('burp', { at: mine ? null : at }), 1300);
        if (mine) {
          const lp = g.localPlayer;
          lp.drunk = Math.min(6, lp.drunk + 1);
          lp.drunkDecay = 0;
          const lines = ['Trash Panda Lager. Tastes like the alley smells.', 'One more. For balance.', 'You feel... wobbly.', 'Is the ground moving?', 'You are a danger to yourself and Gary.', 'Absolutely hammered. Maybe sit down.'];
          g.toast(lines[Math.min(lines.length, Math.ceil(lp.drunk)) - 1] + ` 🍺×${Math.ceil(lp.drunk)}`, 'gary', 'drink');
        }
        break;
      case 'scratch':
        g.sfx.play('scratch', { at: mine ? null : at });
        if (mine) g.hud.scratchCard(f.prize);
        setTimeout(() => {
          if (f.prize > 0) { g.sfx.play(mine ? 'win' : 'coin', { at: mine ? null : at }); if (at) this.coins(at.clone().setY(1.8), Math.min(20, 3 + f.prize / 20), 0.8); }
          else if (mine) g.sfx.play('lose');
        }, 700);
        break;
      case 'bought':
        g.sfx.play('coin', { volume: 0.8, rate: 0.8 });
        g.toast(`${mine ? 'You' : this.nameOf(f.pid)} bought an upgrade for the crew 🎉`, 'money');
        break;
      case 'horn': g.sfx.play('horn', { at: g.truck.position }); break;
      default: break;
    }
  }
}
