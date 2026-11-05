import { getBodyValues, SEX_ANY } from './body.js';
import { landmarkHeight } from './room.js';
import { floorHazardLevel } from './hazards.js';
import { horizontalReach, REACH_STANDING, REACH_TIPTOE } from './scaffold.js';

// Environment adjustments (環境調整): for a child of an age, what they can do by themselves in
// this room, what one adjustment (a step stool, or putting a thing lower) would let them do,
// and what is still out of reach. Nothing here is random: only the body values from the
// ledger and the heights of the things. The hundred-child simulation never reads this.

export const STATUS_CAN = 'can';
export const STATUS_HELP = 'help';
export const STATUS_NOT_YET = 'not_yet';

export const HELP_STEP = 'step';
export const HELP_LOWER = 'lower';
export const HELP_CLOSER = 'closer';

const STEP_ROUND_CM = 5;
const roundUp = (value) => Math.ceil(value / STEP_ROUND_CM) * STEP_ROUND_CM;
const roundDown = (value) => Math.floor(value / STEP_ROUND_CM) * STEP_ROUND_CM;

/** The goals of the layout with their heights resolved from the ledger and the furniture. */
export function placeGoals(ledger, room, landmarks) {
  const byId = new Map(landmarks.map((landmark) => [landmark.id, landmark]));
  return (room.goals ?? []).flatMap((goal) => {
    if (goal.on) {
      const under = byId.get(goal.on);
      if (!under) return [];
      return [{
        ...goal,
        under,
        height: under.height,
        x: under.x + Math.min(Math.max(goal.dx ?? 0, 0), under.w - goal.w),
        y: under.y + Math.min(Math.max(goal.dy ?? 0, 0), under.d - goal.d),
        heightCategory: under.category ?? 'measured',
      }];
    }
    if (goal.on_landmark) {
      // A goal at a landmark's own height (the window sill): drawn at its wall position.
      const at = byId.get(goal.on_landmark);
      if (!at) return [];
      return [{ ...goal, height: at.height, heightCategory: at.category ?? 'measured', x: goal.wall.x, y: goal.wall.y, w: goal.wall.w, d: goal.wall.d }];
    }
    const [itemId, key] = goal.heightOf;
    const entry = ledger.items.find(({ id }) => id === itemId)?.values?.[key];
    if (!entry) throw new Error(`no height in ledger for ${itemId}.${key}`);
    const height = entry.values ? entry.values[goal.level_index ?? entry.values.length - 1] : landmarkHeight(ledger, goal.heightOf);
    const alt = goal.alt ? { ...goal.alt, height: landmarkHeight(ledger, goal.alt.heightOf) } : null;
    const levels = entry.values ?? null;
    return [{ ...goal, height, levels, heightCategory: entry.category ?? 'provisional', alt, x: goal.wall.x, y: goal.wall.y, w: goal.wall.w, d: goal.wall.d }];
  });
}

/** The lowest tiptoe gain in the ledger: the cautious reading of 「背伸びで届く」. */
function tiptoeMin(ledger) {
  return ledger.items.find(({ id }) => id === 'tiptoe_gain').range[0];
}

/**
 * One goal for one body. `reach` and `climb` are the body's standing reach and climb height.
 * A step stool must itself be climbable (its height at most the climb height); standing on it
 * the child reaches `reach` higher than its top. Putting a thing lower means at or below the
 * standing reach.
 */
export function goalStatus(ledger, body, goal) {
  const reach = body.reach.value;
  const climb = body.climb.value;
  const tiptoe = reach + tiptoeMin(ledger);
  const h = goal.height;
  if (goal.kind === 'climb') {
    if (climb >= h) return { status: STATUS_CAN, how: '自分で登れる', gapCm: 0 };
    const gapCm = Math.ceil(h - climb);
    const step = roundUp(h - climb);
    if (step <= climb) return { status: STATUS_HELP, help: HELP_STEP, stepCm: step, how: `踏み台${step}cm`, gapCm };
    return { status: STATUS_NOT_YET, how: 'まだ登れない', gapCm };
  }
  // How far the hand falls short of the thing on tiptoe: the 「あと○cm」 of a reach goal.
  const gapCm = Math.max(0, Math.ceil(h - tiptoe));
  // A thing on furniture must also be within the ledger's horizontal reach from the edge.
  const onTop = goal.under ? floorHazardLevel(ledger, body, goal.under, goal) : null;
  if (onTop !== null) {
    if (onTop === REACH_STANDING) return { status: STATUS_CAN, how: '床から届く', gapCm: 0 };
    if (onTop === REACH_TIPTOE) return { status: STATUS_CAN, how: '背伸びで届く', gapCm: 0 };
  } else {
    if (h <= reach) return { status: STATUS_CAN, how: '床から届く', gapCm: 0 };
    if (h <= tiptoe) return { status: STATUS_CAN, how: '背伸びで届く', gapCm: 0 };
  }
  if (goal.help === HELP_CLOSER) {
    // A thing on furniture within the ledger's horizontal reach from the edge the child stands at.
    if (h > tiptoe) return { status: STATUS_NOT_YET, how: '天板にまだ届かない', gapCm };
    const within = roundDown(horizontalReach(ledger, reach, h));
    if (within <= 0) return { status: STATUS_NOT_YET, how: '縁の物にもまだ届かない', gapCm };
    return { status: STATUS_HELP, help: HELP_CLOSER, maxDistanceCm: within, how: `縁から${within}cm以内に置く`, gapCm };
  }
  if (goal.help === HELP_LOWER) {
    // With shelf levels, name the highest level within reach; otherwise a height.
    const level = goal.levels ? goal.levels.filter((each) => each <= reach).length : 0;
    if (goal.levels && level === 0) return { status: STATUS_NOT_YET, how: 'いちばん下の段にも届かない', gapCm };
    const maxHeightCm = goal.levels ? goal.levels[level - 1] : roundDown(reach);
    const how = goal.levels ? `下から${level}段目（${maxHeightCm}cm）までに置く` : `${maxHeightCm}cm以下に置く`;
    return { status: STATUS_HELP, help: HELP_LOWER, maxHeightCm, how, gapCm };
  }
  const step = roundUp(h - reach);
  if (step <= climb) return { status: STATUS_HELP, help: HELP_STEP, stepCm: step, how: `踏み台${step}cm`, gapCm };
  if (goal.alt && goal.alt.height <= reach) return { status: STATUS_HELP, help: HELP_LOWER, maxHeightCm: goal.alt.height, how: goal.alt.text, gapCm };
  return { status: STATUS_NOT_YET, how: 'まだ届かない', gapCm };
}

/** The body of the child in general, or of 「うちの子」 (a fixed z), at an age. */
function bodyAt(ledger, { months, sex = SEX_ANY, individual = null }) {
  return getBodyValues(ledger, { months, sex, z: individual ?? undefined });
}

/**
 * The adjustments at one age: every goal with its status, the one step height that covers
 * every goal needing a step (the tallest), the things to put lower, and the dangerous things
 * that the step would bring into reach (「だから大人がすること」).
 */
export function adjustmentsAt({ ledger, room, landmarks, hazards = [], months, sex, individual }) {
  const body = bodyAt(ledger, { months, sex, individual });
  // The window lock counts among the dangerous things a step could bring into reach.
  const lock = landmarks.find(({ role }) => role === 'window_lock');
  const dangerous = [...hazards, ...(lock ? [{ id: lock.id, label: lock.mapLabel ?? lock.label, height: lock.height }] : [])];
  const goals = placeGoals(ledger, room, landmarks).map((goal) => ({ ...goal, ...goalStatus(ledger, body, goal) }));
  const stepCm = Math.max(0, ...goals.filter((goal) => goal.help === HELP_STEP && goal.status === STATUS_HELP).map((goal) => goal.stepCm));
  const reach = body.reach.value;
  const withStep = stepCm > 0 ? dangerous
    .filter((hazard) => hazard.height > reach + tiptoeMin(ledger) && hazard.height <= reach + stepCm)
    .map((hazard) => ({ id: hazard.id, label: hazard.label, height: hazard.height, putAbove: roundUp(reach + stepCm + 1) })) : [];
  return {
    months,
    body: { height: body.height.value, reach, climb: body.climb.value },
    goals,
    stepCm,
    lower: goals.filter((goal) => goal.help === HELP_LOWER && goal.status === STATUS_HELP),
    hazardsWithStep: withStep,
  };
}

/**
 * The timeline: at which age each goal first becomes possible with help, and by themselves,
 * walking every month of the ledger's range. Written as fixed sentences by the screen.
 */
export function adjustmentTimeline({ ledger, room, landmarks, hazards = [], sex, individual }) {
  const [from, to] = ledger._meta.age_range_months;
  const rows = [];
  let previous = null;
  for (let months = from; months <= to; months += 1) {
    const now = adjustmentsAt({ ledger, room, landmarks, hazards, months, sex, individual });
    for (const goal of now.goals) {
      const before = previous?.goals.find(({ id }) => id === goal.id);
      if (!before || before.status !== goal.status || (goal.status === STATUS_HELP && before.how !== goal.how)) {
        rows.push({ months, goalId: goal.id, label: goal.label, status: goal.status, how: goal.how, stepCm: goal.stepCm ?? null });
      }
    }
    previous = now;
  }
  return rows;
}

/**
 * The span of each help (「助けの期間」): for every goal that ever needs a step, the first and
 * last months a step is needed and the month it is no longer needed; for things put lower or
 * closer, whether that help is still needed at the end of the range. Built from the timeline.
 */
export function helpSpans(timeline, [from, to]) {
  const byGoal = new Map();
  for (const row of timeline) {
    if (!byGoal.has(row.goalId)) byGoal.set(row.goalId, { goalId: row.goalId, label: row.label, rows: [] });
    byGoal.get(row.goalId).rows.push(row);
  }
  return [...byGoal.values()].map(({ goalId, label, rows }) => {
    const statusAt = (months) => rows.filter((row) => row.months <= months).at(-1);
    const stepRows = rows.filter((row) => row.stepCm !== null && row.status === STATUS_HELP);
    const canRow = rows.find((row) => row.status === STATUS_CAN);
    const endStatus = statusAt(to);
    return {
      goalId,
      label,
      stepFrom: stepRows[0]?.months ?? null,
      stepMax: stepRows.length ? Math.max(...stepRows.map((row) => row.stepCm)) : null,
      stepMin: stepRows.length ? Math.min(...stepRows.map((row) => row.stepCm)) : null,
      canFrom: canRow?.months ?? null,
      stillHelpedAtEnd: endStatus?.status === STATUS_HELP ? endStatus.how : null,
      notYetAtEnd: endStatus?.status === STATUS_NOT_YET,
      from,
      to,
    };
  });
}
