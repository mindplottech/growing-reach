// The ledger check: the rules of CLAUDE.md, checked by a machine rather than by memory.
//
//   node scripts/check-ledger.mjs        (npm run check:ledger; also run by the commit hook)
//
// 1. Every value carries one of the four categories of _meta.categories.
// 2. Every value that is not provisional points at a source listed in _meta.sources.
// 3. No upgrade: a value marked as a secondary citation, or whose source says 未確認
//    (not checked), is never 根拠あり (measured or formula).
// 4. The body values are read from the ledger only: the coefficients of the ledger's formulas
//    never appear as numbers in the code (sim/ and render/).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRONG = new Set(['measured', 'formula']);

/** All problems found, as lines of text. `code` maps a file name to its text. */
export function checkLedger(ledger, code = {}) {
  const errors = [];
  const meta = ledger._meta ?? {};
  const categories = Object.keys(meta.categories ?? {});
  const sourceKeys = Object.keys(meta.sources ?? {});
  const used = new Set();
  const citesKnown = (text) => {
    const found = sourceKeys.filter((key) => String(text ?? '').includes(key));
    found.forEach((key) => used.add(key));
    return found.length > 0;
  };

  // Walk every object that carries a category; a source is inherited from the nearest parent.
  const walk = (node, path, inheritedSource, secondary) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, inheritedSource, secondary));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const source = node.source !== undefined ? node.source : inheritedSource;
    const isSecondary = secondary || node.secondary_citation === true;
    if ('category' in node) {
      const category = node.category;
      const nested = Object.values(node.values ?? {}).some((value) => value && typeof value === 'object' && 'category' in value);
      if (!categories.includes(category)) errors.push(`${path}: 区分「${category}」は台帳の4区分にない`);
      // A container whose values each carry their own category is checked value by value.
      const cited = citesKnown(source);
      if (category !== 'provisional' && !nested && !cited) {
        errors.push(`${path}: 区分が「${category}」なのに、出典一覧（_meta.sources）にある出典を指していない（source: ${source}）`);
      }
      if (STRONG.has(category) && isSecondary) errors.push(`${path}: 二次引用の値が「${category}」になっている（格上げ）`);
      if (STRONG.has(category) && String(source ?? '').includes('未確認') && !nested) {
        errors.push(`${path}: 出典に「未確認」とある値が「${category}」になっている（格上げ）`);
      }
    } else if (node.source) {
      citesKnown(node.source);
    }
    if (node.point_categories) {
      for (const [at, category] of Object.entries(node.point_categories)) {
        if (!categories.includes(category)) errors.push(`${path}.point_categories.${at}: 区分「${category}」は台帳の4区分にない`);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'source' || key === 'note') continue;
      walk(child, `${path}.${key}`, source, isSecondary);
    }
  };
  (ledger.items ?? []).forEach((item) => {
    if (!item.id || !item.label) errors.push(`items: id か label のない項目がある（${item.id ?? '?'}）`);
    if (!('category' in item)) errors.push(`${item.id}: 区分（category）がない`);
    walk(item, item.id, null, false);
  });

  // The formulas' coefficients (three or more significant digits) must not be written in code.
  const coefficients = new Set();
  const collect = (node) => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!node || typeof node !== 'object') return;
    if (typeof node.formula === 'string') {
      for (const number of node.formula.match(/\d+\.\d+/g) ?? []) {
        if (number.replace('.', '').replace(/^0+/, '').length >= 3) coefficients.add(number);
      }
    }
    Object.values(node).forEach(collect);
  };
  collect(ledger.items);
  for (const [file, text] of Object.entries(code)) {
    for (const number of coefficients) {
      const pattern = new RegExp(`(?<![\\d.])${number.replace('.', '\\.')}(?![\\d])`);
      text.split('\n').forEach((line, i) => {
        if (pattern.test(line.replace(/\/\/.*$/, ''))) errors.push(`${file}:${i + 1}: 台帳の式の係数 ${number} がコードに直接書かれている（台帳から読む）`);
      });
    }
  }

  const unused = sourceKeys.filter((key) => !used.has(key));
  return { errors, coefficients: [...coefficients], unusedSources: unused, counts: countCategories(ledger) };
}

function countCategories(ledger) {
  const counts = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.category === 'string') counts[node.category] = (counts[node.category] ?? 0) + 1;
    Object.values(node).forEach(walk);
  };
  walk(ledger.items);
  return counts;
}

/** The code files the rule 4 looks at. */
export function readCode(root) {
  const code = {};
  for (const dir of ['sim', 'render']) {
    for (const name of readdirSync(join(root, dir))) {
      if (name.endsWith('.js')) code[`${dir}/${name}`] = readFileSync(join(root, dir, name), 'utf8');
    }
  }
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const ledger = JSON.parse(readFileSync(join(root, 'data/values_ledger.json'), 'utf8'));
  const { errors, coefficients, unusedSources, counts } = checkLedger(ledger, readCode(root));
  const names = ledger._meta.categories;
  console.log(`台帳の検証：区分ごとの値の数 ${Object.entries(counts).map(([k, n]) => `${names[k] ?? k} ${n}`).join('／')}`);
  console.log(`コードに書かれていないか確かめた式の係数：${coefficients.join('、')}`);
  if (unusedSources.length) console.log(`（参考）どの値からも指されていない出典：${unusedSources.join('、')}`);
  if (errors.length) {
    console.error(`\n台帳の検証で ${errors.length} 件の問題：`);
    for (const line of errors) console.error(`- ${line}`);
    process.exit(1);
  }
  console.log('台帳の検証：問題なし');
}
