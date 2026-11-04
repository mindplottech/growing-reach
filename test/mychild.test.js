import test from 'node:test';
import assert from 'node:assert/strict';
import { SEX_ANY, climbFromHeight, getBodyValues, individualFromMeasurements } from '../sim/body.js';
import { createSimulation } from '../sim/simulation.js';
import { judgeRoom } from '../sim/verdict.js';
import { compareResults, conclusion, differenceText } from '../sim/compare.js';
import { byId, close, everyMonth, ledger, roomLayout, settings } from './helpers.js';

test('a child in general has the ledger average of both sexes, labelled as converted', () => {
  for (const months of everyMonth()) {
    const any = getBodyValues(ledger, { months, sex: SEX_ANY });
    const girl = getBodyValues(ledger, { months, sex: 'female' });
    const boy = getBodyValues(ledger, { months, sex: 'male' });
    close(any.height.value, (girl.height.value + boy.height.value) / 2);
    close(any.height.sd, (girl.height.sd + boy.height.sd) / 2);
    assert.equal(any.height.category, byId('height_both_sexes').category);
    assert.equal(any.climb.value, girl.climb.value);
  }
});

test('a measured height puts the child at the z that gives that height back', () => {
  for (const sex of ['female', 'male', SEX_ANY]) {
    const { z, notes } = individualFromMeasurements(ledger, { months: 30, sex, heightCm: 88 });
    close(getBodyValues(ledger, { months: 30, sex, z }).height.value, 88);
    assert.deepEqual(notes, []);
  }
});

test('with height alone the child keeps the same rank for climbing, so taller climbs higher; a typed climb wins', () => {
  const heightOnly = individualFromMeasurements(ledger, { months: 24, sex: 'female', heightCm: 90 });
  assert.equal(heightOnly.z.climb, heightOnly.z.height);
  const taller = individualFromMeasurements(ledger, { months: 24, sex: 'female', heightCm: 92 });
  const climbOf = (z) => getBodyValues(ledger, { months: 24, sex: 'female', z }).climb.value;
  assert.ok(climbOf(taller.z) > climbOf(heightOnly.z));
  assert.ok(climbOf(heightOnly.z) > climbOf({}));
  const both = individualFromMeasurements(ledger, { months: 24, sex: 'female', heightCm: 90, climbCm: 60 });
  close(climbOf(both.z), 60);
  assert.deepEqual(heightOnly.notes, []);
});

test('the ledger height formula is still readable as a reference', () => {
  close(climbFromHeight(ledger, 90), 1.0516 * 90 - 36.563);
});

test('a fixed individual keeps its height in every run, while the rest still varies by seed', () => {
  const { z } = individualFromMeasurements(ledger, { months: 36, sex: 'male', heightCm: 100 });
  const runs = [1, 2, 3].map((seed) => createSimulation({ ledger, settings, months: 36, sex: 'male', seed, room: roomLayout, individual: z }));
  for (const run of runs) close(run.body.height.value, 100);
  assert.ok(new Set(runs.map((run) => run.body.walkSpeed.value)).size > 1);
});

test('the verdict of one child counts runs, not children, and the words follow', () => {
  const base = { ledger, settings, room: roomLayout, months: 36, sex: 'female' };
  const general = judgeRoom(base);
  const one = judgeRoom({ ...base, individual: { height: 0, climb: 0 } });
  assert.equal(general.unit, '人');
  assert.equal(one.unit, '回');
  assert.match(one.hazards.lock.text, /100回中\d+回が届く/);
  const sections = compareResults(general, one);
  assert.equal(sections[2].title, '100回の内訳');
  assert.equal(differenceText(1, 3), '+2');
  const said = conclusion(sections, { leftName: 'a', rightName: 'b', kind: 'months', unit: '回' });
  assert.ok(said.text.includes('この子は') || said.text.includes('届き方は変わりませんでした'));
});

test('the median individual gives the same counts whichever seed draws the rest', () => {
  const base = { ledger, settings, room: roomLayout, months: 48, sex: SEX_ANY };
  const once = judgeRoom({ ...base, individual: { height: 0, climb: 0 } });
  const twice = judgeRoom({ ...base, individual: { height: 0, climb: 0 } });
  assert.deepEqual(once.hazards.lock.counts, twice.hazards.lock.counts);
});

test('the normal share below z matches the known values', async () => {
  const { normalCdf } = await import('../sim/random.js');
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1) - 0.1587) < 1e-4);
});
