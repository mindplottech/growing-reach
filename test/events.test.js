import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodyValues, drawIndividual } from '../src/body.js';
import { EVENT, EVENT_LABELS } from '../src/events.js';
import { landmarkHeight } from '../src/room.js';
import { footholdReachLevel, reachLevel, REACH_NONE, REACH_STANDING, REACH_TIPTOE } from '../src/scaffold.js';
import { createSimulation } from '../src/simulation.js';
import { byId, ledger, roomLayout, settings } from './helpers.js';

const CLIMBER = { ...settings, climb_probability: 1, chain_probability: 0, climb_failure_k: 0 };
const steady = structuredClone(ledger);
byId('fall_rates', steady).values = { balancePerSec: 0, tripPerStep: 0 };

function run({ seed = 1, months = 36, sex = 'female', usedLedger = steady, used = CLIMBER, room = roomLayout, boxes = [] } = {}) {
  const simulation = createSimulation({ ledger: usedLedger, settings: used, months, sex, seed, room, boxes });
  simulation.step(1800);
  return simulation;
}
const byLandmark = (sim) => new Map(sim.landmarks.map((l) => [l.id, l]));
const of = (sim, kind) => sim.events.filter((event) => event.kind === kind);
const leanHeight = Number(/(\d+)cm以上/.exec(byId('window_lean_foothold').rule)[1]);
const windowFrame = roomLayout.landmarks.find((l) => l.role === 'window');
const lock = roomLayout.landmarks.find((l) => l.role === 'window_lock');
const onlyWindow = { ...roomLayout, landmarks: roomLayout.landmarks.filter((l) => l.role) };

function windowBox(height, gap) {
  const { x } = windowFrame;
  const y = windowFrame.y - gap - 30;
  return { id: 'box', label: 'box', height, scaffold: true, x, y, w: 40, d: 30, approach: { x: x + 20, y: y - 20 } };
}

test('every event records the time, the child and its kind', () => {
  const simulation = run({ usedLedger: ledger, used: settings, seed: 3, months: 50, sex: 'male' });
  assert.ok(simulation.events.length > 0);
  const known = new Set(Object.values(EVENT));
  for (const event of simulation.events) {
    assert.equal(event.seed, 3);
    assert.equal(event.months, 50);
    assert.equal(event.sex, 'male');
    assert.ok(known.has(event.kind));
    assert.ok(EVENT_LABELS[event.kind]);
    assert.ok(event.time >= 0 && event.time <= simulation.time);
  }
});

test('a child who climbs the shelf records the foothold and how the lock was reached', () => {
  const simulation = run();
  const objects = byLandmark(simulation);
  const reached = of(simulation, EVENT.REACHED_LOCK).filter((event) => event.footholdId);
  assert.ok(reached.length > 0);
  for (const event of reached) {
    const expected = footholdReachLevel(steady, simulation.body, objects.get(event.footholdId), objects.get(event.targetId));
    assert.equal(event.level, expected);
    assert.notEqual(event.level, REACH_NONE);
    assert.equal(event.targetId, lock.id);
  }
});

test('a tiptoe-only reach from a foothold is recorded as tiptoe', () => {
  const body = getBodyValues(steady, { months: 36, sex: 'female', z: drawIndividual(1) });
  const lockHeight = landmarkHeight(steady, lock.heightOf);
  const footing = lockHeight - (body.reach.value + body.tiptoeReach.gain / 2);
  const box = {
    id: 'box', label: 'box', height: footing, scaffold: true, x: lock.x, y: lock.y - 30, w: 16, d: 30, approach: { x: lock.x, y: lock.y - 50 },
  };
  const simulation = run({ room: onlyWindow, boxes: [box] });
  const levels = of(simulation, EVENT.REACHED_LOCK).filter((e) => e.footholdId === 'box').map((e) => e.level);
  assert.ok(levels.length > 0);
  assert.ok(levels.every((level) => level === REACH_TIPTOE));
});

test('reaching the lock from the floor is recorded with no foothold', () => {
  const simulation = run({ months: 60, used: { ...CLIMBER, climb_probability: 0 } });
  const lockHeight = landmarkHeight(steady, lock.heightOf);
  assert.equal(reachLevel(simulation.body, lockHeight), REACH_STANDING);
  const reached = of(simulation, EVENT.REACHED_LOCK);
  assert.ok(reached.length > 0);
  for (const event of reached) {
    assert.equal(event.footholdId, null);
    assert.equal(event.level, REACH_STANDING);
  }
});

test('touching something high means it was out of standing reach from the floor', () => {
  const simulation = run();
  const objects = byLandmark(simulation);
  for (const event of of(simulation, EVENT.TOUCHED_HIGH)) {
    assert.notEqual(reachLevel(simulation.body, objects.get(event.targetId).height), REACH_STANDING);
    assert.ok(event.footholdId);
  }
});

test('standing at the window takes the ledger height and the layout gap', () => {
  const gap = roomLayout.window_side_gap.value;
  const count = (height, distance) =>
    of(run({ months: 60, room: onlyWindow, boxes: [windowBox(height, distance)] }), EVENT.STOOD_AT_WINDOW).length;
  assert.ok(count(leanHeight, gap) > 0);
  assert.equal(count(leanHeight - 1, gap), 0);
  assert.equal(count(leanHeight, gap + 1), 0);
});

test('the window lean rule is read from the ledger and checked', () => {
  const edited = structuredClone(steady);
  byId('window_lean_foothold', edited).rule = '窓ぎわで20cm以上の物に立つ';
  const gap = roomLayout.window_side_gap.value;
  const stood = run({ months: 60, usedLedger: edited, room: onlyWindow, boxes: [windowBox(30, gap)] });
  assert.ok(of(stood, EVENT.STOOD_AT_WINDOW).length > 0);
  byId('window_lean_foothold', edited).rule = 'どこか';
  assert.throws(() => run({ usedLedger: edited }), /unexpected window lean rule/);
});
