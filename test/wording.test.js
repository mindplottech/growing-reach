import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_CAUTION, ROW_DANGER, ROW_PLAIN } from '../sim/hazardReport.js';
import { judgeRoom } from '../sim/verdict.js';
import { reachWords } from '../sim/wording.js';
import { ledger, roomLayout, settings } from './helpers.js';

const row = (floor, tiptoe, climbed, foothold = null) => ({ counts: { floor, tiptoe, climbed }, foothold });

test('the words follow the colour rule: climbed red, tiptoe yellow, floor grey', () => {
  assert.deepEqual(reachWords(row(12, 40, 26, '低い棚')), { level: ROW_DANGER, text: '低い棚に登って届く' });
  assert.deepEqual(reachWords(row(86, 3, 0)), { level: ROW_CAUTION, text: '背伸びで届く' });
  assert.deepEqual(reachWords(row(91, 0, 0)), { level: ROW_PLAIN, text: '床から届く' });
  assert.deepEqual(reachWords(row(0, 0, 0)), { level: ROW_PLAIN, text: '届かない' });
});

test('every row says what its colour says, and names the foothold most climbers used', () => {
  for (const months of [36, 48, 60]) {
    const { lock, rows } = judgeRoom({ ledger, settings, room: roomLayout, months, sex: 'female' }).hazards;
    for (const each of [lock, ...rows]) {
      assert.equal(reachWords(each).level, each.level, `${each.label} at ${months}`);
      if (each.counts.climbed > 0) assert.ok(reachWords(each).text.startsWith(each.foothold), each.label);
    }
  }
});
