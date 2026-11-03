import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoplay } from '../render/autoplay.js';
import { EVENT } from '../sim/events.js';
import { somethingHappened, summarizeChild } from '../sim/hazardReport.js';
import { createPlayback } from '../sim/playback.js';
import { createSimulation } from '../sim/simulation.js';
import { judgeRoom } from '../sim/verdict.js';
import { ledger, roomLayout, settings } from './helpers.js';

const STEP_SECONDS = 0.05;
const child = { months: 36, sex: 'female' };

/** One child as the screen plays it: fixed steps, many per frame, stopped at the trial end. */
function played(seed, speed) {
  const simulation = createSimulation({ ledger, settings, ...child, seed, room: roomLayout });
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: 0.25 });
  const total = Math.round(settings.trial_seconds / STEP_SECONDS);
  for (let taken = 0; taken < total;) {
    const steps = Math.min(playback.stepsFor(1 / 60, speed), total - taken);
    for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
    taken += steps;
  }
  return simulation.events;
}

/** The same child as the hundred-child count runs it: one call for the whole trial. */
function counted(seed) {
  const simulation = createSimulation({ ledger, settings, ...child, seed, room: roomLayout });
  simulation.step(settings.trial_seconds);
  return simulation.events;
}

const verdict = judgeRoom({ ledger, settings, room: roomLayout, ...child });

test('a child from a list plays the very events the count saw: same times, same things', () => {
  const listed = verdict.hazards.lock.children.slice(0, 5).map(({ seed }) => seed);
  assert.ok(listed.length > 0);
  for (const seed of listed) {
    const screen = played(seed, settings.start_speed);
    const record = counted(seed);
    assert.equal(screen.length, record.length, `seed ${seed}`);
    screen.forEach((event, i) => {
      assert.equal(event.kind, record[i].kind);
      assert.ok(Math.abs(event.time - record[i].time) < 1e-6, `seed ${seed} event ${i} time`);
      assert.equal(event.targetId ?? event.hazardId ?? event.footholdId, record[i].targetId ?? record[i].hazardId ?? record[i].footholdId);
    });
    assert.ok(screen.some(({ kind }) => kind === EVENT.REACHED_LOCK), `seed ${seed} reaches the lock on screen too`);
  }
});

test('only the runs that reached the lock or a dangerous thing, or fell, are played; the lock first', () => {
  for (let seed = 1; seed <= settings.trial_count; seed += 1) {
    const summary = summarizeChild(counted(seed));
    const happened = Boolean(summary.lock || summary.onFurniture || summary.whileClimbing) || summary.hazards.size > 0;
    assert.equal(somethingHappened(summary), happened);
    assert.equal(verdict.eventful.includes(seed), happened, `seed ${seed}`);
  }
  // Those who reached the lock come first, then the rest; each group by seed.
  const lockSeeds = new Set(verdict.hazards.lock.children.map(({ seed }) => seed));
  const first = verdict.eventful.filter((seed) => lockSeeds.has(seed));
  const rest = verdict.eventful.filter((seed) => !lockSeeds.has(seed));
  assert.deepEqual(verdict.eventful, [...first, ...rest]);
  assert.deepEqual(first, [...first].sort((a, b) => a - b));
  assert.deepEqual(rest, [...rest].sort((a, b) => a - b));
});

test('the lock row counts each child once, by the easiest way', () => {
  const { lock } = verdict.hazards;
  const seeds = lock.children.map(({ seed }) => seed);
  assert.equal(new Set(seeds).size, seeds.length);
  assert.equal(lock.counts.floor + lock.counts.tiptoe + lock.counts.climbed, seeds.length);
  const reached = Array.from({ length: settings.trial_count }, (_, i) => i + 1)
    .filter((seed) => counted(seed).some(({ kind }) => kind === EVENT.REACHED_LOCK));
  assert.deepEqual(seeds, reached);
});

/** A stand-in for the session: it only records which seed was asked for. */
function fakeSession() {
  const listeners = { finished: [] };
  const asked = [];
  return {
    asked,
    setSeed: (seed) => asked.push(seed),
    playing: null,
    setPlaying(next) { this.playing = next; },
    on: (type, listener) => listeners[type]?.push(listener),
    finish: () => listeners.finished.forEach((listener) => listener()),
  };
}

test('autoplay goes through the runs where something happened, in order, then round again', () => {
  const session = fakeSession();
  const autoplay = createAutoplay({ session });
  autoplay.useEventful([3, 8, 20]);
  session.finish();
  session.finish();
  session.finish();
  assert.deepEqual(session.asked, [3, 8, 20, 3]);
});

test('with no such run nothing plays; a pressed row plays only its runs, and pressing it again goes back', () => {
  const session = fakeSession();
  const autoplay = createAutoplay({ session });
  autoplay.useEventful([]);
  session.finish();
  assert.deepEqual(session.asked, []);
  assert.equal(session.playing, false);
  autoplay.useEventful([2, 5, 9, 12]);
  autoplay.useRow('medicine', [9, 12]);
  session.finish();
  assert.deepEqual(session.asked.slice(-2), [9, 12]);
  assert.equal(autoplay.row(), 'medicine');
  autoplay.useRow('medicine', [9, 12]);
  assert.equal(autoplay.row(), null);
  assert.equal(autoplay.current(), 2);
});
