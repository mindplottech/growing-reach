import { describeEvent, formatClock } from '../sim/events.js';

// How many of the latest events the canvas shows.
const SHOWN = 4;

/** The latest events of the child on screen, in fixed sentences with the time since the start. */
export function mountEventLog({ list, session }) {
  let simulation = null;
  let seen = -1;

  function frame() {
    const now = session.getSimulation();
    if (now !== simulation || now.events.length !== seen) {
      simulation = now;
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
