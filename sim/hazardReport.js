import { EVENT } from './events.js';
import { REACH_TIPTOE } from './scaffold.js';

// How a child got a hand to a dangerous thing, easiest first.
export const METHOD_FLOOR = 'floor';
export const METHOD_TIPTOE = 'tiptoe';
export const METHOD_CLIMBED = 'climbed';
const METHOD_ORDER = [METHOD_FLOOR, METHOD_TIPTOE, METHOD_CLIMBED];

export const ROW_DANGER = 'danger';
export const ROW_CAUTION = 'caution';
export const ROW_PLAIN = 'plain';

const FALL_ON_FURNITURE = new Set(['balance', 'cannot_descend']);
const FALL_WHILE_CLIMBING = 'climb_failure';

/** Read from the record alone: from a foothold is climbing; from the floor, tiptoe or flat. */
export function methodOf(event) {
  const fromFoothold = event.kind === EVENT.REACHED_LOCK ? Boolean(event.footholdId) : event.from === 'foothold';
  if (fromFoothold) return METHOD_CLIMBED;
  return event.level === REACH_TIPTOE ? METHOD_TIPTOE : METHOD_FLOOR;
}

const easier = (a, b) => METHOD_ORDER.indexOf(a) < METHOD_ORDER.indexOf(b);

/**
 * What one child's record says: for each dangerous thing the easiest way they reached it
 * (once, however many times they touched it), and the highest place of each kind of fall.
 */
export function summarizeChild(events) {
  const hazards = new Map();
  let lock = null;
  let onFurniture = null;
  let whileClimbing = null;
  for (const event of events) {
    // The window lock is counted the same way: once per child, by the easiest way.
    if (event.kind === EVENT.REACHED_LOCK) {
      const method = methodOf(event);
      if (!lock || easier(method, lock.method)) {
        lock = { method, footholdLabel: method === METHOD_CLIMBED ? event.footholdLabel : null };
      }
    }
    if (event.kind === EVENT.TOUCHED_HAZARD) {
      const method = methodOf(event);
      const known = hazards.get(event.hazardId);
      if (!known || easier(method, known.method)) {
        hazards.set(event.hazardId, {
          method,
          footholdLabel: method === METHOD_CLIMBED ? event.footholdLabel : null,
        });
      }
    }
    if (event.kind !== EVENT.FELL) continue;
    if (FALL_ON_FURNITURE.has(event.reason) && (!onFurniture || event.fromHeight > onFurniture.height)) {
      onFurniture = { height: event.fromHeight, label: event.footholdLabel };
    }
    if (event.reason === FALL_WHILE_CLIMBING && (!whileClimbing || event.startHeight > whileClimbing.height)) {
      whileClimbing = { height: event.startHeight, label: event.footholdLabel };
    }
  }
  return { hazards, lock, onFurniture, whileClimbing };
}

/** Worth playing: the child reached the lock or a dangerous thing (in any way), or fell. */
export function somethingHappened(summary) {
  return Boolean(summary.lock || summary.onFurniture || summary.whileClimbing) || summary.hazards.size > 0;
}

/** The lock row: who reached the window lock, how, and its colour by the same rule as the things. */
export function lockRow(lockObject, children) {
  const withLock = children.map(({ seed, summary }) => ({
    seed, summary: { ...summary, hazards: summary.lock ? new Map([[lockObject.id, summary.lock]]) : new Map() },
  }));
  return hazardRows([{ id: lockObject.id, label: lockObject.label }], withLock)[0];
}

/** The value that comes up most often; on a tie the one seen first (the lower seed). */
function commonest(values) {
  const tally = new Map();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  let best = null;
  for (const [value, count] of tally) if (best === null || count > tally.get(best)) best = value;
  return best;
}

/**
 * One row per dangerous thing: who reached it, how, the colour the counts give it, and the
 * foothold most of the climbing children reached it from.
 */
export function hazardRows(hazards, children) {
  return hazards.map(({ id, label }) => {
    const reached = children
      .filter(({ summary }) => summary.hazards.has(id))
      .map(({ seed, summary }) => ({ seed, ...summary.hazards.get(id) }));
    const count = (method) => reached.filter((child) => child.method === method).length;
    const counts = { floor: count(METHOD_FLOOR), tiptoe: count(METHOD_TIPTOE), climbed: count(METHOD_CLIMBED) };
    let level = ROW_PLAIN;
    if (counts.climbed > 0) level = ROW_DANGER;
    else if (counts.tiptoe > 0) level = ROW_CAUTION;
    return { id, label, children: reached, counts, level, foothold: commonest(reached.filter((child) => child.method === METHOD_CLIMBED).map(({ footholdLabel }) => footholdLabel)) };
  });
}

/** The two kinds of fall, each with its children and the highest place among them. */
export function fallRows(children) {
  const row = (key) => {
    const fell = children
      .filter(({ summary }) => summary[key])
      .map(({ seed, summary }) => ({ seed, ...summary[key] }));
    const highest = fell.length > 0 ? Math.max(...fell.map(({ height }) => height)) : null;
    return { key, children: fell, highest };
  };
  return { onFurniture: row('onFurniture'), whileClimbing: row('whileClimbing') };
}
