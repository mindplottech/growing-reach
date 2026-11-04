import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import { compareTrials, moveAwayFromLock, runTrials } from '../sim/trials.js';
import { footprintDistance } from '../sim/scaffold.js';
import { ledger, maxMonths, scenarioMonths, roomFile, roomLayout, settings } from './helpers.js';
import { selectLayout } from '../sim/room.js';

const BASE = { ledger, settings, room: roomLayout, months: scenarioMonths, sex: 'female' };
const SHELF = 'low_shelf';
const MOVE_CM = 60;
const lock = roomLayout.landmarks.find(({ role }) => role === 'window_lock');
const shelfOf = (room) => room.landmarks.find(({ id }) => id === SHELF);

test('the same settings give the same totals', () => {
  assert.deepEqual(runTrials(BASE), runTrials(BASE));
});

test('there is one trial per seed, from 1 to the set count', () => {
  const { perSeed } = runTrials(BASE);
  assert.deepEqual(perSeed.map(({ seed }) => seed), Array.from({ length: settings.trial_count }, (_, i) => i + 1));
});

test('totals are the sum of the children, and the ranking is sorted', () => {
  const result = runTrials(BASE);
  for (const kind of Object.values(EVENT)) {
    assert.equal(result.perSeed.reduce((sum, { counts }) => sum + counts[kind], 0), result.counts[kind]);
  }
  const counts = result.footholds.map(({ count }) => count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(counts.reduce((a, b) => a + b, 0), result.counts[EVENT.CLIMBED]);
  assert.equal(
    result.lockFromFloor + result.lockFootholds.reduce((sum, { count }) => sum + count, 0),
    result.counts[EVENT.REACHED_LOCK],
  );
});

test('moving a foothold keeps it in the room and takes it further from the lock', () => {
  const moved = moveAwayFromLock({ room: roomLayout }, SHELF, MOVE_CM);
  assert.ok(footprintDistance(shelfOf(moved.room), lock) > footprintDistance(shelfOf(roomLayout), lock));
  assert.equal(moveAwayFromLock({ room: roomLayout }, SHELF, 10000), null);
  assert.ok(shelfOf(roomLayout).x !== shelfOf(moved.room).x, 'the original layout is not changed');
});

for (const months of [scenarioMonths, maxMonths]) {
  test(`at ${months} months, moving the foothold from the window does not raise lock reaches from footholds`, () => {
    const before = runTrials({ ...BASE, months });
    const moved = moveAwayFromLock({ room: roomLayout }, SHELF, MOVE_CM);
    const after = runTrials({ ...BASE, months, room: moved.room });
    const fromFootholds = ({ lockFootholds }) => lockFootholds.reduce((sum, { count }) => sum + count, 0);
    assert.ok(fromFootholds(after) <= fromFootholds(before));
    assert.ok(fromFootholds(before) > 0);
  });
}

test('at 36 months, moving it does not raise the lock count overall', () => {
  const key = EVENT.REACHED_LOCK;
  const moved = moveAwayFromLock({ room: roomLayout }, SHELF, MOVE_CM);
  assert.ok(runTrials({ ...BASE, room: moved.room }).counts[key] <= runTrials(BASE).counts[key]);
});

test('children counts the seeds where the event happened at least once', () => {
  const result = runTrials(BASE);
  for (const kind of Object.values(EVENT)) {
    const expected = result.perSeed.filter(({ counts }) => counts[kind] > 0).length;
    assert.equal(result.children[kind], expected);
    assert.ok(result.children[kind] <= settings.trial_count);
    assert.ok(result.children[kind] <= result.counts[kind]);
  }
});

test('comparison is paired by child and adds up', () => {
  const before = runTrials(BASE);
  const after = runTrials({ ...BASE, months: maxMonths });
  for (const row of compareTrials(before, after)) {
    assert.equal(row.childrenBefore, before.children[row.kind]);
    assert.equal(row.childrenAfter, after.children[row.kind]);
    assert.equal(row.before, before.counts[row.kind]);
    assert.equal(row.after, after.counts[row.kind]);
    assert.equal(row.diff, row.after - row.before);
    assert.ok(row.childrenUp + row.childrenDown <= settings.trial_count);
  }
  const shifted = { ...after, perSeed: [...after.perSeed].reverse() };
  assert.throws(() => compareTrials(before, shifted), /not paired/);
});

test('a sofa moves as one piece, keeping its seat and back together', () => {
  const room = selectLayout(roomFile, 'sofa_by_window');
  const part = (r, id) => r.landmarks.find((l) => l.id === id);
  const moved = moveAwayFromLock({ room }, 'sofa_back', 20).room;
  assert.equal(part(moved, 'sofa_seat').x - part(room, 'sofa_seat').x, part(moved, 'sofa_back').x - part(room, 'sofa_back').x);
  assert.equal(part(moved, 'sofa_seat').y - part(room, 'sofa_seat').y, part(moved, 'sofa_back').y - part(room, 'sofa_back').y);
  assert.notEqual(part(moved, 'sofa_seat').x, part(room, 'sofa_seat').x);
});
