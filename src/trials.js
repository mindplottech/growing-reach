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
  const lockReaches = allEvents.filter(({ kind }) => kind === EVENT.REACHED_LOCK);
  return {
    months,
    sex,
    counts: tallyEvents(allEvents),
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
 * The room with one object moved `distance` cm straight away from the window lock, or null
 * if it would leave the room or overlap something. Works on furniture and placed boxes.
 */
export function moveAwayFromLock({ room, boxes = [] }, objectId, distance) {
  const everything = [...room.landmarks, ...boxes];
  const object = everything.find(({ id }) => id === objectId);
  const lock = everything.find(({ role }) => role === 'window_lock');
  const from = centre(lock);
  const to = centre(object);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const dx = ((to.x - from.x) / length) * distance;
  const dy = ((to.y - from.y) / length) * distance;
  const inRoom = (x, max) => Math.min(Math.max(x, 0), max);
  const moved = {
    ...object,
    x: object.x + dx,
    y: object.y + dy,
    approach: {
      x: inRoom(object.approach.x + dx, room.width),
      y: inRoom(object.approach.y + dy, room.depth),
    },
  };
  const outside = moved.x < 0 || moved.y < 0 || moved.x + moved.w > room.width || moved.y + moved.d > room.depth;
  if (outside || everything.some((other) => other.id !== objectId && overlaps(moved, other))) return null;
  const swap = (list) => list.map((item) => (item.id === objectId ? moved : item));
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
      tried.push({ distance, lock, lockFromFloor: result.lockFromFloor });
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
 * Searches for the most used foothold, and also for the one most used to reach the lock
 * when that is a different object, because only the latter can change the lock count.
 */
export function findCountermeasure(base) {
  const baseline = runTrials(base);
  const baselineLock = baseline.counts[EVENT.REACHED_LOCK];
  const [mostUsed] = baseline.footholds;
  const [mostUsedForLock] = baseline.lockFootholds;
  return {
    baseline,
    baselineLock,
    mostUsed: mostUsed ? searchMoves(base, mostUsed, baselineLock) : null,
    forLock: mostUsedForLock && mostUsedForLock.id !== mostUsed?.id
      ? searchMoves(base, mostUsedForLock, baselineLock)
      : null,
  };
}
