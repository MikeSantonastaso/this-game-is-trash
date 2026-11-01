// Pure-logic tests (no browser needed): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/core/GameState.js';
import { Inventory } from '../src/systems/Inventory.js';
import { computeStats } from '../src/systems/Stats.js';
import { pickWeighted } from '../src/data/trash.js';

const item = (space = 1, value = 2) => ({ type: 'can', space, value });

test('bag fills, auto-ties onto the belt, then blocks when everything is full', () => {
  const stats = { bagSize: 3, bagSlots: 1 };
  const inv = new Inventory(() => stats);
  assert.equal(inv.tryAdd(item()).ok, true);
  assert.equal(inv.tryAdd(item()).ok, true);
  const third = inv.tryAdd(item());
  assert.equal(third.ok, true);
  assert.equal(third.tied, true);
  assert.equal(inv.tied.length, 1);
  inv.tryAdd(item()); inv.tryAdd(item()); inv.tryAdd(item());
  assert.equal(inv.isFull, true);
  assert.deepEqual(inv.tryAdd(item()), { ok: false, tied: false, reason: 'full' });
  assert.equal(inv.takeAll().length, 2);
  assert.equal(inv.isEmpty, true);
});

test('a big item ties off a partial bag to make room', () => {
  const inv = new Inventory(() => ({ bagSize: 4, bagSlots: 2 }));
  inv.tryAdd(item(1));
  const res = inv.tryAdd(item(4, 25));
  assert.equal(res.ok, true);
  assert.equal(inv.tied.length, 2); // partial bag + the now-full tire bag
});

test('buying tools and upgrades spends money and changes stats', () => {
  const s = new GameState();
  assert.equal(s.buyTool('picker_extendo').reason, 'money');
  s.addMoney(1000);
  assert.equal(s.buyTool('picker_extendo').ok, true);
  assert.equal(s.money, 850);
  assert.equal(computeStats(s).reach, 3.8);
  const before = computeStats(s).bagSize;
  assert.equal(s.buyUpgrade('bagSize').ok, true);
  assert.equal(computeStats(s).bagSize, before + 2);
});

test('upgrades stop at max level', () => {
  const s = new GameState();
  s.addMoney(1e9);
  for (let i = 0; i < 20; i++) s.buyUpgrade('bagSlots');
  assert.equal(s.upgradeLevel('bagSlots'), 5);
  assert.equal(s.buyUpgrade('bagSlots').reason, 'max');
});

test('save data round-trips and tolerates missing fields', () => {
  const s = new GameState();
  s.addMoney(500); s.buyUpgrade('haggle');
  const copy = new GameState();
  copy.load(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(copy.money, s.money);
  assert.equal(copy.upgradeLevel('haggle'), 1);
  const partial = new GameState();
  partial.load({ money: 42 });
  assert.equal(partial.money, 42);
  assert.equal(partial.equippedTool, 'picker_basic');
});

test('coming-soon areas cannot be bought yet', () => {
  const s = new GameState();
  s.addMoney(1e9);
  assert.equal(s.buyArea('small_hood').reason, 'soon');
});

test('weighted trash table only returns known types', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(pickWeighted({ a: 1, b: 3 }));
  assert.deepEqual([...seen].sort(), ['a', 'b']);
});
