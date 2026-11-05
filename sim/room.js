import { roomParams } from './params.js';

/** One named layout with what all layouts share, and the provisional room values from params. */
export function selectLayout(file, layoutId) {
  const { layouts, ...shared } = file;
  const layout = layouts.find(({ id }) => id === layoutId);
  if (!layout) throw new Error(`layout not found: ${layoutId}`);
  return { ...roomParams, ...shared, ...layout };
}

/**
 * One representative height from a ledger entry: its median if it has one, else the
 * middle of its listed values, else the middle of its min-max range.
 */
export function landmarkHeight(ledger, [itemId, key]) {
  const item = ledger.items.find((entry) => entry.id === itemId);
  const entry = item?.values?.[key];
  if (typeof entry === 'number') return entry;
  if (typeof entry?.value === 'number') return entry.value;
  if (entry?.median !== undefined) return entry.median;
  if (entry?.values) {
    const sorted = [...entry.values].sort((a, b) => a - b);
    const upper = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[upper] : (sorted[upper - 1] + sorted[upper]) / 2;
  }
  if (entry?.min !== undefined) return (entry.min + entry.max) / 2;
  throw new Error(`no height in ledger for ${itemId}.${key}`);
}
