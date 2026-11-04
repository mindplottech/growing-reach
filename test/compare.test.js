import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareResults, conclusion, differenceText, SECTION_COUNTS, SECTION_FALLS, SECTION_HAZARDS, toneOf, TONE_DOWN, TONE_SAME, TONE_UP,
} from '../sim/compare.js';
import { EVENT } from '../sim/events.js';
import { createSimulation } from '../sim/simulation.js';
import { judgeRoom } from '../sim/verdict.js';
import { reachWords } from '../sim/wording.js';
import { ledger, minMonths, roomLayout, settings } from './helpers.js';

const BASE = { ledger, settings, room: roomLayout, sex: 'female' };
const left = judgeRoom({ ...BASE, months: minMonths });
const right = judgeRoom({ ...BASE, months: 48 });
const sections = compareResults(left, right);
const section = (id) => sections.find((each) => each.id === id);

test('the table has three sections: the lock first among the dangerous things, two falls, four counts', () => {
  assert.deepEqual(sections.map(({ id }) => id), [SECTION_HAZARDS, SECTION_FALLS, SECTION_COUNTS]);
  const hazards = section(SECTION_HAZARDS).rows;
  assert.equal(hazards[0].id, right.hazards.lock.id);
  assert.deepEqual(hazards.slice(1).map(({ id }) => id), right.hazards.rows.map(({ id }) => id));
  assert.deepEqual(section(SECTION_FALLS).rows.map(({ label }) => label), ['家具の上から落ちた', '登る途中で落ちた']);
  assert.deepEqual(section(SECTION_COUNTS).rows.map(({ label }) => label), ['登った', '降りた', '落ちた', '転んだ']);
});

test('every number in the table is the count of children in each result', () => {
  const [lock] = section(SECTION_HAZARDS).rows;
  assert.equal(lock.left, left.hazards.lock.children.length);
  assert.equal(lock.right, right.hazards.lock.children.length);
  assert.equal(lock.rightClimbed, right.hazards.lock.counts.climbed);
  assert.equal(lock.level, reachWords(right.hazards.lock).level);
  for (const row of section(SECTION_FALLS).rows) {
    const id = row.id.replace('fall-', '');
    assert.equal(row.left, left.hazards.falls.find((fall) => fall.id === id).children.length);
    assert.equal(row.right, right.hazards.falls.find((fall) => fall.id === id).children.length);
  }
  const climbed = section(SECTION_COUNTS).rows[0];
  assert.equal(climbed.left, left.children[EVENT.CLIMBED]);
  assert.equal(climbed.right, right.children[EVENT.CLIMBED]);
});

test('differences read +n人, ±0 and -n人, with a tone for the colour', () => {
  assert.equal(differenceText(0, 62), '+62人');
  assert.equal(differenceText(5, 5), '±0');
  assert.equal(differenceText(10, 5), '-5人');
  assert.equal(toneOf(0, 1), TONE_UP);
  assert.equal(toneOf(1, 0), TONE_DOWN);
  assert.equal(toneOf(3, 3), TONE_SAME);
});

const row = (id, before, after) => ({ id, phrase: `${id}に届く`, left: before, right: after });
const table = (...rows) => [{ id: SECTION_HAZARDS, rows }, { id: SECTION_COUNTS, rows: [row('登った', 0, 99)] }];
const months = { leftName: '3歳0か月', rightName: '4歳0か月', kind: 'months' };

test('the conclusion names the row that grew the most, never a count under 100人の内訳', () => {
  const said = conclusion(table(row('窓の錠', 0, 62), row('薬', 10, 30)), months);
  assert.equal(said.text, '3歳0か月から4歳0か月になると、『窓の錠に届く』子が0人から62人に増えました。');
  assert.equal(said.tone, TONE_UP);
});

test('with nothing grown it names the row that shrank the most, and with no change it says so', () => {
  const room = { leftName: '動かす前', rightName: '動かした後', kind: 'room' };
  const shrunk = conclusion(table(row('窓の錠', 62, 0), row('薬', 30, 30)), room);
  assert.equal(shrunk.text, '配置を動かすと、『窓の錠に届く』子が62人から0人に減りました。');
  assert.equal(shrunk.tone, TONE_DOWN);
  const same = conclusion(table(row('窓の錠', 62, 62)), room);
  assert.equal(same.text, '動かす前と動かした後では、ほとんど変わりませんでした。');
  assert.equal(same.tone, TONE_SAME);
});

test('the sentence for the real start reads from the two calculations', () => {
  const said = conclusion(sections, months);
  assert.match(said.text, /^3歳0か月から4歳0か月になると、『.+』子が\d+人から\d+人に(増え|減り)ました。$/);
});

test('the averages are the mean of the hundred children drawn for the result', () => {
  let height = 0;
  for (let seed = 1; seed <= settings.trial_count; seed += 1) {
    height += createSimulation({ ...BASE, months: 48, seed }).body.height.value;
  }
  assert.ok(Math.abs(right.averages.height - height / settings.trial_count) < 1e-9);
  assert.ok(right.averages.climb > 0);
});
