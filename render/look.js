// Display only: あーちゃん turns the head toward the viewer (the camera) while the body keeps
// its way. Pure math so it runs in Node too; render/view3d.js feeds it the camera's position in
// the frame the head hangs from (+z forward, +y up) and puts the angles on the head.

/** How far and how fast the head turns. Display only; the simulation never reads them. */
export const LOOK = {
  yaw: 1.05, // the most the head turns to either side (about 60°)
  pitch: 0.35, // the most it looks up or down (about 20°)
  fadeFrom: 1.75, // past the side (about 100°) the turn starts to fade...
  behind: 2.5, // ...and from here round to the back, the child looks ahead instead
  reachShare: 0.6, // while reaching, the turn is cut by this share (the eyes stay on the thing)
  ease: 5, // how quickly the head follows, per second
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The head's turn toward the viewer. `toViewer` is the viewer's position from the head, in the
 * head's parent frame; `reach` is 0..1 (how far the arms are raised). Returns the yaw (turn,
 * positive to the child's left = +x) and the pitch (negative looks up), both limited.
 */
export function lookAngles(toViewer, reach = 0) {
  const raw = Math.atan2(toViewer.x, toViewer.z);
  // Mostly behind: turning the head round would look odd, and it would flip from one shoulder
  // to the other as the viewer passes behind. Fade to looking ahead instead.
  const away = clamp((Math.abs(raw) - LOOK.fadeFrom) / (LOOK.behind - LOOK.fadeFrom), 0, 1);
  const facing = 1 - away;
  const limit = LOOK.yaw * (1 - LOOK.reachShare * clamp(reach, 0, 1));
  const yaw = clamp(raw, -limit, limit) * facing;
  const flat = Math.hypot(toViewer.x, toViewer.z);
  const pitch = clamp(-Math.atan2(toViewer.y, flat), -LOOK.pitch, LOOK.pitch) * facing;
  return { yaw, pitch };
}

/** Moves the shown angles toward the target, smoothly, over `seconds` of real time. */
export function easeLook(shown, target, seconds) {
  const share = 1 - Math.exp(-LOOK.ease * Math.max(0, seconds));
  return {
    yaw: shown.yaw + (target.yaw - shown.yaw) * share,
    pitch: shown.pitch + (target.pitch - shown.pitch) * share,
  };
}
