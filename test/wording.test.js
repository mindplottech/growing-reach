import test from 'node:test';
import assert from 'node:assert/strict';
import { METHOD_CLIMBED, METHOD_FLOOR, METHOD_TIPTOE } from '../sim/hazardReport.js';
import { degreeWord, levelChange, mainMethod } from '../sim/wording.js';
import { settings } from './helpers.js';

test('the degree words follow the display steps: 90, 50, 10, 1 and 0 out of 100', () => {
  const word = (n) => degreeWord(n / 100, settings.degree_words);
  assert.equal(word(100), 'ほぼ全員が届く');
  assert.equal(word(90), 'ほぼ全員が届く');
  assert.equal(word(89), '多くの子が届く');
  assert.equal(word(50), '多くの子が届く');
  assert.equal(word(49), '届く子もいる');
  assert.equal(word(10), '届く子もいる');
  assert.equal(word(9), 'まれに届く');
  assert.equal(word(1), 'まれに届く');
  assert.equal(word(0), '届かない');
});

test('the way named is the one most children used, the more severe on a tie', () => {
  assert.equal(mainMethod({ floor: 12, tiptoe: 40, climbed: 26 }), METHOD_TIPTOE);
  assert.equal(mainMethod({ floor: 0, tiptoe: 0, climbed: 58 }), METHOD_CLIMBED);
  assert.equal(mainMethod({ floor: 10, tiptoe: 0, climbed: 10 }), METHOD_CLIMBED);
  assert.equal(mainMethod({ floor: 86, tiptoe: 0, climbed: 7 }), METHOD_FLOOR);
  assert.equal(mainMethod({ floor: 0, tiptoe: 0, climbed: 0 }), null);
});

test('a change of colour reads as more or less dangerous', () => {
  assert.equal(levelChange('plain', 'danger'), 1);
  assert.equal(levelChange('caution', 'plain'), -1);
  assert.equal(levelChange('danger', 'danger'), 0);
  assert.equal(levelChange('clear', 'danger'), 1);
});
