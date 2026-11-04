import { EVENT, EVENT_LABELS } from './events.js';
import { reachWords } from './wording.js';

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

/** The difference as it is written in the table: +62人, ±0, -5人. */
export function differenceText(left, right, unit = '人') {
  const change = right - left;
  if (change === 0) return '±0';
  return `${change > 0 ? '+' : '-'}${Math.abs(change)}${unit}`;
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
export function conclusion(sections, { leftName, rightName, kind, unit = '人' }) {
  const rows = sections.filter(({ id }) => id !== SECTION_COUNTS).flatMap(({ rows: each }) => each);
  const pick = (better) => rows.reduce((best, row) => (better(row, best) ? row : best), null);
  const grown = pick((row, best) => row.right - row.left > 0 && (!best || row.right - row.left > best.right - best.left));
  const shrunk = pick((row, best) => row.right - row.left < 0 && (!best || row.right - row.left < best.right - best.left));
  const row = grown ?? shrunk;
  if (!row) return { tone: TONE_SAME, text: `${leftName}と${rightName}では、ほとんど変わりませんでした。` };
  const lead = kind === 'room' ? '配置を動かすと、' : `${leftName}から${rightName}になると、`;
  const verb = row === grown ? '増えました' : '減りました';
  return {
    tone: row === grown ? TONE_UP : TONE_DOWN,
    rowId: row.id,
    text: unit === '人'
      ? `${lead}『${row.phrase}』子が${row.left}人から${row.right}人に${verb}。`
      : `${lead}この子が『${row.phrase}』回が${row.left}回から${row.right}回に${verb}。`,
  };
}
