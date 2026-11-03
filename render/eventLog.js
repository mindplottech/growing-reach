import { describeEvent, EVENT, formatClock } from '../sim/events.js';

// How many of the latest events the canvas shows.
const SHOWN = 4;
const MS_PER_SECOND = 1000;
// The moments shown large: the first reach of the lock or of each dangerous thing, and falls.
const FLASHED = new Set([EVENT.REACHED_LOCK, EVENT.STOOD_AT_WINDOW, EVENT.TOUCHED_HAZARD, EVENT.FELL]);

/** What a flashed moment is about, so the same thing is shown large only the first time. */
function flashKey(event) {
  if (event.kind === EVENT.FELL) return null;
  return `${event.kind}:${event.hazardId ?? event.targetId ?? event.footholdId ?? ''}`;
}

/**
 * The latest events of the child on screen, in fixed sentences with the time since the start,
 * and the same sentence shown large for a moment when something worth watching happens.
 * `onMoment` hears each flashed event, for the 3D view to light the thing up.
 */
export function mountEventLog({ list, flash, session, flashSeconds, onMoment = () => {} }) {
  let simulation = null;
  let seen = -1;
  let shownKeys = new Set();
  let flashTimer = null;

  function showLarge(event) {
    flash.textContent = describeEvent(event);
    flash.hidden = false;
    // Restart the entrance animation for each new moment.
    flash.classList.remove('event-flash-in');
    void flash.offsetWidth;
    flash.classList.add('event-flash-in');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash.hidden = true;
    }, flashSeconds * MS_PER_SECOND);
    onMoment(event);
  }

  function frame() {
    const now = session.getSimulation();
    const fresh = now !== simulation;
    if (fresh) {
      simulation = now;
      seen = 0;
      shownKeys = new Set();
      flash.hidden = true;
    }
    if (fresh || now.events.length !== seen) {
      for (const event of now.events.slice(seen)) {
        if (!FLASHED.has(event.kind)) continue;
        const key = flashKey(event);
        if (key !== null && shownKeys.has(key)) continue;
        if (key !== null) shownKeys.add(key);
        showLarge(event);
      }
      seen = now.events.length;
      const latest = now.events.slice(-SHOWN);
      list.replaceChildren(...latest.map((event) => {
        const item = document.createElement('li');
        const time = document.createElement('span');
        time.className = 'event-time';
        time.textContent = formatClock(event.time);
        item.append(time, describeEvent(event));
        return item;
      }));
      list.hidden = latest.length === 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
