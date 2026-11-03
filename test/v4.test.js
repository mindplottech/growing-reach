import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues, standingReachFor } from '../sim/body.js';
import { ledger } from './helpers.js';

// Values written out from ledger v4, so a change to the ledger shows up here.
const at = (months) => getBodyValues(ledger, { months, sex: 'female' });
const rounded = (value) => Number(value.toFixed(1));

test('ledger v4: the climb height is 60.6 cm at 36 months and 74.3 cm at 47 months', () => {
  assert.equal(String(ledger._meta.version), '4');
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
