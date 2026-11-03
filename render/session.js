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
export function createSession({ ledger, settings, room: startRoom, getChild, startSpeed = 1 }) {
  let room = startRoom;
  let seed = 1;
  let playing = false;
  let simulation = null;
  let speed = startSpeed;
  let finished = false;
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: MAX_FRAME_SECONDS });
  let lastFrame;
  const listeners = { restart: [], play: [], speed: [], finished: [] };
  const emit = (type) => listeners[type].forEach((listener) => listener());

  function restart() {
    simulation = createSimulation({ ledger, settings, ...getChild(), seed, room });
    playback.reset();
    finished = false;
    emit('restart');
  }

  function frame(now) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    if (playing) {
      // One child's run is one trial long; then the session says it has finished.
      const left = Math.round((settings.trial_seconds - simulation.time) / STEP_SECONDS);
      const steps = Math.min(playback.stepsFor(elapsed, speed), Math.max(left, 0));
      for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
      if (!finished && steps >= left) {
        finished = true;
        emit('finished');
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
