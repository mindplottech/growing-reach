/** Seeded generator (mulberry32). The constants belong to the algorithm. */
export function createRng(seed) {
  if (!Number.isInteger(seed)) throw new TypeError(`seed must be an integer: ${seed}`);
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller). 1 - u keeps the log argument above zero. */
export function standardNormal(rng) {
  const radius = Math.sqrt(-2 * Math.log(1 - rng()));
  return radius * Math.cos(2 * Math.PI * rng());
}
