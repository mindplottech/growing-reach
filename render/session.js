import { createPlayback } from '../sim/playback.js';
import { createSimulation } from '../sim/simulation.js';

// A fixed step keeps the run identical for a seed whatever the frame rate is.
const STEP_SECONDS = 0.05;
const MAX_FRAME_SECONDS = 0.25;
const MS_PER_SECOND = 1000;

/**
 * The one running child: which room, which child, playing or not. The simulation itself is
 * created and stepped here; nothing here changes how it computes.
 *
 * A run is the slider's child in the room being edited, from the start to the end of the trial,
 * unless a scene is set: then it is the child of that condition (age, sex and room), computed
 * unseen up to the scene's start and played to its end.
 */
export function createSession({ ledger, settings, room: startRoom, getChild, startSpeed = 1 }) {
  let room = startRoom;
  let seed = 1;
  let playing = false;
  let simulation = null;
  let speed = startSpeed;
  let finished = false;
  let scene = null;
  const playback = createPlayback({ stepSeconds: STEP_SECONDS, maxFrameSeconds: MAX_FRAME_SECONDS });
  let lastFrame;
  const listeners = { restart: [], play: [], speed: [], finished: [] };
  const emit = (type) => listeners[type].forEach((listener) => listener());

  const runRoom = () => scene?.room ?? room;
  const endTime = () => scene?.end ?? settings.trial_seconds;

  function begin() {
    const child = scene ? { months: scene.months, sex: scene.sex, individual: scene.individual ?? null } : getChild();
    // A scene may bring its own settings over the shared ones (the walk: no climbing).
    const runSettings = scene?.settings ? { ...settings, ...scene.settings } : settings;
    simulation = createSimulation({ ledger, settings: runSettings, ...child, seed, room: runRoom() });
    // Computing up to the start in one go gives the same record as stepping there frame by frame.
    if (scene?.start > 0) simulation.step(scene.start);
    playback.reset();
    finished = false;
    emit('restart');
  }

  function frame(now) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    if (playing && !finished) {
      // A run ends at the end of its scene, or of the trial; then the session says so.
      const left = Math.round((endTime() - simulation.time) / STEP_SECONDS);
      const steps = Math.min(playback.stepsFor(elapsed, speed), Math.max(left, 0));
      for (let i = 0; i < steps; i += 1) simulation.step(STEP_SECONDS);
      if (steps >= left) {
        finished = true;
        emit('finished');
      }
    }
    requestAnimationFrame(frame);
  }

  begin();
  requestAnimationFrame(frame);

  return {
    getSimulation: () => simulation,
    /** The room being edited. */
    getRoom: () => room,
    /** The room of the run on screen: the edited one, or that of the scene's condition. */
    getRunRoom: runRoom,
    getSeed: () => seed,
    getScene: () => scene,
    isPlaying: () => playing,
    isFinished: () => finished,
    getSpeed: () => speed,
    setSpeed(next) {
      speed = next;
      emit('speed');
    },
    setRoom(next) {
      room = next;
      scene = null;
      begin();
    },
    setSeed(next) {
      seed = next;
      scene = null;
      begin();
    },
    /** Plays one scene: { seed, months, sex, room, start, end, ... } (extra fields are kept). */
    setScene(next) {
      scene = next;
      seed = next.seed;
      begin();
    },
    setPlaying(next) {
      playing = next;
      // Playing again after the end starts the same run over.
      if (next && finished) begin();
      emit('play');
    },
    /** The slider's child from the start, as the age changes. */
    restart() {
      scene = null;
      begin();
    },
    on(type, listener) {
      listeners[type].push(listener);
    },
  };
}
