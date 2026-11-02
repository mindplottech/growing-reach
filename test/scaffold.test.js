import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues } from '../src/body.js';
import { landmarkHeight } from '../src/room.js';
import {
  evaluateScaffold, footprintDistance, reachLevel, REACH_NONE, REACH_STANDING, REACH_TIPTOE,
} from '../src/scaffold.js';
import { createSimulation } from '../src/simulation.js';
import { close, ledger, maxMonths, minMonths, roomLayout } from './helpers.js';

const objects = roomLayout.landmarks.map((landmark) => ({
  ...landmark,
  height: landmarkHeight(ledger, landmark.heightOf),
}));
const find = (id) => objects.find((object) => object.id === id);
const range = roomLayout.nearby_range.value;
const shelf = find('low_shelf');
const lock = find('window_lock');

function lockResult(body) {
  const result = evaluateScaffold(body, shelf, objects, range);
  return result.objects.find((object) => object.id === lock.id);
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

test('standing and tiptoe reach are told apart, on the floor and on a foothold', () => {
  const body = getBodyValues(ledger, { months: 48, sex: 'male' });
  const gap = body.tiptoeReach.gain / 2;
  for (const standOn of [0, shelf.height]) {
    const standingLimit = standOn + body.reach.value;
    assert.equal(reachLevel(body, standingLimit, standOn), REACH_STANDING);
    assert.equal(reachLevel(body, standingLimit + gap, standOn), REACH_TIPTOE);
    assert.equal(reachLevel(body, standOn + body.tiptoeReach.value, standOn), REACH_TIPTOE);
    assert.equal(reachLevel(body, standOn + body.tiptoeReach.value + gap, standOn), REACH_NONE);
  }
});

test('reach on a foothold is the foothold height plus the standing reach', () => {
  const body = getBodyValues(ledger, { months: 48, sex: 'male' });
  const limit = shelf.height + body.reach.value;
  const near = { ...lock, id: 'near', height: limit };
  const above = { ...lock, id: 'above', height: limit + body.tiptoeReach.gain };
  const { objects: judged } = evaluateScaffold(body, shelf, [near, above], range);
  assert.equal(judged[0].level, REACH_STANDING);
  assert.equal(judged[1].level, REACH_TIPTOE);
});

test('a child who cannot climb it has no foothold', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'male' });
  const tooHigh = { ...shelf, height: body.climb.value + 1 };
  assert.equal(evaluateScaffold(body, tooHigh, objects, range), null);
});

test('objects not marked as footholds never serve as one', () => {
  const body = getBodyValues(ledger, { months: maxMonths, sex: 'male', z: { climb: 3 } });
  const windowFrame = find('window');
  assert.ok(body.climb.value > windowFrame.height);
  assert.equal(evaluateScaffold(body, windowFrame, objects, range), null);
});

test('only objects within the range and above the foothold are judged', () => {
  const body = getBodyValues(ledger, { months: maxMonths, sex: 'male' });
  const { objects: judged } = evaluateScaffold(body, shelf, objects, range);
  for (const { id } of judged) {
    assert.ok(footprintDistance(shelf, find(id)) <= range);
    assert.ok(find(id).height > shelf.height);
  }
  assert.ok(judged.some(({ id }) => id === lock.id));
  assert.ok(!judged.some(({ id }) => id === find('sofa').id));
  assert.deepEqual(evaluateScaffold(body, shelf, objects, 0).objects, []);
});

test('footprint distance is 0 when touching and straight-line across a corner', () => {
  const a = { x: 0, y: 0, w: 10, d: 10 };
  assert.equal(footprintDistance(a, { x: 10, y: 0, w: 5, d: 5 }), 0);
  assert.equal(footprintDistance(a, { x: 5, y: 5, w: 20, d: 20 }), 0);
  close(footprintDistance(a, { x: 13, y: 14, w: 5, d: 5 }), 5);
});

test('every visit records its foothold result, and the record is reproducible', () => {
  const run = (seed) => {
    const simulation = createSimulation({ ledger, months: minMonths, sex: 'female', seed, room: roomLayout });
    for (let i = 0; i < 12000; i += 1) simulation.step(0.05);
    return simulation;
  };
  const simulation = run(1);
  assert.deepEqual(simulation.visits, run(1).visits);
  for (const visit of simulation.visits) {
    const object = find(visit.id);
    assert.deepEqual(visit.scaffold, evaluateScaffold(simulation.body, object, objects, range));
    assert.equal(visit.reachLevel, reachLevel(simulation.body, object.height));
  }
  const shelfVisit = simulation.visits.find((visit) => visit.id === shelf.id);
  assert.ok(shelfVisit.scaffold.objects.some(({ id }) => id === lock.id));
});
