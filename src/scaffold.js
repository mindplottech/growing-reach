import { canClimb, canReach, canReachOnTiptoe } from './ability.js';

export const REACH_STANDING = 'standing';
export const REACH_TIPTOE = 'tiptoe';
export const REACH_NONE = 'none';

const REACH_RANK = { [REACH_NONE]: 0, [REACH_TIPTOE]: 1, [REACH_STANDING]: 2 };

/** True when `level` reaches further than `other`. */
export const isBetterReach = (level, other) => REACH_RANK[level] > REACH_RANK[other];

/** How the child reaches a height from `standOnCm`, judged on height alone. */
export function reachLevel(body, objectHeightCm, standOnCm = 0) {
  if (canReach(body, objectHeightCm, standOnCm)) return REACH_STANDING;
  if (canReachOnTiptoe(body, objectHeightCm, standOnCm)) return REACH_TIPTOE;
  return REACH_NONE;
}

/** Shortest distance between two rectangles seen from above; 0 when they touch or overlap. */
export function footprintDistance(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.d), b.y - (a.y + a.d), 0);
  return Math.hypot(dx, dy);
}

/**
 * The ledger's horizontal reach for an object at `surfaceCm` when the hand rises to
 * `reachCm`. The coefficients are read from the formula so they stay in the ledger.
 */
export function horizontalReach(ledger, reachCm, surfaceCm) {
  const { formula } = ledger.items.find((entry) => entry.id === 'reach_horizontal_on_surface');
  const match = /^min\(([\d.]+) \+ \(reach - surface_height\) \* ([\d.]+), ([\d.]+)\)$/.exec(formula);
  if (!match) throw new Error(`unexpected horizontal reach formula: ${formula}`);
  const [base, slope, limit] = match.slice(1).map(Number);
  return Math.min(base + (reachCm - surfaceCm) * slope, limit);
}

/** How the child on `foothold` reaches `object`, judged on height and horizontal distance. */
export function footholdReachLevel(ledger, body, foothold, object) {
  const distance = footprintDistance(foothold, object);
  const within = (reachValue) =>
    distance <= horizontalReach(ledger, foothold.height + reachValue, object.height);
  if (canReach(body, object.height, foothold.height) && within(body.reach.value)) return REACH_STANDING;
  if (canReachOnTiptoe(body, object.height, foothold.height) && within(body.tiptoeReach.value)) return REACH_TIPTOE;
  return REACH_NONE;
}

/**
 * What the child could reach from on top of `candidate`, or null if it cannot serve as a
 * foothold for this child. Only objects higher than the foothold are judged.
 */
export function evaluateScaffold(ledger, body, candidate, objects) {
  if (!candidate.scaffold || !canClimb(body, candidate.height)) return null;
  const judged = objects
    .filter((object) => object.id !== candidate.id && object.height > candidate.height)
    .map((object) => ({
      id: object.id,
      label: object.label,
      height: object.height,
      level: footholdReachLevel(ledger, body, candidate, object),
      floorLevel: reachLevel(body, object.height),
    }));
  return { id: candidate.id, label: candidate.label, height: candidate.height, objects: judged };
}
