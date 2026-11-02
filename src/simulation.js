import { canClimb, canReach } from './ability.js';
import { drawIndividual, getBodyValues } from './body.js';
import { createRng } from './random.js';
import { landmarkHeight } from './room.js';
import { evaluateScaffold, reachLevel } from './scaffold.js';

const CM_PER_M = 100;
// Keeps the movement stream separate from the stream that draws the individual.
const MOVEMENT_STREAM = 0x9e3779b9;

/**
 * One child moving around a room. Only where to go and how long to stay are random;
 * whether the child can climb or reach is computed from the body when they arrive.
 */
export function createSimulation({ ledger, months, sex, seed, room, boxes = [] }) {
  const body = getBodyValues(ledger, { months, sex, z: drawIndividual(seed) });
  const rng = createRng(seed ^ MOVEMENT_STREAM);
  const dwell = ledger.items.find((entry) => entry.id === 'interest_dwell').range;
  const speed = body.walkSpeed.value * CM_PER_M;
  const landmarks = [
    ...room.landmarks.map((landmark) => ({
      ...landmark,
      height: landmarkHeight(ledger, landmark.heightOf),
    })),
    ...boxes,
  ];

  const position = { ...room.start };
  const visits = [];
  let time = 0;
  let current = null;
  let target = null;
  let dwellLeft = 0;

  function chooseTarget() {
    const choices = landmarks.filter((landmark) => landmark !== current);
    target = choices[Math.floor(rng() * choices.length)];
  }

  function arrive() {
    position.x = target.approach.x;
    position.y = target.approach.y;
    current = target;
    target = null;
    dwellLeft = dwell[0] + rng() * (dwell[1] - dwell[0]);
    visits.push({
      time,
      id: current.id,
      label: current.label,
      height: current.height,
      canClimb: canClimb(body, current.height),
      canReach: canReach(body, current.height),
      reachLevel: reachLevel(body, current.height),
      scaffold: evaluateScaffold(body, current, landmarks, room.nearby_range.value),
    });
  }

  /** Walks for up to `seconds`; returns the time left over if the child arrived. */
  function walk(seconds) {
    const dx = target.approach.x - position.x;
    const dy = target.approach.y - position.y;
    const distance = Math.hypot(dx, dy);
    const needed = distance / speed;
    if (needed <= seconds) {
      time += needed;
      arrive();
      return seconds - needed;
    }
    const fraction = seconds / needed;
    position.x += dx * fraction;
    position.y += dy * fraction;
    time += seconds;
    return 0;
  }

  function stay(seconds) {
    const used = Math.min(seconds, dwellLeft);
    dwellLeft -= used;
    time += used;
    if (dwellLeft === 0) chooseTarget();
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
    step,
    get time() {
      return time;
    },
  };
}
