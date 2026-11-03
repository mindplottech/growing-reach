import { METHOD_CLIMBED, METHOD_FLOOR, METHOD_TIPTOE } from './hazardReport.js';

// Severity of a row colour, for telling whether a change made a place more or less dangerous.
const RANK = { plain: 0, clear: 0, caution: 1, danger: 2 };

/** The words for a share of children (0 to 1), by the display-only steps in sim/params.js. */
export function degreeWord(share, { steps, none }) {
  if (share <= 0) return none;
  const step = [...steps].sort((a, b) => b.min - a.min).find(({ min }) => share >= min - 1e-9);
  return step ? step.text : steps[steps.length - 1].text;
}

// Most severe first, so a tie names the way that matters more.
const BY_SEVERITY = [METHOD_CLIMBED, METHOD_TIPTOE, METHOD_FLOOR];
const COUNT_KEY = { [METHOD_CLIMBED]: 'climbed', [METHOD_TIPTOE]: 'tiptoe', [METHOD_FLOOR]: 'floor' };
export const METHOD_WORDS = { [METHOD_CLIMBED]: '登って', [METHOD_TIPTOE]: '背伸びで', [METHOD_FLOOR]: '床から' };

/** The way most of the children who reached it got there; null if nobody did. */
export function mainMethod(counts) {
  let best = null;
  for (const method of BY_SEVERITY) {
    const count = counts[COUNT_KEY[method]];
    if (count > 0 && (best === null || count > counts[COUNT_KEY[best]])) best = method;
  }
  return best;
}

/** Whether a row became more dangerous (1), less (-1) or kept its colour (0). */
export function levelChange(before, after) {
  return Math.sign((RANK[after] ?? 0) - (RANK[before] ?? 0));
}
