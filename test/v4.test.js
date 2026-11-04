import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues, standingReachFor } from '../sim/body.js';
import { ledger } from './helpers.js';

// Values written out from ledger v4 and v5, so a change to the ledger shows up here.
const at = (months) => getBodyValues(ledger, { months, sex: 'female' });
const rounded = (value) => Number(value.toFixed(1));

test('ledger v5: the climb height is 60.6 cm at 36 months and 74.3 cm at 47 months', () => {
  assert.equal(String(ledger._meta.version), '5');
  assert.equal(rounded(at(36).climb.value), 60.6);
  assert.equal(rounded(at(47).climb.value), 74.3);
});

test('ledger v4: the standing reach for a height of 97 cm is 120.0 cm', () => {
  assert.equal(rounded(standingReachFor(ledger, 97)), 120.0);
});

test('ledger v4: the climb height categories stay as the ledger gives them', () => {
  assert.equal(at(45).climb.category, 'formula');
  assert.equal(at(47).climb.category, 'provisional');
  assert.equal(at(48).climb.category, 'converted');
  assert.equal(at(60).climb.category, 'provisional');
});

test('ledger v5: the range starts at 15 months, where the climb height is 39.9 cm', () => {
  assert.deepEqual(ledger._meta.age_range_months, [15, 60]);
  assert.equal(rounded(at(15).climb.value), 39.9);
  assert.equal(at(15).climb.category, 'formula');
});

test('ledger v5: the median 1-year-old girl is 75.3 cm and reaches 85.5 cm standing', () => {
  assert.equal(rounded(at(15).height.value), 75.3);
  assert.equal(rounded(at(15).reach.value), 85.5);
  assert.equal(rounded(getBodyValues(ledger, { months: 21, sex: 'male' }).reach.value), 96.3);
});

test('ledger v5: the walk speed is 0.82 m/s with SD 0.14 at 15 months and 0.99 with SD 0.11 at 36', () => {
  assert.equal(rounded(at(15).walkSpeed.value), 0.8);
  assert.equal(at(15).walkSpeed.sd, 0.14);
  assert.equal(at(15).walkSpeed.category, 'converted');
  assert.equal(at(29).walkSpeed.category, 'measured');
  assert.equal(at(36).walkSpeed.value, 0.99);
  assert.equal(at(36).walkSpeed.sd, 0.11);
});
