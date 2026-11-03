import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import {
  fallRows, hazardRows, METHOD_CLIMBED, METHOD_FLOOR, METHOD_TIPTOE, ROW_CAUTION, ROW_DANGER, ROW_PLAIN, summarizeChild,
} from '../sim/hazardReport.js';
import { createSimulation } from '../sim/simulation.js';
import { judgeRoom } from '../sim/verdict.js';
import { ledger, roomLayout, settings } from './helpers.js';

const touch = (hazardId, from, level, footholdLabel = null) => ({
  kind: EVENT.TOUCHED_HAZARD, hazardId, from, level, footholdLabel,
});

test('a child who touches one thing many times is one child, counted by the easiest way', () => {
  const events = [
    touch('medicine', 'foothold', 'standing', '椅子'),
    touch('medicine', 'floor', 'tiptoe'),
    touch('medicine', 'foothold', 'tiptoe', '箱'),
    touch('medicine', 'floor', 'tiptoe'),
  ];
  const summary = summarizeChild(events);
  assert.equal(summary.hazards.size, 1);
  assert.equal(summary.hazards.get('medicine').method, METHOD_TIPTOE);
  const [row] = hazardRows([{ id: 'medicine', label: '薬' }], [{ seed: 1, summary }, { seed: 2, summary }]);
  assert.equal(row.children.length, 2);
  assert.deepEqual(row.counts, { floor: 0, tiptoe: 2, climbed: 0 });
  assert.equal(summarizeChild([touch('x', 'floor', 'standing'), touch('x', 'foothold', 'standing', '椅子')]).hazards.get('x').method, METHOD_FLOOR);
});

test('the colour of a row comes from how the children reached it', () => {
  const child = (seed, from, level) => ({ seed, summary: summarizeChild([touch('h', from, level, '椅子')]) });
  const level = (children) => hazardRows([{ id: 'h', label: 'h' }], children)[0].level;
  assert.equal(level([child(1, 'floor', 'standing')]), ROW_PLAIN);
  assert.equal(level([child(1, 'floor', 'standing'), child(2, 'floor', 'tiptoe')]), ROW_CAUTION);
  assert.equal(level([child(1, 'floor', 'tiptoe'), child(2, 'foothold', 'standing')]), ROW_DANGER);
  assert.equal(level([]), ROW_PLAIN);
});

test('falls split into on top of furniture and while climbing, each with its highest place', () => {
  const fell = (reason, fromHeight, startHeight) => ({ kind: EVENT.FELL, reason, fromHeight, startHeight, footholdLabel: 'x' });
  const a = summarizeChild([fell('balance', 35), fell('cannot_descend', 70), fell('climb_failure', 49, 0)]);
  const b = summarizeChild([fell('climb_failure', 70, 37)]);
  const rows = fallRows([{ seed: 1, summary: a }, { seed: 2, summary: b }, { seed: 3, summary: summarizeChild([]) }]);
  assert.equal(rows.onFurniture.children.length, 1);
  assert.equal(rows.onFurniture.highest, 70);
  assert.equal(rows.whileClimbing.children.length, 2);
  assert.equal(rows.whileClimbing.highest, 37);
});

test('a climb failure records where the climb began', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const simulation = createSimulation({ ledger, settings, months: 48, sex: 'female', seed, room: roomLayout });
    simulation.step(settings.trial_seconds);
    for (const event of simulation.events.filter(({ kind, reason }) => kind === EVENT.FELL && reason === 'climb_failure')) {
      assert.ok(Number.isFinite(event.startHeight) && event.startHeight >= 0 && event.startHeight < event.fromHeight + 1e-9);
    }
  }
});

test('the same seeds, layout and age give exactly the same floor, tiptoe and climbing counts', () => {
  const counts = () => judgeRoom({ ledger, settings, room: roomLayout, months: 48, sex: 'male' }).hazards;
  assert.deepEqual(counts(), counts());
});

// A test room: a cord on the low table (within reach from the floor), and a tin on a stand too
// high to reach from the floor, set against a chair. The stand's height is for this test only.
const STAND_CM = 160;
const find = (id) => roomLayout.landmarks.find((landmark) => landmark.id === id);
const chair = find('dining_chair');
const stand = {
  id: 'stand', label: 'テスト用の台', height: STAND_CM, scaffold: false,
  x: chair.x + chair.w, y: chair.y, w: 30, d: 30, approach: { x: chair.x + chair.w + 15, y: chair.y - 20 },
};
const testRoom = {
  ...roomLayout,
  landmarks: [find('low_table'), chair, stand, find('window'), find('window_lock')],
  hazards: [
    { id: 'cord', kind: 'cord', label: 'コード', on: 'low_table', dx: 40, dy: 25, w: 30, d: 4 },
    { id: 'tin', kind: 'medicine', label: '高い台の上の物', on: 'stand', dx: 0, dy: 10, w: 8, d: 8 },
  ],
};

test('a thing within reach from the floor goes to a; one that needs climbing goes to c', (t) => {
  for (const months of [36, 48]) {
    const { rows } = judgeRoom({ ledger, settings, room: testRoom, months, sex: 'female' }).hazards;
    const cord = rows.find(({ id }) => id === 'cord');
    const tin = rows.find(({ id }) => id === 'tin');
    assert.ok(cord.children.length > 0);
    assert.equal(cord.counts.floor, cord.children.length);
    assert.equal(tin.counts.floor + tin.counts.tiptoe, 0);
    assert.equal(tin.counts.climbed, tin.children.length);
    const line = `${months} months: cord a${cord.counts.floor} b${cord.counts.tiptoe} c${cord.counts.climbed}, stand ${STAND_CM}cm a${tin.counts.floor} b${tin.counts.tiptoe} c${tin.counts.climbed}`;
    t.diagnostic(line);
    console.log(line);
  }
});
