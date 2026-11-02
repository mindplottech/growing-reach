function assertHeight(objectHeightCm) {
  if (!Number.isFinite(objectHeightCm) || objectHeightCm < 0) {
    throw new RangeError(`object height must be a non-negative number: ${objectHeightCm}`);
  }
}

/** True when the child can climb onto an object of this height. The limit itself is climbable. */
export function canClimb(body, objectHeightCm) {
  assertHeight(objectHeightCm);
  return objectHeightCm <= body.climb.value;
}

/** True when the child, standing on the floor, can reach this height. The limit itself is reachable. */
export function canReach(body, objectHeightCm) {
  assertHeight(objectHeightCm);
  return objectHeightCm <= body.reach.value;
}
