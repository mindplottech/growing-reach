import { canClimb, canReach } from './ability.js';
import { footholdReachLevel, REACH_NONE } from './scaffold.js';

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
 * The ids of objects the child can reach at this moment, from the foothold or from where
 * they stand on the floor, by the same judgement as the record. Only objects above their
 * feet count. Read-only: this decides what to light up, nothing else.
 */
export function reachableNow({ ledger, body, landmarks, position, foothold }) {
  const standing = foothold ?? { x: position.x, y: position.y, w: 0, d: 0, height: 0 };
  return new Set(
    landmarks
      .filter((object) => object !== foothold && object.height > standing.height)
      .filter((object) => footholdReachLevel(ledger, body, standing, object) !== REACH_NONE)
      .map(({ id }) => id),
  );
}

// The fixed first view: diagonally above the room, looking at its middle.
const VIEW_DIRECTION = { x: 0.62, y: 0.82, z: -1 };
const VIEW_TARGET_HEIGHT_SHARE = 0.18;

/** A camera position that shows the whole room at this aspect ratio and field of view. */
export function cameraPlacement({ width, depth, wallHeight }, aspect, fieldOfViewDegrees) {
  const target = { x: width / 2, y: wallHeight * VIEW_TARGET_HEIGHT_SHARE, z: depth / 2 };
  const radius = Math.hypot(width, depth, wallHeight) / 2;
  const vertical = (fieldOfViewDegrees * Math.PI) / 180 / 2;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal));
  const length = Math.hypot(VIEW_DIRECTION.x, VIEW_DIRECTION.y, VIEW_DIRECTION.z);
  return {
    target,
    position: {
      x: target.x + (VIEW_DIRECTION.x / length) * distance,
      y: target.y + (VIEW_DIRECTION.y / length) * distance,
      z: target.z + (VIEW_DIRECTION.z / length) * distance,
    },
  };
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
