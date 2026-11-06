import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkLedger, readCode } from '../scripts/check-ledger.mjs';

const ledger = JSON.parse(readFileSync(new URL('../data/values_ledger.json', import.meta.url), 'utf8'));
const root = fileURLToPath(new URL('..', import.meta.url));

test('the ledger and the code pass the ledger check', () => {
  const { errors } = checkLedger(ledger, readCode(root));
  assert.deepEqual(errors, []);
});

const tiny = (items) => ({
  _meta: { categories: { measured: '', formula: '', converted: '', provisional: '' }, sources: { SRC: 'a source' } },
  items,
});

test('the check finds a value without a known source, an upgrade, and a coefficient in code', () => {
  const bad = tiny([
    { id: 'a', label: 'a', category: 'measured', source: 'somewhere' },
    { id: 'b', label: 'b', category: 'formula', source: 'SRC（未確認）', formula: 'y = 1.234 * x' },
    { id: 'c', label: 'c', category: 'measured', source: 'SRC', secondary_citation: true },
    { id: 'd', label: 'd', category: 'certain', source: 'SRC' },
  ]);
  const { errors } = checkLedger(bad, { 'sim/x.js': 'const k = 1.234;\n// 1.234 in a comment is fine' });
  assert.ok(errors.some((line) => line.startsWith('a:') && line.includes('出典')));
  assert.ok(errors.some((line) => line.startsWith('b:') && line.includes('未確認')));
  assert.ok(errors.some((line) => line.startsWith('c:') && line.includes('二次引用')));
  assert.ok(errors.some((line) => line.startsWith('d:') && line.includes('4区分')));
  assert.equal(errors.filter((line) => line.includes('1.234')).length, 1);
});

test('provisional values may have no source', () => {
  const { errors } = checkLedger(tiny([{ id: 'p', label: 'p', category: 'provisional', source: null }]));
  assert.deepEqual(errors, []);
});
