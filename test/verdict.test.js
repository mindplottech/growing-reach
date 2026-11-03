import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT } from '../sim/events.js';
import { runTrials } from '../sim/trials.js';
import { judgeRoom, LEVEL_CAUTION, LEVEL_CLEAR, LEVEL_DANGER } from '../sim/verdict.js';
import { ledger, maxMonths, minMonths, roomLayout, settings } from './helpers.js';

const BASE = { ledger, settings, room: roomLayout, months: minMonths, sex: 'female' };
const without = (...ids) => ({ ...roomLayout, landmarks: roomLayout.landmarks.filter(({ id }) => !ids.includes(id)) });
const total = settings.trial_count;

test('the verdict counts the same children as the 100-child totals', () => {
  for (const months of [minMonths, maxMonths]) {
    const verdict = judgeRoom({ ...BASE, months });
    const totals = runTrials({ ...BASE, months });
    assert.deepEqual(verdict.children, totals.children);
  }
});

test('a child reaching the lock makes it red, with the count of children', () => {
  const verdict = judgeRoom(BASE);
  const reached = runTrials(BASE).children[EVENT.REACHED_LOCK];
  assert.ok(reached > 0);
  assert.equal(verdict.level, LEVEL_DANGER);
  assert.equal(verdict.headline, `窓の錠に手が届く子がいます（${total}人中${reached}人）`);
});

test('red reasons name the foothold and heights and point an arrow at the lock', () => {
  const verdict = judgeRoom(BASE);
  assert.ok(verdict.reasons.length >= 1 && verdict.reasons.length <= 3);
  assert.match(verdict.reasons[0], /^低い棚（37cm）から窓の錠（140cm）に手が届きます（100人中\d+人）$/);
  assert.deepEqual(verdict.arrows[0], { from: 'low_shelf', to: 'window_lock' });
  assert.ok(verdict.ids.has('low_shelf'));
  assert.ok(verdict.ids.has('window_lock'));
});

test('with no foothold near the window a young child gives a clear result, never "safe"', () => {
  const verdict = judgeRoom({ ...BASE, room: without('low_shelf') });
  assert.equal(verdict.level, LEVEL_CLEAR);
  assert.equal(verdict.headline, `錠に届いた子はいませんでした（${total}人中0人）`);
  assert.equal(verdict.reasons.length, 0);
  assert.ok(!verdict.headline.includes('安全'));
});

test('climbing near the window without reaching the lock is amber', () => {
  const low = { ...roomLayout.landmarks.find(({ id }) => id === 'low_shelf'), id: 'step', label: '踏み台', heightOf: undefined, height: 5 };
  const room = { ...without('low_shelf'), landmarks: [...without('low_shelf').landmarks, low] };
  const verdict = judgeRoom({ ...BASE, room });
  assert.equal(verdict.level, LEVEL_CAUTION);
  assert.match(verdict.headline, /^窓の近くの家具に登る子がいます（100人中\d+人）$/);
  assert.match(verdict.reasons[0], /^踏み台（5cm）に登りますが、窓の錠には届きません/);
});

test('reaching from the floor is told as such, with one arrow from the floor and none from furniture', () => {
  const room = without('low_shelf');
  const verdict = judgeRoom({ ...BASE, months: maxMonths, room });
  assert.equal(verdict.level, LEVEL_DANGER);
  assert.ok(verdict.reasons.some((text) => text.startsWith('床に立ったまま窓の錠（140cm）に手が届きます')));
  const lock = room.landmarks.find(({ role }) => role === 'window_lock');
  assert.deepEqual(verdict.arrows.filter(({ from }) => from !== null), []);
  assert.deepEqual(verdict.arrows.filter(({ from }) => from === null), [{ from: null, floor: lock.approach, to: lock.id }]);
});

test('the same room and child give the same verdict', () => {
  assert.deepEqual(judgeRoom(BASE), judgeRoom(BASE));
});

test('every level carries the count out of the total', () => {
  for (const room of [roomLayout, without('low_shelf')]) {
    assert.match(judgeRoom({ ...BASE, room }).headline, /（100人中\d+人）$/);
  }
});
