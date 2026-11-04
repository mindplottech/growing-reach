import { createRng } from '../sim/random.js';

// The idle animation: blinking, breathing, a slow tilt of the head and the odd yawn while the
// child stands still. Display only. It reads the record (where the child is, what happened)
// and never writes to it; its timing comes from its own seeded random stream, never from the
// simulation's.

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const smooth = (t) => t * t * (3 - 2 * t);
const between = (rng, [low, high]) => low + rng() * (high - low);

/**
 * `values` is idle_figure from sim/params.js. Each frame, `update` takes what the pose tracker
 * knows (whether the child is still, the simulation clock, and the moments of touching
 * something dangerous, past and known ahead) and returns how far each movement is.
 */
export function createIdle(values, seed = values.seed) {
  const rng = createRng(seed);
  let blinkIn = between(rng, values.blink_interval_s);
  let blinkLeft = 0;
  let stillFor = 0;
  let yawnIn = between(rng, values.yawn_interval_s);
  let yawnElapsed = null;
  let yawnFade = 0;
  let cutLevel = 0;
  let breathPhase = 0;
  let tiltPhase = 0;
  let settled = 0;

  const nearHazard = (time, moments) => moments.some((moment) => Math.abs(moment - time) <= values.yawn_hazard_gap_s);

  return function update({ still, time, hazardMoments = [] }, frameSeconds) {
    // Blinking goes on whatever the child does.
    if (blinkLeft > 0) {
      blinkLeft -= frameSeconds;
    } else {
      blinkIn -= frameSeconds;
      if (blinkIn <= 0) {
        blinkLeft = values.blink_s;
        blinkIn = between(rng, values.blink_interval_s);
      }
    }
    const blink = blinkLeft > 0 ? 1 : 0;

    // Breathing and the head tilt ease in while still and out when moving.
    settled = clamp01(settled + (still ? 1 : -1) * frameSeconds / SETTLE_SECONDS);
    breathPhase += (frameSeconds / values.breath_period_s) * Math.PI * 2;
    tiltPhase += (frameSeconds / values.head_tilt_period_s) * Math.PI * 2;
    const breath = values.breath_share * (0.5 - 0.5 * Math.cos(breathPhase)) * settled;
    const tilt = values.head_tilt_rad * Math.sin(tiltPhase) * settled;

    // A yawn waits for the child to have been still a while, and never near a dangerous moment.
    if (still) {
      stillFor += frameSeconds;
    } else {
      stillFor = 0;
      yawnIn = Math.max(yawnIn, 0);
    }
    if (yawnElapsed === null) {
      if (still) yawnIn -= frameSeconds;
      if (still && yawnIn <= 0 && !nearHazard(time, hazardMoments)) {
        yawnElapsed = 0;
        yawnIn = between(rng, values.yawn_interval_s);
      } else if (!still && yawnIn <= 0) {
        yawnIn = between(rng, values.yawn_interval_s);
      }
    }
    let yawn = 0;
    if (yawnElapsed !== null) {
      yawnElapsed += frameSeconds;
      const t = clamp01(yawnElapsed / values.yawn_s);
      yawn = Math.sin(Math.PI * t);
      if (!still) {
        // Moving cuts the yawn short: it fades out from where it was rather than stopping dead.
        if (yawnFade === 0) cutLevel = Math.sin(Math.PI * clamp01((yawnElapsed - frameSeconds) / values.yawn_s));
        yawnFade = clamp01(yawnFade + frameSeconds / SETTLE_SECONDS);
        yawn = cutLevel * (1 - smooth(yawnFade));
        if (yawnFade >= 1) {
          yawnElapsed = null;
          yawnFade = 0;
          yawn = 0;
        }
      }
      if (yawnElapsed !== null && yawnElapsed >= values.yawn_s) {
        yawnElapsed = null;
        yawnFade = 0;
        yawn = 0;
      }
    }

    return { blink, breath, tilt, yawn, stillFor };
  };
}

const SETTLE_SECONDS = 0.35;
