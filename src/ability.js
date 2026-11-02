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

/** True when the child, standing flat at `standOnCm` (0 is the floor), can reach this height. */
export function canReach(body, objectHeightCm, standOnCm = 0) {
  assertHeight(objectHeightCm);
  return objectHeightCm <= standOnCm + body.reach.value;
}

/** True when the child, on tiptoe at `standOnCm` (0 is the floor), can reach this height. */
export function canReachOnTiptoe(body, objectHeightCm, standOnCm = 0) {
  assertHeight(objectHeightCm);
  return objectHeightCm <= standOnCm + body.tiptoeReach.value;
}
