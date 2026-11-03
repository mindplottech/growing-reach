import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../sim/playback.js';
import { createRng } from '../sim/random.js';
import { createSimulation } from '../sim/simulation.js';
import { ledger, roomLayout, settings } from './helpers.js';

const STEP_SECONDS = 0.05;
const MAX_FRAME_SECONDS = 0.25;

/** Plays one child for the whole trial at `speed`, with uneven frame times like a browser. */
function play(speed, seed) {
  const simulation = createSimulation({ ledger, settings, months: 48, sex: 'female', seed, room: roomLayout });
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: MAX_FRAME_SECONDS });
  const frames = createRng(seed + 1000);
  const total = Math.round(settings.trial_seconds / STEP_SECONDS);
  let taken = 0;
  let realSeconds = 0;
  while (taken < total) {
    const frame = 1 / 60 + frames() * 0.02;
    realSeconds += frame;
    const steps = Math.min(playback.stepsFor(frame, speed), total - taken);
    for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
    taken += steps;
  }
  return { events: simulation.events, realSeconds };
}

test('the speed changes only how fast the record is played, not what happens', (t) => {
  for (const seed of [1, 2, 3]) {
    const runs = [1, 2, 4].map((speed) => ({ speed, ...play(speed, seed) }));
    for (const run of runs.slice(1)) assert.deepEqual(run.events, runs[0].events, `seed ${seed} at ${run.speed}x`);
    const counts = runs[0].events.reduce((tally, { kind }) => ({ ...tally, [kind]: (tally[kind] ?? 0) + 1 }), {});
    const line = `seed ${seed}: ${runs.map(({ speed, realSeconds }) => `${speed}x ${realSeconds.toFixed(0)}s`).join(', ')}; ${JSON.stringify(counts)}`;
    t.diagnostic(line);
    // Twice the speed takes about half the real time for the same ten minutes.
    assert.ok(Math.abs(runs[1].realSeconds * 2 - runs[0].realSeconds) < 1);
    assert.ok(Math.abs(runs[2].realSeconds * 4 - runs[0].realSeconds) < 1);
  }
});

test('a frame takes speed times as many steps, and the remainder carries over', () => {
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: MAX_FRAME_SECONDS });
  assert.equal(playback.stepsFor(0.1, 1), 2);
  assert.equal(playback.stepsFor(0.1, 4), 8);
  assert.equal(playback.stepsFor(0.03, 1), 0);
  assert.equal(playback.stepsFor(0.03, 1), 1);
  // A long pause in the browser is cut to the longest frame, then multiplied.
  playback.reset();
  assert.equal(playback.stepsFor(5, 2), Math.round((MAX_FRAME_SECONDS * 2) / STEP_SECONDS));
});
