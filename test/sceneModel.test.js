import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues } from '../sim/body.js';
import { landmarkHeight, selectLayout } from '../sim/room.js';
import {
  buildSceneModel, cameraPlacement, displayOnlyHeights, facingToward, framePoints, highlightedIds, objectState, projectPoint, reachableNow,
  STATE_CLIMBABLE, STATE_OUT, STATE_REACHABLE,
} from '../render/sceneModel.js';
import { footholdReachLevel, REACH_NONE } from '../sim/scaffold.js';
import { byId, ledger, maxMonths, scenarioMonths, roomFile, roomLayout } from './helpers.js';

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
  for (const months of [scenarioMonths, 48, maxMonths]) {
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
  assert.equal(stateOf(scenarioMonths, 'window'), STATE_REACHABLE);
  assert.equal(stateOf(maxMonths, 'window'), objectState(body(maxMonths), landmarkHeight(ledger, ['furniture_heights', 'window_frame'])));
  const heightsOut = (months) => model(months).objects.filter((o) => o.state === STATE_OUT).length;
  assert.ok(heightsOut(maxMonths) <= heightsOut(scenarioMonths));
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
  const b = body(scenarioMonths);
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

// The canvas at 1280x800: the window minus the toolbar and the results panel.
const CANVAS_ASPECT = 872 / 740;

test('the first camera fills about 80% of the width, with everything drawn in frame', (t) => {
  const m = model(48);
  for (const aspect of [CANVAS_ASPECT, 1.6, 0.9]) {
    const camera = cameraPlacement(m, aspect, 40);
    assert.ok(camera.position.y > camera.target.y, 'from above');
    assert.ok(camera.position.z < 0, 'from the open side of the room');
    const points = framePoints(m);
    for (const o of m.objects) {
      assert.ok(points.some(({ x, y, z }) => x === o.x + o.w && z === o.z + o.d && y === o.visualTop), `${o.id} is framed`);
    }
    const corners = points.map((point) => projectPoint(point, camera, aspect, 40));
    const xs = corners.map(({ x }) => x);
    const ys = corners.map(({ y }) => y);
    const share = (Math.max(...xs) - Math.min(...xs)) / 2;
    t.diagnostic(`aspect ${aspect.toFixed(2)}: width share ${share.toFixed(3)}, y ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)}`);
    assert.ok(share <= 0.8 + 1e-6 && Math.max(...ys) <= 0.7 + 1e-6 && Math.min(...ys) >= -0.9 - 1e-6, 'inside the frame');
    if (aspect === CANVAS_ASPECT) assert.ok(share > 0.75, 'close enough to fill the width');
    assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2) < 0.02, 'centred left to right');
  }
});

test('each piece is drawn by the shape of the ledger height it points to', () => {
  const shapes = Object.fromEntries(model(48).objects.map(({ id, shape }) => [id, shape]));
  assert.deepEqual(shapes, {
    sofa: 'sofa', low_table: 'low_table', low_shelf: 'shelf', dining_chair: 'chair',
    dining_table: 'table', window: 'window', window_lock: 'window_lock',
  });
});

test('display-only parts take ledger heights and never change the heights the simulation uses', () => {
  const m = model(48);
  const heights = displayOnlyHeights(ledger);
  const { dining_chair_back: back, sofa_armrest: arm, sofa_back: sofaBack } = byId('furniture_heights').values;
  assert.equal(heights.chairBack, (back.values[0] + back.values[1]) / 2);
  assert.equal(heights.sofaArm, (arm.min + arm.max) / 2);
  assert.equal(heights.sofaBack, sofaBack.median);
  const find = (id) => m.objects.find((o) => o.id === id);
  assert.equal(find('dining_chair').look.back, heights.chairBack);
  assert.equal(find('dining_chair').top, landmarkHeight(ledger, ['furniture_heights', 'dining_chair_seat']));
  assert.deepEqual(find('sofa').look, { arm: heights.sofaArm, back: heights.sofaBack });
  assert.equal(find('sofa').top, landmarkHeight(ledger, ['furniture_heights', 'sofa_seat']));
  // Where the layout has its own sofa back, the seat draws no second one.
  const byWindow = selectLayout(roomFile, 'sofa_by_window');
  const seat = model(48, byWindow).objects.find((o) => o.id === 'sofa_seat');
  assert.deepEqual(seat.look, { arm: heights.sofaArm });
});

test('a chair turns its back on the table; a shelf opens toward where the child comes from', () => {
  const m = model(48);
  const chair = m.objects.find((o) => o.id === 'dining_chair');
  const table = m.objects.find((o) => o.id === 'dining_table');
  assert.equal(Math.sign(table.x - chair.x), chair.facing.x);
  const shelf = roomLayout.landmarks.find(({ id }) => id === 'low_shelf');
  assert.deepEqual(facingToward(shelf, shelf.approach), m.objects.find((o) => o.id === 'low_shelf').facing);
});
