import { placeBox } from './boxes.js';
import { isBetterReach, REACH_NONE, REACH_STANDING, REACH_TIPTOE } from './scaffold.js';
import { createSimulation } from './simulation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_SECONDS = 0.05;
const MS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.25;
const VISITS_SHOWN = 6;
const DISPLAY_DECIMALS = 1;
const CHILD_RADIUS = 9;

const REACH_TEXT = {
  [REACH_STANDING]: '立って届く',
  [REACH_TIPTOE]: '背伸びなら届く',
};
const reachText = (level) => REACH_TEXT[level] ?? '届かない';
const cm = (value) => `${value.toFixed(DISPLAY_DECIMALS)} cm`;

function svgElement(tag, attributes, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawRoom(svg, simulation, room) {
  const child = svgElement('circle', { r: CHILD_RADIUS, class: 'child' });
  svg.setAttribute('viewBox', `0 0 ${room.width} ${room.depth}`);
  svg.replaceChildren(
    svgElement('rect', { width: room.width, height: room.depth, class: 'floor' }),
    ...simulation.landmarks.map((landmark) =>
      svgElement('rect', { x: landmark.x, y: landmark.y, width: landmark.w, height: landmark.d, class: landmark.temporary ? 'temporary' : 'landmark' }),
    ),
    ...simulation.landmarks.map((landmark) =>
      svgElement('text', { x: landmark.x + landmark.w / 2, y: landmark.y - 3, class: 'landmark-label' }, landmark.mapLabel ?? landmark.label),
    ),
    child,
  );
  return child;
}

function describeBody({ height, reach, tiptoeReach, climb, walkSpeed }) {
  return `この子：身長 ${cm(height.value)}／立って届く ${cm(reach.value)}／背伸びで届く ${cm(tiptoeReach.value)}／登れる ${cm(climb.value)}／歩く速さ ${walkSpeed.value.toFixed(2)} m/s`;
}

/** Footholds worth reporting: those that improve on what the child reaches from the floor. */
function newReaches(visit) {
  return (visit.scaffold?.objects ?? []).filter(
    (object) => object.level !== REACH_NONE && isBetterReach(object.level, object.floorLevel),
  );
}

function scaffoldText(visit, object) {
  return `${visit.scaffold.label}（${cm(visit.scaffold.height)}）を足場に、${object.label}（${cm(object.height)}）に${reachText(object.level)}（床では${reachText(object.floorLevel)}）`;
}

function visitItem(visit) {
  const li = document.createElement('li');
  const climb = visit.canClimb ? '登れる' : '登れない';
  li.textContent = `${visit.time.toFixed(0)}秒 ${visit.label}（${cm(visit.height)}）：${climb}・${reachText(visit.reachLevel)}`;
  return li;
}

function textItem(text) {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

function assumptionLine(ledger, text, category) {
  const line = document.createElement('p');
  line.textContent = `${text} `;
  const badge = document.createElement('span');
  badge.className = `badge cat-${category}`;
  badge.textContent = ledger._meta.categories[category];
  line.append(badge);
  return line;
}

function renderAssumptions(container, ledger, room) {
  const { unit, notice, category } = room._meta;
  const { cardboard_box: box } = room;
  const horizontal = ledger.items.find((entry) => entry.id === 'reach_horizontal_on_surface');
  container.replaceChildren(
    assumptionLine(ledger, notice, category),
    assumptionLine(ledger, `${horizontal.label}：${horizontal.formula}（${horizontal.unit}）`, horizontal.category),
    assumptionLine(ledger, `${box.label}の高さ：${box.height}${unit}`, box.category),
  );
}

/** Runs the room view. `getChild` returns the current { months, sex }. */
export function mountRoomView(ledger, room, settings, getChild) {
  const svg = document.querySelector('#room');
  const seedInput = document.querySelector('#seed');
  const pauseButton = document.querySelector('#pause');
  const childLine = document.querySelector('#child-values');
  const visitList = document.querySelector('#visits');
  const scaffoldList = document.querySelector('#scaffold-reaches');
  const boxMessage = document.querySelector('#box-message');
  const clearButton = document.querySelector('#clear-boxes');

  let simulation;
  let boxes = [];
  let childMark;
  let shownVisits = 0;
  let paused = false;
  let carry = 0;
  let lastFrame;

  function restart() {
    simulation = createSimulation({
      ledger,
      settings,
      ...getChild(),
      seed: Number.parseInt(seedInput.value, 10) || 0,
      room,
      boxes,
    });
    childMark = drawRoom(svg, simulation, room);
    childLine.textContent = describeBody(simulation.body);
    shownVisits = 0;
    carry = 0;
    visitList.replaceChildren();
    scaffoldList.replaceChildren();
    paint();
  }

  function paint() {
    childMark.setAttribute('cx', simulation.position.x);
    childMark.setAttribute('cy', simulation.position.y);
    if (simulation.visits.length === shownVisits) return;
    shownVisits = simulation.visits.length;
    visitList.replaceChildren(
      ...simulation.visits.slice(-VISITS_SHOWN).reverse().map(visitItem),
    );
    const found = simulation.visits.flatMap((visit) =>
      newReaches(visit).map((object) => scaffoldText(visit, object)),
    );
    scaffoldList.replaceChildren(...[...new Set(found)].map(textItem));
  }

  // A fixed step keeps the run identical for a seed whatever the frame rate is.
  function frame(now) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    if (!paused) {
      carry += Math.min(elapsed, MAX_FRAME_SECONDS);
      while (carry >= STEP_SECONDS) {
        simulation.step(STEP_SECONDS);
        carry -= STEP_SECONDS;
      }
      paint();
    }
    requestAnimationFrame(frame);
  }

  seedInput.addEventListener('input', restart);
  svg.addEventListener('click', (event) => {
    const area = svg.getBoundingClientRect();
    const box = placeBox(
      room,
      simulation.landmarks,
      {
        x: ((event.clientX - area.left) / area.width) * room.width,
        y: ((event.clientY - area.top) / area.height) * room.depth,
      },
      boxes.length + 1,
    );
    if (!box) {
      boxMessage.textContent = '家具や箱と重なる場所には置けません';
      return;
    }
    boxes = [...boxes, box];
    boxMessage.textContent = `${box.label}を置きました（最初からやり直します）`;
    restart();
  });
  clearButton.addEventListener('click', () => {
    boxes = [];
    boxMessage.textContent = '図をタップすると段ボール箱を置けます';
    restart();
  });
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? '再生' : '一時停止';
  });

  renderAssumptions(document.querySelector('#layout-assumptions'), ledger, room);
  restart();
  requestAnimationFrame(frame);
  return { restart };
}
