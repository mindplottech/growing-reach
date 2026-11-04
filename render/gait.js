import { interpolate } from '../sim/interpolate.js';

const CM_PER_M = 100;

/**
 * How the figure walks and is built at an age: display only. Step length, cycle time and
 * stride width come from the ledger (gait_display); the sway, the arm guard and the body shares
 * are provisional values in params.js. Nothing here is read by the simulation.
 */
export function gaitFor(ledger, settings, months) {
  const entry = ledger.items.find(({ id }) => id === 'gait_display');
  if (!entry) throw new Error('ledger item not found: gait_display');
  const series = (values) => entry.anchor_months.map((month, i) => [month, values[i]]);
  const figure = settings.gait_figure;
  return {
    stepCm: interpolate(series(entry.values.step_length_m), months) * CM_PER_M,
    cycleSeconds: interpolate(series(entry.values.cycle_time_s), months),
    strideWidthCm: interpolate(series(entry.values.stride_width_m), months) * CM_PER_M,
    sway: interpolate(figure.sway_rad, months),
    armGuard: interpolate(figure.arm_guard, months),
    legSwing: interpolate(figure.leg_swing_rad, months),
    headShare: interpolate(figure.head_share, months),
    bellyShare: interpolate(figure.belly_share, months),
    legShare: interpolate(figure.leg_share, months),
  };
}
