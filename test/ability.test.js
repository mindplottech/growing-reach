import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canClimb, canReach } from '../src/ability.js';
import { getBodyValues } from '../src/body.js';

const ledger = JSON.parse(readFileSync(new URL('../data/values_ledger.json', import.meta.url)));
const EPSILON = 0.01;

for (const [name, can, key] of [['canClimb', canClimb, 'climb'], ['canReach', canReach, 'reach']]) {
  test(`${name} is true up to and including the limit, false above it`, () => {
    const body = getBodyValues(ledger, { months: 48, sex: 'female' });
    const limit = body[key].value;
    assert.equal(can(body, limit - EPSILON), true);
    assert.equal(can(body, limit), true);
    assert.equal(can(body, limit + EPSILON), false);
  });

  test(`${name} rejects an invalid height`, () => {
    const body = getBodyValues(ledger, { months: 48, sex: 'female' });
    assert.throws(() => can(body, -1), RangeError);
    assert.throws(() => can(body, NaN), RangeError);
  });
}

test('the answers change as the child grows', () => {
  const young = getBodyValues(ledger, { months: 36, sex: 'male' });
  const old = getBodyValues(ledger, { months: 60, sex: 'male' });
  assert.equal(canClimb(young, 70), false);
  assert.equal(canClimb(old, 70), true);
  assert.equal(canReach(young, 120), false);
  assert.equal(canReach(old, 120), true);
});

test('an individual z changes the answer at the same age', () => {
  const objectHeight = 70;
  const base = { months: 48, sex: 'male' };
  const low = getBodyValues(ledger, { ...base, z: { height: 0, climb: -1, walkSpeed: 0 } });
  const high = getBodyValues(ledger, { ...base, z: { height: 0, climb: 1, walkSpeed: 0 } });
  assert.equal(canClimb(low, objectHeight), false);
  assert.equal(canClimb(high, objectHeight), true);
});
