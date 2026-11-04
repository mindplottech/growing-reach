import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoplay } from '../render/autoplay.js';
import { compareResults } from '../sim/compare.js';
import { EVENT } from '../sim/events.js';
import { METHOD_CLIMBED, methodOf, summarizeChild } from '../sim/hazardReport.js';
import { createPlayback } from '../sim/playback.js';
import { buildPlaylists, fallKindOf, FALL_KIND_ON_FURNITURE, FALL_KIND_WHILE_CLIMBING } from '../sim/scenes.js';
import { createSimulation } from '../sim/simulation.js';
import { judgeRoom } from '../sim/verdict.js';
import { ledger, minMonths, roomLayout, settings } from './helpers.js';

const STEP_SECONDS = 0.05;
const child = { months: 48, sex: 'female' };
const span = { before: settings.scene_before_seconds, after: settings.scene_after_seconds, trialSeconds: settings.trial_seconds };
const verdict = judgeRoom({ ledger, settings, room: roomLayout, ...child });
const plays = buildPlaylists({ verdict, condition: { ...child, room: roomLayout }, ...span });
const places = [verdict.hazards.lock, ...verdict.hazards.rows];

/** One scene as the screen plays it: computed unseen up to its start, then in fixed steps to its end. */
function played(scene) {
  const simulation = createSimulation({ ledger, settings, months: scene.months, sex: scene.sex, seed: scene.seed, room: scene.room });
  if (scene.start > 0) simulation.step(scene.start);
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: 0.25 });
  const total = Math.round((scene.end - simulation.time) / STEP_SECONDS);
  for (let taken = 0; taken < total;) {
    const steps = Math.min(playback.stepsFor(1 / 60, settings.start_speed), total - taken);
    for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
    taken += steps;
  }
  return simulation.events;
}

/** The same child as the hundred-child count runs it. */
function counted(seed, months = child.months) {
  const simulation = createSimulation({ ledger, settings, months, sex: child.sex, seed, room: roomLayout });
  simulation.step(settings.trial_seconds);
  return simulation.events;
}

const thingOf = (event) => (event.kind === EVENT.REACHED_LOCK ? event.targetId : event.hazardId);
const isReach = (event) => event.kind === EVENT.REACHED_LOCK || event.kind === EVENT.TOUCHED_HAZARD;

test('a scene lasts from 10 seconds before the moment to 5 after, inside the trial', () => {
  for (const scene of plays.auto) {
    assert.equal(scene.start, Math.max(0, scene.moment - 10));
    assert.equal(scene.end, Math.min(settings.trial_seconds, scene.moment + 5));
  }
});

test('the moment of a touch is the first time the record reaches that thing in the way it is counted', () => {
  for (const scene of plays.auto) {
    const record = counted(scene.seed);
    // The way the table counts this child for this thing: the easiest way they ever reached it.
    const summary = summarizeChild(record);
    const method = (scene.scene.lock ? summary.lock : summary.hazards.get(scene.thing)).method;
    const first = record.find((event) => isReach(event) && thingOf(event) === scene.thing && methodOf(event) === method);
    assert.ok(first, `seed ${scene.seed} ${scene.thing}`);
    assert.equal(scene.moment, first.time);
    assert.equal(scene.scene.method, method);
  }
});

test('the screen plays the very moment: same time and same thing as the record', () => {
  for (const scene of plays.byThing.get(verdict.hazards.lock.id).slice(0, 6)) {
    const screen = played(scene);
    const hit = screen.find((event) => isReach(event) && thingOf(event) === scene.thing && Math.abs(event.time - scene.moment) < 1e-6);
    assert.ok(hit, `seed ${scene.seed}`);
  }
  for (const scene of plays.falls) {
    const screen = played(scene);
    assert.ok(screen.some((event) => event.kind === EVENT.FELL && Math.abs(event.time - scene.moment) < 1e-6), `seed ${scene.seed}`);
  }
});

test('pressing a row plays as many children as the row counts, climbers first', () => {
  for (const row of places) {
    const scenes = plays.byThing.get(row.id);
    assert.equal(scenes.length, row.children.length, row.label);
    assert.deepEqual(new Set(scenes.map(({ seed }) => seed)), new Set(row.children.map(({ seed }) => seed)));
    const climbed = scenes.filter(({ scene }) => scene.method === METHOD_CLIMBED);
    assert.equal(climbed.length, row.counts.climbed);
    assert.deepEqual(scenes.slice(0, climbed.length), climbed);
    assert.ok(scenes.every((scene, i) => scene.position === i + 1 && scene.count === scenes.length));
  }
  const falls = verdict.hazards.falls;
  for (const [kind, id] of [[FALL_KIND_ON_FURNITURE, 'on_furniture'], [FALL_KIND_WHILE_CLIMBING, 'while_climbing']]) {
    assert.equal(plays.byFallKind.get(kind).length, falls.find((fall) => fall.id === id).children.length);
  }
  assert.equal(plays.falls.length, verdict.children[EVENT.FELL]);
});

test('the automatic order: climbed to the lock, then climbed to other things, then from the floor; by seed', () => {
  const group = ({ scene }) => {
    if (scene.method !== METHOD_CLIMBED) return 2;
    return scene.lock ? 0 : 1;
  };
  const touches = places.reduce((sum, row) => sum + row.children.length, 0);
  assert.equal(plays.auto.length, touches);
  for (let i = 1; i < plays.auto.length; i += 1) {
    const [a, b] = [plays.auto[i - 1], plays.auto[i]];
    assert.ok(group(a) < group(b) || (group(a) === group(b) && a.seed <= b.seed), `at ${i}`);
  }
  assert.ok(plays.auto.every(({ heading, thing }) => heading === `${places.find(({ id }) => id === thing).label}に触れた子`));
});

test('the left condition plays its own children, from its own record', () => {
  const left = judgeRoom({ ledger, settings, room: roomLayout, months: minMonths, sex: child.sex });
  const leftPlays = buildPlaylists({ verdict: left, condition: { months: minMonths, sex: child.sex, room: roomLayout }, ...span });
  const [first] = leftPlays.byThing.get(left.hazards.lock.id);
  assert.equal(first.months, minMonths);
  const record = counted(first.seed, minMonths);
  assert.ok(record.some((event) => event.kind === EVENT.REACHED_LOCK && event.time === first.moment));
});

test('the table counts do not depend on what is played or how', () => {
  const left = judgeRoom({ ledger, settings, room: roomLayout, months: minMonths, sex: child.sex });
  const before = compareResults(left, verdict);
  for (const scene of plays.auto.slice(0, 10)) played(scene);
  const again = judgeRoom({ ledger, settings, room: roomLayout, ...child });
  assert.deepEqual(compareResults(left, again), before);
});

test('each fall scene is of the kind it is listed under', () => {
  for (const [kind, scenes] of plays.byFallKind) {
    for (const scene of scenes) {
      const fall = counted(scene.seed).find((event) => event.kind === EVENT.FELL && event.time === scene.moment);
      assert.equal(fallKindOf(fall), kind);
    }
  }
});

/** A stand-in for the session: it only records which scenes were asked for. */
function fakeSession() {
  const listeners = { finished: [] };
  const asked = [];
  return {
    asked,
    setScene: (scene) => asked.push(scene.id),
    playing: null,
    setPlaying(next) { this.playing = next; },
    on: (type, listener) => listeners[type]?.push(listener),
    finish: () => listeners.finished.forEach((listener) => listener()),
  };
}
const scenesOf = (...ids) => ids.map((id) => ({ id }));

test('autoplay goes through its scenes in order, then round again', () => {
  const session = fakeSession();
  const autoplay = createAutoplay({ session });
  autoplay.useAuto(scenesOf('a', 'b', 'c'));
  session.finish();
  session.finish();
  session.finish();
  assert.deepEqual(session.asked, ['a', 'b', 'c', 'a']);
});

test('a pressed row plays only its scenes; the same row again, or pressing elsewhere, goes back', () => {
  const session = fakeSession();
  const autoplay = createAutoplay({ session });
  autoplay.useAuto([]);
  assert.equal(session.playing, false);
  autoplay.useAuto(scenesOf('a', 'b', 'c'));
  autoplay.useList('right:lock', scenesOf('x', 'y'));
  session.finish();
  session.finish();
  assert.deepEqual(session.asked.slice(-3), ['x', 'y', 'x']);
  assert.equal(autoplay.key(), 'right:lock');
  autoplay.useList('right:lock', scenesOf('x', 'y'));
  assert.equal(autoplay.key(), null);
  assert.equal(autoplay.current().id, 'a');
  autoplay.useList('left:lock', scenesOf('p'));
  autoplay.leave();
  assert.equal(autoplay.key(), null);
  assert.equal(autoplay.current().id, 'a');
});
