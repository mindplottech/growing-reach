import { EVENT } from './events.js';
import { fallRows, hazardRows, METHOD_CLIMBED, METHOD_TIPTOE, summarizeChild } from './hazardReport.js';
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
function hazardSection(hazards, summaries, total) {
  const childText = (seed, text) => ({ seed, text: `${seed}番の子　${text}` });
  const rows = hazardRows(hazards, summaries).map((row) => ({
    ...row,
    text: `${row.label}：${total}人中${row.children.length}人が届く（うち登って${row.counts.climbed}人）`,
    children: row.children.map((child) => childText(child.seed, howReached(child))),
  }));
  const falls = fallRows(summaries);
  const fallText = (title, { children, highest }) => `${title}：${total}人中${children.length}人${highest === null ? '' : `（いちばん高い所で${cm(highest)}）`}`;
  return {
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
export function judgeRoom({ ledger, settings, room, months, sex }) {
  const total = settings.trial_count;
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

  for (let seed = 1; seed <= total; seed += 1) {
    const simulation = createSimulation({ ledger, settings, months, sex, seed, room });
    simulation.step(settings.trial_seconds);
    landmarks = simulation.landmarks;
    hazards = simulation.hazards;
    summaries.push({ seed, summary: summarizeChild(simulation.events) });
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
  const of = (count) => `（${total}人中${count}人）`;
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
    hazards: hazardSection(hazards, summaries, total),
    children: Object.fromEntries(Object.entries(children).map(([kind, seeds]) => [kind, seeds.size])),
  };
}
