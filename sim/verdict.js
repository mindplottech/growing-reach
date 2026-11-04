import { EVENT } from './events.js';
import {
  fallRows, hazardRows, lockRow, METHOD_CLIMBED, METHOD_TIPTOE, somethingHappened, summarizeChild,
} from './hazardReport.js';
import { scenesOf } from './scenes.js';
import { footprintDistance } from './scaffold.js';
import { createSimulation } from './simulation.js';

export const LEVEL_DANGER = 'danger';
export const LEVEL_CAUTION = 'caution';
export const LEVEL_CLEAR = 'clear';

const MAX_REASONS = 3;
const cm = (value) => `${Math.round(value)}cm`;

function addTo(map, key, seed) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(seed);
}

const byChildren = ([, a], [, b]) => b.size - a.size;

function howReached({ method, footholdLabel }) {
  if (method === METHOD_CLIMBED) return `${footholdLabel}に登って`;
  if (method === METHOD_TIPTOE) return '背伸びで';
  return '床から';
}

const startedFrom = (height) => (height === 0 ? '床' : cm(height));

/** The rows for dangerous things and falls, in fixed sentences with a child list each. */
function hazardSection(hazards, summaries, total, lockObject, landmarks, unit) {
  const childText = (seed, text) => ({ seed, text: `${seed}番の子　${text}` });
  // The foothold by the short name the room shows on it (いす for ダイニングチェア).
  const shown = (label) => {
    const landmark = landmarks.find((each) => each.label === label);
    return landmark?.mapLabel ?? label;
  };
  const named = (row) => row && { ...row, foothold: row.foothold && shown(row.foothold) };
  const lock = lockObject && named(lockRow(lockObject, summaries));
  const rows = hazardRows(hazards, summaries).map(named).map((row) => ({
    ...row,
    text: `${row.label}：${total}${unit}中${row.children.length}${unit}が届く（うち登って${row.counts.climbed}${unit}）`,
    children: row.children.map((child) => childText(child.seed, howReached(child))),
  }));
  const falls = fallRows(summaries);
  const fallText = (title, { children, highest }) => `${title}：${total}${unit}中${children.length}${unit}${highest === null ? '' : `（いちばん高い所で${cm(highest)}）`}`;
  return {
    lock: lock && {
      ...lock,
      text: `${lock.label}：${total}${unit}中${lock.children.length}${unit}が届く（うち登って${lock.counts.climbed}${unit}）`,
      children: lock.children.map((child) => childText(child.seed, howReached(child))),
    },
    rows,
    falls: [
      {
        id: 'on_furniture',
        text: fallText('家具の上から落ちた', falls.onFurniture),
        children: falls.onFurniture.children.map(({ seed, label, height }) => childText(seed, `${label}（${cm(height)}）から`)),
      },
      {
        id: 'while_climbing',
        text: fallText('登る途中で落ちた', falls.whileClimbing),
        children: falls.whileClimbing.children.map(({ seed, label, height }) => childText(seed, `${label}に登る途中（${startedFrom(height)}から登り始めて）`)),
      },
    ],
  };
}

/**
 * Runs the same children as the 100-child totals and puts what happened into fixed sentences.
 * Nothing is estimated: every number is a count of children in the record. The words never
 * say a room is safe; the clearest result only says no child reached the lock.
 */
export function judgeRoom({ ledger, settings, room, months, sex, individual = null }) {
  const total = settings.trial_count;
  // A hundred children in general, or a hundred runs of one fixed child (「うちの子」).
  const unit = individual ? '回' : '人';
  const reachedLock = new Set();
  const stood = new Set();
  const lockFromFloor = new Set();
  const lockBy = new Map();
  const stoodOn = new Map();
  const climbedNearWindow = new Map();
  const children = Object.fromEntries(Object.values(EVENT).map((kind) => [kind, new Set()]));
  let landmarks = [];
  let hazards = [];
  const summaries = [];
  const scenes = [];
  let heightSum = 0;
  let climbSum = 0;

  for (let seed = 1; seed <= total; seed += 1) {
    const simulation = createSimulation({ ledger, settings, months, sex, seed, room, individual });
    simulation.step(settings.trial_seconds);
    heightSum += simulation.body.height.value;
    climbSum += simulation.body.climb.value;
    landmarks = simulation.landmarks;
    hazards = simulation.hazards;
    summaries.push({ seed, summary: summarizeChild(simulation.events) });
    scenes.push({ seed, height: simulation.body.height.value, ...scenesOf(simulation.events) });
    // The lock is part of the window, so being beside either counts as near the window.
    const windowParts = landmarks.filter(({ role }) => role === 'window' || role === 'window_lock');
    const nearWindow = (id) => {
      const object = landmarks.find((landmark) => landmark.id === id);
      return Boolean(object) && windowParts.some((part) => footprintDistance(object, part) <= room.window_side_gap.value);
    };
    for (const event of simulation.events) {
      children[event.kind].add(seed);
      if (event.kind === EVENT.REACHED_LOCK) {
        reachedLock.add(seed);
        if (event.footholdId) addTo(lockBy, event.footholdId, seed);
        else lockFromFloor.add(seed);
      }
      if (event.kind === EVENT.STOOD_AT_WINDOW) {
        stood.add(seed);
        addTo(stoodOn, event.footholdId, seed);
      }
      if (event.kind === EVENT.CLIMBED && nearWindow(event.footholdId)) addTo(climbedNearWindow, event.footholdId, seed);
    }
  }

  const find = (id) => landmarks.find((landmark) => landmark.id === id);
  const lock = landmarks.find(({ role }) => role === 'window_lock');
  const windowFrame = landmarks.find(({ role }) => role === 'window');
  const of = (count) => `（${total}${unit}中${count}${unit}）`;
  const reasons = [];
  const arrows = [];
  const ids = new Set();

  for (const [id, seeds] of [...lockBy].sort(byChildren)) {
    const foothold = find(id);
    reasons.push({ children: seeds.size, text: `${foothold.label}（${cm(foothold.height)}）から窓の錠（${cm(lock.height)}）に手が届きます${of(seeds.size)}` });
    arrows.push({ from: id, to: lock.id });
    ids.add(id);
  }
  if (lockFromFloor.size > 0) {
    reasons.push({ children: lockFromFloor.size, text: `床に立ったまま窓の錠（${cm(lock.height)}）に手が届きます${of(lockFromFloor.size)}` });
    // From the floor where a child stands to reach the lock: the place in the layout.
    arrows.push({ from: null, floor: lock.approach, to: lock.id });
  }
  for (const [id, seeds] of [...stoodOn].sort(byChildren)) {
    const foothold = find(id);
    reasons.push({ children: seeds.size, text: `${foothold.label}（${cm(foothold.height)}）に乗ると窓台に立てます${of(seeds.size)}` });
    arrows.push({ from: id, to: windowFrame.id });
    ids.add(id);
  }

  let level = LEVEL_CLEAR;
  let headline = `錠に届いた子はいませんでした${of(0)}`;
  if (reachedLock.size > 0 || stood.size > 0) {
    level = LEVEL_DANGER;
    headline = reachedLock.size > 0
      ? `窓の錠に手が届く子がいます${of(reachedLock.size)}`
      : `窓台に立つ子がいます${of(stood.size)}`;
    ids.add(lock.id);
    if (stood.size > 0) ids.add(windowFrame.id);
  } else if (climbedNearWindow.size > 0) {
    level = LEVEL_CAUTION;
    const climbers = new Set([...climbedNearWindow.values()].flatMap((seeds) => [...seeds]));
    headline = `窓の近くの家具に登る子がいます${of(climbers.size)}`;
    for (const [id, seeds] of [...climbedNearWindow].sort(byChildren)) {
      const foothold = find(id);
      reasons.push({ children: seeds.size, text: `${foothold.label}（${cm(foothold.height)}）に登りますが、窓の錠には届きません${of(seeds.size)}` });
      ids.add(id);
    }
  }

  reasons.sort((a, b) => b.children - a.children);
  return {
    level,
    headline,
    reasons: reasons.slice(0, MAX_REASONS).map(({ text }) => text),
    ids,
    arrows,
    total,
    unit,
    individual,
    hazards: hazardSection(hazards, summaries, total, lock && { id: lock.id, label: lock.mapLabel ?? lock.label }, landmarks, unit),
    // The runs to play, and only these: those who reached the window lock first, then the others
    // who reached a dangerous thing or fell; each group by seed.
    eventful: [
      ...summaries.filter(({ summary }) => summary.lock),
      ...summaries.filter(({ summary }) => !summary.lock && somethingHappened(summary)),
    ].map(({ seed }) => seed),
    children: Object.fromEntries(Object.entries(children).map(([kind, seeds]) => [kind, seeds.size])),
    // The mean of the hundred children's bodies, for the line of conditions under the table.
    averages: { height: heightSum / total, climb: climbSum / total },
    // Per child, the moments worth watching: the first reach of each thing as counted, and falls.
    scenes,
  };
}
