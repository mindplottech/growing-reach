import test from 'node:test';
import assert from 'node:assert/strict';
import { canClimb } from '../sim/ability.js';
import { drawIndividual, getBodyValues } from '../sim/body.js';
import { byId, close, everyMonth, ledger } from './helpers.js';

const entry = byId('climb_height');
const extension = entry.extension_beyond_45;
const lastValid = entry.valid_age_months[1];
const climbAt = (months, z) => getBodyValues(ledger, { months, sex: 'male', z }).climb;

test('the extension series is used past the formula range', () => {
  const [[firstMonths, firstValue], [lastMonths, lastValue]] = extension.series;
  assert.equal(climbAt(firstMonths).value, firstValue);
  assert.equal(climbAt(lastMonths).value, lastValue);
  const middle = (firstMonths + lastMonths) / 2;
  close(climbAt(middle).value, (firstValue + lastValue) / 2);
});

test('up to the valid age the formula series is used, unchanged', () => {
  for (const [months, value] of entry.series_from_formula) {
    assert.equal(climbAt(months).value, value);
    assert.equal(climbAt(months).category, entry.category);
  }
});

test('categories follow category_rule and are never upgraded', () => {
  for (const months of everyMonth().filter((m) => m > lastValid)) {
    const expected = extension.point_categories[months] ?? extension.category;
    assert.equal(climbAt(months).category, expected, `month ${months}`);
  }
  assert.equal(climbAt(lastValid + 0.5).category, extension.category);
});

// The experiment's conditions and results (Hatogo et al. 2003, as derived in the ledger),
// not ledger values: these check that the ledger still satisfies them.
const CHILDREN = 20000;
const shareThatClimb = (months, objectHeight) => {
  let count = 0;
  for (let seed = 1; seed <= CHILDREN; seed += 1) {
    if (canClimb({ climb: climbAt(months, drawIndividual(seed)) }, objectHeight)) count += 1;
  }
  return count / CHILDREN;
};

test('at 48 months about 80% of seeded children climb 70 cm', () => {
  const share = shareThatClimb(48, 70);
  assert.ok(Math.abs(share - 0.8) < 0.015, `share ${share}`);
});

test('at 48 months about 98% of seeded children climb 60 cm', () => {
  const share = shareThatClimb(48, 60);
  assert.ok(Math.abs(share - 0.982) < 0.01, `share ${share}`);
});

test('the simulated share is reproducible', () => {
  assert.equal(shareThatClimb(48, 70), shareThatClimb(48, 70));
});
