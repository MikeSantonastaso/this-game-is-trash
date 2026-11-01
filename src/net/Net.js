// Networking transports. The game only sees a tiny interface:
//
//   net.selfId                      this peer's id
//   net.send(type, data, to?)       to one peer, or everyone when `to` is omitted
//   net.on(type, (data, from) => {})
//   net.onPeerJoin / net.onPeerLeave = (peerId) => {}
//
// Three transports implement it:
//   - TrysteroNet: real online play. WebRTC data channels between browsers,
//     peers find each other through public Nostr relays (no server of our own,
//     so it works from GitHub Pages). A room code is the Trystero room id.
//   - LocalNet: BroadcastChannel between tabs of the same browser (?net=local).
//     Handy for testing co-op on one machine without the internet.
//   - SoloNet: no peers at all, for single player.
//
// The game is host-authoritative (see sim/HostSim.js): clients only ever talk
// to the host, and the host talks to everyone.

const APP_ID = 'this-game-is-trash-v1';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode(len = 5) {
  let s = '';
  const rnd = crypto.getRandomValues(new Uint32Array(len));
  for (let i = 0; i < len; i++) s += ALPHABET[rnd[i] % ALPHABET.length];
  return s;
}

export function cleanRoomCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

class BaseNet {
  constructor() {
    this.handlers = new Map();
    this.onPeerJoin = () => {};
    this.onPeerLeave = () => {};
    this.bytesIn = 0;
    this.bytesOut = 0;
  }

  on(type, fn) { this.handlers.set(type, fn); }

  dispatch(msg, from) {
    if (!msg || typeof msg.t !== 'string') return;
    const fn = this.handlers.get(msg.t);
    if (fn) {
      try { fn(msg.d, from); } catch (err) { console.error(`net handler "${msg.t}" failed`, err); }
    }
  }

  leave() {}
}

export class SoloNet extends BaseNet {
  constructor() { super(); this.selfId = 'solo'; this.kind = 'solo'; }
  send() {}
}

export class LocalNet extends BaseNet {
  constructor(room) {
    super();
    this.kind = 'local';
    this.selfId = 'L' + Math.random().toString(36).slice(2, 8);
    this.peers = new Map(); // id -> last seen ms
    this.channel = new BroadcastChannel('tgit-' + room);
    this.channel.onmessage = (e) => this.receive(e.data);
    this.post({ sys: 'join' });
    this.beat = setInterval(() => {
      this.post({ sys: 'beat' });
      const now = performance.now();
      for (const [id, seen] of this.peers) if (now - seen > 10000) { this.peers.delete(id); this.onPeerLeave(id); }
    }, 1000);
    window.addEventListener('beforeunload', () => this.leave());
  }

  post(m) { this.channel.postMessage({ ...m, from: this.selfId }); }

  receive(m) {
    if (!m || m.from === this.selfId) return;
    if (m.to && m.to !== this.selfId) return;
    const known = this.peers.has(m.from);
    if (m.sys === 'leave') { if (known) { this.peers.delete(m.from); this.onPeerLeave(m.from); } return; }
    this.peers.set(m.from, performance.now());
    if (!known) {
      if (m.sys !== 'here') this.post({ sys: 'here', to: m.from });
      this.onPeerJoin(m.from);
    }
    if (m.sys) return;
    this.bytesIn += m.size ?? 0;
    this.dispatch(m.msg, m.from);
  }

  send(t, d, to) {
    const msg = { t, d };
    this.post({ msg, to });
  }

  leave() { clearInterval(this.beat); this.post({ sys: 'leave' }); }
}

export class TrysteroNet extends BaseNet {
  static async create(room, { onError } = {}) {
    const mod = await import('../../vendor/trystero.js');
    return new TrysteroNet(mod, room, onError);
  }

  constructor(mod, room, onError) {
    super();
    this.kind = 'online';
    this.selfId = mod.selfId;
    this.room = mod.joinRoom({ appId: APP_ID }, 'room-' + room, {
      onJoinError: (details) => { console.warn('Trystero join error', details); onError?.(details); },
    });
    this.action = this.room.makeAction('m');
    this.action.onMessage = (msg, meta) => this.dispatch(msg, meta?.peerId ?? meta);
    this.room.onPeerJoin = (id) => this.onPeerJoin(id);
    this.room.onPeerLeave = (id) => this.onPeerLeave(id);
    window.addEventListener('beforeunload', () => this.leave());
  }

  send(t, d, to) {
    try {
      this.action.send({ t, d }, to ? { target: to } : undefined)?.catch?.((err) => console.warn('send failed', err));
    } catch (err) { console.warn('send failed', err); }
  }

  leave() { try { this.room.leave(); } catch { /* already gone */ } }
}

export async function createNet({ mode, room, onError }) {
  if (mode === 'solo') return new SoloNet();
  if (new URLSearchParams(location.search).get('net') === 'local') return new LocalNet(room);
  return TrysteroNet.create(room, { onError });
}
