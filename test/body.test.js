import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawIndividual, getBodyValues, getTiptoeReference } from '../src/body.js';

const ledger = JSON.parse(readFileSync(new URL('../data/values_ledger.json', import.meta.url)));
const byId = (id, source = ledger) => source.items.find((entry) => entry.id === id);
const [minMonths, maxMonths] = ledger._meta.age_range_months;
const SEXES = ['male', 'female'];
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
const body = (months, sex = 'male', z) => getBodyValues(ledger, { months, sex, z });

test('height equals the ledger P50 and SD at every anchor month in range', () => {
  const { anchor_months: anchors, values } = byId('height_percentiles');
  for (const sex of SEXES) {
    anchors.forEach((months, i) => {
      if (months > maxMonths) return;
      assert.equal(body(months, sex).height.value, values[sex].P50[i]);
      assert.equal(body(months, sex).height.sd, byId('height_sd').values[sex][i]);
    });
  }
});

test('height is interpolated between anchor months', () => {
  close(body(42, 'male').height.value, (94.3 + 97.8) / 2);
  close(body(40, 'female').height.value, 93.2 + (96.7 - 93.2) / 6);
  close(body(60, 'male').height.value, (104.7 + 108.0) / 2);
  close(body(42, 'male').height.sd, (3.46 + 3.64) / 2);
});

test('height is flat before the first anchor, as the ledger notes', () => {
  assert.equal(body(36).height.value, body(39).height.value);
});

test('reach matches the ledger reference values at anchor months', () => {
  const { anchor_months: anchors } = byId('height_percentiles');
  const reference = byId('reach_height_standing').reference_values_from_P50;
  for (const sex of SEXES) {
    anchors.forEach((months, i) => {
      if (months > maxMonths) return;
      assert.equal(Number(body(months, sex).reach.value.toFixed(1)), reference[sex][i]);
    });
  }
});

test('reach follows the individual height and carries its SD through the slope', () => {
  const tall = body(51, 'male', { height: 1, climb: 0, walkSpeed: 0 });
  close(tall.reach.value, (101.3 + 3.83) * 1.59 - 34.22);
  close(tall.reach.sd, 3.83 * 1.59);
});

test('climb equals the ledger at every series point and is shared by both sexes', () => {
  const entry = byId('climb_height');
  for (const [months, value] of [...entry.series_from_formula, ...entry.extension_beyond_45.series]) {
    for (const sex of SEXES) {
      assert.equal(body(months, sex).climb.value, value);
      assert.equal(body(months, sex).climb.sd, entry.individual_sd.value);
    }
  }
});

test('climb is interpolated between series points, including across the extension', () => {
  close(body(37).climb.value, 60.6 + (63.5 - 60.6) / 3);
  close(body(46).climb.value, 69.4 + (72.4 - 69.4) / 3);
});

test('walk speed equals the ledger at series points and is interpolated between them', () => {
  const { series_used: series, sd_used: sd } = byId('walk_speed').age_4to5_candidates;
  for (const [months, value] of series) {
    assert.equal(body(months).walkSpeed.value, value);
    assert.equal(body(months).walkSpeed.sd, sd);
  }
  close(body(42).walkSpeed.value, (0.99 + 1.04) / 2);
});

test('categories come from the ledger and change where the evidence ends', () => {
  const lastValid = byId('climb_height').valid_age_months[1];
  assert.equal(body(lastValid).climb.category, 'formula');
  assert.equal(body(lastValid + 1).climb.category, 'provisional');
  assert.equal(body(maxMonths).climb.category, 'provisional');
  assert.equal(body(maxMonths).height.category, 'measured');
  assert.equal(body(maxMonths).reach.category, 'formula');
  assert.equal(body(minMonths).walkSpeed.category, 'measured');
  assert.equal(body(minMonths + 1).walkSpeed.category, 'converted');
});

test('z shifts each value by its ledger SD', () => {
  const shifted = body(48, 'female', { height: 2, climb: -1, walkSpeed: 1 });
  const median = body(48, 'female');
  close(shifted.height.value, median.height.value + 2 * median.height.sd);
  close(shifted.climb.value, median.climb.value - median.climb.sd);
  close(shifted.walkSpeed.value, median.walkSpeed.value + median.walkSpeed.sd);
});

test('the same seed gives the same individual and the same body values', () => {
  const first = drawIndividual(123);
  assert.deepEqual(first, drawIndividual(123));
  assert.notDeepEqual(first, drawIndividual(124));
  assert.deepEqual(body(50, 'male', first), body(50, 'male', drawIndividual(123)));
});

test('values are read from the ledger, not from the code', () => {
  const edited = structuredClone(ledger);
  byId('height_percentiles', edited).values.male.P50[0] = 50;
  byId('reach_height_standing', edited).formula = 'reach = height * 2 - 10';
  byId('climb_height', edited).series_from_formula[0][1] = 11;
  byId('climb_height', edited).individual_sd.value = 3;
  byId('walk_speed', edited).age_4to5_candidates.series_used[0][1] = 0.5;
  const result = getBodyValues(edited, { months: 36, sex: 'male' });
  assert.equal(result.height.value, 50);
  assert.equal(result.reach.value, 90);
  assert.equal(result.climb.value, 11);
  assert.equal(result.climb.sd, 3);
  assert.equal(result.walkSpeed.value, 0.5);
});

test('an unexpected reach formula fails loudly', () => {
  const edited = structuredClone(ledger);
  byId('reach_height_standing', edited).formula = 'reach = height + 1';
  assert.throws(() => getBodyValues(edited, { months: 36, sex: 'male' }), /unexpected reach formula/);
});

test('rejects ages outside the range and unknown sexes', () => {
  assert.throws(() => body(minMonths - 1), RangeError);
  assert.throws(() => body(maxMonths + 1), RangeError);
  assert.throws(() => body(NaN), RangeError);
  assert.throws(() => body(48, 'other'), RangeError);
});

test('the tiptoe reference follows the completed age in years', () => {
  const { values_by_age_years: values } = byId('reach_height_tiptoe_zukan');
  assert.equal(getTiptoeReference(ledger, 47).value, values[3].reach);
  assert.equal(getTiptoeReference(ledger, 48).value, values[4].reach);
  assert.equal(getTiptoeReference(ledger, 60).value, values[5].reach);
  assert.equal(getTiptoeReference(ledger, 60).category, 'provisional');
});
