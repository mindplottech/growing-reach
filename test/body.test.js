import test from 'node:test';
import assert from 'node:assert/strict';
import { drawIndividual, getBodyValues, getTiptoeReference } from '../sim/body.js';
import {
  byId, climbPoints, close, everyMonth, expectedAt, heightPoints, heightSdPoints,
  ledger, maxMonths, minMonths, reachFormula, SEXES, walkPoints,
} from './helpers.js';

const body = (months, sex = 'male', z) => getBodyValues(ledger, { months, sex, z });
const inRange = (points) => points.filter(([months]) => months >= minMonths && months <= maxMonths);
// KO's つかまり立ちのころ: before this month the child crawls and does not climb (practice_mobility).
const walkFrom = byId('practice_mobility').walk_from_months;
const walking = (months) => months >= walkFrom;

test('height and its SD equal the ledger at every anchor month in range', () => {
  for (const sex of SEXES) {
    for (const [months, value] of inRange(heightPoints(sex))) {
      assert.equal(body(months, sex).height.value, value);
    }
    for (const [months, sd] of inRange(heightSdPoints(sex))) {
      assert.equal(body(months, sex).height.sd, sd);
    }
  }
});

test('height and its SD are interpolated between anchor months at every month', () => {
  for (const sex of SEXES) {
    for (const months of everyMonth()) {
      close(body(months, sex).height.value, expectedAt(heightPoints(sex), months));
      close(body(months, sex).height.sd, expectedAt(heightSdPoints(sex), months));
    }
  }
});

test('height is flat before the first anchor, as the ledger notes', () => {
  const [firstAnchor] = byId('height_percentiles').anchor_months;
  assert.equal(body(minMonths).height.value, body(firstAnchor).height.value);
});

test('reach matches the ledger reference values at anchor months', () => {
  const { anchor_months: anchors } = byId('height_percentiles');
  const reference = byId('reach_height_standing').reference_values_from_P50;
  for (const sex of SEXES) {
    // The reference values start at the first toddler interval; the infant anchors come before it.
    const offset = anchors.length - reference[sex].length;
    anchors.forEach((months, i) => {
      if (months > maxMonths || i < offset) return;
      assert.equal(Number(body(months, sex).reach.value.toFixed(1)), reference[sex][i - offset]);
    });
  }
});

test('reach follows the individual height and carries its SD through the slope', () => {
  const { slope, intercept } = reachFormula();
  const months = 51;
  const median = body(months);
  const tall = body(months, 'male', { height: 1, climb: 0, walkSpeed: 0 });
  close(tall.reach.value, (median.height.value + median.height.sd) * slope + intercept);
  close(tall.reach.sd, median.height.sd * slope);
});

test('climb equals the ledger at every series point and is shared by both sexes', () => {
  const entry = byId('climb_height');
  for (const [months, value] of climbPoints().filter(([m]) => walking(m))) {
    for (const sex of SEXES) {
      assert.equal(body(months, sex).climb.value, value);
      assert.equal(body(months, sex).climb.sd, entry.individual_sd.value);
    }
  }
});

test('climb is interpolated between series points at every month', () => {
  for (const months of everyMonth().filter(walking)) {
    close(body(months).climb.value, expectedAt(climbPoints(), months));
  }
  // つかまり立ちのころ: no climbing is computed.
  for (const months of everyMonth().filter((m) => !walking(m))) {
    assert.equal(body(months).climb.value, 0);
    assert.equal(body(months).climb.category, 'provisional');
  }
});

test('walk speed equals the ledger at series points and is interpolated between them', () => {
  const { sd_series_used: sdSeries } = byId('walk_speed').age_4to5_candidates;
  for (const months of everyMonth().filter(walking)) {
    close(body(months).walkSpeed.value, expectedAt(walkPoints(), months));
    close(body(months).walkSpeed.sd, expectedAt(sdSeries, months));
  }
  for (const [months, value] of walkPoints()) {
    assert.equal(body(months).walkSpeed.value, value);
  }
});

test('categories come from the ledger and change where the evidence ends', () => {
  const climbEntry = byId('climb_height');
  const walkEntry = byId('walk_speed');
  const lastValid = climbEntry.valid_age_months[1];
  assert.equal(body(lastValid).climb.category, climbEntry.category);
  assert.equal(body(lastValid + 1).climb.category, climbEntry.extension_beyond_45.category);
  assert.equal(body(maxMonths).height.category, byId('height_percentiles').category);
  assert.equal(body(maxMonths).reach.category, byId('reach_height_standing').category);
  for (const months of walkEntry.age_4to5_candidates.measured_points_months) {
    assert.equal(body(months).walkSpeed.category, walkEntry.category);
  }
  assert.equal(body(walkFrom).walkSpeed.category, walkEntry.age_4to5_candidates.category);
  assert.equal(body(minMonths).walkSpeed.category, byId('crawl_speed').category);
  assert.equal(body(maxMonths).walkSpeed.category, walkEntry.age_4to5_candidates.category);
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
  byId('climb_height', edited).series_from_formula[1][1] = 11;
  byId('climb_height', edited).individual_sd.value = 3;
  byId('walk_speed', edited).age_4to5_candidates.series_used[0][1] = 0.5;
  const result = getBodyValues(edited, { months: minMonths, sex: 'male' });
  // Climb and walk from the walking age (18 months: a climb series point, before the walk series starts).
  const walkingResult = getBodyValues(edited, { months: 18, sex: 'male' });
  assert.equal(result.height.value, 50);
  assert.equal(result.reach.value, 90);
  assert.equal(walkingResult.climb.value, 11);
  assert.equal(walkingResult.climb.sd, 3);
  assert.equal(walkingResult.walkSpeed.value, 0.5);
  byId('crawl_speed', edited).value = 0.2;
  assert.equal(getBodyValues(edited, { months: minMonths, sex: 'male' }).walkSpeed.value, 0.2);
});

test('an unexpected reach formula fails loudly', () => {
  const edited = structuredClone(ledger);
  byId('reach_height_standing', edited).formula = 'reach = height + 1';
  assert.throws(() => getBodyValues(edited, { months: minMonths, sex: 'male' }), /unexpected reach formula/);
});

test('rejects ages outside the range and unknown sexes', () => {
  assert.throws(() => body(minMonths - 1), RangeError);
  assert.throws(() => body(maxMonths + 1), RangeError);
  assert.throws(() => body(NaN), RangeError);
  assert.throws(() => body(minMonths, 'other'), RangeError);
});

test('the tiptoe reference follows the completed age in years', () => {
  const entry = byId('reach_height_tiptoe_zukan');
  for (const months of everyMonth()) {
    const years = Math.floor(months / 12);
    const row = entry.values_by_age_years[years];
    if (!row) {
      assert.equal(getTiptoeReference(ledger, months), null);
      continue;
    }
    assert.equal(getTiptoeReference(ledger, months).value, row.reach);
    assert.equal(getTiptoeReference(ledger, months).category, entry.category);
  }
});
