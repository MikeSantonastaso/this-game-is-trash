// Zone layout and unlock rules (pure logic): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/core/GameState.js';
import { canUnlock, checkRequirements } from '../src/core/requirements.js';
import { ZONES, WORLD, GATES, BORDERS, ROADS, zoneAt, getZone, onRoad } from '../src/data/zones.js';

test('zones tile the world without overlapping', () => {
  const area = (r) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
  const total = ZONES.reduce((s, z) => s + area(z.rect), 0);
  assert.equal(total, area(WORLD));
  for (let i = 0; i < 400; i++) {
    const x = WORLD.minX + Math.random() * (WORLD.maxX - WORLD.minX), z = WORLD.minZ + Math.random() * (WORLD.maxZ - WORLD.minZ);
    const hits = ZONES.filter((zz) => x > zz.rect.minX && x < zz.rect.maxX && z > zz.rect.minZ && z < zz.rect.maxZ);
    assert.ok(hits.length <= 1);
  }
  assert.equal(zoneAt(0, 12).id, 'park');
  assert.equal(zoneAt(0, -100).id, 'maple');
  assert.equal(zoneAt(200, 0).id, 'oakridge');
  assert.equal(zoneAt(0, -300).id, 'downtown');
});

test('every gate sits on a road and on a border between its two zones', () => {
  for (const g of GATES) {
    assert.ok(onRoad(g.x, g.z), `${g.id} is on a road`);
    const border = BORDERS.find((b) => b.between.includes(g.between[0]) && b.between.includes(g.between[1]));
    assert.ok(border, `${g.id} has a border`);
    const [x1, z1] = border.from, [x2, z2] = border.to;
    const onLine = z1 === z2 ? Math.abs(g.z - z1) < 0.01 && g.x > Math.min(x1, x2) && g.x < Math.max(x1, x2)
      : Math.abs(g.x - x1) < 0.01 && g.z > Math.min(z1, z2) && g.z < Math.max(z1, z2);
    assert.ok(onLine, `${g.id} is on its border line`);
  }
  // Every zone you can unlock has a gate leading to it.
  for (const z of ZONES.filter((zz) => zz.id !== 'park')) assert.ok(GATES.some((g) => g.leadsTo === z.id), z.id);
  assert.ok(ROADS.length > 5);
});

test('Maple Court needs the fee, the Extendo-Picker and 20 bags sold', () => {
  const s = new GameState();
  const maple = getZone('maple');
  assert.equal(canUnlock(s, maple).ok, false);
  assert.equal(canUnlock(s, maple).missing.length, 3);
  s.addMoney(2000);
  s.buyTool('picker_extendo');
  assert.deepEqual(canUnlock(s, maple).missing.map((r) => r.type), ['stat']);
  s.stats.bagsSold = 20;
  assert.equal(canUnlock(s, maple).ok, true);
  const before = s.money;
  assert.equal(s.unlockZone('maple').ok, true);
  assert.equal(s.money, before - 1000);
  assert.equal(s.isUnlocked('maple'), true);
  assert.equal(s.unlockZone('maple').reason, 'unlocked');
});

test('Oakridge needs the pickup truck, which is buyable property', () => {
  const s = new GameState();
  s.addMoney(1e6);
  s.buyTool('picker_double');
  const oak = getZone('oakridge');
  assert.ok(checkRequirements(s, oak).some((r) => r.type === 'property' && !r.met));
  assert.equal(s.buyProperty('pickup').ok, true);
  assert.equal(s.buyProperty('pickup').reason, 'owned');
  assert.equal(s.buyProperty('dump').reason, 'soon');
  assert.equal(s.unlockZone('oakridge').ok, true);
});

test('Downtown is visible but coming soon', () => {
  const s = new GameState();
  s.addMoney(1e9);
  assert.equal(s.unlockZone('downtown').reason, 'soon');
});

test('unlocks and property survive a save round trip', () => {
  const s = new GameState();
  s.addMoney(1e6); s.buyProperty('pickup');
  s.unlockedAreas.push('maple');
  const copy = new GameState();
  copy.load(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(copy.ownsProperty('pickup'), true);
  assert.equal(copy.isUnlocked('maple'), true);
  // Saves from the first prototype (no ownedProperties, old currentArea key) still load.
  const old = new GameState();
  old.load({ money: 5, unlockedAreas: ['park'], currentArea: 'park' });
  assert.deepEqual(old.ownedProperties, []);
});
