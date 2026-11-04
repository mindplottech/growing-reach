import { interpolate } from './interpolate.js';
import { createRng, standardNormal } from './random.js';

// z-scores of a median child; tiptoe is a position within the ledger's range (0 to 1).
const MEDIAN_CHILD = { height: 0, climb: 0, walkSpeed: 0, tiptoe: 0.5 };

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

/** The sex that stands for a child in general: the ledger's average of both. */
export const SEX_ANY = 'any';

/** Median and SD of height at an age: by sex from the survey, or the ledger's average of both. */
function heightDistribution(ledger, months, sex) {
  if (sex === SEX_ANY) {
    const both = item(ledger, 'height_both_sexes');
    return {
      median: interpolate(zip(both.anchor_months, both.values.P50), months),
      sd: interpolate(zip(both.anchor_months, both.values.SD), months),
      category: both.category,
      sdCategory: both.category,
    };
  }
  const percentiles = item(ledger, 'height_percentiles');
  const sds = item(ledger, 'height_sd');
  return {
    median: interpolate(zip(percentiles.anchor_months, percentiles.values[sex].P50), months),
    sd: interpolate(zip(sds.anchor_months, sds.values[sex]), months),
    category: percentiles.category,
    sdCategory: sds.category,
  };
}

function height(ledger, months, sex, z) {
  const { median, sd, category, sdCategory } = heightDistribution(ledger, months, sex);
  return { value: median + z * sd, sd, category, sdCategory };
}

/** Standing reach for a height, by the ledger's formula. */
export function standingReachFor(ledger, heightCm) {
  const { slope, intercept } = reachCoefficients(ledger);
  return heightCm * slope + intercept;
}

/** Variation comes only from height: the ledger has no residual SD for the reach formula. */
function reach(ledger, heightResult) {
  const { slope } = reachCoefficients(ledger);
  return {
    value: standingReachFor(ledger, heightResult.value),
    sd: heightResult.sd * slope,
    sdCategory: heightResult.sdCategory,
    category: item(ledger, 'reach_height_standing').category,
  };
}

/** Standing reach plus the child's tiptoe gain; min and max span the ledger's range. */
function tiptoeReach(ledger, reachResult, position) {
  const { range: [minGain, maxGain], category } = item(ledger, 'tiptoe_gain');
  const gain = minGain + position * (maxGain - minGain);
  return {
    value: reachResult.value + gain,
    gain,
    min: reachResult.value + minGain,
    max: reachResult.value + maxGain,
    category,
  };
}

/** The median climb height at an age, from the ledger's series (formula, then its extension). */
function climbMedian(ledger, months) {
  const entry = item(ledger, 'climb_height');
  return interpolate([...entry.series_from_formula, ...entry.extension_beyond_45.series], months);
}

/** Reads the coefficients of "climb = height * a - b" so they stay in the ledger. */
function climbFromHeightCoefficients(ledger) {
  const { formula_from_height: formula } = item(ledger, 'climb_height');
  const match = /^climb = ([\d.]+) \* height - ([\d.]+)$/.exec(formula);
  if (!match) throw new Error(`unexpected climb-from-height formula: ${formula}`);
  return { slope: Number(match[1]), intercept: -Number(match[2]) };
}

/** Both sexes share one series: the ledger warns against the sex-specific formulas. */
function climb(ledger, months, z) {
  const entry = item(ledger, 'climb_height');
  const { extension_beyond_45: extension, individual_sd: individualSd } = entry;
  const median = climbMedian(ledger, months);
  const sd = individualSd.value;
  // category_rule: an exact point keeps its own category, any other month the weaker one.
  const beyondData = extension.point_categories[months] ?? extension.category;
  return {
    value: median + z * sd,
    sd,
    category: months <= entry.valid_age_months[1] ? entry.category : beyondData,
  };
}

/**
 * Only the months the ledger lists as measured group means keep the measured category; the
 * rest of the series is derived. The SD is its own series (a toddler group and an older group).
 */
function walkSpeed(ledger, months, z) {
  const entry = item(ledger, 'walk_speed');
  const {
    series_used: series, sd_series_used: sdSeries, measured_points_months: measured, category,
  } = entry.age_4to5_candidates;
  const sd = interpolate(sdSeries, months);
  return {
    value: interpolate(series, months) + z * sd,
    sd,
    category: measured.includes(months) ? entry.category : category,
  };
}

/**
 * Body values at an age. `z` holds an individual's position in SD units per
 * quantity; anything left out is the median child. Each result has value and category.
 */
export function getBodyValues(ledger, { months, sex, z: individual }) {
  const z = { ...MEDIAN_CHILD, ...individual };
  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  if (!(months >= minMonths && months <= maxMonths)) {
    throw new RangeError(`months must be within ${minMonths}-${maxMonths}: ${months}`);
  }
  if (sex !== SEX_ANY && !Object.hasOwn(item(ledger, 'height_percentiles').values, sex)) {
    throw new RangeError(`unknown sex: ${sex}`);
  }
  const heightResult = height(ledger, months, sex, z.height);
  const reachResult = reach(ledger, heightResult);
  return {
    height: heightResult,
    reach: reachResult,
    tiptoeReach: tiptoeReach(ledger, reachResult, z.tiptoe),
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
    tiptoe: rng(),
  };
}

/**
 * The ledger's tiptoe reach for the child's age in years. Display only, never computed with.
 * Returns null for an age the ledger has no row for (the source only covers 3 to 5 years).
 */
export function getTiptoeReference(ledger, months) {
  const entry = item(ledger, 'reach_height_tiptoe_zukan');
  const ageYears = Math.floor(months / 12);
  const row = entry.values_by_age_years[ageYears];
  if (!row) return null;
  const { height: measuredHeight, reach: value } = row;
  return { ageYears, height: measuredHeight, value, category: entry.category };
}

/**
 * The position (z, in SD units) of one child from what a parent can measure: height in cm and,
 * if known, the highest thing the child climbs onto in cm. With height alone, the climb height
 * comes from the ledger's height formula. The result is `{ z, notes }`: z holds only the
 * quantities that were given (the rest stay median), and notes say where an input fell outside
 * the ledger's ranges. Every number comes from the ledger.
 */
export function individualFromMeasurements(ledger, { months, sex, heightCm = null, climbCm = null }) {
  const z = {};
  const notes = [];
  if (heightCm !== null) {
    const { median, sd } = heightDistribution(ledger, months, sex);
    z.height = (heightCm - median) / sd;
  }
  const climbEntry = item(ledger, 'climb_height');
  const climbSd = climbEntry.individual_sd.value;
  if (climbCm !== null) {
    z.climb = (climbCm - climbMedian(ledger, months)) / climbSd;
  } else if (heightCm !== null) {
    const { slope, intercept } = climbFromHeightCoefficients(ledger);
    const [low, high] = climbEntry.formula_from_height_valid_height_cm;
    const used = Math.min(Math.max(heightCm, low), high);
    if (used !== heightCm) notes.push(`身長${heightCm}cmは登れる高さの式の範囲（${low}〜${high}cm）の外なので、${used}cmとして計算`);
    z.climb = (used * slope + intercept - climbMedian(ledger, months)) / climbSd;
  }
  return { z, notes };
}
