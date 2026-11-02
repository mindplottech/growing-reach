import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseTracker, footHeight, isFalling, reachMark } from '../src/childPose.js';
import { EVENT } from '../src/events.js';
import { landmarkHeight } from '../src/room.js';
import { buildSceneModel } from '../src/sceneModel.js';
import { createSimulation } from '../src/simulation.js';
import { byId, close, ledger, roomLayout, settings } from './helpers.js';

const steady = structuredClone(ledger);
byId('fall_rates', steady).values = { balancePerSec: 0, tripPerStep: 0 };
const climber = { ...settings, climb_probability: 1, chain_probability: 0, climb_failure_k: 0 };
const FRAME = 0.05;
const lockHeight = landmarkHeight(ledger, ['window_sill_height', 'lock_height_assumed']);

function newSimulation(boxes = [], used = climber, usedLedger = steady) {
  return createSimulation({ ledger: usedLedger, settings: used, months: 48, sex: 'female', seed: 1, room: roomLayout, boxes });
}

/** Steps until the check holds, so the test sees the child in that state. */
function stepUntil(simulation, check, limit = 40000) {
  for (let i = 0; i < limit; i += 1) {
    if (check(simulation)) return;
    simulation.step(FRAME);
  }
  assert.fail('the simulation never reached the expected state');
}

test('feet are at the height of the foothold the child stands on', () => {
  const simulation = newSimulation();
  const seen = new Set();
  for (let i = 0; i < 40000; i += 1) {
    simulation.step(FRAME);
    const { foothold } = simulation;
    if (foothold) {
      assert.equal(footHeight(simulation), foothold.height);
      seen.add(foothold.id);
    }
  }
  assert.ok(seen.size > 1, 'should have stood on several footholds');
});

test('feet are at the height of a placed box, whatever height h it has', () => {
  for (const h of [10, 30, 55]) {
    const box = { id: 'box-1', label: '箱', height: h, scaffold: true, temporary: true, x: 400, y: 120, w: 40, d: 30, approach: { x: 420, y: 100 } };
    const simulation = newSimulation([box]);
    stepUntil(simulation, (s) => s.foothold?.id === box.id);
    assert.equal(footHeight(simulation), h);
  }
});

test('feet are on the floor before climbing and after coming down', () => {
  const simulation = newSimulation();
  assert.equal(footHeight(simulation), 0);
  stepUntil(simulation, (s) => s.foothold !== null);
  stepUntil(simulation, (s) => s.foothold === null);
  assert.equal(footHeight(simulation), 0);
});

test('the reach mark rises with the foothold and notices the lock', () => {
  const simulation = newSimulation();
  const { value: reach } = simulation.body.reach;
  assert.equal(reachMark(simulation).height, reach);
  assert.equal(reachMark(simulation).reachesLock, reach >= lockHeight);
  stepUntil(simulation, (s) => s.foothold !== null);
  assert.equal(reachMark(simulation).height, simulation.foothold.height + reach);
  const needed = lockHeight - reach;
  assert.equal(reachMark(simulation, needed).reachesLock, true);
  assert.equal(reachMark(simulation, needed - 1).reachesLock, false);
});

test('falling is told from the latest event', () => {
  const noisy = structuredClone(ledger);
  byId('fall_rates', noisy).values = { balancePerSec: 100, tripPerStep: 0 };
  const simulation = newSimulation([], climber, noisy);
  assert.equal(isFalling(simulation), false);
  stepUntil(simulation, (s) => s.events.some(({ kind }) => kind === EVENT.FELL));
  assert.equal(isFalling(simulation), true);
});

const DURATIONS = { climbSeconds: 0.5, fallSeconds: 0.1 };
const at = (feet, falling = false, x = 0, z = 0) => ({ x, z, feet, falling });

test('the drawn feet move in steps and end at the target', () => {
  const update = createPoseTracker(DURATIONS);
  assert.equal(update(at(0), FRAME).feet, 0);
  const heights = [];
  const frames = Math.round(DURATIONS.climbSeconds / FRAME);
  for (let i = 0; i < frames; i += 1) heights.push(update(at(30), FRAME).feet);
  for (let i = 1; i < heights.length; i += 1) assert.ok(heights[i] > heights[i - 1]);
  assert.ok(heights[0] > 0 && heights[0] < 30);
  assert.equal(update(at(30), FRAME).feet, 30);
  assert.equal(update(at(30), FRAME).feet, 30);
});

test('a fall reaches the floor sooner than coming down', () => {
  const framesToFloor = (falling) => {
    const update = createPoseTracker(DURATIONS);
    update(at(40), FRAME);
    let frames = 0;
    while (update(at(0, falling), FRAME).feet > 0) frames += 1;
    return frames;
  };
  assert.ok(framesToFloor(true) < framesToFloor(false));
});

test('walking is drawn exactly where the simulation says', () => {
  const update = createPoseTracker(DURATIONS);
  update(at(0, false, 0, 0), FRAME);
  assert.deepEqual(update(at(0, false, 12, 34), FRAME), { x: 12, z: 34, feet: 0 });
});

test('climbing also slides onto the foothold rather than jumping sideways', () => {
  const update = createPoseTracker(DURATIONS);
  update(at(0, false, 0, 0), FRAME);
  const midway = update(at(30, false, 100, 0), FRAME);
  assert.ok(midway.x > 0 && midway.x < 100);
});

test('a change of target during a move starts from where the child is drawn', () => {
  const update = createPoseTracker(DURATIONS);
  update(at(0), FRAME);
  const partway = update(at(30), FRAME).feet;
  const next = update(at(0, true), FRAME).feet;
  assert.ok(next <= partway);
  close(update(at(0, true), DURATIONS.fallSeconds).feet, 0);
});

test('the plane labels say they are for standing on the floor', () => {
  const simulation = newSimulation();
  const { planes } = buildSceneModel({ ledger, room: roomLayout, landmarks: simulation.landmarks, body: simulation.body });
  for (const { label } of planes) assert.ok(label.includes('床に立ったとき'), label);
});
