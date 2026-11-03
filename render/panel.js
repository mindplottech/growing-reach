import { EVENT, EVENT_LABELS } from '../sim/events.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom } from '../sim/verdict.js';
import { reachWords } from '../sim/wording.js';

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

/** What the last two calculations differ in, named for the reader. */
function compareLabels(before, now, kind) {
  if (!before) return null;
  if (before.months !== now.months) return [formatAge(before.months), formatAge(now.months)];
  const sexWord = { female: '女の子', male: '男の子' };
  if (before.sex !== now.sex) return [sexWord[before.sex], sexWord[now.sex]];
  return { undo: ['戻す前', '戻した後'], reset: ['リセット前', 'リセット後'], room: ['動かす前', '動かした後'] }[kind] ?? null;
}

const countText = ({ children, counts }) => `${children.length}人（うち登って${counts.climbed}人）`;

/**
 * The results panel. The main screen says, per place, only how a child gets a hand to it, in
 * the colour of the same rule; the numbers are under "くわしく見る". Pressing a row plays only
 * the runs that reached that place.
 */
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
  let view = null;
  let lastTags = null;
  let lastChild = null;
  let lastWords = new Map();
  let lastCounts = new Map();

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

  /** Marks the row whose runs are playing, if one was pressed. */
  function showPressed() {
    for (const button of document.querySelectorAll('.place-row')) {
      button.setAttribute('aria-pressed', String(button.dataset.id === autoplay.row()));
    }
  }

  function playRow(id, seeds) {
    autoplay.useRow(id, seeds);
    showPressed();
  }

  /** One place: its name and how a child reaches it, in its colour; a change shows what it was. */
  function placeRow(row, compare) {
    const words = reachWords(row);
    const button = element('button', 'place-row');
    button.type = 'button';
    button.dataset.level = words.level;
    button.dataset.id = row.id;
    button.disabled = row.children.length === 0;
    button.append(element('span', 'row-name', row.label));
    const before = compare ? lastWords.get(row.id) : null;
    const how = element('span', 'row-how');
    if (before && before.text !== words.text) {
      how.append(element('span', `row-before row-before-${before.level}`, before.text), ' → ');
      button.classList.add('row-changed');
    }
    how.append(words.text);
    button.append(how);
    button.addEventListener('click', () => playRow(row.id, row.children.map(({ seed }) => seed)));
    return button;
  }

  /** Runs the same hundred children (seeds 1 to 100) for the room and child as they are now. */
  function judge(kind = null) {
    const child = getChild();
    const verdict = judgeRoom({ ledger, settings, room: session.getRoom(), ...child });
    const labels = compareLabels(lastChild, child, kind);
    const compare = Boolean(labels);
    const { lock, rows, falls } = verdict.hazards;
    const places = [...(lock ? [lock] : []), ...rows];

    verdictBox.dataset.level = lock ? reachWords(lock).level : 'plain';
    verdictBox.replaceChildren(...(lock ? [placeRow(lock, compare)] : []));
    hazardBox.replaceChildren(...rows.map((row) => placeRow(row, compare)));
    compareLine.hidden = !compare;
    if (compare) compareLine.textContent = `${labels[0]} → ${labels[1]} で比べています`;

    // The numbers, with the calculation before, only under "くわしく見る".
    const counts = new Map(places.map((row) => [row.id, countText(row)]));
    fillList(countRows, places.map((row) => {
      const before = compare && lastCounts.get(row.id);
      return [row.label, before ? `${labels[0]} ${before} → ${labels[1]} ${counts.get(row.id)}` : counts.get(row.id)];
    }));
    fallBox.replaceChildren(...falls.map((fall) => {
      const button = element('button', 'place-row fall-row', fall.text);
      button.type = 'button';
      button.dataset.id = `fall-${fall.id}`;
      button.disabled = fall.children.length === 0;
      button.addEventListener('click', () => playRow(`fall-${fall.id}`, fall.children.map(({ seed }) => seed)));
      return button;
    }));
    reasons.replaceChildren(...verdict.reasons.map((text) => element('li', '', text)));
    fillList(trialCounts, Object.entries(verdict.children).filter(([key]) => key !== EVENT.TOUCHED_HAZARD).map(([key, count]) => [
      EVENT_LABELS[key], `${verdict.total}人中${count}人`,
    ]));

    lastWords = new Map(places.map((row) => [row.id, reachWords(row)]));
    lastCounts = counts;
    lastChild = child;
    lastTags = lastWords;
    countermeasure.textContent = '';
    retry.disabled = true;
    retry.dataset.pending = 'false';
    document.querySelector('#results').classList.remove('stale');
    view?.setTags(lastTags);
    autoplay.useEventful(verdict.eventful);
    showPressed();
    return verdict;
  }

  /** The room changed by hand: the results wait for 「試し直す」. */
  function markChanged() {
    retry.disabled = false;
    retry.dataset.pending = 'true';
    document.querySelector('#results').classList.add('stale');
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
  });

  // The child on screen grows while the slider moves; all hundred are run again on release.
  slider.addEventListener('input', () => session.restart());
  slider.addEventListener('change', () => judge());
  for (const radio of document.querySelectorAll('input[name="sex"]')) {
    radio.addEventListener('change', () => judge());
  }
  seedInput.addEventListener('change', () => {
    autoplay.useSeed(Number.parseInt(seedInput.value, 10) || 1);
    showPressed();
  });
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
      if (lastTags) view.setTags(lastTags);
    },
  };
}
