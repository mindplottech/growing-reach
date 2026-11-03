/**
 * How many fixed steps to take for each drawn frame. The simulation always moves in steps of
 * the same length; the speed only changes how many of them one frame takes, so the record is
 * the same at every speed.
 */
export function createPlayback({ stepSeconds, maxFrameSeconds }) {
  let carry = 0;
  return {
    reset() {
      carry = 0;
    },
    /** The steps for a frame that took `elapsedSeconds` of real time, at `speed` times. */
    stepsFor(elapsedSeconds, speed) {
      carry += Math.min(elapsedSeconds, maxFrameSeconds) * speed;
      let steps = 0;
      while (carry >= stepSeconds) {
        carry -= stepSeconds;
        steps += 1;
      }
      return steps;
    },
  };
}
