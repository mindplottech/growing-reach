import { HELP_CLOSER, HELP_LOWER, HELP_STEP, STATUS_CAN, STATUS_HELP, STATUS_WITH_ADULT } from './adjustments.js';
import { landmarkHeight } from './room.js';

// One goal, tried in front of the thing (「助けを置いて、使うところを見せる」): where the child
// stands, what help is put there (a step stool, the thing lower or closer), and where the hand
// gets to with and without it. Only numbers, in cm, for the 3D view to draw. Nothing random:
// the goal's status comes from adjustments.js, the sizes from params.js (provisional).

const TIPTOE_WORD = '背伸びで届く';
// Display only. The toilet seat's middle lies this share of the bowl's depth in from its front;
// the stool tucks this far under the front of the seat.
const SEAT_CENTRE_SHARE = 0.25;
const STOOL_UNDER_SEAT_CM = 8;
// The adult holds the child at this share of the child's height (under the arms), lifts in steps
// of this, and stands this far back of the child's line when beside.
const HOLD_AT_SHARE = 0.55;
const LIFT_ROUND_CM = 5;
const BESIDE_BACK_CM = 10;
const HOLD_SIDE_SHARE = 0.8;
// Putting on shoes, sitting on the step (display only): the child sits this far along the step
// from the shoe shelf and this far in from its front edge; the adult kneels on the 土間 this far
// in front of the child and this far to one side, so the child is not hidden.
const SIT_FROM_THING_CM = 110;
const SIT_END_MARGIN_CM = 25;
const SIT_IN_FROM_EDGE_CM = 8;
const KNEEL_FRONT_CM = 42;
const KNEEL_SIDE_CM = 22;
/** How the shoes go on, by who does what (ledger practice_self_care.shoes.adult_part). */
export const DRESS_PUTS_ON = 'puts_on';
export const DRESS_HELPS = 'helps';
export const DRESS_ALONE = 'alone';

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
 * help_scene settings, `adultSizes` the adult_figure settings (both display only). Returns null
 * for a goal that cannot be drawn.
 */
export function helpScene({ ledger, room, goal, body, sizes, adultSizes = null }) {
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
  // Putting on shoes (KO 2026-11-06): the child sits on the step (goal.sit_on), facing the 土間.
  const seat = goal.sit_on ? (room.landmarks ?? []).find(({ id }) => id === goal.sit_on) : null;
  if (seat) return seatedScene({ ledger, goal, seat, thing, areaCentre, adultSizes, reach });

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
  let adult = null;
  if (goal.status === STATUS_HELP && goal.help === HELP_STEP && goal.feetStep) {
    // At the toilet (KO): the child sits on the seat facing out, the feet resting on the stool in
    // front of it. The seat's middle is a little toward the front of the bowl (the tank is behind).
    const [w, d] = facing.y !== 0 ? [stepW, stepD] : [stepD, stepW];
    const front = { x: edge.x, y: edge.y };
    const seatCentre = {
      x: facing.x !== 0 ? front.x - facing.x * holder.w * SEAT_CENTRE_SHARE : centre.x,
      y: facing.y !== 0 ? front.y - facing.y * holder.d * SEAT_CENTRE_SHARE : centre.y,
    };
    // [w, d] are the stool's extents along x and y; its depth along the facing is stepD.
    const out = stepD / 2 - STOOL_UNDER_SEAT_CM;
    const stoolCentre = facing.x !== 0 ? { x: front.x + facing.x * out, y: seatCentre.y } : { x: seatCentre.x, y: front.y + facing.y * out };
    prop = { kind: HELP_STEP, heightCm: goal.stepCm, x: stoolCentre.x - w / 2, y: stoolCentre.y - d / 2, w, d };
    withHelp = {
      x: seatCentre.x, y: seatCentre.y, feet: goal.height, yaw: Math.atan2(facing.x, facing.y), arms: 0, stretch: 0, forward: false,
      handHeight: goal.height + reach, reaches: true, seated: goal.height,
    };
  } else if (goal.status === STATUS_HELP && goal.help === HELP_STEP) {
    // The stool's long side runs along the holder's edge, under the child's feet.
    const [w, d] = facing.y !== 0 ? [stepW, stepD] : [stepD, stepW];
    prop = { kind: HELP_STEP, heightCm: goal.stepCm, x: stand.x - w / 2, y: stand.y - d / 2, w, d };
    withHelp = figure(goal.stepCm, goal.height);
  } else if (goal.status === STATUS_WITH_ADULT && adultSizes) {
    // Together with an adult (KO): where a step would be needed, the adult stands behind and holds
    // the child up by that much (抱っこ); otherwise (clothes, shoes, the toothbrush) the adult stands
    // beside the child and helps.
    const lift = goal.selfCare ? 0 : (goal.neededStepCm ?? (goal.gapCm > 0 ? Math.ceil(goal.gapCm / LIFT_ROUND_CM) * LIFT_ROUND_CM : 0));
    if (lift > 0) {
      withHelp = { ...figure(lift, goal.height), reaches: true };
      // Behind and a little to one side (the child stays in view from behind), turned to the child.
      const side = { x: -facing.y, y: facing.x };
      const at = {
        x: stand.x + facing.x * adultSizes.hold_behind_cm + side.x * adultSizes.hold_behind_cm * HOLD_SIDE_SHARE,
        y: stand.y + facing.y * adultSizes.hold_behind_cm + side.y * adultSizes.hold_behind_cm * HOLD_SIDE_SHARE,
      };
      adult = {
        mode: 'hold', x: at.x, y: at.y, yaw: Math.atan2(stand.x - at.x, stand.y - at.y),
        holdHeight: lift + body.height * HOLD_AT_SHARE, holdForward: Math.hypot(stand.x - at.x, stand.y - at.y),
      };
    } else {
      const side = { x: -facing.y, y: facing.x };
      const at = { x: stand.x + side.x * adultSizes.beside_cm + facing.x * BESIDE_BACK_CM, y: stand.y + side.y * adultSizes.beside_cm + facing.y * BESIDE_BACK_CM };
      adult = { mode: 'beside', x: at.x, y: at.y, yaw: Math.atan2(stand.x - at.x, stand.y - at.y), holdHeight: body.height * HOLD_AT_SHARE };
    }
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
    stepFromMonths: goal.stepFromMonths ?? null,
    feetStep: Boolean(goal.feetStep),
    // Says 「背伸びで届く」 only when the status came from the tiptoe reading.
    tiptoe: goal.status === STATUS_CAN && goal.how === TIPTOE_WORD,
    stand,
    facing,
    thing: { ...thing, height: goal.height },
    thingAfter,
    prop,
    without,
    withHelp,
    adult,
  };
}

/**
 * The child sits on `seat` (the step at the entrance) facing out over its front, and puts the
 * shoes on: trying while the adult puts them on (1歳代), with the adult helping (2歳代), or alone
 * (3歳から, or whenever the goal is the child's own). Display only; the status is the goal's.
 */
function seatedScene({ ledger, goal, seat, thing, areaCentre, adultSizes, reach }) {
  const seatHeight = landmarkHeight(ledger, seat.heightOf);
  const out = sideToward(seat, seat.approach ?? areaCentre);
  const centre = { x: thing.x + thing.w / 2, y: thing.y + thing.d / 2 };
  // Along the step, a little way from the shelf; just in from the front edge.
  const toward = (along, low, length) => clamp(along, low + SIT_END_MARGIN_CM, low + length - SIT_END_MARGIN_CM);
  const awayFrom = (from, low, length) => (from > low + length / 2 ? from - SIT_FROM_THING_CM : from + SIT_FROM_THING_CM);
  const sit = out.y !== 0
    ? { x: toward(awayFrom(centre.x, seat.x, seat.w), seat.x, seat.w), y: (out.y > 0 ? seat.y + seat.d : seat.y) - out.y * SIT_IN_FROM_EDGE_CM }
    : { x: (out.x > 0 ? seat.x + seat.w : seat.x) - out.x * SIT_IN_FROM_EDGE_CM, y: toward(awayFrom(centre.y, seat.y, seat.d), seat.y, seat.d) };
  const together = goal.status === STATUS_WITH_ADULT;
  const dressing = !together ? DRESS_ALONE : goal.adultPart === DRESS_PUTS_ON ? DRESS_PUTS_ON : DRESS_HELPS;
  const figure = {
    x: sit.x, y: sit.y, feet: 0, yaw: Math.atan2(out.x, out.y), arms: 0, stretch: 0, forward: false,
    handHeight: seatHeight + reach, reaches: true, seated: seatHeight, dressing,
  };
  let adult = null;
  if (together && adultSizes) {
    // Kneeling on the 土間 in front of the child, a little to the side away from the shoe shelf
    // (so the shelf side stays open for the view), turned to the child's feet.
    const across = { x: -out.y, y: out.x };
    const towardThing = (centre.x - sit.x) * across.x + (centre.y - sit.y) * across.y;
    const side = towardThing > 0 ? { x: -across.x, y: -across.y } : across;
    const at = { x: sit.x + out.x * KNEEL_FRONT_CM + side.x * KNEEL_SIDE_CM, y: sit.y + out.y * KNEEL_FRONT_CM + side.y * KNEEL_SIDE_CM };
    const feet = { x: sit.x + out.x * KNEEL_FRONT_CM * 0.4, y: sit.y + out.y * KNEEL_FRONT_CM * 0.4 };
    adult = { mode: 'kneel', x: at.x, y: at.y, yaw: Math.atan2(feet.x - at.x, feet.y - at.y), holdForward: Math.hypot(feet.x - at.x, feet.y - at.y), dressing };
  }
  return {
    goalId: goal.id,
    label: goal.label,
    short: goal.short ?? goal.label,
    status: goal.status,
    kind: goal.kind,
    how: goal.how,
    gapCm: goal.gapCm ?? 0,
    stepFromMonths: null,
    feetStep: false,
    tiptoe: false,
    dressing,
    stand: sit,
    facing: out,
    thing: { ...thing, height: goal.height },
    thingAfter: { ...thing, height: goal.height },
    prop: null,
    without: figure,
    withHelp: figure,
    adult,
  };
}
