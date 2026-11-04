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

/**
 * The share of a standard normal distribution below z (Abramowitz & Stegun 26.2.17, error
 * under 7.5e-8). Used only to say where a typed child sits among a hundred; never for a count.
 */
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - upper : upper;
}
