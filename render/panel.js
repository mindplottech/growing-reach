import {
  compareResults, conclusion, differenceText, SECTION_COUNTS, SECTION_HAZARDS, toneOf,
} from '../sim/compare.js';
import { buildPlaylists } from '../sim/scenes.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom } from '../sim/verdict.js';
import { reachWords } from '../sim/wording.js';

const MONTHS_PER_YEAR = 12;
const SECONDS_PER_MINUTE = 60;
const MODE_MONTHS = 'months';
const MODE_ROOM = 'room';

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

const sexWord = { female: '女の子', male: '男の子' };

/**
 * The results panel: one sentence of what changed between two conditions, then the table of
 * both, side by side, with the difference. By months, the left is the youngest age and the right
 * the age on the slider; after 「試し直す」, the left is the room before the move and the right
 * the room after, at the same age. 「元に戻す」 and 「リセット」 go back to the months.
 */
export function mountPanel({ ledger, settings, session, getChild, autoplay }) {
  const [baseMonths] = ledger._meta.age_range_months;
  const slider = document.querySelector('#months');
  const monthsLabel = document.querySelector('#months-label');
  const seedInput = document.querySelector('#seed');
  const childValues = document.querySelector('#child-values');
  const conclusionBox = document.querySelector('#verdict');
  const table = document.querySelector('#result-table');
  const leftHead = document.querySelector('#col-left');
  const rightHead = document.querySelector('#col-right');
  const conditions = document.querySelector('#conditions');
  const reachList = document.querySelector('#reach-words');
  const reasons = document.querySelector('#verdict-reasons');
  const countermeasure = document.querySelector('#countermeasure');
  const retry = document.querySelector('#retry');
  const total = settings.trial_count;
  let view = null;
  let lastTags = null;
  let mode = MODE_MONTHS;
  // The room the right-hand result was last calculated for: "before" once the room is moved.
  let judgedRoom = null;
  let beforeRoom = null;
  // What each condition can play, from the last calculation.
  let plays = null;

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

  /** Marks the cell whose scenes are playing, if one was pressed. */
  function showPressed() {
    for (const cell of table.querySelectorAll('[data-play]')) {
      cell.setAttribute('aria-pressed', String(cell.dataset.play === autoplay.key()));
    }
  }

  /** The scenes of one row in one condition: a dangerous thing's touches, or one kind of fall. */
  function scenesOfRow(side, id) {
    const plan = plays?.[side];
    if (!plan) return [];
    if (id.startsWith('fall-')) return plan.byFallKind.get(id.slice('fall-'.length)) ?? [];
    return plan.byThing.get(id) ?? [];
  }

  /** Pressing a row's name or right-hand number plays the right condition; the left number, the left. */
  function playable(cell, side, id) {
    cell.dataset.play = `${side}:${id}`;
    cell.classList.add('playable');
    cell.tabIndex = 0;
    const press = () => {
      autoplay.useList(cell.dataset.play, scenesOfRow(side, id));
      showPressed();
    };
    cell.addEventListener('click', press);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        press();
      }
    });
  }

  /** A count with a thin bar for its share of the hundred, and the climbers for a place. */
  function countCell(count, climbed) {
    const cell = element('td');
    cell.append(element('span', 'count', `${count}人`));
    if (climbed !== undefined) cell.append(element('span', 'climbed', `（登って${climbed}人）`));
    const bar = element('span', 'bar');
    const fill = element('span', 'bar-fill');
    fill.style.width = `${(count / total) * 100}%`;
    bar.append(fill);
    cell.append(bar);
    return cell;
  }

  function rowElement(row, sectionId) {
    const tr = element('tr', 'result-row');
    tr.dataset.id = row.id;
    if (row.level) tr.dataset.level = row.level;
    const name = element('td', 'row-name', row.label);
    const withClimbed = sectionId === SECTION_HAZARDS;
    const leftCell = countCell(row.left, withClimbed ? row.leftClimbed : undefined);
    const rightCell = countCell(row.right, withClimbed ? row.rightClimbed : undefined);
    const diff = element('td', 'diff', differenceText(row.left, row.right));
    diff.dataset.tone = toneOf(row.left, row.right);
    if (row.seeds) {
      if (row.left > 0) playable(leftCell, 'left', row.id);
      if (row.right > 0) {
        playable(rightCell, 'right', row.id);
        name.addEventListener('click', () => rightCell.click());
        name.classList.add('playable-name');
      }
    }
    tr.append(name, leftCell, rightCell, diff);
    return tr;
  }

  function showTable(sections) {
    for (const body of table.querySelectorAll('tbody')) body.remove();
    for (const section of sections) {
      const body = element('tbody', section.id === SECTION_COUNTS ? 'small' : '');
      const title = element('tr', 'section-title');
      const th = element('th', '', section.title);
      th.colSpan = 4;
      th.scope = 'colgroup';
      title.append(th);
      body.append(title, ...section.rows.map((row) => rowElement(row, section.id)));
      table.append(body);
    }
  }

  const minutes = (seconds) => (seconds % SECONDS_PER_MINUTE === 0 ? `${seconds / SECONDS_PER_MINUTE}分` : `${seconds}秒`);
  const averages = ({ averages: { height, climb } }) => `平均の身長 ${Math.round(height)}cm・平均の登れる高さ ${Math.round(climb)}cm`;

  /** The conditions both results were run under, in one line. */
  function conditionLine(names, left, right, child) {
    const shared = `${total}人・各${minutes(settings.trial_seconds)}・${sexWord[child.sex]}`;
    if (mode === MODE_ROOM) return `${shared}・${formatAge(child.months)}（${averages(right)}）`;
    return `${shared}｜${names[0]}：${averages(left)}｜${names[1]}：${averages(right)}`;
  }

  function places(verdict) {
    const { lock, rows } = verdict.hazards;
    return [...(lock ? [lock] : []), ...rows];
  }

  /**
   * Runs the same hundred children (seeds 1 to 100) for both conditions. `kind` is what led
   * here: 'room' (「試し直す」) compares the room before and after; 'undo' and 'reset' go back
   * to comparing by months; anything else keeps the comparison as it is.
   */
  function judge(kind = null) {
    const child = getChild();
    const room = session.getRoom();
    if (kind === 'room' && judgedRoom) {
      mode = MODE_ROOM;
      beforeRoom = judgedRoom;
    } else if (kind === 'undo' || kind === 'reset') {
      mode = MODE_MONTHS;
    }
    const right = judgeRoom({ ledger, settings, room, ...child });
    const left = mode === MODE_ROOM
      ? judgeRoom({ ledger, settings, room: beforeRoom, ...child })
      : judgeRoom({ ledger, settings, room, months: baseMonths, sex: child.sex });
    const names = mode === MODE_ROOM ? ['動かす前', '動かした後'] : [formatAge(baseMonths), formatAge(child.months)];
    const leftCondition = mode === MODE_ROOM ? { ...child, room: beforeRoom } : { months: baseMonths, sex: child.sex, room };
    judgedRoom = room;
    const span = { before: settings.scene_before_seconds, after: settings.scene_after_seconds, trialSeconds: settings.trial_seconds };
    plays = {
      left: buildPlaylists({ verdict: left, condition: leftCondition, ...span }),
      right: buildPlaylists({ verdict: right, condition: { ...child, room }, ...span }),
    };

    const sections = compareResults(left, right);
    const said = conclusion(sections, { leftName: names[0], rightName: names[1], kind: mode });
    conclusionBox.dataset.tone = said.tone;
    conclusionBox.replaceChildren(element('p', 'conclusion-text', said.text));
    [leftHead.textContent, rightHead.textContent] = names;
    showTable(sections);
    conditions.textContent = `使った条件：${conditionLine(names, left, right, child)}`;

    // How each place was reached, in words, for both conditions.
    const leftWords = new Map(places(left).map((row) => [row.id, reachWords(row).text]));
    fillList(reachList, places(right).map((row) => [
      row.label, `${names[0]}：${leftWords.get(row.id) ?? '届かない'}／${names[1]}：${reachWords(row).text}`,
    ]));
    reasons.replaceChildren(...right.reasons.map((text) => element('li', '', text)));

    lastTags = new Map(places(right).map((row) => [row.id, reachWords(row)]));
    countermeasure.textContent = '';
    retry.disabled = true;
    retry.dataset.pending = 'false';
    document.querySelector('#results').classList.remove('stale');
    view?.setTags(lastTags);
    autoplay.useAuto(plays.right.auto);
    showPressed();
    return right;
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
  // A whole run by number, of the right-hand condition: from the start to the end of the trial.
  seedInput.addEventListener('change', () => {
    const seed = Number.parseInt(seedInput.value, 10) || 1;
    autoplay.useRun({
      ...getChild(), seed, room: session.getRoom(), start: 0, end: settings.trial_seconds, moment: null, thing: null, heading: `${seed}番の子`,
    });
    showPressed();
  });
  autoplay.onChange(showPressed);
  session.on('restart', () => {
    showChild();
    seedInput.value = String(session.getSeed());
  });
  showChild();

  return {
    judge,
    markChanged,
    /** The scenes of the right-hand condition, for the buttons under the 3D view. */
    plays: () => plays?.right ?? null,
    attachView(next) {
      view = next;
      if (lastTags) view.setTags(lastTags);
    },
  };
}
