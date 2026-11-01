// Snapshot interpolation. Remote things are drawn slightly in the past
// (INTERP_DELAY) so there are always two samples to blend between, which hides
// network jitter. Samples are flat number arrays; the caller says which
// slots are angles (wrap around) and where quaternions start (normalized after
// blending).
export const INTERP_DELAY = 110; // ms

export class SampleBuffer {
  constructor(max = 10) { this.max = max; this.samples = []; }

  push(t, data) {
    const s = this.samples;
    if (s.length && t <= s[s.length - 1].t) return; // out of order / duplicate
    s.push({ t, data });
    if (s.length > this.max) s.shift();
  }

  get latest() { return this.samples[this.samples.length - 1]?.data ?? null; }
  get empty() { return this.samples.length === 0; }

  // Blend into `out` (array) at time t. Returns out, or null if empty.
  at(t, out, { angles = [], quats = [] } = {}) {
    const s = this.samples;
    if (!s.length) return null;
    if (t <= s[0].t || s.length === 1) return copy(s[0].data, out);
    const last = s[s.length - 1];
    if (t >= last.t) return copy(last.data, out);
    let i = s.length - 2;
    while (i > 0 && s[i].t > t) i--;
    const a = s[i], b = s[i + 1];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const A = a.data, Bd = b.data;
    for (let j = 0; j < A.length; j++) out[j] = A[j] + (Bd[j] - A[j]) * k;
    for (const j of angles) {
      let d = Bd[j] - A[j];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      out[j] = A[j] + d * k;
    }
    for (const j of quats) {
      // Take the short way round, then normalize (nlerp).
      const dot = A[j] * Bd[j] + A[j + 1] * Bd[j + 1] + A[j + 2] * Bd[j + 2] + A[j + 3] * Bd[j + 3];
      const sgn = dot < 0 ? -1 : 1;
      let len = 0;
      for (let c = 0; c < 4; c++) { out[j + c] = A[j + c] + (Bd[j + c] * sgn - A[j + c]) * k; len += out[j + c] * out[j + c]; }
      len = Math.sqrt(len) || 1;
      for (let c = 0; c < 4; c++) out[j + c] /= len;
    }
    return out;
  }
}

function copy(src, out) {
  for (let j = 0; j < src.length; j++) out[j] = src[j];
  return out;
}

// Keeps a smoothed estimate of (host clock - local clock) from snapshot timestamps.
export class Clock {
  constructor() { this.offset = null; }
  sample(hostT) {
    const o = hostT - performance.now();
    if (this.offset === null || Math.abs(o - this.offset) > 1000) this.offset = o;
    else this.offset += (o - this.offset) * 0.05;
  }
  renderTime() { return performance.now() + (this.offset ?? 0) - INTERP_DELAY; }
}
