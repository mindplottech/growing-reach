import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { canClimb, canReach } from '../src/ability.js';
import { landmarkHeight } from '../src/room.js';
import { createSimulation } from '../src/simulation.js';
import { byId, close, ledger, roomLayout } from './helpers.js';

const BASE = { ledger, months: 48, sex: 'female', room: roomLayout };
const STEP = 0.05;
const RUN_SECONDS = 600;

function run(seed, step = STEP, seconds = RUN_SECONDS, base = BASE) {
  const simulation = createSimulation({ ...base, seed });
  for (let t = 0; t < seconds; t += step) simulation.step(step);
  return simulation;
}

test('the same seed gives the same visits and position', () => {
  const a = run(5);
  const b = run(5);
  assert.deepEqual(a.visits, b.visits);
  assert.deepEqual(a.position, b.position);
  assert.ok(a.visits.length > 0);
});

test('different seeds go to different places', () => {
  const route = (seed) => run(seed).visits.map((visit) => visit.id);
  assert.notDeepEqual(route(5), route(6));
});

test('the route does not depend on the step size', () => {
  const route = (step) => run(5, step).visits.map((visit) => visit.id).slice(0, 20);
  assert.deepEqual(route(0.05), route(0.2));
});

test('the child visits every landmark and never stays for two visits in a row', () => {
  const ids = run(5).visits.map((visit) => visit.id);
  assert.deepEqual(new Set(ids), new Set(roomLayout.landmarks.map((landmark) => landmark.id)));
  ids.slice(1).forEach((id, i) => assert.notEqual(id, ids[i]));
});

test('each visit is judged by canClimb and canReach', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const simulation = run(seed);
    for (const visit of simulation.visits) {
      assert.equal(visit.canClimb, canClimb(simulation.body, visit.height));
      assert.equal(visit.canReach, canReach(simulation.body, visit.height));
    }
  }
});

test('the judgement for a landmark never changes during a run', () => {
  const answers = new Map();
  for (const visit of run(5).visits) {
    const answer = `${visit.canClimb}/${visit.canReach}`;
    assert.equal(answers.get(visit.id) ?? answer, answer);
    answers.set(visit.id, answer);
  }
});

test('walking time matches the walk speed and the dwell stays in the ledger range', () => {
  const [minDwell, maxDwell] = byId('interest_dwell').range;
  const simulation = run(7);
  const speed = simulation.body.walkSpeed.value * 100;
  const byLandmark = new Map(roomLayout.landmarks.map((l) => [l.id, l.approach]));
  simulation.visits.slice(1).forEach((visit, i) => {
    const previous = simulation.visits[i];
    const from = byLandmark.get(previous.id);
    const to = byLandmark.get(visit.id);
    const walking = Math.hypot(to.x - from.x, to.y - from.y) / speed;
    const dwell = visit.time - previous.time - walking;
    assert.ok(dwell >= minDwell - 1e-9 && dwell <= maxDwell + 1e-9, `dwell ${dwell}`);
  });
});

test('step advances time exactly and the child stays inside the room', () => {
  const simulation = createSimulation({ ...BASE, seed: 3 });
  for (let i = 0; i < 2000; i += 1) {
    simulation.step(STEP);
    assert.ok(simulation.position.x >= 0 && simulation.position.x <= roomLayout.width);
    assert.ok(simulation.position.y >= 0 && simulation.position.y <= roomLayout.depth);
  }
  close(Number(simulation.time.toFixed(6)), Number((2000 * STEP).toFixed(6)));
});

test('landmark heights are read from the ledger by the documented rule', () => {
  const values = byId('furniture_heights').values;
  assert.equal(landmarkHeight(ledger, ['furniture_heights', 'sofa_seat']), values.sofa_seat.median);
  assert.equal(landmarkHeight(ledger, ['furniture_heights', 'dining_table_top']), values.dining_table_top.values[1]);
  close(
    landmarkHeight(ledger, ['furniture_heights', 'low_table_top']),
    (values.low_table_top.values[0] + values.low_table_top.values[1]) / 2,
  );
  close(
    landmarkHeight(ledger, ['furniture_heights', 'dining_chair_seat']),
    (values.dining_chair_seat.min + values.dining_chair_seat.max) / 2,
  );
  assert.equal(
    landmarkHeight(ledger, ['window_sill_height', 'lock_height_assumed']),
    byId('window_sill_height').values.lock_height_assumed,
  );
  assert.throws(() => landmarkHeight(ledger, ['furniture_heights', 'missing']), /no height/);
});

test('every landmark and approach point is inside the room, and the point is off the furniture', () => {
  for (const { x, y, w, d, approach, heightOf } of roomLayout.landmarks) {
    assert.ok(x >= 0 && y >= 0 && x + w <= roomLayout.width && y + d <= roomLayout.depth);
    assert.ok(approach.x >= 0 && approach.x <= roomLayout.width);
    assert.ok(approach.y >= 0 && approach.y <= roomLayout.depth);
    assert.ok(!(approach.x > x && approach.x < x + w && approach.y > y && approach.y < y + d));
    assert.ok(landmarkHeight(ledger, heightOf) > 0);
  }
});

test('no source file uses unseeded randomness', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.ok(!source.includes('Math.random'), `${name} uses Math.random`);
  }
});
