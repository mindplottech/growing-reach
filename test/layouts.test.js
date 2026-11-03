import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import { landmarkHeight, selectLayout } from '../sim/room.js';
import { footprintDistance } from '../sim/scaffold.js';
import { createSimulation } from '../sim/simulation.js';
import { byId, ledger, maxMonths, roomFile, settings } from './helpers.js';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

test('layouts are named and selected by id, with shared settings', () => {
  for (const { id, name } of roomFile.layouts) {
    const room = selectLayout(roomFile, id);
    assert.equal(room.name, name);
    assert.equal(room.width, roomFile.width);
    assert.equal(room.neighbor_gap, roomFile.neighbor_gap);
  }
  assert.throws(() => selectLayout(roomFile, 'missing'), /layout not found/);
});

test('every layout fits in the room, nothing overlaps, and it has a window and a lock', () => {
  for (const { id } of roomFile.layouts) {
    const room = selectLayout(roomFile, id);
    room.landmarks.forEach((a, i) => {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= room.width && a.y + a.d <= room.depth, a.id);
      assert.ok(landmarkHeight(ledger, a.heightOf) > 0, a.id);
      for (const b of room.landmarks.slice(i + 1)) assert.ok(!overlap(a, b), `${a.id} ${b.id}`);
    });
    assert.ok(room.landmarks.some(({ role }) => role === 'window'));
    assert.ok(room.landmarks.some(({ role }) => role === 'window_lock'));
  }
});

test('in the sofa layout the back uses the ledger median and stands at the window', () => {
  const room = selectLayout(roomFile, 'sofa_by_window');
  const back = room.landmarks.find(({ id }) => id === 'sofa_back');
  const windowFrame = room.landmarks.find(({ role }) => role === 'window');
  assert.equal(landmarkHeight(ledger, back.heightOf), byId('furniture_heights').values.sofa_back.median);
  assert.ok(footprintDistance(back, windowFrame) <= room.window_side_gap.value);
});

test('the sofa layout makes standing at the window possible', () => {
  const room = selectLayout(roomFile, 'sofa_by_window');
  const climber = { ...settings, climb_probability: 1, chain_probability: 1, climb_failure_k: 0 };
  const simulation = createSimulation({ ledger, settings: climber, months: maxMonths, sex: 'female', seed: 1, room });
  simulation.step(settings.trial_seconds);
  assert.ok(simulation.events.some(({ kind }) => kind === EVENT.STOOD_AT_WINDOW));
});
