import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleBuffer } from '../src/net/Interp.js';
import { makeRoomCode, cleanRoomCode } from '../src/net/Net.js';

test('room codes are short, readable and survive sloppy typing', () => {
  for (let i = 0; i < 50; i++) {
    const code = makeRoomCode();
    assert.match(code, /^[A-Z0-9]{4,8}$/);
    assert.equal(cleanRoomCode(code.toLowerCase()), code);
  }
  assert.equal(cleanRoomCode(' ab-cd 12 '), 'ABCD12');
  assert.equal(cleanRoomCode(null), '');
});

test('interpolates between samples and clamps at the ends', () => {
  const b = new SampleBuffer();
  b.push(0, [0, 0]);
  b.push(100, [10, 20]);
  b.push(50, [99, 99]); // out of order, ignored
  assert.deepEqual(b.at(50, []), [5, 10]);
  assert.deepEqual(b.at(-10, []), [0, 0]);
  assert.deepEqual(b.at(500, []), [10, 20]);
});

test('angles take the short way round', () => {
  const b = new SampleBuffer();
  b.push(0, [3.0]);
  b.push(100, [-3.0]);
  const [a] = b.at(50, [], { angles: [0] });
  assert.ok(Math.abs(Math.abs(a) - (3.0 + (2 * Math.PI - 6) / 2)) < 1e-6, `got ${a}`);
});

test('quaternions stay normalized', () => {
  const b = new SampleBuffer();
  b.push(0, [0, 0, 0, 1]);
  b.push(100, [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  const q = b.at(50, [], { quats: [0] });
  assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-9);
});
