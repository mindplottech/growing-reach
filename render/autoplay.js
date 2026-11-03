/**
 * Which run plays next. Only runs where something happened are played, one after another, each
 * for one whole trial: all of them, or only those of the row the user pressed. Choosing never
 * changes how any run computes.
 */
export function createAutoplay({ session }) {
  let eventful = [];
  let queue = [];
  let index = 0;
  let filter = null;

  function playAt(next) {
    if (queue.length === 0) {
      session.setPlaying(false);
      return;
    }
    index = (next + queue.length) % queue.length;
    session.setSeed(queue[index]);
    session.setPlaying(true);
  }

  session.on('finished', () => {
    // A single run asked for by number gives way to the usual queue when it ends.
    if (filter === 'one') {
      filter = null;
      queue = [...eventful];
      playAt(0);
      return;
    }
    if (queue.length > 0) playAt(index + 1);
  });

  return {
    /** Every run where something happened, the lock first. With none, nothing plays. */
    useEventful(seeds) {
      eventful = [...seeds];
      queue = [...eventful];
      filter = null;
      playAt(0);
    },
    /** Only the runs of one row, from the first; the same row again goes back to all. */
    useRow(id, seeds) {
      if (filter === id) {
        filter = null;
        queue = [...eventful];
      } else {
        filter = id;
        queue = [...seeds];
      }
      playAt(0);
    },
    /** One run chosen by number under "くわしく見る"; then the usual queue goes on. */
    useSeed(seed) {
      filter = 'one';
      queue = [seed];
      playAt(0);
    },
    current: () => queue[index],
    row: () => (filter === 'one' ? null : filter),
  };
}
