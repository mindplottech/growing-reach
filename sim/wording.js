import { ROW_CAUTION, ROW_DANGER, ROW_PLAIN } from './hazardReport.js';

/**
 * How a row reads, by the same rule as its colour: red is reached by climbing (with the
 * foothold most of those children used), yellow on tiptoe, grey from the floor.
 */
export function reachWords(row) {
  if (row.counts.climbed > 0) return { level: ROW_DANGER, text: `${row.foothold ?? '足場'}に登って届く` };
  if (row.counts.tiptoe > 0) return { level: ROW_CAUTION, text: '背伸びで届く' };
  if (row.counts.floor > 0) return { level: ROW_PLAIN, text: '床から届く' };
  return { level: ROW_PLAIN, text: '届かない' };
}
