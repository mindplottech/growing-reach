import { interpolate } from './interpolate.js';
import { createRng, standardNormal } from './random.js';

const MEDIAN_CHILD = { height: 0, climb: 0, walkSpeed: 0 };

function item(ledger, id) {
  const found = ledger.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`ledger item not found: ${id}`);
  return found;
}

function zip(xs, ys) {
  return xs.map((x, i) => [x, ys[i]]);
}

/** Reads the coefficients of "reach = height * a - b" so they stay in the ledger. */
function reachCoefficients(ledger) {
  const { formula } = item(ledger, 'reach_height_standing');
  const match = /^reach = height \* ([\d.]+) - ([\d.]+)$/.exec(formula);
  if (!match) throw new Error(`unexpected reach formula: ${formula}`);
  return { slope: Number(match[1]), intercept: -Number(match[2]) };
}

function height(ledger, months, sex, z) {
  const percentiles = item(ledger, 'height_percentiles');
  const sds = item(ledger, 'height_sd');
  const median = interpolate(zip(percentiles.anchor_months, percentiles.values[sex].P50), months);
  const sd = interpolate(zip(sds.anchor_months, sds.values[sex]), months);
  return { value: median + z * sd, sd, category: percentiles.category };
}

/** Variation comes only from height: the ledger has no residual SD for the reach formula. */
function reach(ledger, heightResult) {
  const { slope, intercept } = reachCoefficients(ledger);
  return {
    value: heightResult.value * slope + intercept,
    sd: heightResult.sd * slope,
    category: item(ledger, 'reach_height_standing').category,
  };
}

/** Both sexes share one series: the ledger warns against the sex-specific formulas. */
function climb(ledger, months, z) {
  const entry = item(ledger, 'climb_height');
  const { extension_beyond_45: extension, individual_sd: individualSd } = entry;
  const median = interpolate([...entry.series_from_formula, ...extension.series], months);
  const sd = individualSd.value;
  // category_rule: an exact point keeps its own category, any other month the weaker one.
  const beyondData = extension.point_categories[months] ?? extension.category;
  return {
    value: median + z * sd,
    sd,
    category: months <= entry.valid_age_months[1] ? entry.category : beyondData,
  };
}

/** Only the first point is the measured group mean; the rest of the series is derived. */
function walkSpeed(ledger, months, z) {
  const entry = item(ledger, 'walk_speed');
  const { series_used: series, sd_used: sd, category } = entry.age_4to5_candidates;
  return {
    value: interpolate(series, months) + z * sd,
    sd,
    category: months === series[0][0] ? entry.category : category,
  };
}

/**
 * Body values at an age. `z` holds an individual's position in SD units per
 * quantity; the default is the median child. Each result is { value, sd, category }.
 */
export function getBodyValues(ledger, { months, sex, z = MEDIAN_CHILD }) {
  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  if (!(months >= minMonths && months <= maxMonths)) {
    throw new RangeError(`months must be within ${minMonths}-${maxMonths}: ${months}`);
  }
  if (!Object.hasOwn(item(ledger, 'height_percentiles').values, sex)) {
    throw new RangeError(`unknown sex: ${sex}`);
  }
  const heightResult = height(ledger, months, sex, z.height);
  return {
    height: heightResult,
    reach: reach(ledger, heightResult),
    climb: climb(ledger, months, z.climb),
    walkSpeed: walkSpeed(ledger, months, z.walkSpeed),
  };
}

/** Draws one individual. Quantities are drawn independently, in a fixed order. */
export function drawIndividual(seed) {
  const rng = createRng(seed);
  return {
    height: standardNormal(rng),
    climb: standardNormal(rng),
    walkSpeed: standardNormal(rng),
  };
}

/** The ledger's tiptoe reach for the child's age in years. Display only, never computed with. */
export function getTiptoeReference(ledger, months) {
  const entry = item(ledger, 'reach_height_tiptoe_zukan');
  const ageYears = Math.floor(months / 12);
  return {
    ageYears,
    value: entry.values_by_age_years[ageYears].reach,
    category: entry.category,
    label: entry.label,
  };
}
