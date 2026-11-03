import { EVENT } from '../sim/events.js';
import { REACH_TIPTOE } from '../sim/scaffold.js';

/** The height of the surface the child stands on now: a foothold's height, or the floor. */
export const footHeight = (simulation) => simulation.foothold?.height ?? 0;

/**
 * The hand's height from where the child stands now, and whether it reaches the window
 * lock. Standing reach, as in the plane; tiptoe is not added.
 */
export function reachMark(simulation, feet = footHeight(simulation)) {
  const height = feet + simulation.body.reach.value;
  const lock = simulation.landmarks.find(({ role }) => role === 'window_lock');
  return { height, reachesLock: lock ? height >= lock.height : false };
}

export const MOTION = {
  CLIMB: 'climb',
  STEP_DOWN: 'step_down',
  BACKWARD_DOWN: 'backward_down',
  JUMP_DOWN: 'jump_down',
  FALL: 'fall',
};

// The record says how the child got down; only the drawing calls the highest kind a jump.
const DESCENT_MOTION = {
  step_down: MOTION.STEP_DOWN,
  backward: MOTION.BACKWARD_DOWN,
  climb_down: MOTION.JUMP_DOWN,
};

/** The motion an event starts, if any. */
export function motionForEvent(event) {
  switch (event.kind) {
    case EVENT.CLIMBED: return MOTION.CLIMB;
    case EVENT.DESCENDED: return DESCENT_MOTION[event.mode];
    case EVENT.FELL:
    case EVENT.TRIPPED: return MOTION.FALL;
    default: return null;
  }
}

/** How far the figure lifts its arms and stretches to reach. Tiptoe stretches; standing does not. */
export function gestureForEvent(event) {
  if (event.kind !== EVENT.REACHED_LOCK && event.kind !== EVENT.TOUCHED_HIGH) return null;
  return { stretch: event.level === REACH_TIPTOE };
}

/** A soft floor shadow that shrinks and fades as the child gets higher. */
export function floorShadow(feet) {
  const closeness = 1 / (1 + feet / SHADOW_FADE_CM);
  return { scale: closeness, opacity: closeness };
}

// Shape of the motions, for drawing only.
const SHADOW_FADE_CM = 60;
const CLIMB_REACH_SHARE = 0.35;
const CLIMB_LEAN = 0.4;
const STEP_LEAN = 0.15;
const BACKWARD_ARMS = 0.6;
const JUMP_HOP_CM = 8;
const LYING_DOWN = Math.PI / 2;
const TURN_MIN_CM = 0.01;

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function motionDuration(kind, seconds) {
  switch (kind) {
    case MOTION.CLIMB: return seconds.climb;
    case MOTION.STEP_DOWN: return seconds.step_down;
    case MOTION.BACKWARD_DOWN: return seconds.backward_down;
    case MOTION.JUMP_DOWN: return seconds.jump_down;
    default: return seconds.fall + seconds.fall_hold + seconds.fall;
  }
}

/** Where a motion has the child at `elapsed` seconds, as shares of the way to the target. */
function motionShape(kind, elapsed, seconds) {
  const t = clamp01(elapsed / motionDuration(kind, seconds));
  switch (kind) {
    case MOTION.CLIMB: {
      const lift = clamp01((t - CLIMB_REACH_SHARE) / (1 - CLIMB_REACH_SHARE));
      return {
        along: smooth(lift),
        arms: t < CLIMB_REACH_SHARE ? t / CLIMB_REACH_SHARE : 1 - lift,
        lean: Math.sin(Math.PI * lift) * CLIMB_LEAN,
      };
    }
    case MOTION.STEP_DOWN:
      return { along: smooth(t), lean: Math.sin(Math.PI * t) * STEP_LEAN };
    case MOTION.BACKWARD_DOWN:
      return { along: smooth(t), arms: BACKWARD_ARMS, turned: true };
    case MOTION.JUMP_DOWN:
      return { along: t, arms: Math.sin(Math.PI * t), hop: JUMP_HOP_CM * 4 * t * (1 - t) };
    default: {
      const falling = clamp01(elapsed / seconds.fall);
      const rising = clamp01((elapsed - seconds.fall - seconds.fall_hold) / seconds.fall);
      return { along: falling * falling, pitch: LYING_DOWN * falling * (1 - rising) };
    }
  }
}

/**
 * Turns the simulation's instant changes into short motions. Each frame takes where the child
 * really is and the events so far, and returns how to draw them. It only reads: nothing here
 * can change the simulation or its record. `seconds` is sim_settings.display_seconds.
 */
export function createPoseTracker(seconds) {
  let drawn = null;
  let motion = null;
  let gesture = null;
  let seen = 0;
  let yaw = 0;

  return function update({ x, z, feet, events }, frameSeconds) {
    if (!drawn || events.length < seen) {
      drawn = { x, z, feet };
      motion = null;
      gesture = null;
      seen = 0;
    }
    for (const event of events.slice(seen)) {
      const kind = motionForEvent(event);
      if (kind) motion = { kind, from: { ...drawn }, elapsed: 0 };
      const started = gestureForEvent(event);
      if (started) gesture = { ...started, elapsed: 0 };
    }
    seen = events.length;

    let shape = {};
    if (motion) {
      motion.elapsed += frameSeconds;
      shape = motionShape(motion.kind, motion.elapsed, seconds);
      const along = shape.along ?? 0;
      const next = {
        x: lerp(motion.from.x, x, along),
        z: lerp(motion.from.z, z, along),
        feet: lerp(motion.from.feet, feet, along) + (shape.hop ?? 0),
      };
      if (motion.elapsed >= motionDuration(motion.kind, seconds)) motion = null;
      faceTowards(next);
      drawn = next;
    } else {
      const next = { x, z, feet };
      faceTowards(next);
      drawn = next;
    }

    let arms = shape.arms ?? 0;
    let stretch = 0;
    if (gesture) {
      gesture.elapsed += frameSeconds;
      const envelope = Math.sin(Math.PI * clamp01(gesture.elapsed / seconds.reach_gesture));
      arms = Math.max(arms, envelope);
      if (gesture.stretch) stretch = envelope;
      if (gesture.elapsed >= seconds.reach_gesture) gesture = null;
    }

    return {
      ...drawn,
      yaw,
      kind: motion?.kind ?? null,
      turned: Boolean(shape.turned),
      pitch: shape.pitch ?? 0,
      lean: shape.lean ?? 0,
      arms,
      stretch,
    };
  };

  function faceTowards(next) {
    const dx = next.x - drawn.x;
    const dz = next.z - drawn.z;
    if (Math.hypot(dx, dz) > TURN_MIN_CM) yaw = Math.atan2(dx, dz);
  }
}
