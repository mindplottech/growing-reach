import { EVENT, EVENT_LABELS } from '../sim/events.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom } from '../sim/verdict.js';

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
  const headline = verdictBox.querySelector('.verdict-headline');
  const reasons = verdictBox.querySelector('.verdict-reasons');
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

  /** One row per dangerous thing and per kind of fall; each opens the list of its children. */
  function rowElements(rows) {
    return rows.map((row) => {
      const details = element('details', 'hazard-row');
      details.dataset.level = row.level ?? 'plain';
      details.dataset.id = row.id;
      details.append(element('summary', '', row.text));
      if (row.children.length === 0) {
        details.append(element('p', 'hazard-empty', '当てはまる子はいません'));
      } else {
        const list = element('ul', 'hazard-children');
        const seeds = row.children.map(({ seed }) => seed);
        for (const child of row.children) {
          const button = element('button', 'hazard-child', child.text);
          button.type = 'button';
          button.dataset.seed = String(child.seed);
          // The children of this row play one after another, from the one chosen.
          button.addEventListener('click', () => autoplay.useList(seeds, child.seed));
          const item = element('li');
          item.append(button);
          list.append(item);
        }
        details.append(list);
      }
      return details;
    });
  }

  // Falls sit under "くわしく見る" so that the panel fits the screen without scrolling.
  function showHazards({ lock, rows, falls }) {
    hazardBox.replaceChildren(...rowElements([...(lock ? [lock] : []), ...rows]));
    fallBox.replaceChildren(...rowElements(falls));
  }

  /** Runs the same hundred children (seeds 1 to 100) for the room and child as they are now. */
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
    countermeasure.textContent = '';
    retryBox.hidden = true;
    verdictBox.classList.remove('stale');
    view?.setFocus(null);
    view?.setDanger({ level: verdict.level, ids: verdict.ids, arrows: verdict.arrows });
    autoplay.useEventful(verdict.eventful);
    return verdict;
  }

  /** The room changed by hand: the results wait for 「試し直す」. */
  function markChanged() {
    retryBox.hidden = false;
    verdictBox.classList.add('stale');
  }
  retry.addEventListener('click', judge);

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
  slider.addEventListener('change', judge);
  for (const radio of document.querySelectorAll('input[name="sex"]')) {
    radio.addEventListener('change', judge);
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
    },
  };
}
