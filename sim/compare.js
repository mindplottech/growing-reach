import { EVENT, EVENT_LABELS } from './events.js';
import { reachWords } from './wording.js';
import { ROW_CAUTION, ROW_DANGER, ROW_PLAIN } from './hazardReport.js';

const LEVEL_RANK = { [ROW_PLAIN]: 0, [ROW_CAUTION]: 1, [ROW_DANGER]: 2 };

export const SECTION_HAZARDS = 'hazards';
export const SECTION_FALLS = 'falls';
export const SECTION_COUNTS = 'counts';

export const TONE_UP = 'up';
export const TONE_DOWN = 'down';
export const TONE_SAME = 'same';

// The kinds counted under 「100人の内訳」, in this order.
const COUNTED = [EVENT.CLIMBED, EVENT.DESCENDED, EVENT.FELL, EVENT.TRIPPED];
// What the sentence calls each fall row.
const FALL_WORDS = { on_furniture: '家具の上から落ちた', while_climbing: '登る途中で落ちた' };

const climbedOf = (row) => row?.counts.climbed ?? 0;

/** The places of one result: the window lock first, then each dangerous thing. */
function places(verdict) {
  const { lock, rows } = verdict.hazards;
  return [...(lock ? [lock] : []), ...rows];
}

/**
 * The two results side by side, in three sections. Every number is a count of children in the
 * record; nothing is estimated. A dangerous thing's colour is that of the right-hand result.
 */
export function compareResults(left, right) {
  const unit = right.unit ?? '人';
  const leftPlaces = new Map(places(left).map((row) => [row.id, row]));
  const hazards = places(right).map((row) => {
    const before = leftPlaces.get(row.id);
    return {
      id: row.id,
      label: row.label,
      phrase: `${row.label}に届く`,
      left: before?.children.length ?? 0,
      right: row.children.length,
      leftClimbed: climbedOf(before),
      rightClimbed: climbedOf(row),
      level: reachWords(row).level,
      leftLevel: before ? reachWords(before).level : ROW_PLAIN,
      words: reachWords(row).text,
      leftWords: before ? reachWords(before).text : '届かない',
      seeds: row.children.map(({ seed }) => seed),
    };
  });
  const leftFalls = new Map(left.hazards.falls.map((fall) => [fall.id, fall]));
  const falls = right.hazards.falls.map((fall) => ({
    id: `fall-${fall.id}`,
    label: FALL_WORDS[fall.id],
    phrase: FALL_WORDS[fall.id],
    left: leftFalls.get(fall.id)?.children.length ?? 0,
    right: fall.children.length,
    seeds: fall.children.map(({ seed }) => seed),
  }));
  const counts = COUNTED.map((kind) => ({
    id: `count-${kind}`,
    label: EVENT_LABELS[kind],
    left: left.children[kind] ?? 0,
    right: right.children[kind] ?? 0,
  }));
  return [
    { id: SECTION_HAZARDS, title: '危険な物', rows: hazards },
    { id: SECTION_FALLS, title: '転倒・転落', rows: falls },
    { id: SECTION_COUNTS, title: `${right.total}${unit}の内訳`, rows: counts },
  ];
}

/** The difference as it is written in the table, in points of a hundred: +62, ±0, -5. */
export function differenceText(left, right) {
  const change = right - left;
  if (change === 0) return '±0';
  return `${change > 0 ? '+' : '-'}${Math.abs(change)}`;
}

export function toneOf(left, right) {
  if (right > left) return TONE_UP;
  if (right < left) return TONE_DOWN;
  return TONE_SAME;
}

/**
 * The conclusion in one fixed sentence, built from the table. It names the row that grew the
 * most among the dangerous things and the falls (the first in the table on a tie); with none
 * grown, the one that shrank the most; with no change at all, it says so.
 */
export function conclusion(sections, { leftName, rightName, kind, unit = '人', noiseBand = 0 }) {
  const hazards = sections.find(({ id }) => id === SECTION_HAZARDS)?.rows ?? [];
  const rows = sections.filter(({ id }) => id !== SECTION_COUNTS).flatMap(({ rows: each }) => each);
  const lead = kind === 'room' ? '配置を動かすと、' : `${leftName}から${rightName}になると、`;
  const subject = unit === '人' ? '' : 'この子は';
  // First, a change of colour (how a thing is reached): the worst rise, else the biggest fall.
  const shift = (row) => LEVEL_RANK[row.level] - LEVEL_RANK[row.leftLevel];
  const rose = hazards.filter((row) => shift(row) > 0).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
  const fell = hazards.filter((row) => shift(row) < 0).sort((a, b) => LEVEL_RANK[b.leftLevel] - LEVEL_RANK[a.leftLevel])[0];
  if (rose) {
    return { tone: TONE_UP, rowId: rose.id, text: `${lead}${subject}『${rose.label}』に${rose.words}ようになりました（${rose.left}%→${rose.right}%）。` };
  }
  if (fell) {
    const to = fell.words === '届かない' ? '届かなくなりました' : `${fell.words}だけになりました`;
    return { tone: TONE_DOWN, rowId: fell.id, text: `${lead}${subject}『${fell.label}』に${to}（${fell.left}%→${fell.right}%）。` };
  }
  // No colour changed: say so when every difference is within the band of chance.
  const largest = rows.reduce((best, row) => Math.max(best, Math.abs(row.right - row.left)), 0);
  if (largest <= noiseBand) {
    const spread = largest === 0 ? '' : `回数の違い（最大${largest}）は偶然の範囲です。`;
    return { tone: TONE_SAME, text: `${leftName}と${rightName}で、届き方は変わりませんでした。${spread}` };
  }
  // Otherwise the biggest change in count, a rise before a fall of the same size.
  const size = (row) => Math.abs(row.right - row.left);
  const row = rows.reduce((best, each) => (size(each) > size(best) || (size(each) === size(best) && each.right > each.left && best.right < best.left) ? each : best));
  const grown = row.right > row.left;
  const verb = grown ? '増えました' : '減りました';
  return {
    tone: grown ? TONE_UP : TONE_DOWN,
    rowId: row.id,
    text: `${lead}${subject}『${row.phrase}』のが${row.left}%から${row.right}%に${verb}。`,
  };
}

/**
 * The result in one line, worst first: what is reached by climbing, on tiptoe, from the floor,
 * and what is not reached. Built from the colours only; it never advises.
 */
export function summaryLine(sections, { name, unit = '人' }) {
  const hazards = sections.find(({ id }) => id === SECTION_HAZARDS)?.rows ?? [];
  const named = (level) => hazards.filter((row) => row.level === level && row.right > 0).map((row) => row.label);
  const notReached = hazards.filter((row) => row.right === 0).map((row) => row.label);
  const parts = [];
  if (named(ROW_DANGER).length) parts.push(`${named(ROW_DANGER).join('・')}に登って届く`);
  if (named(ROW_CAUTION).length) parts.push(`${named(ROW_CAUTION).join('・')}に背伸びで届く`);
  if (named(ROW_PLAIN).length) parts.push(`${named(ROW_PLAIN).join('・')}に床から届く`);
  if (notReached.length) parts.push(`${notReached.join('・')}には届かない`);
  const who = unit === '人' ? '' : 'この子は';
  return `${name}：${who}${parts.join('。')}。`;
}
