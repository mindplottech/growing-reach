import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../src/events.js';
import { findCountermeasure, moveAwayFromLock, runTrials, searchMoves } from '../src/trials.js';
import { ledger, maxMonths, minMonths, roomLayout, settings } from './helpers.js';

const BASE = { ledger, settings, room: roomLayout, boxes: [], months: minMonths, sex: 'female' };
const lockCount = (result) => result.counts[EVENT.REACHED_LOCK];
const shelf = { id: 'low_shelf', label: '低い棚' };

test('the reported distance and counts are exactly what a rerun gives', () => {
  for (const months of [minMonths, maxMonths]) {
    const base = { ...BASE, months };
    const { baselineLock, baselineChildren, target } = findCountermeasure(base);
    const baseline = runTrials(base);
    assert.equal(baselineLock, lockCount(baseline));
    assert.equal(baselineChildren, baseline.children[EVENT.REACHED_LOCK]);
    for (const { distance, lock, children } of target.tried) {
      const rerun = runTrials({ ...base, ...moveAwayFromLock(base, target.id, distance) });
      assert.equal(lockCount(rerun), lock);
      assert.equal(rerun.children[EVENT.REACHED_LOCK], children);
    }
  }
});

test('a reported distance is the first tried with no lock reaches, and nothing is reported otherwise', () => {
  for (const months of [minMonths, maxMonths]) {
    const { target } = findCountermeasure({ ...BASE, months });
    const firstZero = target.tried.find(({ lock }) => lock === 0);
    assert.equal(target.found, firstZero ? firstZero.distance : null);
    assert.ok(target.tried.slice(0, -1).every(({ lock }) => lock > 0));
  }
});

test('the search uses the step and limit from the settings', () => {
  const usedSettings = [settings, { ...settings, countermeasure_step_cm: 7, countermeasure_limit_cm: 20 }];
  for (const used of usedSettings) {
    const { countermeasure_step_cm: step, countermeasure_limit_cm: limit } = used;
    const { tried } = searchMoves({ ...BASE, settings: used }, shelf, 1);
    assert.ok(tried.length > 0);
    for (const { distance } of tried) {
      assert.equal(distance % step, 0, `${distance} is not a multiple of ${step}`);
      assert.ok(distance <= limit, `${distance} is over ${limit}`);
    }
  }
});

test('when children reach the lock from the floor, zero is not reported', () => {
  const { baseline, target } = findCountermeasure({ ...BASE, months: maxMonths });
  if (baseline.lockFromFloor === 0) return;
  for (const { lockFromFloor, lock } of target.tried) {
    assert.ok(lock >= lockFromFloor);
    if (lockFromFloor > 0) assert.ok(lock > 0);
  }
});

test('the target is the top foothold for the lock, and the overall top is reported separately', () => {
  for (const months of [minMonths, maxMonths]) {
    const { baseline, mostUsed, target } = findCountermeasure({ ...BASE, months });
    assert.equal(target.id, baseline.lockFootholds[0].id);
    assert.deepEqual(mostUsed, baseline.footholds[0]);
  }
});

test('with no lock foothold the target falls back to the most used foothold', () => {
  const room = { ...roomLayout, landmarks: roomLayout.landmarks.filter(({ id }) => id !== 'low_shelf') };
  const { baseline, target } = findCountermeasure({ ...BASE, room });
  assert.equal(baseline.lockFootholds.length, 0);
  assert.equal(target.id, baseline.footholds[0].id);
});

test('positions that do not fit are skipped, not reported as results', () => {
  const small = { ...settings, countermeasure_step_cm: 10000, countermeasure_limit_cm: 10000 };
  const { tried, last, found } = searchMoves({ ...BASE, settings: small }, shelf, 1);
  assert.deepEqual(tried, []);
  assert.equal(last, null);
  assert.equal(found, null);
});
