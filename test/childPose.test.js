import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPoseTracker, floorShadow, footHeight, gestureForEvent, MOTION, motionForEvent, reachMark,
} from '../src/childPose.js';
import { EVENT } from '../src/events.js';
import { landmarkHeight } from '../src/room.js';
import { REACH_STANDING, REACH_TIPTOE } from '../src/scaffold.js';
import { buildSceneModel } from '../src/sceneModel.js';
import { createSimulation } from '../src/simulation.js';
import { byId, ledger, roomLayout, settings } from './helpers.js';

const steady = structuredClone(ledger);
byId('fall_rates', steady).values = { balancePerSec: 0, tripPerStep: 0 };
const climber = { ...settings, climb_probability: 1, chain_probability: 0, climb_failure_k: 0 };
const FRAME = 0.05;
const lockHeight = landmarkHeight(ledger, ['window_sill_height', 'lock_height_assumed']);
const { display_seconds: SECONDS } = settings;

function newSimulation(boxes = [], used = climber, usedLedger = steady) {
  return createSimulation({ ledger: usedLedger, settings: used, months: 48, sex: 'female', seed: 1, room: roomLayout, boxes });
}

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

test('real descents to the floor use the motion for their height, by the ledger rules', () => {
  const { step_down_max: stepDown, backward_max: backward } = byId('descend_height').rules;
  const seen = new Set();
  for (const months of [36, 60]) {
    const simulation = createSimulation({ ledger: steady, settings: climber, months, sex: 'female', seed: 1, room: roomLayout });
    simulation.step(settings.trial_seconds);
    for (const event of simulation.events.filter(({ kind, to }) => kind === EVENT.DESCENDED && to === null)) {
      const expected = event.fromHeight <= stepDown ? MOTION.STEP_DOWN
        : event.fromHeight <= backward ? MOTION.BACKWARD_DOWN : MOTION.JUMP_DOWN;
      assert.equal(motionForEvent(event), expected);
      seen.add(expected);
    }
  }
  assert.ok(seen.size > 1);
});

test('each descent mode in the record has its own motion', () => {
  const motion = (mode) => motionForEvent({ kind: EVENT.DESCENDED, mode });
  assert.equal(motion('step_down'), MOTION.STEP_DOWN);
  assert.equal(motion('backward'), MOTION.BACKWARD_DOWN);
  assert.equal(motion('climb_down'), MOTION.JUMP_DOWN);
});

test('events start the right motion, and others start none', () => {
  assert.equal(motionForEvent({ kind: EVENT.CLIMBED }), MOTION.CLIMB);
  assert.equal(motionForEvent({ kind: EVENT.FELL }), MOTION.FALL);
  assert.equal(motionForEvent({ kind: EVENT.TRIPPED }), MOTION.FALL);
  assert.equal(motionForEvent({ kind: EVENT.REACHED_LOCK }), null);
});

test('tiptoe reaches stretch the body and standing reaches only raise the arms', () => {
  assert.deepEqual(gestureForEvent({ kind: EVENT.REACHED_LOCK, level: REACH_TIPTOE }), { stretch: true });
  assert.deepEqual(gestureForEvent({ kind: EVENT.TOUCHED_HIGH, level: REACH_STANDING }), { stretch: false });
  assert.equal(gestureForEvent({ kind: EVENT.CLIMBED }), null);
});

test('the shadow shrinks and fades with height', () => {
  assert.deepEqual(floorShadow(0), { scale: 1, opacity: 1 });
  assert.ok(floorShadow(70).scale < floorShadow(30).scale);
  assert.ok(floorShadow(70).opacity < floorShadow(30).opacity);
});

const at = (feet, events = [], x = 0, z = 0) => ({ x, z, feet, events });
const event = (kind, extra = {}) => ({ kind, ...extra });
const framesFor = (duration) => Math.round(duration / FRAME);

test('climbing first reaches for the edge, then rises to the surface', () => {
  const update = createPoseTracker(SECONDS);
  update(at(0), FRAME);
  const events = [event(EVENT.CLIMBED)];
  const first = update(at(30, events), FRAME);
  assert.equal(first.feet, 0, 'feet stay down while the hands reach');
  assert.ok(first.arms > 0);
  assert.equal(first.kind, MOTION.CLIMB);
  const heights = [];
  for (let i = 0; i < framesFor(SECONDS.climb); i += 1) heights.push(update(at(30, events), FRAME).feet);
  for (let i = 1; i < heights.length; i += 1) assert.ok(heights[i] >= heights[i - 1]);
  assert.equal(update(at(30, events), FRAME).feet, 30);
});

test('climbing slides onto the foothold rather than jumping sideways', () => {
  const update = createPoseTracker(SECONDS);
  update(at(0), FRAME);
  const events = [event(EVENT.CLIMBED)];
  const positions = [];
  for (let i = 0; i < framesFor(SECONDS.climb); i += 1) positions.push(update(at(30, events, 100, 0), FRAME).x);
  assert.ok(positions.some((x) => x > 0 && x < 100));
});

test('coming down differs by kind, and a backward descent turns the child round', () => {
  const run = (mode) => {
    const update = createPoseTracker(SECONDS);
    update(at(40), FRAME);
    const events = [event(EVENT.DESCENDED, { mode })];
    const poses = [];
    for (let i = 0; i < 5; i += 1) poses.push(update(at(0, events), FRAME));
    return poses;
  };
  assert.equal(run('backward')[0].turned, true);
  assert.equal(run('step_down')[0].turned, false);
  assert.ok(run('climb_down').some((pose) => pose.arms > 0));
});

test('a fall tips the figure over, holds briefly, then stands up again', () => {
  const update = createPoseTracker(SECONDS);
  update(at(40), FRAME);
  const events = [event(EVENT.FELL)];
  const poses = [];
  const total = SECONDS.fall * 2 + SECONDS.fall_hold;
  for (let i = 0; i <= framesFor(total) + 1; i += 1) poses.push(update(at(0, events), FRAME));
  const onFloor = framesFor(SECONDS.fall) + 1;
  assert.ok(poses[onFloor].feet < 1, 'quickly on the floor');
  assert.ok(poses[onFloor].pitch > 1, 'lying over');
  const holding = poses[framesFor(SECONDS.fall + SECONDS.fall_hold / 2)];
  assert.equal(holding.pitch, poses[onFloor].pitch, 'staying still');
  assert.equal(poses[poses.length - 1].pitch, 0, 'upright again');
});

test('a fall reaches the floor sooner than a backward descent', () => {
  const framesToFloor = (kind, extra) => {
    const update = createPoseTracker(SECONDS);
    update(at(40), FRAME);
    const events = [event(kind, extra)];
    let frames = 0;
    while (update(at(0, events), FRAME).feet > 0.5) frames += 1;
    return frames;
  };
  assert.ok(framesToFloor(EVENT.FELL) < framesToFloor(EVENT.DESCENDED, { mode: 'backward' }));
});

test('a reach gesture raises the arms, stretching only for tiptoe, then ends', () => {
  const peak = (level) => {
    const update = createPoseTracker(SECONDS);
    update(at(30), FRAME);
    const events = [event(EVENT.REACHED_LOCK, { level })];
    const poses = [];
    for (let i = 0; i < framesFor(SECONDS.reach_gesture) + 2; i += 1) poses.push(update(at(30, events), FRAME));
    const end = update(at(30, events), FRAME);
    return { arms: Math.max(...poses.map((p) => p.arms)), stretch: Math.max(...poses.map((p) => p.stretch)), end };
  };
  assert.ok(peak(REACH_STANDING).arms > 0.9);
  assert.equal(peak(REACH_STANDING).stretch, 0);
  assert.ok(peak(REACH_TIPTOE).stretch > 0.9);
  assert.equal(peak(REACH_TIPTOE).end.arms, 0);
});

test('walking is drawn exactly where the simulation says, facing the way it goes', () => {
  const update = createPoseTracker(SECONDS);
  update(at(0), FRAME);
  const pose = update(at(0, [], 12, 0), FRAME);
  assert.equal(pose.x, 12);
  assert.equal(pose.feet, 0);
  assert.equal(pose.yaw, Math.PI / 2);
});

test('a restarted run starts cleanly', () => {
  const update = createPoseTracker(SECONDS);
  update(at(0), FRAME);
  update(at(30, [event(EVENT.CLIMBED)]), FRAME);
  const pose = update(at(0, [], 5, 5), FRAME);
  assert.equal(pose.feet, 0);
  assert.equal(pose.kind, null);
  assert.equal(pose.x, 5);
});

test('drawing cannot change the record: display seconds and the tracker leave it the same', () => {
  const { display_seconds: _unused, ...withoutDisplay } = settings;
  const steps = settings.trial_seconds / FRAME;
  const simulate = (used, draw) => {
    const simulation = createSimulation({ ledger, settings: used, months: 48, sex: 'female', seed: 7, room: roomLayout });
    const update = createPoseTracker(SECONDS);
    for (let i = 0; i < steps; i += 1) {
      simulation.step(FRAME);
      if (draw) update({ x: simulation.position.x, z: simulation.position.y, feet: footHeight(simulation), events: simulation.events }, FRAME);
    }
    return simulation.events;
  };
  assert.deepEqual(simulate(settings, true), simulate(withoutDisplay, false));
});

test('the plane labels say they are for standing on the floor', () => {
  const simulation = newSimulation();
  const { planes } = buildSceneModel({ ledger, room: roomLayout, landmarks: simulation.landmarks, body: simulation.body });
  for (const { label } of planes) assert.ok(label.includes('床に立ったとき'), label);
});
