import { getBodyValues, getTiptoeReference } from './body.js';

const MONTHS_PER_YEAR = 12;
const DISPLAY_DECIMALS = 1;
const LEDGER_URL = new URL('../data/values_ledger.json', import.meta.url);

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
  const reference = getTiptoeReference(ledger, months);
  const line = element(
    'p',
    'reference',
    `参考：${reference.label} ${reference.ageYears}歳 ${reference.value} cm（計算には使わない） `,
  );
  line.append(badge(ledger, reference.category));
  return line;
}

function render(ledger) {
  const months = Number(monthsInput.value);
  const sex = new FormData(controls).get('sex');
  const body = getBodyValues(ledger, { months, sex });
  const reachItem = ledgerItem(ledger, 'reach_height_standing');
  const climbItem = ledgerItem(ledger, 'climb_height');

  monthsLabel.textContent = formatAge(months);

  const reachCard = card(ledger, reachItem.label, body.reach, reachItem.unit);
  reachCard.append(tiptoeReference(ledger, months));

  valuesList.replaceChildren(
    card(ledger, '身長（中央値）', body.height, ledgerItem(ledger, 'height_percentiles').unit),
    reachCard,
    card(ledger, climbItem.label, body.climb, climbItem.unit),
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

async function start() {
  const response = await fetch(LEDGER_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const ledger = await response.json();

  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  monthsInput.min = minMonths;
  monthsInput.max = maxMonths;
  monthsInput.value = minMonths;

  renderLegend(ledger);
  controls.addEventListener('input', () => render(ledger));
  render(ledger);
}

start().catch((error) => {
  errorBox.hidden = false;
  errorBox.textContent = `データを読み込めませんでした（${error.message}）`;
});
