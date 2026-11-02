import { canClimb, canReach } from './ability.js';
import { drawIndividual, getBodyValues } from './body.js';
import { EVENT } from './events.js';
import { createRng } from './random.js';
import { landmarkHeight } from './room.js';
import { evaluateScaffold, footprintDistance, reachLevel } from './scaffold.js';

const CM_PER_M = 100;
// Keeps the movement stream separate from the stream that draws the individual.
const MOVEMENT_STREAM = 0x9e3779b9;

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

/**
 * One child moving around a room. Whether to go somewhere, climb or stay is random;
 * whether they can is computed from the body. Random times are drawn ahead of time,
 * so the result does not depend on the size of the steps.
 */
export function createSimulation({ ledger, settings, months, sex, seed, room, boxes = [] }) {
  const body = getBodyValues(ledger, { months, sex, z: drawIndividual(seed) });
  const rng = createRng(seed ^ MOVEMENT_STREAM);
  const dwell = ledgerItem(ledger, 'interest_dwell').range;
  const { balancePerSec, tripPerStep } = ledgerItem(ledger, 'fall_rates').values;
  const { step_down_max: stepDownMax, backward_max: backwardMax } = ledgerItem(ledger, 'descend_height').rules;
  const failureExponent = climbFailureExponent(ledger);
  const speed = body.walkSpeed.value * CM_PER_M;
  const tripPerCm = tripPerStep / settings.step_length_cm;
  const landmarks = [
    ...room.landmarks.map((landmark) => ({
      ...landmark,
      height: landmark.height ?? landmarkHeight(ledger, landmark.heightOf),
    })),
    ...boxes,
  ];

  const position = { ...room.start };
  const visits = [];
  const events = [];
  let time = 0;
  let current = null;
  let target = null;
  let foothold = null;
  let tripLeft = Infinity;
  let waitLeft = 0;
  let afterWait = null;

  const between = ([min, max]) => min + rng() * (max - min);
  const pick = (choices) => choices[Math.floor(rng() * choices.length)];
  const waitingTime = (rate) => (rate > 0 ? -Math.log(1 - rng()) / rate : Infinity);

  function record(kind, details = {}) {
    events.push({ time, kind, footholdId: foothold?.id ?? null, footholdLabel: foothold?.label ?? null, ...details });
  }

  function wait(seconds, then) {
    target = null;
    waitLeft = seconds;
    afterWait = then;
  }

  function chooseTarget() {
    target = pick(landmarks.filter((landmark) => landmark !== current));
    tripLeft = waitingTime(tripPerCm);
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

  function fall(from, reason) {
    record(EVENT.FELL, { fromHeight: from.height, reason, footholdId: from.id, footholdLabel: from.label });
    stepOffFoothold(from);
    wait(settings.after_fall_seconds, chooseTarget);
  }

  function stand(on) {
    foothold = on;
    position.x = on.x + on.w / 2;
    position.y = on.y + on.d / 2;
  }

  function attemptClimb(to, stepHeight) {
    const failure = settings.climb_failure_k * (stepHeight / body.climb.value) ** failureExponent;
    if (rng() < failure) {
      fall(to, 'climb_failure');
      return;
    }
    stand(to);
    record(EVENT.CLIMBED, { height: to.height, stepHeight });
    standOnFoothold();
  }

  function standOnFoothold() {
    const stayFor = between(settings.foothold_stay_seconds);
    const untilFall = waitingTime(balancePerSec);
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
    if (steppable.length > 0 && rng() < settings.chain_probability) {
      const next = pick(steppable);
      attemptClimb(next, Math.abs(next.height - here.height));
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
    const next = pick(lower);
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
    if (current.scaffold && canClimb(body, current.height) && rng() < settings.climb_probability) {
      attemptClimb(current, current.height);
    } else {
      wait(between(dwell), chooseTarget);
    }
  }

  function trip() {
    record(EVENT.TRIPPED);
    wait(settings.after_fall_seconds, chooseTarget);
  }

  /** Walks for up to `seconds`; returns the time left over if something happened. */
  function walk(seconds) {
    const dx = target.approach.x - position.x;
    const dy = target.approach.y - position.y;
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
    if (travel === distance) arrive();
    else trip();
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
    position,
    visits,
    events,
    step,
    get time() {
      return time;
    },
    get foothold() {
      return foothold;
    },
  };
}
