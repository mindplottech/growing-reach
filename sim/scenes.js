import { EVENT } from './events.js';
import { METHOD_CLIMBED, METHOD_TIPTOE, methodOf, summarizeChild } from './hazardReport.js';

export const SCENE_TOUCH = 'touch';
export const SCENE_FALL = 'fall';

const FALL_ON_FURNITURE = new Set(['balance', 'cannot_descend']);
const FALL_WHILE_CLIMBING = 'climb_failure';
export const FALL_KIND_ON_FURNITURE = 'on_furniture';
export const FALL_KIND_WHILE_CLIMBING = 'while_climbing';

export function fallKindOf(event) {
  if (FALL_ON_FURNITURE.has(event.reason)) return FALL_KIND_ON_FURNITURE;
  if (event.reason === FALL_WHILE_CLIMBING) return FALL_KIND_WHILE_CLIMBING;
  return null;
}

/** The thing a reach is of: the lock by its id, a dangerous thing by its own. */
const thingOf = (event) => (event.kind === EVENT.REACHED_LOCK ? event.targetId : event.hazardId);
const isReach = (event) => event.kind === EVENT.REACHED_LOCK || event.kind === EVENT.TOUCHED_HAZARD;

/**
 * The moments of one child's record worth watching. For each thing reached, the first time it
 * was reached in the way the table counts it (the easiest way the child ever reached it), so a
 * scene always agrees with the row it is in. For falls, the first fall of each kind, and the
 * first fall of all.
 */
export function scenesOf(events) {
  const summary = summarizeChild(events);
  const counted = (event) => (event.kind === EVENT.REACHED_LOCK ? summary.lock : summary.hazards.get(event.hazardId))?.method;
  const touches = [];
  const seen = new Set();
  for (const event of events) {
    if (!isReach(event)) continue;
    const thing = thingOf(event);
    if (seen.has(thing) || methodOf(event) !== counted(event)) continue;
    seen.add(thing);
    touches.push({
      type: SCENE_TOUCH,
      thing,
      lock: event.kind === EVENT.REACHED_LOCK,
      time: event.time,
      method: methodOf(event),
      chain: (event.chain ?? []).map(({ id, label }) => ({ id, label })),
    });
  }
  const falls = [];
  const fallKinds = new Set();
  for (const event of events) {
    if (event.kind !== EVENT.FELL) continue;
    const kind = fallKindOf(event);
    if (fallKinds.has(kind)) continue;
    fallKinds.add(kind);
    falls.push({
      type: SCENE_FALL,
      fallKind: kind,
      time: event.time,
      foothold: { id: event.footholdId, label: event.footholdLabel },
      first: falls.length === 0,
    });
  }
  return { touches, falls };
}

/** The part of the run a scene plays: from `before` seconds ahead of the moment to `after` past it. */
export function sceneWindow(time, { before, after, trialSeconds }) {
  return { start: Math.max(0, time - before), end: Math.min(trialSeconds, time + after) };
}

/**
 * The sentence shown large at the moment, from the record: the footholds in the order they were
 * stood on, or the floor. `nameOf` gives the short name the room shows on a thing.
 */
export function momentText(scene, nameOf) {
  if (scene.type === SCENE_FALL) {
    const where = nameOf(scene.foothold.id, scene.foothold.label);
    return scene.fallKind === FALL_KIND_WHILE_CLIMBING ? `${where}に登る途中で落ちた` : `${where}から落ちた`;
  }
  const thing = nameOf(scene.thing);
  if (scene.method === METHOD_CLIMBED && scene.chain.length > 0) {
    return `${scene.chain.map(({ id, label }) => nameOf(id, label)).join(' → ')} → ${thing}に届いた`;
  }
  return scene.method === METHOD_TIPTOE ? `床から背伸びで ${thing}に届いた` : `床から ${thing}に届いた`;
}

const bySeed = (a, b) => a.seed - b.seed;
const climbedFirst = (a, b) => Number(b.scene.method === METHOD_CLIMBED) - Number(a.scene.method === METHOD_CLIMBED) || bySeed(a, b);

/** Each touch of every child, as { seed, scene }. */
const allTouches = (children) => children.flatMap(({ seed, touches }) => touches.map((scene) => ({ seed, scene })));

/**
 * The order of the automatic playing: the children who climbed to the window lock, then those
 * who climbed to any other thing, then those who reached from the floor; each by seed, and on
 * one seed in the order of the things in the table.
 */
export function autoplayOrder(children, thingOrder) {
  const order = (entry) => thingOrder.indexOf(entry.scene.thing);
  const group = ({ scene }) => {
    if (scene.method !== METHOD_CLIMBED) return 2;
    return scene.lock ? 0 : 1;
  };
  return allTouches(children).sort((a, b) => group(a) - group(b) || bySeed(a, b) || order(a) - order(b));
}

/** The touches of one thing: those who climbed first, then those from the floor; each by seed. */
export function thingOrder(children, thing) {
  return allTouches(children).filter(({ scene }) => scene.thing === thing).sort(climbedFirst);
}

/** The first fall of each child who fell, by seed; or, given a kind, the first fall of that kind. */
export function fallOrder(children, fallKind = null) {
  return children
    .flatMap(({ seed, falls }) => falls
      .filter((scene) => (fallKind ? scene.fallKind === fallKind : scene.first))
      .map((scene) => ({ seed, scene })))
    .sort(bySeed);
}

const FALL_HEADINGS = { [FALL_KIND_ON_FURNITURE]: '家具の上から落ちた子', [FALL_KIND_WHILE_CLIMBING]: '登る途中で落ちた子' };

/**
 * Everything one condition can play, as scenes ready for the screen. `verdict` is that
 * condition's judgeRoom result and `condition` its { months, sex, room }. Each scene says which
 * child of how many it is, counted in the list of its own thing (or kind of fall).
 */
export function buildPlaylists({ verdict, condition, before, after, trialSeconds }) {
  const { lock, rows } = verdict.hazards;
  const places = [...(lock ? [lock] : []), ...rows];
  const names = new Map(condition.room.landmarks.map(({ id, label, mapLabel }) => [id, mapLabel ?? label]));
  for (const place of places) names.set(place.id, place.label);
  const nameOf = (id, fallback) => names.get(id) ?? fallback;
  const heights = new Map(verdict.scenes.map(({ seed, height }) => [seed, height]));

  const ready = (entries, heading) => entries.map(({ seed, scene }, index) => ({
    seed,
    months: condition.months,
    sex: condition.sex,
    individual: condition.individual ?? null,
    room: condition.room,
    ...sceneWindow(scene.time, { before, after, trialSeconds }),
    moment: scene.time,
    scene,
    thing: scene.type === SCENE_TOUCH ? scene.thing : null,
    text: momentText(scene, nameOf),
    heading,
    position: index + 1,
    count: entries.length,
    height: heights.get(seed),
  }));

  const byThing = new Map(places.map((place) => [place.id, ready(thingOrder(verdict.scenes, place.id), `${place.label}に触れた子`)]));
  // The automatic order, each scene numbered within its own thing.
  const numbered = new Map([...byThing.values()].flat().map((entry) => [`${entry.seed}:${entry.thing}`, entry]));
  const auto = autoplayOrder(verdict.scenes, places.map(({ id }) => id)).map(({ seed, scene }) => numbered.get(`${seed}:${scene.thing}`));
  const byFallKind = new Map([FALL_KIND_ON_FURNITURE, FALL_KIND_WHILE_CLIMBING]
    .map((kind) => [kind, ready(fallOrder(verdict.scenes, kind), FALL_HEADINGS[kind])]));
  return { auto, byThing, byFallKind, falls: ready(fallOrder(verdict.scenes), '落ちた子') };
}
