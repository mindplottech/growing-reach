/**
 * Which scene plays next. On its own it goes through the touches of the right-hand condition and
 * round again; a pressed row or button plays only its own scenes, and pressing the same again,
 * or somewhere else, goes back. Choosing never changes how any run computes.
 */
export function createAutoplay({ session }) {
  let auto = [];
  let list = [];
  let index = 0;
  let key = null;
  const listeners = [];
  const changed = () => listeners.forEach((listener) => listener());

  function playAt(next) {
    if (list.length === 0) {
      session.setPlaying(false);
      changed();
      return;
    }
    index = ((next % list.length) + list.length) % list.length;
    session.setScene(list[index]);
    session.setPlaying(true);
    changed();
  }

  function backToAuto() {
    key = null;
    list = auto;
    playAt(0);
  }

  session.on('finished', () => {
    // A whole run asked for by number gives way to the usual order when it ends.
    if (key === 'seed') backToAuto();
    else if (list.length > 0) playAt(index + 1);
  });

  return {
    /** The scenes played on their own; with none, nothing plays. */
    useAuto(scenes) {
      auto = [...scenes];
      backToAuto();
    },
    /** Only these scenes, from the first; the same key again goes back to the automatic order. */
    useList(nextKey, scenes) {
      if (key === nextKey) {
        backToAuto();
        return;
      }
      key = nextKey;
      list = [...scenes];
      playAt(0);
    },
    /** One whole run, chosen by number under "くわしく見る". */
    useRun(scene) {
      key = 'seed';
      list = [scene];
      playAt(0);
    },
    /** Pressed somewhere else: back to the automatic order, if something else was playing. */
    leave() {
      if (key !== null) backToAuto();
    },
    current: () => list[index] ?? null,
    key: () => key,
    onChange: (listener) => listeners.push(listener),
  };
}
