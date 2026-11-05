import { HELP_CLOSER, HELP_LOWER, HELP_STEP, STATUS_CAN, STATUS_HELP } from './adjustments.js';

// One goal, tried in front of the thing (「助けを置いて、使うところを見せる」): where the child
// stands, what help is put there (a step stool, the thing lower or closer), and where the hand
// gets to with and without it. Only numbers, in cm, for the 3D view to draw. Nothing random:
// the goal's status comes from adjustments.js, the sizes from params.js (provisional).

const TIPTOE_WORD = '背伸びで届く';

/** The side of a footprint that faces a point, as a unit step along x or y (y is the floor's depth). */
function sideToward(object, point) {
  const dx = (point.x - (object.x + object.w / 2)) / object.w;
  const dy = (point.y - (object.y + object.d / 2)) / object.d;
  return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || -1 };
}

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/**
 * `goal` is one of adjustmentsAt(...).goals (with status, help and sizes), `body` its body
 * (height, reach, climb in cm), `room` the layout (for the room areas), `sizes` the
 * help_scene settings. Returns null for a goal that cannot be drawn.
 */
export function helpScene({ ledger, room, goal, body, sizes }) {
  const tiptoeGain = ledger.items.find(({ id }) => id === 'tiptoe_gain').range[0];
  const area = (room.rooms ?? []).find(({ id }) => id === goal.room);
  const areaCentre = area ? { x: area.x + area.w / 2, y: area.y + area.d / 2 } : { x: room.width / 2, y: room.depth / 2 };
  // The thing, and the piece of furniture or wall it belongs to: the child comes to that side.
  const thing = { x: goal.x, y: goal.y, w: goal.w, d: goal.d };
  const holder = goal.under ?? thing;
  const facing = sideToward(holder, goal.under?.approach ?? areaCentre);
  const standDistance = sizes.stand_distance_cm;
  // The hand reaches over the holder's edge, so the stool sits with its far edge at the holder.
  const stepW = sizes.step_width_cm;
  const stepD = sizes.step_depth_cm;
  const centre = { x: thing.x + thing.w / 2, y: thing.y + thing.d / 2 };
  const edge = facing.x !== 0
    ? { x: facing.x > 0 ? holder.x + holder.w : holder.x, y: clamp(centre.y, holder.y + stepW / 2, holder.y + holder.d - stepW / 2) }
    : { x: clamp(centre.x, holder.x + stepW / 2, holder.x + holder.w - stepW / 2), y: facing.y > 0 ? holder.y + holder.d : holder.y };
  if (holder.w < stepW) edge.x = facing.x !== 0 ? edge.x : centre.x;
  if (holder.d < stepW) edge.y = facing.y !== 0 ? edge.y : centre.y;
  const stand = { x: edge.x + facing.x * standDistance, y: edge.y + facing.y * standDistance };
  // The figure faces the thing.
  const yaw = Math.atan2(centre.x - stand.x, centre.y - stand.y);
  const reach = body.reach;
  const tiptoe = reach + tiptoeGain;
  const isWork = goal.kind === 'work';
  const isClimb = goal.kind === 'climb';

  /** The figure on a surface `feet` high, trying for a thing at `height`. */
  function figure(feet, height) {
    if (isClimb) {
      const can = body.climb >= height - feet;
      return { x: stand.x, y: stand.y, feet, yaw, arms: can ? 0.6 : 1, stretch: 0, forward: false, handHeight: feet + reach, reaches: can };
    }
    if (isWork) {
      const share = ledger.items.find(({ id }) => id === 'elbow_height_share');
      const elbow = feet + body.height * share.value;
      const can = height <= elbow + share.work_tolerance_cm.value;
      return { x: stand.x, y: stand.y, feet, yaw, arms: 0.5, stretch: 0, forward: true, handHeight: elbow, reaches: can };
    }
    const standing = feet + reach >= height;
    const onTiptoe = !standing && feet + tiptoe >= height;
    return {
      x: stand.x, y: stand.y, feet, yaw, arms: 1, stretch: onTiptoe ? 1 : 0, forward: false,
      handHeight: feet + (onTiptoe ? tiptoe : reach), reaches: standing || onTiptoe,
    };
  }

  const without = figure(0, goal.height);
  let prop = null;
  let withHelp = without;
  let thingAfter = { ...thing, height: goal.height };
  if (goal.status === STATUS_HELP && goal.help === HELP_STEP) {
    // The stool's long side runs along the holder's edge, under the child's feet.
    const [w, d] = facing.y !== 0 ? [stepW, stepD] : [stepD, stepW];
    prop = { kind: HELP_STEP, heightCm: goal.stepCm, x: stand.x - w / 2, y: stand.y - d / 2, w, d };
    withHelp = figure(goal.stepCm, goal.height);
  } else if (goal.status === STATUS_HELP && goal.help === HELP_LOWER) {
    prop = { kind: HELP_LOWER, heightCm: goal.maxHeightCm };
    thingAfter = { ...thing, height: goal.maxHeightCm };
    withHelp = figure(0, goal.maxHeightCm);
  } else if (goal.status === STATUS_HELP && goal.help === HELP_CLOSER) {
    // The thing moves to within the horizontal reach of the edge the child stands at.
    const inward = Math.min(goal.maxDistanceCm, Math.max(thing.w, thing.d)) / 2;
    const moved = facing.x !== 0
      ? { x: edge.x - facing.x * inward - thing.w / 2, y: clamp(stand.y - thing.d / 2, holder.y, holder.y + holder.d - thing.d) }
      : { x: clamp(stand.x - thing.w / 2, holder.x, holder.x + holder.w - thing.w), y: edge.y - facing.y * inward - thing.d / 2 };
    prop = { kind: HELP_CLOSER, distanceCm: goal.maxDistanceCm };
    thingAfter = { ...thing, ...moved, height: goal.height };
    withHelp = { ...without, reaches: true };
  }
  return {
    goalId: goal.id,
    label: goal.label,
    short: goal.short ?? goal.label,
    status: goal.status,
    kind: goal.kind,
    how: goal.how,
    gapCm: goal.gapCm ?? 0,
    // Says 「背伸びで届く」 only when the status came from the tiptoe reading.
    tiptoe: goal.status === STATUS_CAN && goal.how === TIPTOE_WORD,
    stand,
    facing,
    thing: { ...thing, height: goal.height },
    thingAfter,
    prop,
    without,
    withHelp,
  };
}
