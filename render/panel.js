import { EVENT, EVENT_LABELS } from '../sim/events.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom } from '../sim/verdict.js';

const MONTHS_PER_YEAR = 12;
// Wait for the slider to settle before running all children again.
const JUDGE_DELAY_MS = 150;

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
export function mountPanel({ ledger, settings, session, getChild }) {
  const slider = document.querySelector('#months');
  const monthsLabel = document.querySelector('#months-label');
  const seedInput = document.querySelector('#seed');
  const childValues = document.querySelector('#child-values');
  const trialCounts = document.querySelector('#trial-counts');
  const verdictBox = document.querySelector('#verdict');
  const headline = verdictBox.querySelector('.verdict-headline');
  const reasons = verdictBox.querySelector('.verdict-reasons');
  const countermeasure = document.querySelector('#countermeasure');
  const hazardBox = document.querySelector('#hazard-rows');
  let view = null;
  let timer = null;
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

  /** Replays one of the hundred children from the start: the same seed gives the same run. */
  function replay(seed) {
    seedInput.value = String(seed);
    session.setSeed(seed);
    session.setPlaying(true);
  }

  /** One row per dangerous thing and per kind of fall; each opens the list of its children. */
  function showHazards({ rows, falls }) {
    hazardBox.replaceChildren(...[...rows, ...falls].map((row) => {
      const details = element('details', 'hazard-row');
      details.dataset.level = row.level ?? 'plain';
      details.append(element('summary', '', row.text));
      if (row.children.length === 0) {
        details.append(element('p', 'hazard-empty', '当てはまる子はいません'));
      } else {
        const list = element('ul', 'hazard-children');
        for (const child of row.children) {
          const button = element('button', 'hazard-child', child.text);
          button.type = 'button';
          button.addEventListener('click', () => replay(child.seed));
          const item = element('li');
          item.append(button);
          list.append(item);
        }
        details.append(list);
      }
      return details;
    }));
  }

  function judge() {
    const verdict = judgeRoom({ ledger, settings, room: session.getRoom(), ...getChild() });
    lastVerdict = verdict;
    verdictBox.dataset.level = verdict.level;
    headline.textContent = verdict.headline;
    reasons.replaceChildren(...verdict.reasons.map((text) => element('li', '', text)));
    showHazards(verdict.hazards);
    // Dangerous things have their own rows above, counted by how they were reached.
    fillList(trialCounts, Object.entries(verdict.children).filter(([kind]) => kind !== EVENT.TOUCHED_HAZARD).map(([kind, count]) => [
      EVENT_LABELS[kind], `${verdict.total}人中${count}人`,
    ]));
    view?.setDanger({ level: verdict.level, ids: verdict.ids, arrows: verdict.arrows });
  }

  function judgeSoon() {
    clearTimeout(timer);
    timer = setTimeout(judge, JUDGE_DELAY_MS);
    countermeasure.textContent = '';
    view?.setFocus(null);
  }

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

  slider.addEventListener('input', () => session.restart());
  for (const radio of document.querySelectorAll('input[name="sex"]')) {
    radio.addEventListener('change', () => session.restart());
  }
  seedInput.addEventListener('change', () => session.setSeed(Number.parseInt(seedInput.value, 10) || 1));

  let judgedFor = null;
  session.on('restart', () => {
    showChild();
    // The seed changes only the child on screen, not the hundred children behind the verdict.
    const key = JSON.stringify([getChild(), session.getRoom()]);
    if (key !== judgedFor) {
      judgedFor = key;
      judgeSoon();
    }
  });
  showChild();
  judgedFor = JSON.stringify([getChild(), session.getRoom()]);
  judge();

  return {
    attachView(next) {
      view = next;
      if (lastVerdict) view.setDanger({ level: lastVerdict.level, ids: lastVerdict.ids, arrows: lastVerdict.arrows });
    },
  };
}
