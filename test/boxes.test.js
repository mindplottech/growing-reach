import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues } from '../src/body.js';
import { moveBox, placeBox } from '../src/boxes.js';
import { landmarkHeight } from '../src/room.js';
import { evaluateScaffold, reachLevel, REACH_NONE, REACH_STANDING } from '../src/scaffold.js';
import { createSimulation } from '../src/simulation.js';
import { ledger, maxMonths, minMonths, roomLayout, settings } from './helpers.js';

const furniture = roomLayout.landmarks.map((landmark) => ({
  ...landmark,
  height: landmarkHeight(ledger, landmark.heightOf),
}));
const spec = roomLayout.cardboard_box;
const lock = furniture.find((object) => object.id === 'window_lock');
const FREE_SPOT = { x: 400, y: 120 };

/** A spot on the floor beside the window lock, clear of the furniture. */
const NEAR_LOCK = { x: lock.x - spec.w, y: lock.y - spec.d };

test('a box takes its size and height from the layout and is centred on the tap', () => {
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  assert.equal(box.height, spec.height);
  assert.equal(box.x, FREE_SPOT.x - spec.w / 2);
  assert.equal(box.y, FREE_SPOT.y - spec.d / 2);
  assert.equal(box.scaffold, true);
});

test('a box at the room edge stays inside, with an approach point inside', () => {
  for (const corner of [{ x: 0, y: 0 }, { x: 9999, y: 9999 }, { x: 0, y: 9999 }, { x: 9999, y: 0 }]) {
    const box = placeBox(roomLayout, [], corner, 1);
    assert.ok(box.x >= 0 && box.x + box.w <= roomLayout.width);
    assert.ok(box.y >= 0 && box.y + box.d <= roomLayout.depth);
    assert.ok(box.approach.x >= 0 && box.approach.x <= roomLayout.width);
    assert.ok(box.approach.y >= 0 && box.approach.y <= roomLayout.depth);
  }
});

test('a box cannot overlap furniture or another box', () => {
  const [sofa] = furniture;
  assert.equal(placeBox(roomLayout, furniture, { x: sofa.x + 10, y: sofa.y + 10 }, 1), null);
  const first = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  assert.equal(placeBox(roomLayout, [...furniture, first], FREE_SPOT, 2), null);
});

test('a box near the window lets a child reach the lock they could not reach before', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female' });
  assert.equal(reachLevel(body, lock.height), REACH_NONE);
  const box = placeBox(roomLayout, furniture, { x: NEAR_LOCK.x + spec.w / 2, y: NEAR_LOCK.y + spec.d / 2 }, 1);
  assert.ok(box, 'the spot beside the lock must be free');
  const result = evaluateScaffold(ledger, body, box, [...furniture, box]);
  const lockResult = result.objects.find((object) => object.id === lock.id);
  assert.equal(lockResult.level, REACH_STANDING);
  assert.equal(lockResult.floorLevel, REACH_NONE);
});

test('a box out of range of the lock does not help', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female' });
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  const result = evaluateScaffold(ledger, body, box, [...furniture, box]);
  assert.equal(result.objects.find((object) => object.id === lock.id).level, REACH_NONE);
});

test('a child who cannot climb the box cannot use it', () => {
  const body = getBodyValues(ledger, { months: minMonths, sex: 'female', z: { climb: -10 } });
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  assert.equal(evaluateScaffold(ledger, body, box, [...furniture, box]), null);
});

const runWith = (boxes, seed = 1) => {
  const simulation = createSimulation({ ledger, settings, months: maxMonths, sex: 'male', seed, room: roomLayout, boxes });
  for (let i = 0; i < 12000; i += 1) simulation.step(0.05);
  return simulation;
};

test('the child visits a placed box and the visit carries the foothold judgement', () => {
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  const visit = runWith([box]).visits.find(({ id }) => id === box.id);
  assert.ok(visit, 'the box should be visited');
  assert.equal(visit.height, spec.height);
  assert.notEqual(visit.scaffold, null);
});

test('the same seed and the same boxes give the same record', () => {
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  assert.deepEqual(runWith([box]).visits, runWith([box]).visits);
});

test('a run without boxes is unaffected by the box feature', () => {
  const ids = (simulation) => simulation.landmarks.map(({ id }) => id);
  assert.deepEqual(ids(runWith([])), furniture.map(({ id }) => id));
});

test('moving a box follows the point, stays in the room and refuses overlaps', () => {
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  const others = [...furniture, box];
  const moved = moveBox(roomLayout, others, box, { x: FREE_SPOT.x - 20, y: FREE_SPOT.y + 20 });
  assert.equal(moved.id, box.id);
  assert.equal(moved.x, box.x - 20);
  assert.equal(moved.y, box.y + 20);
  const toCorner = moveBox(roomLayout, [box], box, { x: 9999, y: -9999 });
  assert.equal(toCorner.x + toCorner.w, roomLayout.width);
  assert.equal(toCorner.y, 0);
  const [sofa] = furniture;
  assert.equal(moveBox(roomLayout, others, box, { x: sofa.x + 10, y: sofa.y + 10 }), null);
});

test('a moved box does not collide with its old self', () => {
  const box = placeBox(roomLayout, furniture, FREE_SPOT, 1);
  assert.ok(moveBox(roomLayout, [...furniture, box], box, { x: FREE_SPOT.x + 1, y: FREE_SPOT.y }));
});
