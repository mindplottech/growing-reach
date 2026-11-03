import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent, EVENT, formatClock } from '../sim/events.js';
import { footprintDistance } from '../sim/scaffold.js';
import { createSimulation } from '../sim/simulation.js';
import { byId, ledger, roomLayout, settings } from './helpers.js';

const withoutFalls = (() => {
  const edited = structuredClone(ledger);
  byId('fall_rates', edited).values = { balancePerSec: 0, tripPerStep: 0 };
  return edited;
})();
const WITH_CHAIN = [EVENT.REACHED_LOCK, EVENT.STOOD_AT_WINDOW, EVENT.TOUCHED_HAZARD, EVENT.TOUCHED_HIGH];

// The window, its lock, the low shelf beside the lock, and a box against the shelf.
const find = (id) => roomLayout.landmarks.find((landmark) => landmark.id === id);
const shelf = find('low_shelf');
const { cardboard_box: size } = roomLayout;
const box = {
  id: 'box', label: '段ボール箱', height: size.height, scaffold: true,
  x: shelf.x + shelf.w, y: shelf.y, w: size.w, d: size.d,
  approach: { x: shelf.x + shelf.w + size.w / 2, y: shelf.y - size.approach_gap },
};
const chainRoom = { ...roomLayout, landmarks: [shelf, find('window'), find('window_lock')], hazards: [] };

function run({ room = roomLayout, boxes = [], used = settings, usedLedger = ledger, seed = 1, months = 48 } = {}) {
  const simulation = createSimulation({ ledger: usedLedger, settings: used, months, sex: 'female', seed, room, boxes });
  simulation.step(settings.trial_seconds);
  return simulation;
}

test('a reach from a foothold records the footholds that led there, ending where the child stands', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const simulation = run({ seed });
    for (const event of simulation.events.filter(({ kind }) => WITH_CHAIN.includes(kind))) {
      assert.ok(Array.isArray(event.chain), `${event.kind} has a chain`);
      if (event.footholdId) {
        assert.equal(event.chain[event.chain.length - 1].id, event.footholdId);
        event.chain.slice(1).forEach((step, i) => {
          const from = simulation.landmarks.find(({ id }) => id === event.chain[i].id);
          const to = simulation.landmarks.find(({ id }) => id === step.id);
          assert.ok(footprintDistance(from, to) <= roomLayout.neighbor_gap.value, 'each step is to a neighbour');
        });
      } else {
        assert.deepEqual(event.chain, []);
      }
    }
  }
});

test('box, then shelf, then the window lock: the chain is recorded in that order', () => {
  const used = { ...settings, climb_failure_k: 0, climb_probability: 1, chain_probability: 1 };
  let found = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const simulation = run({ room: chainRoom, boxes: [box], used, usedLedger: withoutFalls, seed, months: 36 });
    for (const event of simulation.events.filter(({ kind }) => kind === EVENT.REACHED_LOCK)) {
      if (event.chain.map(({ id }) => id).join('>') === 'box>low_shelf') found += 1;
    }
  }
  assert.ok(found > 0);
});

test('every kind of event has a fixed sentence made from the record, with no safety words', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    for (const event of run({ seed, months: 60 }).events) {
      const text = describeEvent(event);
      assert.ok(text.length > 0 && !text.includes('undefined'), text);
      assert.ok(!text.includes('安全'), text);
      seen.add(event.kind);
    }
  }
  for (const kind of [EVENT.CLIMBED, EVENT.DESCENDED, EVENT.FELL, EVENT.REACHED_LOCK, EVENT.TOUCHED_HAZARD]) {
    assert.ok(seen.has(kind), kind);
  }
});

test('a descent says how the child got down, by the ledger limits', () => {
  const { step_down_max: step, backward_max: backward } = byId('descend_height').rules;
  const descents = run({ seed: 4 }).events.filter(({ kind }) => kind === EVENT.DESCENDED);
  assert.ok(descents.length > 0);
  for (const event of descents) {
    const text = describeEvent(event);
    const drop = event.to === null ? event.fromHeight : null;
    if (drop === null) continue;
    if (drop <= step) assert.match(text, /一歩で/);
    else if (drop <= backward) assert.match(text, /後ろ向きで/);
    else assert.match(text, /跳び降りた/);
  }
});

test('the clock reads minutes and seconds', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65.9), '1:05');
  assert.equal(formatClock(600), '10:00');
});
