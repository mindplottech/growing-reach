/**
 * Which child plays next. A queue of seeds plays one after another, each for one whole trial.
 * The queue is either the children to whom something happened (or 1, 2, 3, … if none), or the
 * children in a list the user opened. Choosing a child never changes how any run computes.
 */
export function createAutoplay({ session, total }) {
  let queue = [];
  let index = 0;
  const listeners = [];
  const emit = () => listeners.forEach((listener) => listener());

  function playAt(next) {
    index = (next + queue.length) % queue.length;
    session.setSeed(queue[index]);
    session.setPlaying(true);
    emit();
  }

  session.on('finished', () => {
    if (queue.length > 0) playAt(index + 1);
  });

  const everyone = () => Array.from({ length: total }, (_, i) => i + 1);

  return {
    /** The automatic order: children to whom something happened first; else everyone by seed. */
    useEventful(eventful, startSeed = null) {
      queue = eventful.length > 0 ? [...eventful] : everyone();
      const at = startSeed === null ? 0 : queue.indexOf(startSeed);
      playAt(Math.max(at, 0));
    },
    /** The children of one row, starting from `seed`. */
    useList(seeds, seed) {
      queue = [...seeds];
      playAt(Math.max(queue.indexOf(seed), 0));
    },
    /** One child chosen by number; the queue goes on from there by seed. */
    useSeed(seed) {
      queue = everyone();
      playAt(Math.max(queue.indexOf(seed), 0));
    },
    previous: () => playAt(index - 1),
    next: () => playAt(index + 1),
    current: () => queue[index],
    on(listener) {
      listeners.push(listener);
    },
  };
}
