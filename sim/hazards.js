import { canReach, canReachOnTiptoe } from './ability.js';
import { footholdReachLevel, footprintDistance, horizontalReach, REACH_NONE, REACH_STANDING, REACH_TIPTOE } from './scaffold.js';

/**
 * The dangerous things on furniture tops, placed in the room. Each sits on one piece of
 * furniture (`on`) at an offset from its corner, so it moves with the furniture and goes away
 * with it. Its height is the furniture's top, which comes from the ledger.
 */
export function placeHazards(room, landmarks) {
  const byId = new Map(landmarks.map((landmark) => [landmark.id, landmark]));
  return (room.hazards ?? []).flatMap((hazard) => {
    const under = byId.get(hazard.on);
    if (!under) return [];
    const w = Math.min(hazard.w, under.w);
    const d = Math.min(hazard.d, under.d);
    const x = under.x + Math.min(Math.max(hazard.dx, 0), under.w - w);
    const y = under.y + Math.min(Math.max(hazard.dy, 0), under.d - d);
    return [{ ...hazard, x, y, w, d, height: under.height }];
  });
}

/** The point of `rect`'s edge nearest to `point`: where a child at `point` stands against it. */
function nearestEdgePoint(rect, point) {
  return {
    x: Math.min(Math.max(point.x, rect.x), rect.x + rect.w),
    y: Math.min(Math.max(point.y, rect.y), rect.y + rect.d),
    w: 0,
    d: 0,
  };
}

/**
 * How a child on the floor beside `under` reaches a hazard on it: the height must be within
 * reach and the distance in from the edge they stand at within the ledger's horizontal reach.
 */
export function floorHazardLevel(ledger, body, under, hazard) {
  const edge = nearestEdgePoint(under, under.approach);
  const distance = footprintDistance(edge, hazard);
  const within = (reachValue) => distance <= horizontalReach(ledger, reachValue, hazard.height);
  if (canReach(body, hazard.height) && within(body.reach.value)) return REACH_STANDING;
  if (canReachOnTiptoe(body, hazard.height) && within(body.tiptoeReach.value)) return REACH_TIPTOE;
  return REACH_NONE;
}

/** How a child standing on `foothold` reaches a hazard, by the same rule as other objects. */
export function footholdHazardLevel(ledger, body, foothold, hazard) {
  return footholdReachLevel(ledger, body, foothold, hazard);
}
