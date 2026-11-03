import test from 'node:test';
import assert from 'node:assert/strict';
import { canClimb, canReach } from '../sim/ability.js';
import { getBodyValues } from '../sim/body.js';
import { ledger, maxMonths, minMonths } from './helpers.js';

const EPSILON = 0.01;
const SAMPLE = { months: 48, sex: 'female' };

for (const [name, can, key] of [['canClimb', canClimb, 'climb'], ['canReach', canReach, 'reach']]) {
  test(`${name} is true up to and including the limit, false above it`, () => {
    const body = getBodyValues(ledger, SAMPLE);
    const limit = body[key].value;
    assert.equal(can(body, limit - EPSILON), true);
    assert.equal(can(body, limit), true);
    assert.equal(can(body, limit + EPSILON), false);
  });

  test(`${name} rejects an invalid height`, () => {
    const body = getBodyValues(ledger, SAMPLE);
    assert.throws(() => can(body, -1), RangeError);
    assert.throws(() => can(body, NaN), RangeError);
  });

  test(`${name} changes its answer as the child grows`, () => {
    const young = getBodyValues(ledger, { months: minMonths, sex: 'male' });
    const old = getBodyValues(ledger, { months: maxMonths, sex: 'male' });
    const between = (young[key].value + old[key].value) / 2;
    assert.equal(can(young, between), false);
    assert.equal(can(old, between), true);
  });
}

test('an individual z changes the answer at the same age', () => {
  const objectHeight = getBodyValues(ledger, SAMPLE).climb.value;
  const low = getBodyValues(ledger, { ...SAMPLE, z: { height: 0, climb: -1, walkSpeed: 0 } });
  const high = getBodyValues(ledger, { ...SAMPLE, z: { height: 0, climb: 1, walkSpeed: 0 } });
  assert.equal(canClimb(low, objectHeight), false);
  assert.equal(canClimb(high, objectHeight), true);
});
