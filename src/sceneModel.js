import { canClimb, canReach } from './ability.js';

export const STATE_CLIMBABLE = 'climbable';
export const STATE_REACHABLE = 'reachable';
export const STATE_OUT = 'out';

/** Which plane an object sits under: climbable, only reachable, or above both. */
export function objectState(body, height) {
  if (canClimb(body, height)) return STATE_CLIMBABLE;
  if (canReach(body, height)) return STATE_REACHABLE;
  return STATE_OUT;
}

/** The objects that should light up together with `id`: itself and its group. */
export function highlightedIds(landmarks, id) {
  const object = landmarks.find((landmark) => landmark.id === id);
  if (!object) return new Set();
  const members = object.group ? landmarks.filter(({ group }) => group === object.group) : [object];
  return new Set(members.map((member) => member.id));
}

/**
 * Everything the 3D view draws, as plain numbers: positions in cm with x and z on the
 * floor and y upwards. The view only draws this; sizes come from the layout and ledger.
 */
export function buildSceneModel({ ledger, room, landmarks, body, boxIds = new Set() }) {
  const windowInner = ledger.items
    .find((entry) => entry.id === 'window_sill_height').values.standard_waist_window_inner;
  const objects = landmarks.map((landmark) => {
    const isLock = landmark.role === 'window_lock';
    const lockSize = room.lock_display_size_cm;
    return {
      id: landmark.id,
      label: landmark.mapLabel ?? landmark.label,
      kind: landmark.role ?? (boxIds.has(landmark.id) ? 'box' : 'furniture'),
      x: landmark.x,
      z: landmark.y,
      w: landmark.w,
      d: landmark.d,
      bottom: isLock ? landmark.height - lockSize / 2 : 0,
      top: isLock ? landmark.height + lockSize / 2 : landmark.height,
      height: landmark.height,
      state: objectState(body, landmark.height),
    };
  });
  const sill = objects.find(({ kind }) => kind === 'window');
  return {
    width: room.width,
    depth: room.depth,
    wallHeight: room.wall_height.value,
    objects,
    pane: sill && { x: sill.x, w: sill.w, bottom: sill.top, top: sill.top + windowInner },
    planes: [
      { id: 'reach', label: '立って届く高さ（床に立ったとき）', height: body.reach.value, category: body.reach.category },
      { id: 'climb', label: '登れる高さ（床に立ったとき）', height: body.climb.value, category: body.climb.category },
    ],
    childHeight: body.height.value,
  };
}
