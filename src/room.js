/**
 * A sample living room seen from above, in cm. The layout is a design placeholder,
 * not measured data; heights are looked up in the ledger, never written here.
 * `approach` is where the child stands to use the landmark; `mapLabel` is a short label for the map.
 */
export const LIVING_ROOM = {
  width: 450,
  depth: 360,
  start: { x: 225, y: 150 },
  landmarks: [
    { id: 'sofa', label: 'ソファの座面', heightOf: ['furniture_heights', 'sofa_seat'], x: 30, y: 20, w: 180, d: 80, approach: { x: 120, y: 120 } },
    { id: 'low_table', label: 'ローテーブル', heightOf: ['furniture_heights', 'low_table_top'], x: 70, y: 150, w: 100, d: 60, approach: { x: 190, y: 180 } },
    { id: 'low_shelf', label: '低い棚', heightOf: ['furniture_heights', 'low_shelf_top'], x: 300, y: 25, w: 130, d: 35, approach: { x: 365, y: 80 } },
    { id: 'dining_chair', label: 'ダイニングチェア', mapLabel: 'いす', heightOf: ['furniture_heights', 'dining_chair_seat'], x: 225, y: 225, w: 40, d: 40, approach: { x: 245, y: 205 } },
    { id: 'dining_table', label: 'ダイニングテーブル', heightOf: ['furniture_heights', 'dining_table_top'], x: 280, y: 200, w: 140, d: 90, approach: { x: 350, y: 180 } },
    { id: 'window', label: '窓枠', heightOf: ['furniture_heights', 'window_frame'], x: 40, y: 350, w: 130, d: 10, approach: { x: 105, y: 330 } },
    { id: 'window_lock', label: '窓の錠（報告書の仮定）', mapLabel: '窓の錠', heightOf: ['window_sill_height', 'lock_height_assumed'], x: 170, y: 350, w: 16, d: 10, approach: { x: 178, y: 330 } },
  ],
};

/**
 * One representative height from a ledger entry: its median if it has one, else the
 * middle of its listed values, else the middle of its min-max range.
 */
export function landmarkHeight(ledger, [itemId, key]) {
  const item = ledger.items.find((entry) => entry.id === itemId);
  const entry = item?.values?.[key];
  if (typeof entry === 'number') return entry;
  if (entry?.median !== undefined) return entry.median;
  if (entry?.values) {
    const sorted = [...entry.values].sort((a, b) => a - b);
    const upper = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[upper] : (sorted[upper - 1] + sorted[upper]) / 2;
  }
  if (entry?.min !== undefined) return (entry.min + entry.max) / 2;
  throw new Error(`no height in ledger for ${itemId}.${key}`);
}
