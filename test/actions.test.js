import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import { createSimulation } from '../sim/simulation.js';
import { byId, ledger, roomLayout, settings } from './helpers.js';

const QUIET = { ...settings, climb_failure_k: 0 };
const withoutFalls = (() => {
  const edited = structuredClone(ledger);
  byId('fall_rates', edited).values = { balancePerSec: 0, tripPerStep: 0 };
  return edited;
})();

function run({ seed = 1, months = 48, usedLedger = withoutFalls, used = QUIET, room = roomLayout, boxes = [], seconds = 1200 } = {}) {
  const simulation = createSimulation({ ledger: usedLedger, settings: used, months, sex: 'female', seed, room, boxes });
  simulation.step(seconds);
  return simulation;
}
const kinds = (simulation, kind) => simulation.events.filter((event) => event.kind === kind);

const box = (id, height, x, y) => ({
  id, label: id, height, scaffold: true, x, y, w: 40, d: 30, approach: { x: x + 20, y: y - 20 },
});
/** A room holding only the given objects, so a test sees nothing else. */
const onlyRoom = { ...roomLayout, landmarks: [] };

test('climbing only happens when chosen: probability 0 never climbs', () => {
  assert.equal(kinds(run({ used: { ...QUIET, climb_probability: 0 } }), EVENT.CLIMBED).length, 0);
});

test('with probability 1 every climbable foothold visited on the floor is climbed', () => {
  const simulation = run({ used: { ...QUIET, climb_probability: 1, chain_probability: 0 } });
  const fromFloor = simulation.visits.filter((visit) => visit.scaffold !== null);
  assert.ok(fromFloor.length > 0);
  // Climbing takes time, so a climb may still be under way when the run ends.
  const underWay = simulation.climbing ? 1 : 0;
  assert.equal(kinds(simulation, EVENT.CLIMBED).length, fromFloor.length - underWay);
});

test('whatever the dice say, a child never climbs what canClimb refuses', () => {
  const simulation = run({ used: { ...QUIET, climb_probability: 1, chain_probability: 0 } });
  const limit = simulation.body.climb.value;
  for (const event of kinds(simulation, EVENT.CLIMBED)) assert.ok(event.stepHeight <= limit);
  const high = run({
    room: onlyRoom,
    boxes: [box('too_high', limit + 1, 100, 100), box('also_high', limit + 2, 300, 100)],
    used: { ...QUIET, climb_probability: 1 },
  });
  assert.equal(kinds(high, EVENT.CLIMBED).length, 0);
});

test('the same seed gives the same events, whatever the step size', () => {
  const coarse = run({ usedLedger: ledger, used: settings });
  const fine = createSimulation({ ledger, settings, months: 48, sex: 'female', seed: 1, room: roomLayout });
  for (let i = 0; i < 1200 / 0.25; i += 1) fine.step(0.25);
  assert.deepEqual(fine.events.map((e) => e.kind), coarse.events.map((e) => e.kind));
  assert.notDeepEqual(run({ seed: 2, usedLedger: ledger, used: settings }).events, coarse.events);
});

test('climb failure uses k and the ledger exponent: k = 0 never fails, a huge k always does', () => {
  const noFail = run({ used: { ...QUIET, climb_probability: 1 } });
  assert.equal(kinds(noFail, EVENT.FELL).length, 0);
  const alwaysFail = run({ used: { ...QUIET, climb_probability: 1, climb_failure_k: 1e9 } });
  assert.equal(kinds(alwaysFail, EVENT.CLIMBED).length, 0);
  assert.ok(kinds(alwaysFail, EVENT.FELL).length > 0);
  for (const event of kinds(alwaysFail, EVENT.FELL)) assert.equal(event.reason, 'climb_failure');
});

test('the climb failure formula is checked', () => {
  const edited = structuredClone(ledger);
  byId('climb_failure', edited).formula = 'k + step';
  assert.throws(() => run({ usedLedger: edited }), /unexpected climb failure formula/);
});

test('fall_rates drive falls off footholds and trips while walking', () => {
  const rate = (values) => {
    const edited = structuredClone(ledger);
    byId('fall_rates', edited).values = values;
    return edited;
  };
  const steady = run({ usedLedger: rate({ balancePerSec: 0, tripPerStep: 0 }) });
  assert.equal(kinds(steady, EVENT.FELL).length + kinds(steady, EVENT.TRIPPED).length, 0);
  const wobbly = run({ usedLedger: rate({ balancePerSec: 10, tripPerStep: 0 }), used: { ...QUIET, climb_probability: 1 } });
  assert.ok(kinds(wobbly, EVENT.FELL).length > 0);
  for (const event of kinds(wobbly, EVENT.FELL)) assert.equal(event.reason, 'balance');
  assert.equal(kinds(wobbly, EVENT.TRIPPED).length, 0);
  const clumsy = run({ usedLedger: rate({ balancePerSec: 0, tripPerStep: 1 }) });
  assert.ok(kinds(clumsy, EVENT.TRIPPED).length > 0);
});

test('descending uses the ledger rules for how the child gets down', () => {
  const { step_down_max: stepDownMax, backward_max: backwardMax } = byId('descend_height').rules;
  const descents = kinds(run({ used: { ...QUIET, climb_probability: 1, chain_probability: 0 } }), EVENT.DESCENDED);
  assert.ok(descents.length > 0);
  for (const event of descents) {
    const expected = event.fromHeight <= stepDownMax ? 'step_down' : event.fromHeight <= backwardMax ? 'backward' : 'climb_down';
    assert.equal(event.mode, expected);
  }
  const low = run({ room: onlyRoom, boxes: [box('a', stepDownMax, 100, 100), box('b', stepDownMax + 1, 300, 100)], used: { ...QUIET, climb_probability: 1 } });
  const modes = new Set(kinds(low, EVENT.DESCENDED).map((event) => event.mode));
  assert.deepEqual(modes, new Set(['step_down', 'backward']));
});

test('a chain only goes to a neighbour the child can step up to', () => {
  const limit = run().body.climb.value;
  const gap = roomLayout.neighbor_gap.value;
  const low = box('low', limit - 1, 100, 100);
  const near = box('near', limit - 1 + limit / 2, 140 + gap, 100);
  const nearTooHigh = box('near_too_high', limit - 1 + limit + 1, 100, 130 + gap);
  const far = box('far', limit - 1 + limit / 2, 400, 300);
  const chained = run({
    room: onlyRoom,
    boxes: [low, near, nearTooHigh, far],
    used: { ...QUIET, climb_probability: 1, chain_probability: 1 },
    seconds: 300,
  });
  const climbedIds = kinds(chained, EVENT.CLIMBED).map((event) => event.footholdId);
  assert.ok(climbedIds.includes('near'), 'should step to the neighbour');
  assert.ok(!climbedIds.includes('near_too_high'));
  assert.ok(!climbedIds.includes('far'));
});

test('the child comes down from above the climb limit through a lower neighbour', () => {
  const limit = run().body.climb.value;
  const gap = roomLayout.neighbor_gap.value;
  const chained = run({
    room: onlyRoom,
    boxes: [box('low', limit - 1, 100, 100), box('high', limit - 1 + limit / 2, 140 + gap, 100)],
    used: { ...QUIET, climb_probability: 1, chain_probability: 0.5 },
    seconds: 600,
  });
  const fromHigh = kinds(chained, EVENT.DESCENDED).filter((event) => event.footholdId === 'high');
  assert.ok(fromHigh.length > 0);
  for (const event of fromHigh) assert.equal(event.to, 'low');
});
