import test from 'node:test';
import assert from 'node:assert/strict';
import { drawIndividual, getBodyValues, getTiptoeReference } from '../src/body.js';
import { byId, close, everyMonth, ledger, SEXES } from './helpers.js';

const entry = byId('tiptoe_gain');
const [minGain, maxGain] = entry.range;
const SAMPLE = { months: 48, sex: 'female' };
const SEEDS = Array.from({ length: 5000 }, (_, i) => i + 1);

test('tiptoe reach is the standing reach plus the gain', () => {
  for (const sex of SEXES) {
    for (const months of everyMonth()) {
      const { reach, tiptoeReach } = getBodyValues(ledger, { months, sex, z: drawIndividual(months) });
      close(tiptoeReach.value, reach.value + tiptoeReach.gain);
      close(tiptoeReach.min, reach.value + minGain);
      close(tiptoeReach.max, reach.value + maxGain);
    }
  }
});

test('the gain stays in the ledger range and covers it across children', () => {
  const gains = SEEDS.map(
    (seed) => getBodyValues(ledger, { ...SAMPLE, z: drawIndividual(seed) }).tiptoeReach.gain,
  );
  for (const gain of gains) assert.ok(gain >= minGain && gain < maxGain, `gain ${gain}`);
  const span = maxGain - minGain;
  assert.ok(Math.min(...gains) < minGain + span * 0.01);
  assert.ok(Math.max(...gains) > maxGain - span * 0.01);
});

test('the same seed gives the same gain, and a child keeps it while growing', () => {
  const gainAt = (months, seed) =>
    getBodyValues(ledger, { months, sex: 'male', z: drawIndividual(seed) }).tiptoeReach.gain;
  assert.equal(gainAt(48, 9), gainAt(48, 9));
  assert.equal(gainAt(36, 9), gainAt(60, 9));
  assert.notEqual(gainAt(48, 9), gainAt(48, 10));
});

test('tiptoe reach carries the ledger category', () => {
  assert.equal(getBodyValues(ledger, SAMPLE).tiptoeReach.category, entry.category);
});

test('the gain range is read from the ledger', () => {
  const edited = structuredClone(ledger);
  byId('tiptoe_gain', edited).range = [1, 3];
  const { reach, tiptoeReach } = getBodyValues(edited, { ...SAMPLE, z: { tiptoe: 0.5 } });
  close(tiptoeReach.value - reach.value, 2);
});

test('the reach SD is labelled with the ledger category of the height SD', () => {
  assert.equal(getBodyValues(ledger, SAMPLE).reach.sdCategory, byId('height_sd').category);
});

test('the zukan reference carries the height it was measured at', () => {
  const { values_by_age_years: values } = byId('reach_height_tiptoe_zukan');
  for (const months of everyMonth()) {
    const reference = getTiptoeReference(ledger, months);
    assert.equal(reference.height, values[reference.ageYears].height);
    assert.equal(reference.value, values[reference.ageYears].reach);
  }
});
