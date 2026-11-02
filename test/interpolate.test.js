import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate } from '../src/interpolate.js';

const points = [[10, 1], [20, 3], [40, 4]];

test('returns the exact value on a point', () => {
  for (const [x, y] of points) assert.equal(interpolate(points, x), y);
});

test('interpolates linearly between points', () => {
  assert.equal(interpolate(points, 15), 2);
  assert.equal(interpolate(points, 30), 3.5);
});

test('holds the end values flat outside the points', () => {
  assert.equal(interpolate(points, 0), 1);
  assert.equal(interpolate(points, 99), 4);
});

test('rejects a non-numeric x', () => {
  assert.throws(() => interpolate(points, NaN), TypeError);
});
