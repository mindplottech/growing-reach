import { describeEvent, EVENT, formatClock } from '../sim/events.js';

// The moments the 3D view marks: the first reach of the lock or of each dangerous thing, and falls.
const MARKED = new Set([EVENT.REACHED_LOCK, EVENT.STOOD_AT_WINDOW, EVENT.TOUCHED_HAZARD, EVENT.FELL]);

/** What a marked moment is about, so the same thing is marked only the first time. */
function momentKey(event) {
  if (event.kind === EVENT.FELL) return null;
  return `${event.kind}:${event.hazardId ?? event.targetId ?? event.footholdId ?? ''}`;
}

/**
 * The whole record of the child on screen, in fixed sentences with the time since the start,
 * kept under "くわしく見る". `onMoment` hears each moment worth marking.
 */
export function mountEventLog({ list, session, onMoment = () => {} }) {
  let simulation = null;
  let seen = -1;
  let shownKeys = new Set();

  function line(event) {
    const item = document.createElement('li');
    const time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = formatClock(event.time);
    item.append(time, describeEvent(event));
    return item;
  }

  function frame() {
    const now = session.getSimulation();
    if (now !== simulation) {
      simulation = now;
      seen = 0;
      shownKeys = new Set();
      list.replaceChildren();
    }
    if (now.events.length !== seen) {
      for (const event of now.events.slice(seen)) {
        list.append(line(event));
        if (!MARKED.has(event.kind)) continue;
        const key = momentKey(event);
        if (key !== null && shownKeys.has(key)) continue;
        if (key !== null) shownKeys.add(key);
        onMoment(event);
      }
      seen = now.events.length;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
