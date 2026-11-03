import { createPlayback } from '../sim/playback.js';
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
  let speed = 1;
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: MAX_FRAME_SECONDS });
  let lastFrame;
  const listeners = { restart: [], play: [], speed: [] };
  const emit = (type) => listeners[type].forEach((listener) => listener());

  function restart() {
    simulation = createSimulation({ ledger, settings, ...getChild(), seed, room });
    playback.reset();
    emit('restart');
  }

  function frame(now) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    if (playing) {
      const steps = playback.stepsFor(elapsed, speed);
      for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
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
    getSpeed: () => speed,
    /** Faster playback takes more of the same steps per frame; the record does not change. */
    setSpeed(next) {
      speed = next;
      emit('speed');
    },
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
