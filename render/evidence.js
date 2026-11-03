import { provisionalRows } from '../sim/params.js';
import { DISPLAY_ONLY_PARTS, displayOnlyHeights } from './sceneModel.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SKIPPED = new Set(['id', 'label', 'unit', 'category', 'source', 'table_page', 'note', 'formula']);

function withLinks(text) {
  const fragment = document.createDocumentFragment();
  const url = /https?:\S+/.exec(text)?.[0];
  if (!url) {
    fragment.append(text);
    return fragment;
  }
  const [before, after] = text.split(url);
  const link = element('a', '', url);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  fragment.append(before, link, after);
  return fragment;
}

function row(term, value) {
  const fragment = document.createDocumentFragment();
  if (value === undefined || value === null || value === '') return fragment;
  fragment.append(element('dt', '', term), element('dd', '', typeof value === 'string' ? value : JSON.stringify(value)));
  return fragment;
}

/** One ledger item as it is in the file; nothing is summarised away. */
function itemCard(ledger, item) {
  const card = element('article', 'evidence-item');
  const title = element('h3', '', item.label);
  title.append(element('span', 'evidence-unit', item.unit ? ` （${item.unit}）` : ''));
  const facts = element('dl');
  facts.append(
    row('区分', ledger._meta.categories[item.category] ?? item.category),
    row('式', item.formula),
    row('出典', item.source ? ledger._meta.sources[item.source] ?? item.source : 'なし'),
    row('ページ・表', item.table_page),
    row('メモ', item.note),
  );
  const rest = Object.fromEntries(Object.entries(item).filter(([key]) => !SKIPPED.has(key)));
  const data = element('details');
  data.append(element('summary', '', 'データ'), element('pre', '', JSON.stringify(rest, null, 2)));
  card.append(title, facts, data);
  return card;
}

/** One line on the parts drawn at ledger heights that the calculation does not use. */
function displayOnlyNote(ledger) {
  const heights = displayOnlyHeights(ledger);
  const parts = DISPLAY_ONLY_PARTS.map(({ key, label, heightOf }) => `${label}（${heights[key].toFixed(1)}cm、${heightOf.join('.')}）`);
  return `${parts.join('・')}は、台帳の値で形を描くだけで、登る・届くの計算には使っていません。`;
}

/** The ledger, the layout and the settings exactly as loaded, for the evidence dialog. */
export function renderEvidence(container, { ledger, roomFile }) {
  const meta = ledger._meta;
  const intro = element('section', 'evidence-section');
  intro.append(
    element('p', '', meta.notice),
    element('p', 'evidence-note', `台帳 version ${meta.version}（${meta.created} 作成）`),
  );

  const categories = element('section', 'evidence-section');
  const list = element('dl');
  for (const [key, label] of Object.entries(meta.categories)) list.append(row(key, label));
  categories.append(element('h2', '', '値の区分'), list);

  const decisions = element('section', 'evidence-section');
  const decisionList = element('ul');
  for (const { date, item, decision, reason } of meta.decisions) {
    decisionList.append(element('li', '', `${date}　${item}：${decision}（理由：${reason}）`));
  }
  decisions.append(element('h2', '', '採用の決定'), decisionList);

  const items = element('section', 'evidence-section');
  items.append(element('h2', '', '台帳の項目'), ...ledger.items.map((item) => itemCard(ledger, item)));

  const assumptions = element('section', 'evidence-section');
  const rows = element('div');
  for (const { key, label, value, unit, reason, category } of provisionalRows()) {
    const card = element('article', 'evidence-item');
    const title = element('h3', '', label);
    title.append(element('span', 'evidence-unit', ` （${key}）`));
    const facts = element('dl');
    facts.append(
      row('値', typeof value === 'object' ? JSON.stringify(value) : `${value}${unit ? ` ${unit}` : ''}`),
      row('区分', ledger._meta.categories[category]),
      row('出典', 'なし（設計者が置いた値）'),
      row('決め方', reason),
    );
    card.append(title, facts);
    rows.append(card);
  }
  assumptions.append(
    element('h2', '', '設計者が置いた仮値（sim/params.js）'),
    rows,
    element('h2', '', '部屋の配置（data/room_layout.json）'),
    element('p', '', roomFile._meta.notice),
    element('pre', '', JSON.stringify(roomFile, null, 2)),
    element('h2', '', '3D表示だけに描く部分'),
    element('p', '', displayOnlyNote(ledger)),
  );

  const sources = element('section', 'evidence-section');
  const sourceList = element('ul', 'evidence-sources');
  for (const [key, text] of Object.entries(meta.sources)) {
    const li = element('li');
    li.append(element('strong', '', `${key}　`), withLinks(text));
    sourceList.append(li);
  }
  sources.append(element('h2', '', '出典'), sourceList);

  container.replaceChildren(intro, categories, decisions, items, assumptions, sources);
}
