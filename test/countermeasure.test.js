import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../src/events.js';
import { findCountermeasure, moveAwayFromLock, runTrials, searchMoves } from '../src/trials.js';
import { ledger, maxMonths, minMonths, roomLayout, settings } from './helpers.js';

const BASE = { ledger, settings, room: roomLayout, boxes: [], months: minMonths, sex: 'female' };
const lockCount = (result) => result.counts[EVENT.REACHED_LOCK];
const shelf = { id: 'low_shelf', label: '低い棚' };

test('the reported distance and counts are exactly what a rerun gives', () => {
  const { baselineLock, mostUsed } = findCountermeasure(BASE);
  assert.equal(baselineLock, lockCount(runTrials(BASE)));
  assert.notEqual(mostUsed.found, null);
  const moved = moveAwayFromLock(BASE, mostUsed.id, mostUsed.found);
  assert.equal(lockCount(runTrials({ ...BASE, ...moved })), 0);
  for (const { distance, lock } of mostUsed.tried) {
    const rerun = moveAwayFromLock(BASE, mostUsed.id, distance);
    assert.equal(lockCount(runTrials({ ...BASE, ...rerun })), lock);
  }
});

test('the found distance is the smallest one tried that reaches zero', () => {
  const { mostUsed } = findCountermeasure(BASE);
  const zeros = mostUsed.tried.filter(({ lock }) => lock === 0);
  assert.equal(zeros.length, 1);
  assert.equal(zeros[0].distance, mostUsed.found);
  assert.ok(mostUsed.tried.slice(0, -1).every(({ lock }) => lock > 0));
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
  const base = { ...BASE, months: maxMonths };
  const { mostUsed, forLock } = findCountermeasure(base);
  for (const search of [mostUsed, forLock].filter(Boolean)) {
    assert.equal(search.found, null);
    assert.ok(search.last.lock > 0);
    assert.ok(search.last.lockFromFloor > 0);
  }
});

test('the object most used for the lock is searched too when it is not the most used overall', () => {
  const { baseline, mostUsed, forLock } = findCountermeasure({ ...BASE, months: maxMonths });
  assert.equal(mostUsed.id, baseline.footholds[0].id);
  assert.notEqual(baseline.lockFootholds[0].id, mostUsed.id);
  assert.equal(forLock.id, baseline.lockFootholds[0].id);
});

test('positions that do not fit are skipped, not reported as results', () => {
  const small = { ...settings, countermeasure_step_cm: 10000, countermeasure_limit_cm: 10000 };
  const { tried, last, found } = searchMoves({ ...BASE, settings: small }, shelf, 1);
  assert.deepEqual(tried, []);
  assert.equal(last, null);
  assert.equal(found, null);
});
