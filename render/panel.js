import {
  compareResults, conclusion, differenceText, SECTION_COUNTS, SECTION_HAZARDS, summaryLine, TONE_SAME, toneOf,
} from '../sim/compare.js';
import { buildPlaylists } from '../sim/scenes.js';
import { findCountermeasure } from '../sim/trials.js';
import { judgeRoom } from '../sim/verdict.js';
import { reachWords } from '../sim/wording.js';
import { adjustmentsAt, adjustmentTimeline, helpSpans, HELP_STEP, STATUS_CAN, STATUS_HELP, STATUS_NOT_YET } from '../sim/adjustments.js';
import { getBodyValues } from '../sim/body.js';
import { helpScene } from '../sim/helpScene.js';
import { normalCdf } from '../sim/random.js';

const MONTHS_PER_YEAR = 12;
const SECONDS_PER_MINUTE = 60;
const MODE_MONTHS = 'months';
const MODE_ROOM = 'room';
// 「あと○cm」 is said only when the thing is this close (display only).
const NEAR_GAP_CM = 15;

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

const sexWord = { female: '女の子', male: '男の子', any: '一般の子（男女平均）' };

/**
 * The results panel: one sentence of what changed between two conditions, then the table of
 * both, side by side, with the difference. By months, the left is the youngest age and the right
 * the age on the slider; after 「試し直す」, the left is the room before the move and the right
 * the room after, at the same age. 「元に戻す」 and 「リセット」 go back to the months.
 */
export function mountPanel({ ledger, settings, session, getChild, autoplay }) {
  const [youngestMonths] = ledger._meta.age_range_months;
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
  const myChild = document.querySelector('#my-child');
  const myChildNote = document.querySelector('#my-child-note');
  const myChildPosition = document.querySelector('#my-child-position');
  const adjustLists = {
    can: document.querySelector('#adjust-can'),
    help: document.querySelector('#adjust-help'),
    notyet: document.querySelector('#adjust-notyet'),
    next: document.querySelector('#adjust-next'),
    adults: document.querySelector('#adjust-adults'),
    spans: document.querySelector('#adjust-spans'),
  };
  const adjustTitle = document.querySelector('#adjustments-title');
  const adjustRooms = document.querySelector('#adjust-rooms');
  // The room the adjustments are shown for: 'all' or one of the layout's rooms.
  let adjustRoom = 'living';
  let lastChild = null;
  // The goal being shown in 3D with its help placed (「助けを置いて見せる」), and which side.
  let shownGoalId = null;
  // How many whole runs (seeds 1..n) あーちゃん walks through on its own, in turn. Display only.
  const WANDER_RUNS = 5;
  let shownWithHelp = true;
  let lastAll = null;
  const caption = {
    main: document.querySelector('#help-caption-main'),
    sub: document.querySelector('#help-caption-sub'),
    actions: document.querySelector('#help-caption-actions'),
    with: document.querySelector('#help-with'),
    without: document.querySelector('#help-without'),
    close: document.querySelector('#help-close'),
  };
  const CAPTION_IDLE = caption.main.textContent;
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

  /** Where the typed child sits among a hundred of the same age, and their body at the slider's age. */
  function showPosition(child) {
    if (!child.individual) {
      myChildPosition.replaceChildren();
      return;
    }
    const at = child.measuredMonths;
    const measuredBody = getBodyValues(ledger, { months: at, sex: child.sex, z: child.individual });
    const rank = (z) => Math.min(100, Math.max(1, Math.round(normalCdf(z) * 100)));
    const lines = [];
    const parts = [];
    if (child.individual.height !== undefined) parts.push(`身長は下から${rank(child.individual.height)}番目くらい`);
    lines.push(`${formatAge(at)}の子100人の中で、${parts.join('、')}。`);
    const extreme = Object.values(child.individual).some((z) => Math.abs(z) > 3);
    if (extreme) lines.push('台帳の分布から大きく外れた値です。月齢か数値を確かめてください。');
    if (child.months !== at) {
      const body = session.getSimulation().body;
      lines.push(`${formatAge(child.months)}では、身長 ${cm(body.height.value)}・登れる高さ ${cm(body.climb.value)} と推測して計算しています（身長の順位が変わらないとみなした仮値）。`);
    } else {
      lines.push(`身長から、登れる高さ ${cm(measuredBody.climb.value)}・立って届く高さ ${cm(measuredBody.reach.value)} と推測して計算しています。`);
    }
    myChildPosition.replaceChildren(...lines.map((text, i) => element(i === 0 ? 'strong' : 'span', '', text)).flatMap((node, i) => (i ? [document.createElement('br'), node] : [node])));
  }

  /**
   * The adjustments of the age on the slider: what the child does by themselves, what one
   * help makes possible, what is still to come, and what the step would bring into reach.
   * Deterministic, from the ledger; the hundred runs are not involved. Returns the tag levels.
   */
  function showAdjustments(child) {
    lastChild = child;
    const simulation = session.getSimulation();
    const room = session.getRoom();
    const shared = { ledger, room, landmarks: simulation.landmarks, hazards: simulation.hazards, sex: child.sex, individual: child.individual };
    const all = adjustmentsAt({ ...shared, months: child.months });
    lastAll = all;
    const allRows = adjustmentTimeline(shared);
    // The room chips: all, then each room of the layout; the lists below show the chosen one.
    const areas = room.rooms ?? [];
    if (adjustRooms.childElementCount !== areas.length + 1) {
      adjustRooms.replaceChildren(...[{ id: 'all', label: 'すべて' }, ...areas].map((area) => {
        const button = element('button', '', area.label);
        button.type = 'button';
        button.dataset.room = area.id;
        button.addEventListener('click', () => {
          adjustRoom = area.id;
          // A new room starts at the whole house; a scene opens only when a row is pressed.
          if (shownGoalId !== null) closeHelp();
          showAdjustments(lastChild);
          view?.setGoalRoom(adjustRoom);
        });
        return button;
      }));
    }
    for (const button of adjustRooms.children) button.setAttribute('aria-pressed', String(button.dataset.room === adjustRoom));
    const inRoom = (goal) => adjustRoom === 'all' || goal.room === adjustRoom;
    const roomName = new Map(areas.map((area) => [area.id, area.label]));
    const now = { ...all, goals: all.goals.filter(inRoom) };
    now.stepCm = Math.max(0, ...now.goals.filter((goal) => goal.help === HELP_STEP && goal.status === STATUS_HELP).map((goal) => goal.stepCm));
    const rows = allRows.filter((row) => adjustRoom === 'all' || all.goals.find(({ id }) => id === row.goalId)?.room === adjustRoom);
    const named = (goal) => (adjustRoom === 'all' && roomName.has(goal.room) ? `${roomName.get(goal.room)}：${goal.label}` : goal.label);
    const who = child.individual ? 'この子は' : '';
    adjustTitle.textContent = `${formatAge(child.months)}の環境調整`;
    const firstCan = (goalId) => rows.find((row) => row.goalId === goalId && row.status === STATUS_CAN)?.months ?? null;
    const item = (text, quiet = false) => { const li = element('li', quiet ? 'quiet' : '', ''); li.append(text); return li; };
    // A row that can be pressed to see its goal in 3D.
    const showable = (li, goal) => {
      li.classList.add('showable');
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.dataset.goal = goal.id;
      li.setAttribute('aria-pressed', String(goal.id === shownGoalId));
      const press = () => openHelp(goal.id);
      li.addEventListener('click', press);
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(); }
      });
      return li;
    };
    const bold = (text) => { const node = element('strong', '', text); return node; };

    // By themselves, with the age it became so when that is later than the start.
    adjustLists.can.replaceChildren(...now.goals.filter(({ status }) => status === STATUS_CAN).map((goal) => {
      const since = firstCan(goal.id);
      const li = item(named(goal));
      li.append(`（${goal.how}${since && since > ledger._meta.age_range_months[0] ? `・${formatAge(since)}から` : ''}）`);
      // Nothing to place for what the child does already, so these rows open no scene.
      return li;
    }));
    // With help: one step covers every goal needing one; things put lower or closer each on a line.
    const helped = now.goals.filter(({ status }) => status === STATUS_HELP);
    const stepGoals = helped.filter(({ help }) => help === HELP_STEP);
    const helpItems = [];
    // 「あと○cm」: how far the hand or the climb falls short, when it is close.
    const gap = (goal) => (goal.gapCm > 0 && goal.gapCm <= NEAR_GAP_CM ? `（あと${goal.gapCm}cm）` : '');
    // One row per goal, so each can be pressed to see it; the step's height is the one that covers all.
    for (const goal of stepGoals) {
      const li = item('');
      li.append(bold(`踏み台 ${goal.stepCm}cm`), ` → ${named(goal)}${gap(goal)}`);
      helpItems.push(showable(li, goal));
    }
    if (stepGoals.length > 1 && stepGoals.some((goal) => goal.stepCm !== now.stepCm)) {
      helpItems.push(item(`踏み台を1つにするなら、いちばん高い ${now.stepCm}cm で全部に足りる`, true));
    }
    for (const goal of helped.filter(({ help }) => help !== HELP_STEP)) {
      const li = item('');
      li.append(bold(goal.how), ` → ${named(goal)}${gap(goal)}`);
      helpItems.push(showable(li, goal));
    }
    adjustLists.help.replaceChildren(...helpItems);
    adjustLists.notyet.replaceChildren(...now.goals.filter(({ status }) => status === STATUS_NOT_YET).map((goal) => showable(item(`${named(goal)}（${goal.how}${goal.gapCm ? `・あと${goal.gapCm}cm` : ''}）`, true), goal)));
    // The span of each help: from when to when a step is needed, and when the goal is theirs.
    adjustLists.spans.replaceChildren(...helpSpans(rows, ledger._meta.age_range_months).map((span) => {
      const goal = all.goals.find(({ id }) => id === span.goalId);
      span = { ...span, label: goal ? named(goal) : span.label };
      const parts = [];
      if (span.stepFrom !== null) {
        const until = span.canFrom !== null ? formatAge(span.canFrom - 1) : `${formatAge(span.to)}以降`;
        parts.push(`踏み台 ${span.stepMax}→${span.stepMin}cm：${formatAge(span.stepFrom)}〜${until}`);
      }
      if (span.canFrom !== null) parts.push(span.canFrom > span.from ? `${formatAge(span.canFrom)}から自分で` : '最初から自分で');
      if (span.stillHelpedAtEnd && span.stepFrom === null) parts.push(`${formatAge(span.to)}でも「${span.stillHelpedAtEnd}」`);
      if (span.notYetAtEnd) parts.push(`${formatAge(span.to)}でもまだ`);
      return item(`${span.label}：${parts.join('、')}`);
    }));
    // The next changes after this age: the first three, in age order.
    // Only the steps getting smaller and the goals becoming possible by themselves; a shelf or
    // hook height creeping up with the child is not a change worth a line.
    const coming = rows
      .filter((row) => row.months > child.months && (row.status === STATUS_CAN || row.stepCm !== null))
      .slice(0, 3)
      .map((row) => {
        const goal = all.goals.find(({ id }) => id === row.goalId);
        const name = goal ? named(goal) : row.label;
        const said = row.status === STATUS_CAN ? `${name}（${row.how}・助けを卒業）` : `${name}：${row.how}で足りる`;
        return item(`${formatAge(row.months)}：${who}${said}`);
      });
    adjustLists.next.replaceChildren(...coming);
    // What the step also brings into reach: the adults' side, kept below.
    adjustLists.adults.replaceChildren(...all.hazardsWithStep.map((hazard) => item(`踏み台${all.stepCm}cmがあると${hazard.label}（${Math.round(hazard.height)}cm）にも届く → ${hazard.putAbove}cmより上へ`)));

    // The scene being shown follows the age: the stool gets lower, and when it is no longer
    // needed the scene closes and the view goes back to the house (openHelp closes it).
    // The first screen opens no scene: the child moves about the whole house (KO, 2026-11-05).
    if (shownGoalId) openHelp(shownGoalId);

    const level = { [STATUS_CAN]: 'ok', [STATUS_HELP]: 'caution', [STATUS_NOT_YET]: 'plain' };
    return new Map(all.goals.map((goal) => [`goal-${goal.id}`, { level: level[goal.status], text: goal.how }]));
  }

  /** The words over the 3D view for one scene: the help, the goal, and where the hand gets to. */
  function captionFor(scene, months) {
    const age = formatAge(months);
    const figure = shownWithHelp ? scene.withHelp : scene.without;
    const gap = scene.gapCm > 0 ? `あと${scene.gapCm}cm` : '';
    if (scene.status === STATUS_CAN) {
      return { main: `${age}：${scene.label}`, sub: `${scene.how}。助けはいらない`, toggles: false };
    }
    if (scene.status === STATUS_NOT_YET) {
      return { main: `${age}：${scene.label} は、まだ`, sub: [scene.how, gap].filter(Boolean).join('・'), toggles: false };
    }
    const kind = scene.prop?.kind;
    const main = kind === HELP_STEP
      ? `${age}：踏み台 ${scene.prop.heightCm}cm があると → ${scene.label}`
      : `${age}：${scene.how} → ${scene.label}`;
    let sub;
    if (kind === HELP_STEP) {
      const where = shownWithHelp ? '踏み台の上なら' : '床からは';
      if (figure.forward) sub = shownWithHelp ? `${where}、肘の高さで使える` : `${where}、天板が肘より高い`;
      else if (scene.kind === 'climb') sub = shownWithHelp ? `${where}、登れる` : `${where}、${gap ? `${gap} ` : ''}登れない`;
      else sub = shownWithHelp ? `${where}、手が届く` : `${where}、${gap ? `${gap} ` : ''}届かない`;
    } else if (kind === HELP_LOWER) {
      sub = shownWithHelp ? 'この高さなら、床から手が届く' : `いまの高さには、${gap || 'まだ'}届かない`;
    } else {
      sub = shownWithHelp ? '縁の近くなら、手が届く' : '奥にあると、手が届かない';
    }
    return { main, sub, toggles: true };
  }

  /** Shows one goal in 3D with its help placed, and says what is being shown over the view. */
  function openHelp(goalId) {
    const goal = lastAll?.goals.find(({ id }) => id === goalId);
    if (!goal) return;
    shownGoalId = goalId;
    const scene = helpScene({ ledger, room: session.getRoom(), goal, body: lastAll.body, sizes: settings.help_scene });
    // No help is needed any more (the slider moved on): nothing to show, back to the house.
    if (scene.status === STATUS_CAN) { closeHelp(); return; }
    if (scene.status !== STATUS_HELP) shownWithHelp = true;
    view?.showHelp(scene, shownWithHelp);
    const words = captionFor(scene, lastAll.months);
    caption.main.textContent = words.main;
    caption.sub.textContent = words.sub;
    caption.sub.hidden = !words.sub;
    caption.actions.hidden = false;
    caption.with.hidden = !words.toggles;
    caption.without.hidden = !words.toggles;
    caption.with.setAttribute('aria-pressed', String(shownWithHelp));
    caption.without.setAttribute('aria-pressed', String(!shownWithHelp));
    for (const li of document.querySelectorAll('.adjust-list li[data-goal]')) li.setAttribute('aria-pressed', String(li.dataset.goal === goalId));
  }

  /** Back to the run: the figure follows the hundred children again. */
  function closeHelp() {
    shownGoalId = null;
    view?.clearHelp();
    caption.main.textContent = CAPTION_IDLE;
    caption.sub.hidden = true;
    caption.actions.hidden = true;
    for (const li of document.querySelectorAll('.adjust-list li[data-goal]')) li.setAttribute('aria-pressed', 'false');
  }
  caption.with.addEventListener('click', () => { shownWithHelp = true; if (shownGoalId) openHelp(shownGoalId); });
  caption.without.addEventListener('click', () => { shownWithHelp = false; if (shownGoalId) openHelp(shownGoalId); });
  caption.close.addEventListener('click', closeHelp);

  document.querySelector('#print-adjustments').addEventListener('click', () => {
    document.querySelector('#print-date').textContent = new Date().toLocaleDateString('ja-JP');
    window.print();
  });

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
      closeHelp();
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

  /** A share of the hundred (children, or runs of one child) with a thin bar. */
  function countCell(count) {
    const cell = element('td');
    cell.append(element('span', 'count', `${Math.round((count / total) * 100)}%`));
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
    const leftCell = countCell(row.left);
    const rightCell = countCell(row.right);
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
  const averages = ({ averages: { height, climb }, individual }) => (individual
    ? `身長 ${Math.round(height)}cm・登れる高さ ${Math.round(climb)}cm`
    : `平均の身長 ${Math.round(height)}cm・平均の登れる高さ ${Math.round(climb)}cm`);

  /** The conditions both results were run under, in one line. */
  function conditionLine(names, left, right, child) {
    const shared = child.individual
      ? `%はこの子の体（${sexWord[child.sex]}${measured(child.measurements)}）で${total}回試したうちの割合・各${minutes(settings.trial_seconds)}。行動だけが毎回違う`
      : `%は${total}人（${sexWord[child.sex]}）のうちの割合・各${minutes(settings.trial_seconds)}`;
    if (mode === MODE_ROOM) return `${shared}・${formatAge(child.months)}（${averages(right)}）`;
    return `${shared}｜${names[0]}：${averages(left)}｜${names[1]}：${averages(right)}`;
  }

  /** What was typed for 「うちの子」, as it is shown in the conditions line. */
  function measured({ heightCm, climbCm }) {
    const parts = [];
    if (heightCm !== null) parts.push(`身長${heightCm}cm`);
    if (climbCm !== null) parts.push(`登れる高さ${climbCm}cm`);
    return parts.length ? `・${parts.join('・')}` : '';
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
    // By months, the left column is the youngest age; for 「うちの子」 it is the age the child was measured at.
    const baseMonths = child.measuredMonths ?? youngestMonths;
    const right = judgeRoom({ ledger, settings, room, ...child });
    const left = mode === MODE_ROOM
      ? judgeRoom({ ledger, settings, room: beforeRoom, ...child })
      : judgeRoom({ ledger, settings, room, months: baseMonths, sex: child.sex, individual: child.individual });
    const names = mode === MODE_ROOM ? ['動かす前', '動かした後'] : [formatAge(baseMonths), formatAge(child.months)];
    const leftCondition = mode === MODE_ROOM ? { ...child, room: beforeRoom } : { months: baseMonths, sex: child.sex, individual: child.individual, room };
    judgedRoom = room;
    const span = { before: settings.scene_before_seconds, after: settings.scene_after_seconds, trialSeconds: settings.trial_seconds };
    plays = {
      left: buildPlaylists({ verdict: left, condition: leftCondition, ...span }),
      right: buildPlaylists({ verdict: right, condition: { ...child, room }, ...span }),
    };

    const sections = compareResults(left, right);
    const sameCondition = mode === MODE_MONTHS && child.months === baseMonths;
    const said = sameCondition
      ? { tone: TONE_SAME, text: child.individual
        ? 'スライダーで月齢を上げると、この子がこの部屋で何に届くようになるかが分かります。'
        : 'スライダーで月齢を上げると、この部屋で何に届くようになるかが分かります。' }
      : conclusion(sections, { leftName: names[0], rightName: names[1], kind: mode, unit: right.unit, noiseBand: settings.noise_band });
    conclusionBox.dataset.tone = said.tone;
    conclusionBox.replaceChildren(
      element('p', 'summary-line', summaryLine(sections, { name: names[1], unit: right.unit })),
      element('p', 'conclusion-text', said.text),
    );
    [leftHead.textContent, rightHead.textContent] = names;
    table.classList.toggle('same-condition', sameCondition);
    showTable(sections);
    myChildNote.textContent = child.measurements?.notes?.join('。') ?? '';
    showPosition(child);
    conditions.textContent = `使った条件：${conditionLine(names, left, right, child)}`;

    // How each place was reached, in words, for both conditions.
    const leftWords = new Map(places(left).map((row) => [row.id, reachWords(row).text]));
    fillList(reachList, places(right).map((row) => [
      row.label, `${names[0]}：${leftWords.get(row.id) ?? '届かない'}／${names[1]}：${reachWords(row).text}`,
    ]));
    reasons.replaceChildren(...right.reasons.map((text) => element('li', '', text)));

    lastTags = new Map([...places(right).map((row) => [row.id, reachWords(row)]), ...showAdjustments(child)]);
    countermeasure.textContent = '';
    retry.disabled = true;
    retry.dataset.pending = 'false';
    document.querySelector('#results').classList.remove('stale');
    view?.setTags(lastTags);
    // On its own, あーちゃん just walks about the house: whole runs, one after another. The scenes
    // of touching dangerous things are no longer played (KO, 2026-11-05).
    const height = lastAll?.body.height;
    autoplay.useAuto(Array.from({ length: WANDER_RUNS }, (_, i) => ({
      ...child, seed: i + 1, room: session.getRoom(), start: 0, end: settings.trial_seconds, moment: null, thing: null, heading: 'あーちゃん', height,
    })));
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
  // 「うちの子に合わせる」: opening, closing, the sex and each measurement run the hundred again.
  myChild.addEventListener('toggle', () => judge());
  for (const input of myChild.querySelectorAll('input')) {
    input.addEventListener('change', () => judge());
  }
  // A whole run by number, of the right-hand condition: from the start to the end of the trial.
  seedInput.addEventListener('change', () => {
    const seed = Number.parseInt(seedInput.value, 10) || 1;
    closeHelp();
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
      view.setGoalRoom(adjustRoom);
      if (shownGoalId) openHelp(shownGoalId);
    },
    closeHelp,
  };
}
