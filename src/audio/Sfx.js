// Sound. A handful of CC0 samples from Kenney's starter kits (assets/audio)
// plus little Web Audio synths for everything else (cha-ching, whoosh, glug,
// horn, scratch). Positional sounds are quieter with distance and panned
// left/right relative to the camera.
import * as THREE from 'three';

const SAMPLES = {
  coin: 'coin.mp3', impact: 'impact.mp3', breakS: 'break.mp3', fallS: 'fall.mp3', jumpS: 'jump.mp3',
  landS: 'land.mp3', placeA: 'placement-a.mp3', placeB: 'placement-b.mp3', rustle: 'removal-a.mp3',
  toggle: 'toggle.mp3', engine: 'engine.mp3', skid: 'skid.mp3',
};
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();

export class Sfx {
  constructor(camera) {
    this.camera = camera;
    this.buffers = new Map();
    this.ctx = null;
    this.muted = false;
  }

  // Browsers only allow audio after a click, so the start button calls this.
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise();
    for (const [name, file] of Object.entries(SAMPLES)) {
      fetch('assets/audio/' + file).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => {
        this.buffers.set(name, buf);
        if (name === 'engine') this.startEngine();
      }).catch(() => {});
    }
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Output node for a sound at a world position (or non-positional).
  out(volume, at) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let v = volume;
    let pan = 0;
    if (at) {
      this.camera.getWorldPosition(_v);
      const dx = at.x - _v.x, dy = at.y - _v.y, dz = at.z - _v.z;
      const d = Math.hypot(dx, dy, dz);
      v *= 1 / (1 + d / 7);
      if (v < 0.01) return null;
      _r.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      pan = THREE.MathUtils.clamp((dx * _r.x + dz * _r.z) / Math.max(d, 1), -1, 1) * 0.8;
    }
    g.gain.value = v;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  sample(name, { volume = 1, rate = 1, at = null, delay = 0 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    const out = this.out(volume, at);
    if (!out) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(out);
    src.start(this.ctx.currentTime + delay);
  }

  tone(freq, dur, { type = 'sine', volume = 0.3, at = null, delay = 0, slide = 0, attack = 0.005 } = {}) {
    const out = this.out(volume, at);
    if (!out) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, { volume = 0.3, at = null, delay = 0, freq = 1200, q = 1, sweep = 1, type = 'bandpass' } = {}) {
    const out = this.out(volume, at);
    if (!out) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const { volume = 1, at = null, rate = 1 } = opts;
    switch (name) {
      case 'pick': // claw snap + plastic rustle into the bag
        this.sample('placeA', { volume: volume * 0.8, rate: 1.3 * rate, at });
        this.noiseBurst(0.18, { volume: volume * 0.22, at, freq: 3500, q: 0.8, delay: 0.06 });
        break;
      case 'clack': this.sample('toggle', { volume: volume * 0.6, rate, at }); break;
      case 'tie':
        this.noiseBurst(0.35, { volume: volume * 0.3, at, freq: 2500, sweep: 0.5 });
        this.sample('placeB', { volume, rate: 0.7, at, delay: 0.2 });
        break;
      case 'grab': this.sample('placeB', { volume, rate: 0.9, at }); break;
      case 'whoosh': this.noiseBurst(0.28, { volume: volume * 0.35, at, freq: 500 * rate, sweep: 4, q: 2 }); break;
      case 'punchHit':
        this.sample('impact', { volume: volume * 0.9, rate: 1.6, at });
        this.tone(110, 0.18, { type: 'sine', volume: volume * 0.5, at, slide: 0.5 });
        break;
      case 'thud': this.sample('impact', { volume, rate: 0.75 + Math.random() * 0.3, at }); break;
      case 'crash':
        this.sample('impact', { volume, rate: 0.6, at });
        this.sample('breakS', { volume: volume * 0.8, rate: 0.8, at, delay: 0.03 });
        break;
      case 'spill':
        this.sample('breakS', { volume: volume * 0.6, rate: 1.1, at });
        this.noiseBurst(0.5, { volume: volume * 0.25, at, freq: 2000, sweep: 0.4 });
        break;
      case 'fall': this.sample('fallS', { volume, rate: 0.9, at }); break;
      case 'jump': this.sample('jumpS', { volume, rate: 0.9, at }); break;
      case 'land': this.sample('landS', { volume, at }); break;
      case 'coin': this.sample('coin', { volume, rate, at }); break;
      case 'chaching': {
        // Register bell + a shower of coins.
        this.tone(1318, 0.5, { type: 'triangle', volume: volume * 0.35, at });
        this.tone(1760, 0.7, { type: 'triangle', volume: volume * 0.35, at, delay: 0.09 });
        for (let i = 0; i < 6; i++) this.sample('coin', { volume: volume * 0.55, rate: 0.9 + Math.random() * 0.5, at, delay: 0.12 + i * 0.07 });
        break;
      }
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'square', volume: volume * 0.12, delay: i * 0.09 }));
        break;
      case 'lose':
        [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', volume: volume * 0.08, delay: i * 0.22, slide: 0.97 }));
        break;
      case 'scratch': for (let i = 0; i < 5; i++) this.noiseBurst(0.08, { volume: volume * 0.25, freq: 4000, delay: i * 0.1, at }); break;
      case 'glug': for (let i = 0; i < 4; i++) this.tone(180 + Math.random() * 60, 0.12, { volume: volume * 0.35, delay: i * 0.22, slide: 1.6, at }); break;
      case 'burp': this.tone(95, 0.45, { type: 'sawtooth', volume: volume * 0.18, slide: 0.7, at }); break;
      case 'horn':
        this.tone(392, 0.45, { type: 'square', volume: volume * 0.12, at });
        this.tone(330, 0.45, { type: 'square', volume: volume * 0.12, at });
        break;
      default: break;
    }
  }

  // Looping engine that follows the truck.
  attachEngine(truck) { this.truck = truck; if (this.buffers.has('engine')) this.startEngine(); }

  startEngine() {
    if (!this.ctx || !this.truck || this.engine) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get('engine');
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(this.master);
    src.start();
    this.engine = { src, g };
  }

  update(dt, game) {
    if (!this.engine || !this.truck) return;
    const t = this.truck;
    const driving = !!t.driver;
    const speed = Math.abs(t.speed);
    this.camera.getWorldPosition(_v);
    const d = _v.distanceTo(t.position);
    const vol = driving ? (0.25 + Math.min(speed / 20, 1) * 0.35) / (1 + d / 10) : 0;
    this.engine.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    this.engine.src.playbackRate.setTargetAtTime(0.7 + Math.min(speed / 20, 1) * 0.9 + Math.abs(t.throttle ?? 0) * 0.15, this.ctx.currentTime, 0.1);
  }
}
