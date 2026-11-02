import { LIVING_ROOM } from './room.js';
import { createSimulation } from './simulation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_SECONDS = 0.05;
const MS_PER_SECOND = 1000;
const MAX_FRAME_SECONDS = 0.25;
const VISITS_SHOWN = 6;
const DISPLAY_DECIMALS = 1;
const CHILD_RADIUS = 9;

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
      svgElement('rect', { x: landmark.x, y: landmark.y, width: landmark.w, height: landmark.d, class: 'landmark' }),
    ),
    ...simulation.landmarks.map((landmark) =>
      svgElement('text', { x: landmark.x + landmark.w / 2, y: landmark.y - 3, class: 'landmark-label' }, landmark.mapLabel ?? landmark.label),
    ),
    child,
  );
  return child;
}

function describeBody(body) {
  const cm = (result) => result.value.toFixed(DISPLAY_DECIMALS);
  return `この子：身長 ${cm(body.height)} cm／届く ${cm(body.reach)} cm／登れる ${cm(body.climb)} cm／歩く速さ ${body.walkSpeed.value.toFixed(2)} m/s`;
}

function visitItem(visit) {
  const li = document.createElement('li');
  const climb = visit.canClimb ? '登れる' : '登れない';
  const reach = visit.canReach ? '届く' : '届かない';
  li.textContent = `${visit.time.toFixed(0)}秒 ${visit.label}（${visit.height.toFixed(DISPLAY_DECIMALS)} cm）：${climb}・${reach}`;
  return li;
}

/** Runs the room view. `getChild` returns the current { months, sex }. */
export function mountRoomView(ledger, getChild) {
  const svg = document.querySelector('#room');
  const seedInput = document.querySelector('#seed');
  const pauseButton = document.querySelector('#pause');
  const childLine = document.querySelector('#child-values');
  const visitList = document.querySelector('#visits');

  let simulation;
  let childMark;
  let shownVisits = 0;
  let paused = false;
  let carry = 0;
  let lastFrame;

  function restart() {
    simulation = createSimulation({
      ledger,
      ...getChild(),
      seed: Number.parseInt(seedInput.value, 10) || 0,
      room: LIVING_ROOM,
    });
    childMark = drawRoom(svg, simulation, LIVING_ROOM);
    childLine.textContent = describeBody(simulation.body);
    shownVisits = 0;
    carry = 0;
    visitList.replaceChildren();
    paint();
  }

  function paint() {
    childMark.setAttribute('cx', simulation.position.x);
    childMark.setAttribute('cy', simulation.position.y);
    if (simulation.visits.length !== shownVisits) {
      shownVisits = simulation.visits.length;
      visitList.replaceChildren(
        ...simulation.visits.slice(-VISITS_SHOWN).reverse().map(visitItem),
      );
    }
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
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? '再生' : '一時停止';
  });

  restart();
  requestAnimationFrame(frame);
  return { restart };
}
