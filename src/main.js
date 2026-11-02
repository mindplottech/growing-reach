import { getBodyValues, getTiptoeReference } from './body.js';
import { selectLayout } from './room.js';
import { mountRoomView } from './roomView.js';
import { mountTrialsView } from './trialsView.js';

const MONTHS_PER_YEAR = 12;
const DISPLAY_DECIMALS = 1;
const LEDGER_URL = new URL('../data/values_ledger.json', import.meta.url);
const ROOM_URL = new URL('../data/room_layout.json', import.meta.url);
const SETTINGS_URL = new URL('../data/sim_settings.json', import.meta.url);

const monthsInput = document.querySelector('#months');
const monthsLabel = document.querySelector('#months-label');
const controls = document.querySelector('#controls');
const valuesList = document.querySelector('#values');
const legendList = document.querySelector('#legend');
const errorBox = document.querySelector('#error');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(ledger, category) {
  return element('span', `badge cat-${category}`, ledger._meta.categories[category]);
}

function formatAge(months) {
  const years = Math.floor(months / MONTHS_PER_YEAR);
  return `${years}歳${months % MONTHS_PER_YEAR}か月`;
}

function ledgerItem(ledger, id) {
  return ledger.items.find((entry) => entry.id === id);
}

function card(ledger, label, result, unit) {
  const li = element('li', `card cat-${result.category}`);
  const value = element('p', 'card-value', result.value.toFixed(DISPLAY_DECIMALS));
  value.append(' ', element('small', '', unit));
  li.append(element('p', 'card-label', label), value, badge(ledger, result.category));
  return li;
}

function tiptoeReference(ledger, months) {
  const { ageYears, height, value, category } = getTiptoeReference(ledger, months);
  const line = element(
    'p',
    'reference',
    `参考（計算には使わない）：図鑑 ${ageYears}歳：身長${height}cmの子で${value}cm `,
  );
  line.append(badge(ledger, category));
  return line;
}

function reachSd(ledger, reach, unit) {
  const line = element('p', 'reference', `個人差 SD ${reach.sd.toFixed(DISPLAY_DECIMALS)} ${unit} `);
  line.append(badge(ledger, reach.sdCategory));
  return line;
}

/** The range is shown because the gain differs per child and this view has no single child. */
function tiptoeCard(ledger, tiptoe, unit, months) {
  const { range: [minGain, maxGain] } = ledgerItem(ledger, 'tiptoe_gain');
  const li = element('li', `card cat-${tiptoe.category}`);
  const range = `${tiptoe.min.toFixed(DISPLAY_DECIMALS)}〜${tiptoe.max.toFixed(DISPLAY_DECIMALS)}`;
  const value = element('p', 'card-value', range);
  value.append(' ', element('small', '', unit));
  li.append(
    element('p', 'card-label', `背伸びで届く高さ（立って届く高さ＋${minGain}〜${maxGain}${unit}）`),
    value,
    badge(ledger, tiptoe.category),
    tiptoeReference(ledger, months),
  );
  return li;
}

/** Says where the two parts of the climb series come from; the months are the ledger's. */
function climbOrigin(climbItem) {
  const lastFormulaMonth = climbItem.valid_age_months[1];
  const [[hatogoMonth]] = climbItem.extension_beyond_45.series;
  return element(
    'p',
    'reference',
    `${lastFormulaMonth}か月まで：東京都の実測の式／${hatogoMonth}か月：4〜6歳の実験結果に合わせた値`,
  );
}

function render(ledger) {
  const months = Number(monthsInput.value);
  const sex = new FormData(controls).get('sex');
  const body = getBodyValues(ledger, { months, sex });
  const reachItem = ledgerItem(ledger, 'reach_height_standing');
  const climbItem = ledgerItem(ledger, 'climb_height');

  monthsLabel.textContent = formatAge(months);

  const reachCard = card(ledger, reachItem.label, body.reach, reachItem.unit);
  reachCard.append(reachSd(ledger, body.reach, reachItem.unit));
  const climbCard = card(ledger, climbItem.label, body.climb, climbItem.unit);
  climbCard.append(climbOrigin(climbItem));

  valuesList.replaceChildren(
    card(ledger, '身長（中央値）', body.height, ledgerItem(ledger, 'height_percentiles').unit),
    reachCard,
    tiptoeCard(ledger, body.tiptoeReach, reachItem.unit, months),
    climbCard,
  );
}

function renderLegend(ledger) {
  legendList.replaceChildren(
    ...Object.keys(ledger._meta.categories).map((category) => {
      const li = element('li');
      li.append(badge(ledger, category));
      return li;
    }),
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function start() {
  const [ledger, roomFile, settings] = await Promise.all([
    fetchJson(LEDGER_URL),
    fetchJson(ROOM_URL),
    fetchJson(SETTINGS_URL),
  ]);

  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  monthsInput.min = minMonths;
  monthsInput.max = maxMonths;
  monthsInput.value = minMonths;

  const layoutSelect = document.querySelector('#layout');
  layoutSelect.replaceChildren(
    ...roomFile.layouts.map(({ id, name }) => {
      const option = element('option', '', name);
      option.value = id;
      return option;
    }),
  );
  let room = selectLayout(roomFile, layoutSelect.value);

  renderLegend(ledger);
  render(ledger);
  const roomView = mountRoomView(ledger, room, settings, () => ({
    months: Number(monthsInput.value),
    sex: new FormData(controls).get('sex'),
  }));
  mountTrialsView({
    ledger,
    settings,
    getRoom: () => room,
    getCondition: () => ({
      months: Number(monthsInput.value),
      sex: new FormData(controls).get('sex'),
      boxes: roomView.getBoxes(),
    }),
    highlight: roomView.highlight,
    onConditionChange: roomView.onConditionChange,
  });
  // The 3D view is display only: if it cannot load, the map and all calculations still work.
  const stage = document.querySelector('#stage');
  const modeButtons = document.querySelector('#mode-buttons');
  import('./view3d.js')
    .then(({ mountView3d }) => {
      stage.classList.add('with-3d');
      modeButtons.hidden = false;
      document.querySelector('#state-legend').hidden = false;
      document.querySelector('#box-message').textContent = '「配置」で床をタップすると段ボール箱を置け、箱をなぞると動かせます';
      roomView.useMapOnly();
      mountView3d({
        container: stage,
        ledger,
        settings,
        roomView,
        modeButtons: {
          view: document.querySelector('#mode-view'),
          place: document.querySelector('#mode-place'),
        },
        slider: monthsInput,
      });
    })
    .catch((error) => {
      document.querySelector('#box-message').textContent = `3D表示を読み込めませんでした（${error.message}）。図をタップすると段ボール箱を置けます`;
    });

  layoutSelect.addEventListener('change', () => {
    room = selectLayout(roomFile, layoutSelect.value);
    roomView.setRoom(room);
  });
  controls.addEventListener('input', () => {
    render(ledger);
    roomView.restart();
  });
}

start().catch((error) => {
  errorBox.hidden = false;
  errorBox.textContent = `データを読み込めませんでした（${error.message}）`;
});
