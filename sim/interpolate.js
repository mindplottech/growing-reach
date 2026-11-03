/**
 * Piecewise-linear interpolation over [x, y] points sorted by x.
 * Outside the points the end value is held flat, as the ledger specifies.
 */
export function interpolate(points, x) {
  if (!Number.isFinite(x)) throw new TypeError(`x must be a finite number: ${x}`);
  if (points.length === 0) throw new RangeError('points must not be empty');

  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];

  const upper = points.findIndex(([px]) => px > x);
  const [x0, y0] = points[upper - 1];
  const [x1, y1] = points[upper];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}
