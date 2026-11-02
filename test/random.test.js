import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, standardNormal } from '../src/random.js';

const draw = (seed, count, fn) => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => fn(rng));
};

test('the same seed gives the same sequence', () => {
  assert.deepEqual(draw(42, 100, (r) => r()), draw(42, 100, (r) => r()));
  assert.deepEqual(draw(42, 100, standardNormal), draw(42, 100, standardNormal));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(draw(1, 10, (r) => r()), draw(2, 10, (r) => r()));
});

test('uniform draws stay in [0, 1)', () => {
  for (const u of draw(7, 10000, (r) => r())) assert.ok(u >= 0 && u < 1);
});

test('normal draws have mean near 0 and SD near 1', () => {
  const zs = draw(7, 50000, standardNormal);
  const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
  const variance = zs.reduce((a, b) => a + (b - mean) ** 2, 0) / zs.length;
  assert.ok(Math.abs(mean) < 0.02, `mean ${mean}`);
  assert.ok(Math.abs(Math.sqrt(variance) - 1) < 0.02, `sd ${Math.sqrt(variance)}`);
});

test('rejects a non-integer seed', () => {
  assert.throws(() => createRng('abc'), TypeError);
});
