import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues } from '../src/body.js';
import { landmarkHeight, selectLayout } from '../src/room.js';
import {
  buildSceneModel, cameraPlacement, highlightedIds, objectState, reachableNow,
  STATE_CLIMBABLE, STATE_OUT, STATE_REACHABLE,
} from '../src/sceneModel.js';
import { footholdReachLevel, REACH_NONE } from '../src/scaffold.js';
import { byId, ledger, maxMonths, minMonths, roomFile, roomLayout } from './helpers.js';

const resolved = (room) => room.landmarks.map((l) => ({ ...l, height: landmarkHeight(ledger, l.heightOf) }));
const body = (months) => getBodyValues(ledger, { months, sex: 'female' });
const model = (months, room = roomLayout, boxIds) =>
  buildSceneModel({ ledger, room, landmarks: resolved(room), body: body(months), boxIds });

test('an object takes its state from which plane it is under', () => {
  const b = body(48);
  assert.equal(objectState(b, b.climb.value), STATE_CLIMBABLE);
  assert.equal(objectState(b, b.climb.value + 1), STATE_REACHABLE);
  assert.equal(objectState(b, b.reach.value), STATE_REACHABLE);
  assert.equal(objectState(b, b.reach.value + 1), STATE_OUT);
});

test('the planes follow the body values and their ledger categories', () => {
  for (const months of [minMonths, 48, maxMonths]) {
    const b = body(months);
    const [reach, climb] = model(months).planes;
    assert.equal(reach.height, b.reach.value);
    assert.equal(reach.category, b.reach.category);
    assert.equal(climb.height, b.climb.value);
    assert.equal(climb.category, b.climb.category);
  }
});

test('growing moves objects under the planes', () => {
  const stateOf = (months, id) => model(months).objects.find((o) => o.id === id).state;
  assert.equal(stateOf(minMonths, 'window'), STATE_REACHABLE);
  assert.equal(stateOf(maxMonths, 'window'), objectState(body(maxMonths), landmarkHeight(ledger, ['furniture_heights', 'window_frame'])));
  const heightsOut = (months) => model(months).objects.filter((o) => o.state === STATE_OUT).length;
  assert.ok(heightsOut(maxMonths) <= heightsOut(minMonths));
});

test('sizes come from the layout and the ledger', () => {
  const m = model(48);
  assert.equal(m.width, roomLayout.width);
  assert.equal(m.depth, roomLayout.depth);
  assert.equal(m.wallHeight, roomLayout.wall_height.value);
  assert.equal(m.childHeight, body(48).height.value);
  for (const landmark of roomLayout.landmarks) {
    const object = m.objects.find((o) => o.id === landmark.id);
    assert.equal(object.x, landmark.x);
    assert.equal(object.z, landmark.y);
    assert.equal(object.w, landmark.w);
    assert.equal(object.d, landmark.d);
    assert.equal(object.height, landmarkHeight(ledger, landmark.heightOf));
  }
});

test('the window shows its sill, pane and lock at the right heights', () => {
  const m = model(48);
  const sill = m.objects.find((o) => o.kind === 'window');
  const lock = m.objects.find((o) => o.kind === 'window_lock');
  const inner = byId('window_sill_height').values.standard_waist_window_inner;
  assert.equal(sill.bottom, 0);
  assert.equal(sill.top, sill.height);
  assert.equal(m.pane.bottom, sill.top);
  assert.equal(m.pane.top, sill.top + inner);
  assert.equal((lock.bottom + lock.top) / 2, lock.height);
  assert.ok(lock.bottom > 0);
});

test('boxes are told apart from furniture', () => {
  const box = { id: 'box-1', label: '箱', height: 30, x: 0, y: 0, w: 1, d: 1 };
  const m = buildSceneModel({
    ledger, room: roomLayout, landmarks: [...resolved(roomLayout), box], body: body(48), boxIds: new Set(['box-1']),
  });
  assert.equal(m.objects.find((o) => o.id === 'box-1').kind, 'box');
  assert.equal(m.objects.find((o) => o.id === 'sofa').kind, 'furniture');
});

test('highlighting a part of a group lights the whole group', () => {
  const sofa = selectLayout(roomFile, 'sofa_by_window');
  assert.deepEqual(highlightedIds(sofa.landmarks, 'sofa_seat'), new Set(['sofa_seat', 'sofa_back']));
  assert.deepEqual(highlightedIds(roomLayout.landmarks, 'low_shelf'), new Set(['low_shelf']));
  assert.deepEqual(highlightedIds(roomLayout.landmarks, null), new Set());
});

test('what lights up from a foothold follows the same judgement as the record', () => {
  const landmarks = resolved(roomLayout);
  const b = body(minMonths);
  const shelf = landmarks.find(({ id }) => id === 'low_shelf');
  const reached = reachableNow({ ledger, body: b, landmarks, position: { x: 0, y: 0 }, foothold: shelf });
  const expected = landmarks
    .filter((object) => object !== shelf && object.height > shelf.height)
    .filter((object) => footholdReachLevel(ledger, b, shelf, object) !== REACH_NONE)
    .map(({ id }) => id);
  assert.deepEqual([...reached], expected);
  assert.ok(reached.has('window_lock'));
  assert.ok(!reached.has('low_shelf'));
});

test('on the floor only nearby objects light up', () => {
  const landmarks = resolved(roomLayout);
  const b = body(maxMonths);
  const sofa = landmarks.find(({ id }) => id === 'sofa');
  const near = reachableNow({ ledger, body: b, landmarks, position: { x: sofa.x + 10, y: sofa.y + sofa.d + 5 }, foothold: null });
  assert.ok(near.has('sofa'));
  assert.ok(!near.has('dining_table'));
});

test('the first camera view keeps the whole room in frame at any aspect', () => {
  const room = { width: 450, depth: 360, wallHeight: 240 };
  const distance = (aspect) => {
    const { position, target } = cameraPlacement(room, aspect, 40);
    return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
  };
  assert.ok(distance(0.5) > distance(1));
  assert.equal(distance(1), distance(2));
  const { position, target } = cameraPlacement(room, 1, 40);
  assert.ok(position.y > target.y, 'from above');
  assert.ok(position.z < 0, 'from the open side of the room');
});
