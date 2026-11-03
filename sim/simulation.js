import { canClimb, canReach } from './ability.js';
import { drawIndividual, getBodyValues } from './body.js';
import { EVENT } from './events.js';
import { createRng } from './random.js';
import { landmarkHeight } from './room.js';
import {
  evaluateScaffold, footholdReachLevel, footprintDistance, reachLevel, REACH_NONE, REACH_STANDING,
} from './scaffold.js';
import { floorHazardLevel, footholdHazardLevel, placeHazards } from './hazards.js';
import { createGrid, findPath } from './path.js';

const CM_PER_M = 100;
// One stream per kind of decision, all separate from the one that draws the body, so that
// changing the room leaves a child's body the same and their choices as close as possible.
const STREAMS = {
  route: 0x9e3779b9,
  stay: 0x7f4a7c15,
  climb: 0x2545f491,
  chain: 0x3c6ef372,
  failure: 0x1b873593,
  balance: 0x5bd1e995,
  trip: 0x6c62272e,
  play: 0x27d4eb2f,
};

// Routes depend only on the room and the grid settings, so runs in the same room share them.
const routeCaches = new WeakMap();

function routeCache(room, landmarks, settings) {
  const key = `${settings.path_grid_cm}/${settings.path_clearance_cm}`;
  if (!routeCaches.has(room)) routeCaches.set(room, new Map());
  const byGrid = routeCaches.get(room);
  if (!byGrid.has(key)) {
    const grid = createGrid(room, landmarks, { cell: settings.path_grid_cm, clearance: settings.path_clearance_cm });
    byGrid.set(key, { grid, routes: new Map() });
  }
  return byGrid.get(key);
}

const ledgerItem = (ledger, id) => {
  const item = ledger.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`ledger item not found: ${id}`);
  return item;
};

/** Reads the exponent of "k * (step / climb_height)^n"; k itself is not in the ledger. */
function climbFailureExponent(ledger) {
  const { formula } = ledgerItem(ledger, 'climb_failure');
  const match = /^k \* \(step \/ climb_height\)\^(\d+)$/.exec(formula);
  if (!match) throw new Error(`unexpected climb failure formula: ${formula}`);
  return Number(match[1]);
}

/** Reads the height limit from the ledger's rule, such as "窓ぎわで60cm以上の物に立つ". */
function windowLeanHeight(ledger) {
  const { rule } = ledgerItem(ledger, 'window_lean_foothold');
  const match = /(\d+)cm以上/.exec(rule);
  if (!match) throw new Error(`unexpected window lean rule: ${rule}`);
  return Number(match[1]);
}

const ROLE_WINDOW = 'window';
const ROLE_LOCK = 'window_lock';

/**
 * One child moving around a room. Whether to go somewhere, climb or stay is random;
 * whether they can is computed from the body. Random times are drawn ahead of time,
 * so the result does not depend on the size of the steps.
 */
export function createSimulation({ ledger, settings, months, sex, seed, room, boxes = [] }) {
  const body = getBodyValues(ledger, { months, sex, z: drawIndividual(seed) });
  const streams = Object.fromEntries(
    Object.entries(STREAMS).map(([name, offset]) => [name, createRng(seed ^ offset)]),
  );
  const dwell = ledgerItem(ledger, 'interest_dwell').range;
  const { balancePerSec, tripPerStep } = ledgerItem(ledger, 'fall_rates').values;
  const { step_down_max: stepDownMax, backward_max: backwardMax } = ledgerItem(ledger, 'descend_height').rules;
  const failureExponent = climbFailureExponent(ledger);
  const leanHeight = windowLeanHeight(ledger);
  const speed = body.walkSpeed.value * CM_PER_M;
  const tripPerCm = tripPerStep / settings.step_length_cm;
  const landmarks = [
    ...room.landmarks.map((landmark) => ({
      ...landmark,
      height: landmark.height ?? landmarkHeight(ledger, landmark.heightOf),
    })),
    ...boxes,
  ];
  // Dangerous things sit on furniture tops; boxes carry none.
  const hazards = placeHazards(room, landmarks);
  // Placed boxes are not part of the room object, so their routes cannot be shared.
  const cache = boxes.length === 0
    ? routeCache(room, landmarks, settings)
    : { grid: createGrid(room, landmarks, { cell: settings.path_grid_cm, clearance: settings.path_clearance_cm }), routes: new Map() };
  const routeBetween = (from, to) => {
    const key = `${from.x},${from.y}>${to.x},${to.y}`;
    if (!cache.routes.has(key)) cache.routes.set(key, findPath(cache.grid, from, to));
    return cache.routes.get(key).map((point) => ({ ...point }));
  };

  const position = { ...room.start };
  const visits = [];
  const events = [];
  // Walked legs, each a list of floor points, for drawing the trail.
  const trail = [];
  let route = [];
  let time = 0;
  let current = null;
  let target = null;
  let foothold = null;
  // The object being climbed onto, while the climb takes its time.
  let climbing = null;
  let tripLeft = Infinity;
  let waitLeft = 0;
  let afterWait = null;

  const between = (rng, [min, max]) => min + rng() * (max - min);
  const pick = (rng, choices) => choices[Math.floor(rng() * choices.length)];
  // With equal weights this picks the same item as pick() for the same draw.
  const pickWeighted = (rng, choices, weight) => {
    let left = rng() * choices.reduce((sum, choice) => sum + weight(choice), 0);
    for (const choice of choices) {
      left -= weight(choice);
      if (left < 0) return choice;
    }
    return choices[choices.length - 1];
  };
  const interestOf = (landmark) => landmark.interest ?? settings.interest_default;
  const waitingTime = (rng, rate) => (rate > 0 ? -Math.log(1 - rng()) / rate : Infinity);

  function record(kind, details = {}) {
    events.push({
      time,
      seed,
      months,
      sex,
      kind,
      footholdId: foothold?.id ?? null,
      footholdLabel: foothold?.label ?? null,
      ...details,
    });
  }

  function wait(seconds, then) {
    target = null;
    waitLeft = seconds;
    afterWait = then;
  }

  function chooseTarget() {
    target = pickWeighted(streams.route, landmarks.filter((landmark) => landmark !== current), interestOf);
    route = routeBetween(position, target.approach);
    trail.push([{ ...position }]);
    tripLeft = waitingTime(streams.trip, tripPerCm);
  }

  function neighbours(of) {
    return landmarks.filter(
      (other) => other !== of && other.scaffold && footprintDistance(of, other) <= room.neighbor_gap.value,
    );
  }

  function stepOffFoothold(from) {
    current = from;
    foothold = null;
    position.x = from.approach.x;
    position.y = from.approach.y;
  }

  function fall(from, reason, details = {}) {
    record(EVENT.FELL, { fromHeight: from.height, reason, footholdId: from.id, footholdLabel: from.label, ...details });
    stepOffFoothold(from);
    wait(settings.after_fall_seconds, chooseTarget);
  }

  function stand(on) {
    foothold = on;
    position.x = on.x + on.w / 2;
    position.y = on.y + on.d / 2;
  }

  /**
   * Climbing takes time that grows with the step; whether it fails is decided at the top.
   * `startHeight` is where the climb began: 0 for the floor, or the foothold it went from.
   */
  function attemptClimb(to, stepHeight, startHeight) {
    const seconds = settings.climb_seconds_base + settings.climb_seconds_per_cm * stepHeight;
    climbing = to;
    wait(seconds, () => {
      climbing = null;
      const failure = settings.climb_failure_k * (stepHeight / body.climb.value) ** failureExponent;
      if (streams.failure() < failure) {
        fall(to, 'climb_failure', { startHeight });
        return;
      }
      stand(to);
      record(EVENT.CLIMBED, { height: to.height, stepHeight, startHeight, climbSeconds: seconds });
      reactOnFoothold(to);
      standOnFoothold();
    });
  }

  function touchHazard(hazard, level, from) {
    record(EVENT.TOUCHED_HAZARD, {
      hazardId: hazard.id,
      hazardKind: hazard.kind,
      hazardLabel: hazard.label,
      onId: hazard.on,
      height: hazard.height,
      level,
      from,
    });
  }

  /** Records what the child on this foothold reaches, and standing at the window. */
  function reactOnFoothold(on) {
    const windowFrame = landmarks.find((landmark) => landmark.role === ROLE_WINDOW);
    if (
      windowFrame
      && on.height >= leanHeight
      && footprintDistance(on, windowFrame) <= room.window_side_gap.value
    ) {
      record(EVENT.STOOD_AT_WINDOW, { height: on.height });
    }
    for (const object of landmarks) {
      if (object === on || object.height <= on.height) continue;
      const level = footholdReachLevel(ledger, body, on, object);
      if (level === REACH_NONE) continue;
      const details = { targetId: object.id, targetLabel: object.label, level };
      if (object.role === ROLE_LOCK) record(EVENT.REACHED_LOCK, details);
      else if (reachLevel(body, object.height) !== REACH_STANDING) record(EVENT.TOUCHED_HIGH, details);
    }
    for (const hazard of hazards) {
      const level = footholdHazardLevel(ledger, body, on, hazard);
      if (level !== REACH_NONE) touchHazard(hazard, level, 'foothold');
    }
  }

  function standOnFoothold() {
    const stayFor = between(streams.stay, settings.foothold_stay_seconds);
    const untilFall = waitingTime(streams.balance, balancePerSec);
    const here = foothold;
    if (untilFall < stayFor) wait(untilFall, () => fall(here, 'balance'));
    else wait(stayFor, leaveFoothold);
  }

  function descentMode(drop) {
    if (drop <= stepDownMax) return 'step_down';
    if (drop <= backwardMax) return 'backward';
    return 'climb_down';
  }

  function leaveFoothold() {
    const here = foothold;
    const steppable = neighbours(here).filter((other) => canClimb(body, Math.abs(other.height - here.height)));
    const wantsToChain = streams.chain() < settings.chain_probability;
    if (steppable.length > 0 && wantsToChain) {
      const next = pick(streams.chain, steppable);
      attemptClimb(next, Math.abs(next.height - here.height), here.height);
      return;
    }
    descend(here, steppable);
  }

  /** The ledger's descent limit is the climb height: a longer drop means going via a lower neighbour. */
  function descend(here, steppable) {
    if (canClimb(body, here.height)) {
      record(EVENT.DESCENDED, { fromHeight: here.height, mode: descentMode(here.height), to: null });
      stepOffFoothold(here);
      chooseTarget();
      return;
    }
    const lower = steppable.filter((other) => other.height < here.height);
    if (lower.length === 0) {
      fall(here, 'cannot_descend');
      return;
    }
    const next = pick(streams.chain, lower);
    const drop = here.height - next.height;
    record(EVENT.DESCENDED, { fromHeight: here.height, mode: descentMode(drop), to: next.id });
    stand(next);
    standOnFoothold();
  }

  function arrive() {
    position.x = target.approach.x;
    position.y = target.approach.y;
    current = target;
    target = null;
    visits.push({
      time,
      id: current.id,
      label: current.label,
      height: current.height,
      canClimb: canClimb(body, current.height),
      canReach: canReach(body, current.height),
      reachLevel: reachLevel(body, current.height),
      scaffold: evaluateScaffold(ledger, body, current, landmarks),
    });
    const floorLevel = reachLevel(body, current.height);
    if (current.role === ROLE_LOCK && floorLevel !== REACH_NONE) {
      record(EVENT.REACHED_LOCK, { targetId: current.id, targetLabel: current.label, level: floorLevel });
    }
    // What is on top of this furniture, if the child's hand gets to it from the floor.
    for (const hazard of hazards.filter(({ on }) => on === current.id)) {
      const level = floorHazardLevel(ledger, body, current, hazard);
      if (level !== REACH_NONE) touchHazard(hazard, level, 'floor');
    }
    const wantsToClimb = streams.climb() < settings.climb_probability;
    if (current.scaffold && canClimb(body, current.height) && wantsToClimb) {
      attemptClimb(current, current.height, 0);
    } else {
      // Look at it for the ledger's dwell time; if it is within reach, sometimes play with it too.
      const look = between(streams.stay, dwell);
      const plays = canReach(body, current.height) && streams.play() < settings.play_probability;
      visits[visits.length - 1].played = plays;
      wait(look + (plays ? between(streams.play, settings.play_seconds) : 0), chooseTarget);
    }
  }

  function trip() {
    record(EVENT.TRIPPED);
    wait(settings.after_fall_seconds, chooseTarget);
  }

  const markTrail = () => trail[trail.length - 1].push({ ...position });

  /** Walks the route for up to `seconds`; returns the time left over if something happened. */
  function walk(seconds) {
    const next = route[0];
    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, tripLeft);
    const needed = travel / speed;
    const moved = needed <= seconds ? travel : seconds * speed;
    const fraction = distance > 0 ? moved / distance : 0;
    position.x += dx * fraction;
    position.y += dy * fraction;
    tripLeft -= moved;
    if (needed > seconds) {
      time += seconds;
      return 0;
    }
    time += needed;
    markTrail();
    if (travel !== distance) {
      trip();
    } else {
      route.shift();
      if (route.length === 0) arrive();
    }
    return seconds - needed;
  }

  function stay(seconds) {
    const used = Math.min(seconds, waitLeft);
    waitLeft -= used;
    time += used;
    if (waitLeft === 0) afterWait();
    return seconds - used;
  }

  function step(seconds) {
    let left = seconds;
    while (left > 0) left = target ? walk(left) : stay(left);
  }

  chooseTarget();

  return {
    body,
    landmarks,
    hazards,
    position,
    visits,
    events,
    trail,
    step,
    get time() {
      return time;
    },
    get foothold() {
      return foothold;
    },
    get climbing() {
      return climbing;
    },
  };
}
