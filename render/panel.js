import { EVENT, EVENT_LABELS } from '../sim/events.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom, LEVEL_CAUTION, LEVEL_DANGER } from '../sim/verdict.js';
import { degreeWord, levelChange, mainMethod, METHOD_WORDS } from '../sim/wording.js';

const MONTHS_PER_YEAR = 12;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const cm = (value) => `${Math.round(value)} cm`;

function formatAge(months) {
  return `${Math.floor(months / MONTHS_PER_YEAR)}歳${months % MONTHS_PER_YEAR}か月`;
}

function fillList(list, rows) {
  list.replaceChildren(...rows.flatMap(([term, value]) => [element('dt', '', term), element('dd', '', value)]));
}

/** The countermeasure in one sentence; every number is from a rerun of all the children. */
function countermeasureLine(search, baselineChildren, limit, label) {
  const { baselineLock, found, last } = search;
  if (baselineLock === 0) return '窓の錠に届いた子はいません。';
  if (found !== null) return `${label}を${found}cm離すと、窓の錠に届く子は${baselineChildren}人から0人になります。`;
  if (!last) return `${label}は、これ以上離す場所がありません。`;
  return `${label}を${last.distance}cmまで離しても（探す上限${limit}cm）、窓の錠に届く子は${baselineChildren}人から${last.children}人までしか減りません。`;
}

/** The results panel: the verdict on top, the child below, and the details folded away. */
export function mountPanel({ ledger, settings, session, getChild, autoplay }) {
  const slider = document.querySelector('#months');
  const monthsLabel = document.querySelector('#months-label');
  const seedInput = document.querySelector('#seed');
  const childValues = document.querySelector('#child-values');
  const trialCounts = document.querySelector('#trial-counts');
  const verdictBox = document.querySelector('#verdict');
  const reasons = document.querySelector('#verdict-reasons');
  const countRows = document.querySelector('#count-rows');
  const compareLine = document.querySelector('#compare-line');
  const countermeasure = document.querySelector('#countermeasure');
  const hazardBox = document.querySelector('#hazard-rows');
  const fallBox = document.querySelector('#fall-rows');
  const retry = document.querySelector('#retry');
  const retryBox = document.querySelector('#retry-box');
  let view = null;
  let lastVerdict = null;

  function showChild() {
    monthsLabel.textContent = formatAge(getChild().months);
    const { height, reach, tiptoeReach, climb, walkSpeed } = session.getSimulation().body;
    fillList(childValues, [
      ['身長', cm(height.value)],
      ['立って手が届く高さ', cm(reach.value)],
      ['背伸びで届く高さ', cm(tiptoeReach.value)],
      ['登れる高さ', cm(climb.value)],
      ['歩く速さ', `${walkSpeed.value.toFixed(2)} m/s`],
    ]);
  }

  /** The list of children under a row: only their numbers; choosing one plays the row's children. */
  function childList(row) {
    if (row.children.length === 0) return element('p', 'hazard-empty', '当てはまる子はいません');
    const list = element('ul', 'hazard-children');
    const seeds = row.children.map(({ seed }) => seed);
    for (const { seed } of row.children) {
      const button = element('button', 'hazard-child', `${seed}番の子`);
      button.type = 'button';
      button.dataset.seed = String(seed);
      button.addEventListener('click', () => autoplay.useList(seeds, seed));
      const item = element('li');
      item.append(button);
      list.append(item);
    }
    return list;
  }

  // The rows of the last calculation, so a new bar can grow or shrink from the old one.
  let previousRows = new Map();
  let lastTags = null;

  /** A short bar: its length is the share who reached it, split by how they reached it. */
  function bar(row, total) {
    const track = element('span', 'row-bar');
    const before = previousRows.get(row.id)?.counts ?? { floor: 0, tiptoe: 0, climbed: 0 };
    const parts = ['climbed', 'tiptoe', 'floor'].map((key) => {
      const part = element('span', `row-bar-part row-bar-${key}`);
      part.style.width = `${(before[key] / total) * 100}%`;
      track.append(part);
      return [key, part];
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [key, part] of parts) part.style.width = `${(row.counts[key] / total) * 100}%`;
    }));
    return track;
  }

  /**
   * One row in words: the thing, how most children reached it, how many in words, and a bar.
   * The numbers are under "くわしく見る". With `compare`, a changed colour is named in words.
   */
  function rowElement(row, total, { lead = '', compare = false } = {}) {
    const details = element('details', 'hazard-row');
    details.dataset.level = row.level;
    details.dataset.id = row.id;
    const summary = element('summary');
    const method = mainMethod(row.counts);
    const how = method ? METHOD_WORDS[method] : '';
    const degree = degreeWord(row.children.length / total, settings.degree_words);
    const line = element('span', 'row-line');
    line.append(
      element('span', 'row-name', `${row.label}${lead}`),
      element('span', 'row-how', how),
      element('span', 'row-degree', degree),
    );
    const before = previousRows.get(row.id);
    if (compare && before) {
      const change = levelChange(before.level, row.level);
      if (change !== 0) {
        line.append(element('span', `row-change row-change-${change > 0 ? 'up' : 'down'}`, change > 0 ? '新しく危なくなった' : '危なくなくなった'));
      }
      // A row stands out when what it says changed: its colour, its way or its words.
      if (change !== 0 || before.how !== how || before.degree !== degree) details.classList.add('row-changed');
    }
    summary.append(line, bar(row, total));
    details.append(summary, childList(row));
    return details;
  }

  // The lock takes the verdict's colour: reaching it at all is the danger the app is about.
  const lockLevel = (verdict) => ({ [LEVEL_DANGER]: 'danger', [LEVEL_CAUTION]: 'caution' }[verdict.level] ?? 'plain');

  const countText = ({ children, counts }) => `${children.length}人（うち登って${counts.climbed}人）`;

  /** What the last two calculations differ in, named for the reader. */
  function compareLabels(before, now, kind) {
    if (!before) return null;
    if (before.months !== now.months) return [formatAge(before.months), formatAge(now.months)];
    const sexWord = { female: '女の子', male: '男の子' };
    if (before.sex !== now.sex) return [sexWord[before.sex], sexWord[now.sex]];
    return { undo: ['戻す前', '戻した後'], reset: ['リセット前', 'リセット後'], room: ['動かす前', '動かした後'] }[kind] ?? null;
  }

  let lastChild = null;
  let lastCounts = null;

  /** Runs the same hundred children (seeds 1 to 100) for the room and child as they are now. */
  function judge(kind = null) {
    const child = getChild();
    const verdict = judgeRoom({ ledger, settings, room: session.getRoom(), ...child });
    const { total } = verdict;
    const labels = compareLabels(lastChild, child, kind);
    const compare = Boolean(labels);
    const lock = verdict.hazards.lock && { ...verdict.hazards.lock, level: lockLevel(verdict) };
    const { rows } = verdict.hazards;
    const all = [...(lock ? [lock] : []), ...rows];
    lastVerdict = verdict;

    verdictBox.dataset.level = verdict.level;
    verdictBox.replaceChildren(...(lock ? [rowElement(lock, total, { lead: 'に', compare })] : []));
    hazardBox.replaceChildren(...rows.map((row) => rowElement(row, total, { compare })));
    fallBox.replaceChildren(...verdict.hazards.falls.map((fall) => {
      const details = element('details', 'hazard-row');
      details.append(element('summary', '', fall.text), childList(fall));
      return details;
    }));
    compareLine.hidden = !compare;
    if (compare) compareLine.textContent = `${labels[0]} → ${labels[1]} で比べています`;

    // The numbers, with the calculation before, only under "くわしく見る".
    const counts = new Map(all.map((row) => [row.id, countText(row)]));
    fillList(countRows, all.map((row) => {
      const before = compare && lastCounts?.get(row.id);
      return [row.label, before ? `${labels[0]} ${before} → ${labels[1]} ${counts.get(row.id)}` : counts.get(row.id)];
    }));
    reasons.replaceChildren(...verdict.reasons.map((text) => element('li', '', text)));
    fillList(trialCounts, Object.entries(verdict.children).filter(([key]) => key !== EVENT.TOUCHED_HAZARD).map(([key, count]) => [
      EVENT_LABELS[key], `${verdict.total}人中${count}人`,
    ]));

    previousRows = new Map(all.map((row) => {
      const method = mainMethod(row.counts);
      return [row.id, {
        level: row.level,
        counts: row.counts,
        how: method ? METHOD_WORDS[method] : '',
        degree: degreeWord(row.children.length / total, settings.degree_words),
      }];
    }));
    lastChild = child;
    lastCounts = counts;
    lastTags = new Map(all.map((row) => [row.id, { level: row.level, method: mainMethod(row.counts) }]));
    countermeasure.textContent = '';
    retryBox.hidden = true;
    verdictBox.classList.remove('stale');
    view?.setFocus(null);
    view?.setDanger({ level: verdict.level, ids: verdict.ids, arrows: verdict.arrows });
    view?.setTags(lastTags);
    autoplay.useEventful(verdict.eventful);
    return verdict;
  }

  /** The room changed by hand: the results wait for 「試し直す」. */
  function markChanged() {
    retryBox.hidden = false;
    verdictBox.classList.add('stale');
  }
  retry.addEventListener('click', () => judge('room'));

  document.querySelector('#find-countermeasure').addEventListener('click', () => {
    const room = session.getRoom();
    const { target, baselineChildren } = findCountermeasure({ ledger, settings, room, boxes: [], ...getChild() });
    if (!target) {
      countermeasure.textContent = '足場になった物はありませんでした。';
      return;
    }
    const landmark = room.landmarks.find(({ id }) => id === target.id);
    const label = landmark?.groupLabel ?? target.label;
    countermeasure.textContent = countermeasureLine(target, baselineChildren, settings.countermeasure_limit_cm, label);
    view?.setFocus(target.id);
  });

  // The child on screen grows while the slider moves; all hundred are run again on release.
  slider.addEventListener('input', () => session.restart());
  slider.addEventListener('change', () => judge());
  for (const radio of document.querySelectorAll('input[name="sex"]')) {
    radio.addEventListener('change', () => judge());
  }
  seedInput.addEventListener('change', () => autoplay.useSeed(Number.parseInt(seedInput.value, 10) || 1));
  session.on('restart', () => {
    showChild();
    seedInput.value = String(session.getSeed());
  });
  showChild();

  return {
    judge,
    markChanged,
    attachView(next) {
      view = next;
      if (lastVerdict) view.setDanger({ level: lastVerdict.level, ids: lastVerdict.ids, arrows: lastVerdict.arrows });
      if (lastTags) view.setTags(lastTags);
    },
  };
}
