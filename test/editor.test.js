import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFurniture, canRemove, createHistory, membersOf, moveObject, moveWindow, placeChild, removeObject,
} from '../sim/editor.js';
import { landmarkHeight } from '../sim/room.js';
import { createSimulation } from '../sim/simulation.js';
import { furnitureCatalog } from '../sim/params.js';
import { ledger, roomLayout, settings } from './helpers.js';

const catalog = furnitureCatalog;
const item = (kind) => catalog.find((entry) => entry.kind === kind);
// An empty part of the default room, wide enough for any catalogue item tested here.
const FREE = { x: 360, y: 130 };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

function assertValid(room) {
  room.landmarks.forEach((a, i) => {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= room.width && a.y + a.d <= room.depth, `${a.id} outside`);
    for (const b of room.landmarks.slice(i + 1)) assert.ok(!overlap(a, b), `${a.id} overlaps ${b.id}`);
    assert.ok(a.approach.x >= 0 && a.approach.x <= room.width && a.approach.y >= 0 && a.approach.y <= room.depth);
  });
}

test('the catalogue has the furniture asked for, with heights from the ledger', () => {
  assert.deepEqual(catalog.map(({ kind }) => kind), ['sofa', 'bed', 'chair', 'table', 'shelf', 'box']);
  for (const { parts } of catalog) {
    for (const part of parts) {
      if (part.box) continue;
      assert.ok(landmarkHeight(ledger, part.heightOf) > 0);
    }
  }
});

test('adding furniture centres it on the point and keeps the room valid', () => {
  for (const kind of ['chair', 'shelf', 'box']) {
    const room = addFurniture(roomLayout, item(kind), FREE);
    assert.ok(room, kind);
    const added = room.landmarks.at(-1);
    assert.equal(added.x + added.w / 2, FREE.x);
    assert.equal(added.y + added.d / 2, FREE.y);
    assertValid(room);
  }
});

test('a sofa comes as a seat and a back that move and go together', () => {
  const room = addFurniture({ ...roomLayout, landmarks: [] }, item('sofa'), { x: 200, y: 200 });
  const [seat, back] = room.landmarks;
  assert.equal(seat.group, back.group);
  assert.equal(seat.groupLabel, 'ソファ');
  const moved = moveObject(room, seat.id, { x: 220, y: 150 });
  const [seat2, back2] = moved.landmarks;
  assert.equal(seat2.x - seat.x, back2.x - back.x);
  assert.equal(seat2.y - seat.y, back2.y - back.y);
  assert.equal(removeObject(moved, back.id).landmarks.length, 0);
});

test('nothing can be added or moved onto something else', () => {
  const sofa = roomLayout.landmarks.find(({ id }) => id === 'sofa');
  assert.equal(addFurniture(roomLayout, item('chair'), { x: sofa.x + 20, y: sofa.y + 20 }), null);
  assert.equal(moveObject(roomLayout, 'dining_chair', { x: sofa.x + 20, y: sofa.y + 20 }), null);
});

test('things are kept inside the room when dragged past a wall', () => {
  const moved = moveObject(roomLayout, 'dining_chair', { x: 9999, y: 150 });
  const chair = moved.landmarks.find(({ id }) => id === 'dining_chair');
  assert.equal(chair.x + chair.w, roomLayout.width);
  assertValid(moved);
});

test('boxes get numbered labels and a unique id each', () => {
  const one = addFurniture(roomLayout, item('box'), FREE);
  const two = addFurniture(one, item('box'), { x: 300, y: 60 });
  const boxes = two.landmarks.filter(({ temporary }) => temporary);
  assert.deepEqual(boxes.map(({ label }) => label), ['段ボール箱1', '段ボール箱2']);
  assert.equal(new Set(boxes.map(({ id }) => id)).size, 2);
  assert.equal(boxes[0].height, roomLayout.cardboard_box.height);
});

test('the window moves with its lock along the wall and cannot be removed', () => {
  const windowFrame = roomLayout.landmarks.find(({ role }) => role === 'window');
  const lock = roomLayout.landmarks.find(({ role }) => role === 'window_lock');
  const moved = moveWindow(roomLayout, { x: 300, y: 0 });
  const frame2 = moved.landmarks.find(({ role }) => role === 'window');
  const lock2 = moved.landmarks.find(({ role }) => role === 'window_lock');
  assert.equal(frame2.x - windowFrame.x, lock2.x - lock.x);
  assert.equal(frame2.y, windowFrame.y);
  assert.deepEqual(moveObject(roomLayout, lock.id, { x: 300, y: 0 }), moved);
  assert.equal(canRemove(roomLayout, windowFrame.id), false);
  assert.equal(removeObject(roomLayout, lock.id), null);
  assert.equal(membersOf(roomLayout, lock.id).length, 2);
});

test('the child is placed on the floor but not inside furniture', () => {
  const room = placeChild(roomLayout, { x: 300, y: 120 });
  assert.deepEqual(room.start, { x: 300, y: 120 });
  const sofa = roomLayout.landmarks.find(({ id }) => id === 'sofa');
  assert.equal(placeChild(roomLayout, { x: sofa.x + 10, y: sofa.y + 10 }), null);
});

test('edits never change the room they were given', () => {
  const before = JSON.stringify(roomLayout);
  addFurniture(roomLayout, item('bed'), { x: 380, y: 150 });
  moveObject(roomLayout, 'dining_chair', { x: 100, y: 300 });
  removeObject(roomLayout, 'sofa');
  moveWindow(roomLayout, { x: 300 });
  placeChild(roomLayout, { x: 300, y: 120 });
  assert.equal(JSON.stringify(roomLayout), before);
});

test('undo steps back through every change, including a reset', () => {
  const history = createHistory(roomLayout);
  assert.equal(history.canUndo(), false);
  const added = history.push(addFurniture(roomLayout, item('chair'), FREE));
  history.push(roomLayout);
  assert.equal(history.undo(), added);
  assert.equal(history.undo(), roomLayout);
  assert.equal(history.undo(), roomLayout);
});

test('an edited room runs in the simulation, and new furniture can be a foothold', () => {
  const room = addFurniture(roomLayout, item('table'), { x: 380, y: 120 });
  const simulation = createSimulation({ ledger, settings: { ...settings, climb_probability: 1 }, months: 60, sex: 'male', seed: 1, room });
  simulation.step(settings.trial_seconds);
  assert.ok(simulation.events.some(({ kind, footholdId }) => kind === 'climbed' && footholdId?.startsWith('table-')));
});
