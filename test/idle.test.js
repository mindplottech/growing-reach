import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdle } from '../render/idle.js';
import { createPoseTracker } from '../render/childPose.js';
import { createSimulation } from '../sim/simulation.js';
import { ledger, roomLayout, settings } from './helpers.js';

const STEP = 0.05;
const values = settings.idle_figure;

/** Drives the idle animation `seconds` long under one condition and collects the frames. */
function drive(idle, seconds, frame, from = 0) {
  const frames = [];
  for (let t = from; t < from + seconds; t += STEP) frames.push({ time: t, ...idle(frame(t), STEP) });
  return frames;
}

test('the record is the same whether or not the idle animation runs beside it', () => {
  const run = (withIdle) => {
    const simulation = createSimulation({ ledger, settings, months: 36, sex: 'female', seed: 3, room: roomLayout });
    const pose = createPoseTracker(settings.display_seconds);
    const idle = createIdle(values);
    for (let t = 0; t < 60; t += STEP) {
      simulation.step(STEP);
      if (withIdle) {
        const drawn = pose({ x: simulation.position.x, z: simulation.position.y, feet: simulation.foothold?.height ?? 0, events: simulation.events, climbing: Boolean(simulation.climbing) }, STEP);
        idle({ still: !drawn.busy, time: simulation.time, hazardMoments: [] }, STEP);
      }
    }
    return simulation.events;
  };
  assert.deepEqual(run(true), run(false));
});

test('no yawn while moving, and none within two seconds of touching something dangerous', () => {
  const moving = drive(createIdle(values), 60, () => ({ still: false, time: 0, hazardMoments: [] }));
  assert.ok(moving.every(({ yawn }) => yawn === 0));

  // Still the whole time, with a dangerous moment at 20 s: nothing yawns from 18 to 22 s.
  const guarded = drive(createIdle(values), 60, (t) => ({ still: true, time: t, hazardMoments: [20] }));
  assert.ok(guarded.filter(({ time }) => Math.abs(time - 20) <= values.yawn_hazard_gap_s).every(({ yawn }) => yawn === 0));
  assert.ok(guarded.some(({ yawn }) => yawn > 0), 'a still child yawns eventually');
  const first = guarded.find(({ yawn }) => yawn > 0);
  assert.ok(first.time >= values.yawn_interval_s[0], 'not before the shortest interval');
});

test('blinks last the set time and come at the set intervals, from the display seed only', () => {
  const once = drive(createIdle(values), 30, (t) => ({ still: true, time: t }));
  const twice = drive(createIdle(values), 30, (t) => ({ still: true, time: t }));
  assert.deepEqual(once.map(({ blink }) => blink), twice.map(({ blink }) => blink));
  const blinks = once.filter(({ blink }) => blink === 1).length * STEP;
  const count = once.filter(({ blink }, i) => blink === 1 && (i === 0 || once[i - 1].blink === 0)).length;
  assert.ok(count >= 30 / values.blink_interval_s[1] - 1 && count <= 30 / values.blink_interval_s[0] + 1);
  assert.ok(Math.abs(blinks / count - values.blink_s) < STEP * 2);
  const other = drive(createIdle(values, 99), 30, (t) => ({ still: true, time: t }));
  assert.notDeepEqual(once.map(({ blink }) => blink), other.map(({ blink }) => blink));
});

test('breathing and the head tilt only while still, and they ease away on moving', () => {
  const idle = createIdle(values);
  const still = drive(idle, 10, (t) => ({ still: true, time: t }));
  assert.ok(Math.max(...still.map(({ breath }) => breath)) > values.breath_share * 0.9);
  assert.ok(Math.max(...still.map(({ tilt }) => Math.abs(tilt))) > values.head_tilt_rad * 0.5);
  const moving = drive(idle, 5, (t) => ({ still: false, time: t }), 10);
  assert.ok(moving[moving.length - 1].breath === 0);
  assert.ok(moving[moving.length - 1].tilt === 0);
});

test('a yawn cut short by moving fades out instead of stopping dead', () => {
  const idle = createIdle(values);
  let t = 0;
  let frame = null;
  while (t < 40 && !(frame?.yawn > 0)) {
    frame = idle({ still: true, time: t }, STEP);
    t += STEP;
  }
  assert.ok(frame.yawn > 0);
  for (let i = 0; i < 6; i += 1) frame = idle({ still: true, time: (t += STEP) }, STEP);
  const after = drive(idle, 2, () => ({ still: false, time: t }), t);
  const drops = [frame.yawn, ...after.map(({ yawn }) => yawn)];
  assert.ok(drops[0] > 0);
  assert.ok(drops.every((value, i) => i === 0 || value <= drops[i - 1] + 1e-9));
  assert.equal(drops[drops.length - 1], 0);
});
