import { EVENT } from './events.js';
import { createSimulation } from './simulation.js';

const EVENT_KINDS = Object.values(EVENT);

const emptyCounts = () => Object.fromEntries(EVENT_KINDS.map((kind) => [kind, 0]));

function tallyEvents(events) {
  const counts = emptyCounts();
  for (const { kind } of events) counts[kind] += 1;
  return counts;
}

/** Objects by how often an event used them as a foothold, most used first; ties by id. */
function rankFootholds(events) {
  const tally = new Map();
  for (const { footholdId: id, footholdLabel: label } of events) {
    if (!tally.has(id)) tally.set(id, { id, label, count: 0 });
    tally.get(id).count += 1;
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * One trial is one child (one seed) spending the set time in the room. The children are
 * seeds 1 to the set count, so two runs with different conditions compare the same children.
 */
export function runTrials({ ledger, settings, room, boxes = [], months, sex }) {
  const perSeed = [];
  const allEvents = [];
  for (let seed = 1; seed <= settings.trial_count; seed += 1) {
    const simulation = createSimulation({ ledger, settings, months, sex, seed, room, boxes });
    simulation.step(settings.trial_seconds);
    perSeed.push({ seed, counts: tallyEvents(simulation.events) });
    allEvents.push(...simulation.events);
  }
  const children = emptyCounts();
  for (const { counts } of perSeed) {
    for (const kind of EVENT_KINDS) if (counts[kind] > 0) children[kind] += 1;
  }
  const lockReaches = allEvents.filter(({ kind }) => kind === EVENT.REACHED_LOCK);
  return {
    months,
    sex,
    counts: tallyEvents(allEvents),
    children,
    footholds: rankFootholds(allEvents.filter(({ kind }) => kind === EVENT.CLIMBED)),
    lockFootholds: rankFootholds(lockReaches.filter(({ footholdId }) => footholdId)),
    lockFromFloor: lockReaches.filter(({ footholdId }) => !footholdId).length,
    perSeed,
  };
}

/** Paired comparison: totals per kind, and how many of the same children went up or down. */
export function compareTrials(before, after) {
  return EVENT_KINDS.map((kind) => {
    const pairs = before.perSeed.map(({ seed, counts }, i) => {
      if (after.perSeed[i].seed !== seed) throw new Error('trials are not paired by seed');
      return after.perSeed[i].counts[kind] - counts[kind];
    });
    return {
      kind,
      childrenBefore: before.children[kind],
      childrenAfter: after.children[kind],
      before: before.counts[kind],
      after: after.counts[kind],
      diff: after.counts[kind] - before.counts[kind],
      childrenUp: pairs.filter((change) => change > 0).length,
      childrenDown: pairs.filter((change) => change < 0).length,
    };
  });
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

const centre = (object) => ({ x: object.x + object.w / 2, y: object.y + object.d / 2 });

/**
 * The room with one object, and any others in its group, moved `distance` cm straight away
 * from the window lock. Null if it would leave the room or overlap something.
 */
export function moveAwayFromLock({ room, boxes = [] }, objectId, distance) {
  const everything = [...room.landmarks, ...boxes];
  const object = everything.find(({ id }) => id === objectId);
  const lock = everything.find(({ role }) => role === 'window_lock');
  const inGroup = (other) => other.id === objectId || (object.group && other.group === object.group);
  const group = everything.filter(inGroup);
  const left = Math.min(...group.map(({ x }) => x));
  const right = Math.max(...group.map(({ x, w }) => x + w));
  const top = Math.min(...group.map(({ y }) => y));
  const bottom = Math.max(...group.map(({ y, d }) => y + d));
  const from = centre(lock);
  const toX = (left + right) / 2 - from.x;
  const toY = (top + bottom) / 2 - from.y;
  const length = Math.hypot(toX, toY);
  const dx = (toX / length) * distance;
  const dy = (toY / length) * distance;
  const inRoom = (value, max) => Math.min(Math.max(value, 0), max);
  const shift = (item) => ({
    ...item,
    x: item.x + dx,
    y: item.y + dy,
    approach: {
      x: inRoom(item.approach.x + dx, room.width),
      y: inRoom(item.approach.y + dy, room.depth),
    },
  });
  const moved = group.map(shift);
  const others = everything.filter((other) => !inGroup(other));
  const outside = moved.some(({ x, y, w, d }) => x < 0 || y < 0 || x + w > room.width || y + d > room.depth);
  if (outside || moved.some((item) => others.some((other) => overlaps(item, other)))) return null;
  const swap = (list) => list.map((item) => (inGroup(item) ? shift(item) : item));
  return { room: { ...room, landmarks: swap(room.landmarks) }, boxes: swap(boxes) };
}

/**
 * Moves one object away from the lock step by step, rerunning all trials each time, and
 * stops at the first distance where the lock count is zero. Every number is from a rerun.
 */
export function searchMoves(base, foothold, baselineLock) {
  const { countermeasure_step_cm: step, countermeasure_limit_cm: limit } = base.settings;
  const tried = [];
  for (let distance = step; distance <= limit; distance += step) {
    const moved = moveAwayFromLock(base, foothold.id, distance);
    if (moved) {
      const result = runTrials({ ...base, ...moved });
      const lock = result.counts[EVENT.REACHED_LOCK];
      tried.push({
        distance,
        lock,
        children: result.children[EVENT.REACHED_LOCK],
        lockFromFloor: result.lockFromFloor,
      });
      if (lock === 0) break;
    }
  }
  const last = tried[tried.length - 1] ?? null;
  return {
    id: foothold.id,
    label: foothold.label,
    baselineLock,
    tried,
    found: last && last.lock === 0 ? last.distance : null,
    last,
  };
}

/**
 * Searches for the foothold most used to reach the lock, or the most used foothold overall
 * if none reached it. Only the former can change the lock count directly.
 */
export function findCountermeasure(base) {
  const baseline = runTrials(base);
  const baselineLock = baseline.counts[EVENT.REACHED_LOCK];
  const [mostUsed = null] = baseline.footholds;
  const target = baseline.lockFootholds[0] ?? mostUsed;
  return {
    baseline,
    baselineLock,
    baselineChildren: baseline.children[EVENT.REACHED_LOCK],
    mostUsed,
    target: target && searchMoves(base, target, baselineLock),
  };
}
