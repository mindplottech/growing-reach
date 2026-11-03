import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues } from '../sim/body.js';
import { landmarkHeight } from '../sim/room.js';
import {
  evaluateScaffold, footholdReachLevel, footprintDistance, horizontalReach, isBetterReach,
  reachLevel, REACH_NONE, REACH_STANDING, REACH_TIPTOE,
} from '../sim/scaffold.js';
import { byId, close, ledger, maxMonths, minMonths, roomLayout } from './helpers.js';

const objects = roomLayout.landmarks.map((landmark) => ({
  ...landmark,
  height: landmarkHeight(ledger, landmark.heightOf),
}));
const find = (id) => objects.find((object) => object.id === id);
const shelf = find('low_shelf');
const lock = find('window_lock');

/** The horizontal limit written in the ledger's formula, for building test cases. */
const [, formulaBase, formulaSlope, formulaLimit] =
  /min\(([\d.]+) \+ \(reach - surface_height\) \* ([\d.]+), ([\d.]+)\)/.exec(byId('reach_horizontal_on_surface').formula).map(Number);

function lockResult(body) {
  return evaluateScaffold(ledger, body, shelf, objects).objects.find(({ id }) => id === lock.id);
}

test('at the youngest age a foothold decides whether the window lock is reached', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female' });
  assert.equal(reachLevel(body, lock.height), REACH_NONE);
  assert.equal(lockResult(body).level, REACH_STANDING);
  assert.equal(lockResult(body).floorLevel, REACH_NONE);
});

test('at the oldest age a foothold decides it too, for a child with the smallest tiptoe gain', () => {
  const body = getBodyValues(ledger, { months: maxMonths, sex: 'female', z: { tiptoe: 0 } });
  assert.equal(reachLevel(body, lock.height), REACH_NONE);
  assert.equal(lockResult(body).level, REACH_STANDING);
});

test('horizontal reach follows the ledger formula and its limit', () => {
  close(horizontalReach(ledger, 100, 100), formulaBase);
  close(horizontalReach(ledger, 110, 100), formulaBase + 10 * formulaSlope);
  assert.equal(horizontalReach(ledger, 10000, 100), formulaLimit);
});

test('the horizontal formula is read from the ledger and fails loudly if changed', () => {
  const edited = structuredClone(ledger);
  byId('reach_horizontal_on_surface', edited).formula = 'min(1 + (reach - surface_height) * 2, 3)';
  assert.equal(horizontalReach(edited, 100, 100), 1);
  assert.equal(horizontalReach(edited, 200, 100), 3);
  byId('reach_horizontal_on_surface', edited).formula = 'reach * 2';
  assert.throws(() => horizontalReach(edited, 100, 100), /unexpected horizontal reach formula/);
});

test('a foothold further away than the horizontal reach does not reach the object', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female' });
  const place = (distance) => ({ ...shelf, x: lock.x - shelf.w - distance, y: lock.y });
  const limit = (reachValue) => horizontalReach(ledger, shelf.height + reachValue, lock.height);
  const standingLimit = limit(body.reach.value);
  const tiptoeLimit = limit(body.tiptoeReach.value);
  assert.ok(tiptoeLimit > standingLimit);
  assert.equal(footholdReachLevel(ledger, body, place(standingLimit), lock), REACH_STANDING);
  assert.equal(footholdReachLevel(ledger, body, place((standingLimit + tiptoeLimit) / 2), lock), REACH_TIPTOE);
  assert.equal(footholdReachLevel(ledger, body, place(tiptoeLimit + 1), lock), REACH_NONE);
});

test('standing and tiptoe reach are told apart on height, on the floor and on a foothold', () => {
  const body = getBodyValues(ledger, { months: 48, sex: 'male' });
  const gap = body.tiptoeReach.gain / 2;
  for (const standOn of [0, shelf.height]) {
    const standingLimit = standOn + body.reach.value;
    assert.equal(reachLevel(body, standingLimit, standOn), REACH_STANDING);
    assert.equal(reachLevel(body, standingLimit + gap, standOn), REACH_TIPTOE);
    assert.equal(reachLevel(body, standOn + body.tiptoeReach.value + gap, standOn), REACH_NONE);
  }
});

test('a higher object beyond tiptoe reach is not reached even when touching the foothold', () => {
  const body = getBodyValues(ledger, { months: 48, sex: 'male' });
  const beyond = { ...lock, height: shelf.height + body.tiptoeReach.value + 1, x: shelf.x, y: shelf.y };
  assert.equal(footholdReachLevel(ledger, body, shelf, beyond), REACH_NONE);
});

test('a child who cannot climb it has no foothold', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'male' });
  const tooHigh = { ...shelf, height: body.climb.value + 1 };
  assert.equal(evaluateScaffold(ledger, body, tooHigh, objects), null);
});

test('objects not marked as footholds never serve as one', () => {
  const body = getBodyValues(ledger, { months: maxMonths, sex: 'male', z: { climb: 3 } });
  const windowFrame = find('window');
  assert.ok(body.climb.value > windowFrame.height);
  assert.equal(evaluateScaffold(ledger, body, windowFrame, objects), null);
});

test('only objects above the foothold are judged', () => {
  const body = getBodyValues(ledger, { months: maxMonths, sex: 'male' });
  for (const { id } of evaluateScaffold(ledger, body, shelf, objects).objects) {
    assert.ok(find(id).height > shelf.height);
  }
});

test('a far foothold reaches nothing', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female' });
  const sofa = find('sofa');
  const result = evaluateScaffold(ledger, body, sofa, objects);
  assert.equal(result.objects.find(({ id }) => id === lock.id).level, REACH_NONE);
});

test('footprint distance is 0 when touching and straight-line across a corner', () => {
  const a = { x: 0, y: 0, w: 10, d: 10 };
  assert.equal(footprintDistance(a, { x: 10, y: 0, w: 5, d: 5 }), 0);
  assert.equal(footprintDistance(a, { x: 5, y: 5, w: 20, d: 20 }), 0);
  close(footprintDistance(a, { x: 13, y: 14, w: 5, d: 5 }), 5);
});

test('reach levels are ranked standing over tiptoe over none', () => {
  assert.ok(isBetterReach(REACH_STANDING, REACH_TIPTOE));
  assert.ok(isBetterReach(REACH_TIPTOE, REACH_NONE));
  assert.ok(!isBetterReach(REACH_NONE, REACH_NONE));
});
