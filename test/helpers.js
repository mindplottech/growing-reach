import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectLayout } from '../sim/room.js';

export const ledger = JSON.parse(readFileSync(new URL('../data/values_ledger.json', import.meta.url)));
export const roomFile = JSON.parse(readFileSync(new URL('../data/room_layout.json', import.meta.url)));
export const roomLayout = selectLayout(roomFile, roomFile.layouts[0].id);
export const settings = JSON.parse(readFileSync(new URL('../data/sim_settings.json', import.meta.url)));
export const byId = (id, source = ledger) => source.items.find((entry) => entry.id === id);
export const [minMonths, maxMonths] = ledger._meta.age_range_months;
export const SEXES = ['male', 'female'];

export const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

/** Every whole month in the ledger's age range. */
export const everyMonth = () =>
  Array.from({ length: maxMonths - minMonths + 1 }, (_, i) => minMonths + i);

/** Expected value worked out from the ledger's points, independently of sim/interpolate.js. */
export function expectedAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  const upper = points.findIndex(([px]) => px >= x);
  if (upper === -1) return points[points.length - 1][1];
  const [x0, y0] = points[upper - 1] ?? points[upper];
  const [x1, y1] = points[upper];
  return x === x1 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

export const heightPoints = (sex) => {
  const { anchor_months: anchors, values } = byId('height_percentiles');
  return anchors.map((months, i) => [months, values[sex].P50[i]]);
};

export const heightSdPoints = (sex) => {
  const { anchor_months: anchors, values } = byId('height_sd');
  return anchors.map((months, i) => [months, values[sex][i]]);
};

export const climbPoints = () => {
  const entry = byId('climb_height');
  return [...entry.series_from_formula, ...entry.extension_beyond_45.series];
};

export const walkPoints = () => byId('walk_speed').age_4to5_candidates.series_used;

/** The slope and intercept written in the ledger's reach formula. */
export function reachFormula() {
  const [, slope, intercept] = /\* ([\d.]+) - ([\d.]+)$/.exec(byId('reach_height_standing').formula);
  return { slope: Number(slope), intercept: -Number(intercept) };
}
