import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import { moveObject, removeObject } from '../sim/editor.js';
import { floorHazardLevel, footholdHazardLevel, placeHazards } from '../sim/hazards.js';
import { landmarkHeight } from '../sim/room.js';
import { REACH_NONE } from '../sim/scaffold.js';
import { createSimulation } from '../sim/simulation.js';
import { byId, ledger, roomLayout, settings } from './helpers.js';

const withoutFalls = (() => {
  const edited = structuredClone(ledger);
  byId('fall_rates', edited).values = { balancePerSec: 0, tripPerStep: 0 };
  return edited;
})();
const QUIET = { ...settings, climb_failure_k: 0 };

function run({ seed = 1, months = 48, used = QUIET, room = roomLayout, boxes = [], seconds = 1200, usedLedger = withoutFalls } = {}) {
  const simulation = createSimulation({ ledger: usedLedger, settings: used, months, sex: 'female', seed, room, boxes });
  simulation.step(seconds);
  return simulation;
}
const kinds = (simulation, kind) => simulation.events.filter((event) => event.kind === kind);
const withHeights = (room) => room.landmarks.map((l) => ({ ...l, height: landmarkHeight(ledger, l.heightOf) }));

test('the hazards are medicine, scissors and a cord, each on a piece of furniture at its top height', () => {
  const landmarks = withHeights(roomLayout);
  const placed = placeHazards(roomLayout, landmarks);
  assert.deepEqual(placed.map(({ label }) => label), ['薬', 'はさみ', 'コード']);
  for (const hazard of placed) {
    const under = landmarks.find(({ id }) => id === hazard.on);
    assert.equal(hazard.height, under.height);
    assert.ok(hazard.x >= under.x && hazard.x + hazard.w <= under.x + under.w);
    assert.ok(hazard.y >= under.y && hazard.y + hazard.d <= under.y + under.d);
  }
});

test('a hazard moves with its furniture and goes away with it', () => {
  const before = placeHazards(roomLayout, withHeights(roomLayout)).find(({ id }) => id === 'medicine');
  const table = roomLayout.landmarks.find(({ id }) => id === 'dining_table');
  const moved = moveObject(roomLayout, 'dining_table', { x: table.x + table.w / 2 + 20, y: table.y + table.d / 2 });
  assert.ok(moved);
  const after = placeHazards(moved, withHeights(moved)).find(({ id }) => id === 'medicine');
  assert.equal(after.x, before.x + 20);
  assert.equal(after.y, before.y);
  const removed = removeObject(roomLayout, 'dining_table');
  assert.equal(placeHazards(removed, withHeights(removed)).some(({ id }) => id === 'medicine'), false);
});

test('a hazard is touched exactly when the reach rule says the hand gets to it', () => {
  for (const months of [36, 48, 60]) {
    const simulation = run({ months, used: { ...QUIET, climb_probability: 0.5 } });
    const hazards = new Map(simulation.hazards.map((hazard) => [hazard.id, hazard]));
    const byId = new Map(simulation.landmarks.map((landmark) => [landmark.id, landmark]));
    const touches = kinds(simulation, EVENT.TOUCHED_HAZARD);
    for (const touch of touches) {
      const hazard = hazards.get(touch.hazardId);
      assert.equal(touch.hazardLabel, hazard.label);
      const level = touch.from === 'floor'
        ? floorHazardLevel(ledger, simulation.body, byId.get(hazard.on), hazard)
        : footholdHazardLevel(ledger, simulation.body, byId.get(touch.footholdId), hazard);
      assert.notEqual(level, REACH_NONE);
      assert.equal(touch.level, level);
    }
    // Every floor visit to furniture with a reachable hazard on it gives a touch at that moment.
    for (const visit of simulation.visits) {
      for (const hazard of simulation.hazards.filter(({ on }) => on === visit.id)) {
        const reachable = floorHazardLevel(ledger, simulation.body, byId.get(visit.id), hazard) !== REACH_NONE;
        const touched = touches.some((t) => t.from === 'floor' && t.hazardId === hazard.id && t.time === visit.time);
        assert.equal(touched, reachable, `${months} months, ${hazard.id} at ${visit.time}`);
      }
    }
  }
});

test('a hazard far in from the edge of a wide top is out of reach from the floor, but not from on top', () => {
  const wide = {
    id: 'wide', label: 'wide', heightOf: ['furniture_heights', 'low_table_top'], scaffold: true,
    x: 100, y: 100, w: 240, d: 200, approach: { x: 220, y: 80 },
  };
  const room = { ...roomLayout, landmarks: [wide], hazards: [{ id: 'far', kind: 'medicine', label: '薬', on: 'wide', dx: 110, dy: 100, w: 8, d: 8 }] };
  const [placed] = placeHazards(room, withHeights(room));
  const [table] = withHeights(room);
  const body = run({ room, seconds: 0 }).body;
  assert.equal(floorHazardLevel(ledger, body, table, placed), REACH_NONE);
  assert.notEqual(footholdHazardLevel(ledger, body, table, placed), REACH_NONE);
});

test('climbing takes the base time plus the time per cm of the step', () => {
  const simulation = run({ used: { ...QUIET, climb_probability: 1, chain_probability: 0 } });
  const climbs = kinds(simulation, EVENT.CLIMBED);
  assert.ok(climbs.length > 0);
  for (const climb of climbs) {
    const expected = settings.climb_seconds_base + settings.climb_seconds_per_cm * climb.stepHeight;
    assert.ok(Math.abs(climb.climbSeconds - expected) < 1e-9);
    const visit = simulation.visits.findLast((v) => v.time <= climb.time && v.id === climb.footholdId);
    assert.ok(Math.abs(climb.time - visit.time - expected) < 1e-6, `${climb.footholdId} ${climb.time - visit.time}`);
  }
});

test('the same seed, layout and age give the same events', () => {
  for (const months of [36, 48]) {
    const a = run({ months, usedLedger: ledger, used: settings, seed: 9 });
    const b = run({ months, usedLedger: ledger, used: settings, seed: 9 });
    assert.deepEqual(a.events, b.events);
    assert.ok(a.events.length > 0);
  }
});

// A box set against the window: the room has only the window, its lock and the box.
const window = roomLayout.landmarks.find(({ role }) => role === 'window');
const lock = roomLayout.landmarks.find(({ role }) => role === 'window_lock');
const boxByWindow = {
  id: 'box', label: '段ボール箱', height: roomLayout.cardboard_box.height, scaffold: true,
  x: lock.x - roomLayout.cardboard_box.w, y: window.y - roomLayout.cardboard_box.d,
  w: roomLayout.cardboard_box.w, d: roomLayout.cardboard_box.d,
  approach: { x: lock.x - roomLayout.cardboard_box.w / 2, y: window.y - roomLayout.cardboard_box.d - roomLayout.cardboard_box.approach_gap },
};
const windowRoom = { ...roomLayout, landmarks: [window, lock], hazards: [] };

test('a box by the window: how many of 100 children reach the window at 3y0m and at 4y0m', (t) => {
  const count = (months) => {
    let reached = 0;
    for (let seed = 1; seed <= settings.trial_count; seed += 1) {
      const simulation = createSimulation({ ledger, settings, months, sex: 'female', seed, room: windowRoom, boxes: [boxByWindow] });
      simulation.step(settings.trial_seconds);
      if (simulation.events.some(({ kind }) => kind === EVENT.REACHED_LOCK || kind === EVENT.STOOD_AT_WINDOW)) reached += 1;
    }
    return reached;
  };
  const three = count(36);
  const four = count(48);
  // No direction is asserted: the counts are reported, and the reasons are explained to KO.
  t.diagnostic(`window reached: 3y0m ${three}/100, 4y0m ${four}/100`);
  console.log(`window reached: 3y0m ${three}/100, 4y0m ${four}/100`);
  assert.ok(three >= 0 && three <= 100 && four >= 0 && four <= 100);
});
