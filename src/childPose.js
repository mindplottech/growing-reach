import { EVENT } from './events.js';

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

/** True when the latest thing that happened to the child was falling. */
export function isFalling(simulation) {
  return simulation.events[simulation.events.length - 1]?.kind === EVENT.FELL;
}

const easeInOut = (t) => t * t * (3 - 2 * t);
const easeIn = (t) => t * t;

/**
 * Turns the simulation's instant changes of height into short moves. Each frame takes where
 * the child really is and returns where to draw them; the simulation itself is not changed.
 */
export function createPoseTracker({ climbSeconds, fallSeconds }) {
  let pose = null;
  let move = null;

  return function update({ x, z, feet, falling }, seconds) {
    if (!pose) pose = { x, z, feet };
    if (feet !== (move?.toFeet ?? pose.feet)) {
      move = {
        from: { ...pose },
        toFeet: feet,
        elapsed: 0,
        duration: falling ? fallSeconds : climbSeconds,
        ease: falling ? easeIn : easeInOut,
      };
    }
    if (!move) {
      pose = { x, z, feet };
      return pose;
    }
    move.elapsed += seconds;
    const progress = Math.min(move.elapsed / move.duration, 1);
    const eased = move.ease(progress);
    pose = {
      x: move.from.x + (x - move.from.x) * eased,
      z: move.from.z + (z - move.from.z) * eased,
      feet: move.from.feet + (feet - move.from.feet) * eased,
    };
    if (progress === 1) move = null;
    return pose;
  };
}
