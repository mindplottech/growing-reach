import { createSimulation } from '../sim/simulation.js';

// A fixed step keeps the run identical for a seed whatever the frame rate is.
const STEP_SECONDS = 0.05;
const MAX_FRAME_SECONDS = 0.25;
const MS_PER_SECOND = 1000;

/**
 * The one running child: which room, which child, playing or not. The simulation itself is
 * created and stepped here; nothing here changes how it computes.
 */
export function createSession({ ledger, settings, room: startRoom, getChild }) {
  let room = startRoom;
  let seed = 1;
  let playing = false;
  let simulation = null;
  let carry = 0;
  let lastFrame;
  const listeners = { restart: [], play: [] };
  const emit = (type) => listeners[type].forEach((listener) => listener());

  function restart() {
    simulation = createSimulation({ ledger, settings, ...getChild(), seed, room });
    carry = 0;
    emit('restart');
  }

  function frame(now) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    if (playing) {
      carry += Math.min(elapsed, MAX_FRAME_SECONDS);
      while (carry >= STEP_SECONDS) {
        simulation.step(STEP_SECONDS);
        carry -= STEP_SECONDS;
      }
    }
    requestAnimationFrame(frame);
  }

  restart();
  requestAnimationFrame(frame);

  return {
    getSimulation: () => simulation,
    getRoom: () => room,
    getSeed: () => seed,
    isPlaying: () => playing,
    setRoom(next) {
      room = next;
      restart();
    },
    setSeed(next) {
      seed = next;
      restart();
    },
    setPlaying(next) {
      playing = next;
      emit('play');
    },
    restart,
    on(type, listener) {
      listeners[type].push(listener);
    },
  };
}
