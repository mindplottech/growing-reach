import { canClimb, canReach, canReachOnTiptoe } from './ability.js';

export const REACH_STANDING = 'standing';
export const REACH_TIPTOE = 'tiptoe';
export const REACH_NONE = 'none';

/** How the child reaches a height from `standOnCm`: flat-footed, only on tiptoe, or not at all. */
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
 * What the child could reach from on top of `candidate`, or null if it cannot serve as a
 * foothold for this child. Only nearby objects higher than the foothold are judged.
 */
export function evaluateScaffold(body, candidate, objects, rangeCm) {
  if (!candidate.scaffold || !canClimb(body, candidate.height)) return null;
  const judged = objects
    .filter((object) => object.id !== candidate.id && object.height > candidate.height)
    .filter((object) => footprintDistance(candidate, object) <= rangeCm)
    .map((object) => ({
      id: object.id,
      label: object.label,
      height: object.height,
      level: reachLevel(body, object.height, candidate.height),
      floorLevel: reachLevel(body, object.height),
    }));
  return { id: candidate.id, label: candidate.label, height: candidate.height, objects: judged };
}
