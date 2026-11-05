import test from 'node:test';
import assert from 'node:assert/strict';
import { activitiesAt, adjustmentsAt, adjustmentTimeline, goalStatus, inAge, placeGoals, STATUS_CAN, STATUS_HELP, STATUS_NOT_YET, STATUS_WITH_ADULT, HELP_STEP, HELP_LOWER, HELP_ADULT } from '../sim/adjustments.js';
import { createSimulation } from '../sim/simulation.js';
import { getBodyValues, SEX_ANY } from '../sim/body.js';
import * as helpersAll from './helpers.js';
import { byId, ledger, roomLayout, settings, maxMonths, minMonths } from './helpers.js';
import { selectLayout } from '../sim/room.js';

const sim = createSimulation({ ledger, settings, months: 36, sex: SEX_ANY, seed: 1, room: roomLayout });
const base = { ledger, room: roomLayout, landmarks: sim.landmarks, hazards: sim.hazards, sex: SEX_ANY };

test('every goal of the layout gets a height from the ledger or its furniture', () => {
  const goals = placeGoals(ledger, roomLayout, sim.landmarks);
  assert.equal(goals.length, roomLayout.goals.length);
  for (const goal of goals) assert.ok(goal.height > 0, goal.id);
  assert.equal(goals.find(({ id }) => id === 'switch').height, 120);
  assert.equal(goals.find(({ id }) => id === 'seat').height, sim.landmarks.find(({ id }) => id === 'dining_chair').height);
});

test('a step stool is the smallest multiple of 5 cm that brings a thing within standing reach, and must itself be climbable', () => {
  const body = getBodyValues(ledger, { months: 24, sex: SEX_ANY });
  const high = { id: 'x', kind: 'reach', help: HELP_STEP, height: body.reach.value + 12 };
  const result = goalStatus(ledger, body, high);
  assert.equal(result.status, STATUS_HELP);
  assert.equal(result.stepCm, 15);
  const tooHigh = { id: 'y', kind: 'reach', help: HELP_STEP, height: body.reach.value + body.climb.value + 10 };
  assert.equal(goalStatus(ledger, body, tooHigh).status, STATUS_NOT_YET);
  const low = { id: 'z', kind: 'reach', help: HELP_STEP, height: body.reach.value - 1 };
  assert.equal(goalStatus(ledger, body, low).status, STATUS_CAN);
});

test('putting a thing lower names the highest shelf level within standing reach', () => {
  const body = getBodyValues(ledger, { months: 15, sex: SEX_ANY });
  const shelf = { id: 'b', kind: 'reach', help: HELP_LOWER, height: 105, levels: [15, 45, 75, 105] };
  const result = goalStatus(ledger, body, shelf);
  assert.equal(result.status, STATUS_HELP);
  assert.equal(result.maxHeightCm, 75);
  assert.match(result.how, /下から3段目/);
});

test('with age, help gets smaller and then is no longer needed; nothing ever gets harder', () => {
  // 「大人と一緒に」 comes before a step: the step is offered only from the practice's age.
  const rank = { [STATUS_NOT_YET]: 0, [STATUS_WITH_ADULT]: 1, [STATUS_HELP]: 2, [STATUS_CAN]: 3 };
  const stepFrom = byId('practice_step_stool').step_from_months;
  let previous = null;
  for (let months = minMonths; months <= maxMonths; months += 1) {
    const now = adjustmentsAt({ ...base, months });
    if (previous) {
      for (const goal of now.goals) {
        const before = previous.goals.find(({ id }) => id === goal.id);
        if (!before) continue; // a goal of a new age (KO's 「年ごろ」) starts here
        assert.ok(rank[goal.status] >= rank[before.status], `${goal.id} at ${months}`);
        if (goal.stepCm !== undefined && before.stepCm !== undefined) assert.ok(goal.stepCm <= before.stepCm);
      }
      // The one stool for all: compared over the goals of both ages (a goal of a new 年ごろ may bring its own).
      const stepOf = (state, ids) => Math.max(0, ...state.goals.filter((goal) => ids.has(goal.id) && goal.status === STATUS_HELP && goal.help === HELP_STEP).map((goal) => goal.stepCm));
      const shared = new Set(previous.goals.map(({ id }) => id).filter((id) => now.goals.some((goal) => goal.id === id)));
      if (months > stepFrom) assert.ok(stepOf(now, shared) <= stepOf(previous, shared), `stool at ${months}`);
    }
    previous = now;
  }
  assert.equal(adjustmentsAt({ ...base, months: 60 }).goals.find(({ id }) => id === 'switch').status, STATUS_CAN);
});

test('the timeline lists each change once, in age order, starting with every goal at the youngest age', () => {
  const rows = adjustmentTimeline(base);
  const first = rows.filter(({ months }) => months === minMonths);
  assert.equal(first.length, roomLayout.goals.filter((goal) => inAge(goal, minMonths)).length);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].months >= rows[i - 1].months);
  const seat = rows.filter(({ goalId }) => goalId === 'seat');
  assert.equal(seat[seat.length - 1].status, STATUS_CAN);
});

test('a typed child shifts the adjustments by their rank, without touching the simulation', () => {
  const tall = adjustmentsAt({ ...base, months: 24, individual: { height: 2, climb: 2 } });
  const median = adjustmentsAt({ ...base, months: 24 });
  assert.ok(tall.stepCm <= median.stepCm);
  const again = createSimulation({ ledger, settings, months: 36, sex: SEX_ANY, seed: 1, room: roomLayout });
  again.step(30);
  const fresh = createSimulation({ ledger, settings, months: 36, sex: SEX_ANY, seed: 1, room: roomLayout });
  fresh.step(30);
  assert.deepEqual(again.events, fresh.events);
});

test('work with the hands needs the top at the elbow plus a tolerance; the step makes up the rest', () => {
  const body = getBodyValues(ledger, { months: 24, sex: SEX_ANY });
  const share = byId('elbow_height_share');
  const limit = body.height.value * share.value + share.work_tolerance_cm.value;
  const fine = { id: 'w1', kind: 'work', help: HELP_STEP, height: limit - 1 };
  assert.equal(goalStatus(ledger, body, fine).status, STATUS_CAN);
  const counter = { id: 'w2', kind: 'work', help: HELP_STEP, height: limit + 12 };
  const result = goalStatus(ledger, body, counter);
  assert.equal(result.status, STATUS_HELP);
  assert.equal(result.stepCm, 15);
});

test('every room has goals with heights, and the hundred runs still work there', () => {
  const { roomFile } = helpersAll;
  for (const { id } of roomFile.layouts) {
    const room = selectLayout(roomFile, id);
    const simulation = createSimulation({ ledger, settings, months: 24, sex: SEX_ANY, seed: 1, room });
    simulation.step(10);
    const goals = placeGoals(ledger, room, simulation.landmarks);
    assert.equal(goals.length, room.goals.length, id);
    for (const goal of goals) assert.ok(goal.height > 0 && goal.x >= 0 && goal.y >= 0 && goal.x + goal.w <= room.width + 1e-9 && goal.y + goal.d <= room.depth + 1e-9, `${id} ${goal.id}`);
    const now = adjustmentsAt({ ledger, room, landmarks: simulation.landmarks, hazards: simulation.hazards, months: 24, sex: SEX_ANY });
    assert.equal(now.goals.length, room.goals.filter((goal) => inAge(goal, 24)).length);
  }
});

test('practice (KO): before 30 months no step stool is offered; the adult holds the child up instead', () => {
  const practice = byId('practice_step_stool');
  assert.equal(practice.category, 'provisional');
  assert.equal(practice.source, 'KO_PRACTICE');
  for (let months = minMonths; months < practice.step_from_months; months += 1) {
    for (const goal of adjustmentsAt({ ...base, months }).goals) {
      const from = practice.step_from_by_goal?.[goal.id] ?? practice.step_from_months;
      if (months < from) assert.ok(!(goal.status === STATUS_HELP && goal.help === HELP_STEP), `${goal.id} at ${months}`);
      if (goal.status === STATUS_WITH_ADULT) {
        assert.equal(goal.help, HELP_ADULT);
        assert.equal(goal.how, practice.before_words);
        assert.ok(goal.neededStepCm === null || goal.neededStepCm > 0); // null: つかまり立ちのころ, no step at all
      }
    }
  }
  // 1歳3か月 (つかまり立ちのころ) and 1歳6か月 (walking): the switch is with an adult, not a step
  // (at 18 months the body alone would say a 30 cm step).
  const switchAt = (months) => adjustmentsAt({ ...base, months }).goals.find(({ id }) => id === 'switch');
  assert.equal(switchAt(15).status, STATUS_WITH_ADULT);
  assert.equal(switchAt(18).status, STATUS_WITH_ADULT);
  assert.equal(switchAt(18).neededStepCm, 30);
  assert.equal(adjustmentsAt({ ...base, months: 18 }).stepCm, 0);
});

test('practice (KO): from 30 months the step comes, with an adult beside at first', () => {
  const practice = byId('practice_step_stool');
  const now = adjustmentsAt({ ...base, months: practice.step_from_months });
  const stepped = now.goals.filter(({ help, status }) => help === HELP_STEP && status === STATUS_HELP);
  assert.ok(stepped.length > 0);
  for (const goal of stepped) {
    assert.equal(goal.accompany, practice.from_words);
  }
  assert.equal(now.goals.find(({ id }) => id === 'switch').stepCm, 15);
  // Putting a thing lower is not a step: it is offered at any age.
  assert.ok(adjustmentsAt({ ...base, months: 15 }).goals.some(({ help, status }) => help === HELP_LOWER && status === STATUS_HELP));
});

test('practice (KO): each goal is shown only in its 年ごろ, and the 遊びと生活 follow the age', () => {
  const ids = (months) => adjustmentsAt({ ...base, months }).goals.map(({ id }) => id);
  // 1歳3か月: no toilet goals (KO: 4歳で行きたいと言える), no hook, no cooking; the crayons are there.
  for (const id of ['sit', 'flush', 'paper', 'toilet_switch', 'hook', 'help_cook', 'tidy', 'laundry']) assert.ok(!ids(18).includes(id), id);
  for (const id of ['crayons', 'toys', 'clothes', 'books']) assert.ok(ids(18).includes(id), id);
  // つかまり立ちのころ (9か月): the touch toys and the books, reached standing at the furniture; no walking goals.
  for (const id of ['toys', 'books', 'switch', 'wash']) assert.ok(ids(9).includes(id), id);
  for (const id of ['crayons', 'clothes', 'shoes', 'step_up', 'seat', 'cup']) assert.ok(!ids(9).includes(id), id);
  assert.equal(adjustmentsAt({ ...base, months: 9 }).goals.find(({ id }) => id === 'toys').how, 'つかまり立ちで届く');
  assert.equal(activitiesAt(ledger, 9).label, 'つかまり立ちのころ');
  assert.ok(activitiesAt(ledger, 9).play.includes('手遊び'));
  // 2歳: tidying and the laundry basket come; 3歳: the crayons and the touch toys go, the hook comes.
  assert.ok(ids(24).includes('tidy') && ids(24).includes('laundry'));
  assert.ok(!ids(36).includes('crayons') && !ids(36).includes('toys') && ids(36).includes('hook'));
  // 4歳: the toilet; 5歳: the paper too (KO: 自分でトイレの処理ができる).
  assert.ok(ids(48).includes('sit') && !ids(48).includes('paper') && ids(60).includes('paper'));
  // The window is no longer something to want (it invites climbing to the window).
  assert.ok(!ids(15).includes('window_view'));
  assert.equal(activitiesAt(ledger, 16).label, '1歳');
  assert.ok(activitiesAt(ledger, 16).play.includes('いないいないばあ'));
  assert.equal(activitiesAt(ledger, 48).label, '4歳');
  assert.equal(byId('practice_age_activities').source, 'KO_PRACTICE');
});

test('practice (KO): hand washing starts on a step at 2 years, the others at 2½', () => {
  const at = (months, id) => adjustmentsAt({ ...base, months }).goals.find((goal) => goal.id === id);
  assert.equal(at(21, 'wash').status, STATUS_WITH_ADULT);
  assert.equal(at(24, 'wash').status, STATUS_HELP);
  assert.equal(at(24, 'wash').help, HELP_STEP);
  assert.equal(at(24, 'wash').stepFromMonths, undefined);
  assert.equal(at(21, 'wash').stepFromMonths, 24);
  assert.equal(at(24, 'switch').status, STATUS_WITH_ADULT);
  assert.equal(at(24, 'switch').stepFromMonths, 30);
});
