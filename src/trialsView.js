import { EVENT, EVENT_LABELS } from './events.js';
import { EVENT as KINDS } from './events.js';
import { compareTrials, findCountermeasure, moveAwayFromLock, runTrials } from './trials.js';

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(cellTag, cells) {
  const tr = element('tr');
  tr.append(...cells.map((cell) => element(cellTag, cell)));
  return tr;
}

function table(headers, rows) {
  const node = element('table');
  node.append(row('th', headers), ...rows.map((cells) => row('td', cells)));
  return node;
}

function totalsTable(result) {
  return table(
    ['出来事', '1回以上起きた子', '回数（補足）'],
    Object.values(EVENT).map((kind) => [
      EVENT_LABELS[kind],
      `${result.perSeed.length}人中${result.children[kind]}人`,
      String(result.counts[kind]),
    ]),
  );
}

function footholdsTable(result) {
  const lockCount = new Map(result.lockFootholds.map(({ id, count }) => [id, count]));
  return table(
    ['順位', '足場', '足場になった回数', 'うち窓の錠に届いた回数'],
    result.footholds.map(({ id, label, count }, i) => [
      String(i + 1), label, String(count), String(lockCount.get(id) ?? 0),
    ]),
  );
}

const signed = (value) => (value > 0 ? `+${value}` : String(value));

function comparisonTable(before, after) {
  return table(
    ['出来事', '起きた子（前→後）', '回数（前→後）', '回数の差'],
    compareTrials(before, after).map(({ kind, childrenBefore, childrenAfter, before: a, after: b, diff }) => [
      EVENT_LABELS[kind],
      `${childrenBefore}人→${childrenAfter}人`,
      `${a}回→${b}回`,
      signed(diff),
    ]),
  );
}

/** Words for one search. Every number comes from a rerun; nothing here estimates. */
function searchLine(search, baselineChildren, limit) {
  const { label, baselineLock, found, last } = search;
  if (baselineLock === 0) return `窓の錠に届いた子はもともと0人です`;
  if (found !== null) {
    return `${label}を${found}cm離すと、窓の錠に届く子 ${baselineChildren}人→0人（回数 ${baselineLock}回→0回）`;
  }
  if (!last) return `${label}は動かせる場所がありません（部屋の外に出るか、他の物と重なります）`;
  return `${label}を${last.distance}cmまで離しても（探す上限${limit}cm）、窓の錠に届く子 ${baselineChildren}人→${last.children}人で、0人になりません（回数 ${baselineLock}回→${last.lock}回、うち床から${last.lockFromFloor}回）`;
}

/** The same result in a few words, for the 3D view. */
function overlayLine(search, baselineChildren) {
  const { label, baselineLock, found, last } = search;
  if (baselineLock === 0 || !last) return `窓の錠に届いた子 ${baselineChildren}人`;
  if (found !== null) return `${label}を${found}cm離すと\n窓の錠に届く子 ${baselineChildren}人→0人`;
  return `${label}を${last.distance}cm離しても\n窓の錠に届く子 ${baselineChildren}人→${last.children}人`;
}

/** Runs the batch views. `getCondition` returns the current { months, sex, boxes }. */
export function mountTrialsView({ ledger, settings, getRoom, getCondition, highlight, onConditionChange }) {
  const results = document.querySelector('#trial-results');
  const overlay = document.querySelector('#result-overlay');
  const showOverlay = (text) => {
    overlay.hidden = text === null;
    overlay.innerText = text ?? '';
  };
  const monthsInput = document.querySelector('#compare-months');
  const objectSelect = document.querySelector('#move-object');
  const distanceInput = document.querySelector('#move-cm');
  const [minMonths, maxMonths] = ledger._meta.age_range_months;

  monthsInput.min = minMonths;
  monthsInput.max = maxMonths;
  monthsInput.value = maxMonths;
  distanceInput.step = settings.countermeasure_step_cm;
  distanceInput.value = settings.countermeasure_step_cm;

  let optionsRoom = null;
  function refreshObjects() {
    const room = getRoom();
    if (room === optionsRoom) return;
    optionsRoom = room;
    objectSelect.replaceChildren(
      ...room.landmarks.filter(({ scaffold }) => scaffold).map(({ id, label }) => {
        const option = element('option', label);
        option.value = id;
        return option;
      }),
    );
  }
  refreshObjects();

  function run() {
    const room = getRoom();
    const { months, sex, boxes } = getCondition();
    const base = { ledger, settings, room, boxes, months, sex };
    const before = runTrials(base);
    const comparedMonths = Number(monthsInput.value);
    const objectId = objectSelect.value;
    const distance = Number(distanceInput.value);
    const moved = moveAwayFromLock({ room, boxes }, objectId, distance);
    const objectLabel = objectSelect.selectedOptions[0].textContent;

    const moveSection = [element('h3', `① ${objectLabel}を窓の錠から${distance}cm離す前と後（シード同じ）`)];
    moveSection.push(
      moved
        ? comparisonTable(before, runTrials({ ...base, ...moved }))
        : element('p', 'その距離には動かせません（部屋の外に出るか、他の物と重なります）'),
    );

    results.replaceChildren(
      element('h3', `出来事の回数（${months}か月、${settings.trial_count}人）`),
      totalsTable(before),
      element('p', `窓の錠に届いた回数のうち、床から：${before.lockFromFloor}回`),
      element('h3', '足場になった回数の順位'),
      footholdsTable(before),
      ...moveSection,
      element('h3', `② ${months}か月と${comparedMonths}か月の比較（シード同じ）`),
      comparisonTable(before, runTrials({ ...base, months: comparedMonths })),
    );
    highlight(before.lockFootholds[0]?.id ?? before.footholds[0]?.id ?? null);
    showOverlay(`窓の錠に届いた子 ${before.perSeed.length}人中${before.children[KINDS.REACHED_LOCK]}人`);
    return { base, before };
  }

  const countermeasure = document.querySelector('#countermeasure');

  function find() {
    const room = getRoom();
    const { months, sex, boxes } = getCondition();
    const limit = settings.countermeasure_limit_cm;
    const { mostUsed, target, baselineChildren } = findCountermeasure({ ledger, settings, room, boxes, months, sex });
    highlight(target?.id ?? null);
    const displayed = target && { ...target, label: room.landmarks.find(({ id }) => id === target.id)?.groupLabel ?? target.label };
    showOverlay(displayed ? overlayLine(displayed, baselineChildren) : null);
    if (!target) {
      countermeasure.replaceChildren(element('p', '足場になった物はありませんでした'));
      return;
    }
    countermeasure.replaceChildren(
      element('p', searchLine(
        { ...target, label: room.landmarks.find(({ id }) => id === target.id)?.groupLabel ?? target.label },
        baselineChildren,
        limit,
      )),
      element('p', `全体の足場の1位：${mostUsed.label}（${mostUsed.count}回）`),
    );
  }

  document.querySelector('#run-trials').addEventListener('click', run);
  document.querySelector('#find-countermeasure').addEventListener('click', find);
  onConditionChange(() => {
    refreshObjects();
    highlight(null);
    showOverlay(null);
    countermeasure.replaceChildren();
  });
  return { run };
}
