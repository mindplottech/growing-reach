import { canClimb, canReach } from '../sim/ability.js';
import { landmarkHeight } from '../sim/room.js';
import { footholdReachLevel, REACH_NONE } from '../sim/scaffold.js';

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

// The fixed first view: from above the front left, so every piece of furniture, the things on
// them, the window and its lock are in sight at once.
const VIEW_DIRECTION = { x: -0.35, y: 1.3, z: -1 };
// Where the room may reach on screen, in normalised device coordinates (-1 to 1). The top is
// kept lower so the list of events in the top left corner does not cover the window.
const FRAME = { halfWidth: 0.8, top: 0.7, bottom: -0.9 };
const FIT_ROUNDS = 4;
const SEARCH_STEPS = 40;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a) => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const along = (point, direction, length) => ({
  x: point.x + direction.x * length, y: point.y + direction.y * length, z: point.z + direction.z * length,
});

/** Where a point lands on screen for a camera at `position` looking at `target`, y up. */
export function projectPoint(point, { position, target }, aspect, fieldOfViewDegrees) {
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const offset = sub(point, position);
  const depth = dot(offset, forward);
  const tanHalf = Math.tan((fieldOfViewDegrees * Math.PI) / 180 / 2);
  return { x: dot(offset, right) / (depth * tanHalf * aspect), y: dot(offset, up) / (depth * tanHalf), depth };
}

const boxCorners = ({ x, z, w, d }, y) => [
  { x, y, z }, { x: x + w, y, z }, { x, y, z: z + d }, { x: x + w, y, z: z + d },
];

/** The points that must be on screen: the floor corners and the top corners of everything drawn. */
export function framePoints(model) {
  const floor = boxCorners({ x: 0, z: 0, w: model.width, d: model.depth }, 0);
  if (!model.objects) return [...floor, ...boxCorners({ x: 0, z: 0, w: model.width, d: model.depth }, model.wallHeight)];
  const tops = model.objects.flatMap((object) => boxCorners(object, object.visualTop));
  const pane = model.pane ? boxCorners({ x: model.pane.x, z: model.depth, w: model.pane.w, d: 0 }, model.pane.top) : [];
  const curtain = model.curtain ? boxCorners({ x: model.curtain.x, z: model.depth, w: model.curtain.w, d: 0 }, model.pane.top) : [];
  return [...floor, ...tops, ...pane, ...curtain];
}

function screenBox(corners, camera, aspect, fieldOfViewDegrees) {
  const points = corners.map((corner) => projectPoint(corner, camera, aspect, fieldOfViewDegrees));
  return {
    left: Math.min(...points.map(({ x }) => x)),
    right: Math.max(...points.map(({ x }) => x)),
    bottom: Math.min(...points.map(({ y }) => y)),
    top: Math.max(...points.map(({ y }) => y)),
    inFront: points.every(({ depth }) => depth > 0),
  };
}

/**
 * The first camera: as close as it can be while the floor and everything on it fit inside
 * FRAME, centred in it. The room then fills about 80% of the width, unless the height is the
 * tighter side. Every object's top corners are kept inside, so all of them stay in sight.
 */
export function cameraPlacement(model, aspect, fieldOfViewDegrees) {
  const { width, depth, wallHeight } = model;
  const contentHeight = model.contentHeight ?? wallHeight;
  const corners = framePoints(model);
  const direction = unit(VIEW_DIRECTION);
  const radius = Math.hypot(width, depth, contentHeight);
  const frameMiddle = (FRAME.top + FRAME.bottom) / 2;
  const frameHalfHeight = (FRAME.top - FRAME.bottom) / 2;
  const fits = (box) => box.inFront
    && (box.right - box.left) / 2 <= FRAME.halfWidth && (box.top - box.bottom) / 2 <= frameHalfHeight;
  const closest = (target) => {
    let near = radius * 0.2;
    let far = radius * 10;
    for (let i = 0; i < SEARCH_STEPS; i += 1) {
      const middle = (near + far) / 2;
      const trial = { target, position: along(target, direction, middle) };
      if (fits(screenBox(corners, trial, aspect, fieldOfViewDegrees))) far = middle;
      else near = middle;
    }
    return { target, position: along(target, direction, far), distance: far };
  };
  const tanHalf = Math.tan((fieldOfViewDegrees * Math.PI) / 180 / 2);
  let camera = closest({ x: width / 2, y: contentHeight / 3, z: depth / 2 });
  for (let round = 0; round < FIT_ROUNDS; round += 1) {
    // Move the aim so the room sits in the middle of FRAME, then come as close as it fits.
    const box = screenBox(corners, camera, aspect, fieldOfViewDegrees);
    const forward = unit(sub(camera.target, camera.position));
    const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
    const up = cross(right, forward);
    const shiftX = ((box.left + box.right) / 2) * camera.distance * tanHalf * aspect;
    const shiftY = ((box.top + box.bottom) / 2 - frameMiddle) * camera.distance * tanHalf;
    camera = closest(along(along(camera.target, right, shiftX), up, shiftY));
  }
  return { target: camera.target, position: camera.position };
}

// Which shape draws a piece of furniture, from the ledger height it points to.
const SHAPES = {
  dining_table_top: 'table',
  low_table_top: 'low_table',
  dining_chair_seat: 'chair',
  sofa_seat: 'sofa',
  sofa_back: 'sofa_back',
  low_shelf_top: 'shelf',
  adult_bed_mattress: 'bed',
};

// Parts drawn for the look only, at ledger heights. The simulation never reads them: it climbs
// and reaches only by the heights in the layout.
export const DISPLAY_ONLY_PARTS = [
  { key: 'chairBack', label: 'いすの背もたれ', heightOf: ['furniture_heights', 'dining_chair_back'] },
  { key: 'sofaArm', label: 'ソファの肘掛け', heightOf: ['furniture_heights', 'sofa_armrest'] },
  { key: 'sofaBack', label: 'ソファの背もたれ（背もたれを別に持たない配置のとき）', heightOf: ['furniture_heights', 'sofa_back'] },
];

/** The heights of the display-only parts, by the same rule as every layout height. */
export function displayOnlyHeights(ledger) {
  return Object.fromEntries(DISPLAY_ONLY_PARTS.map(({ key, heightOf }) => [key, landmarkHeight(ledger, heightOf)]));
}

/** The side of a footprint that faces a point, as a unit step along x or z. */
export function facingToward(object, point) {
  if (!point) return { x: 0, z: -1 };
  const dx = (point.x - (object.x + object.w / 2)) / object.w;
  const dz = (point.y - (object.y + object.d / 2)) / object.d;
  return Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) || -1 };
}

const centre = (object) => ({ x: object.x + object.w / 2, y: object.y + object.d / 2 });

/** A chair faces the nearest table; anything else faces where the child comes to it from. */
function facingOf(landmark, landmarks, shape) {
  if (shape === 'chair') {
    const tables = landmarks.filter((other) => SHAPES[other.heightOf?.[1]] === 'table');
    const here = centre(landmark);
    const nearest = tables.sort((a, b) => Math.hypot(centre(a).x - here.x, centre(a).y - here.y)
      - Math.hypot(centre(b).x - here.x, centre(b).y - here.y))[0];
    if (nearest) return facingToward(landmark, centre(nearest));
  }
  return facingToward(landmark, landmark.approach);
}

const CURTAIN_SPACE_CM = 30;

/**
 * Everything the 3D view draws, as plain numbers: positions in cm with x and z on the
 * floor and y upwards. The view only draws this; sizes come from the layout and ledger.
 */
export function buildSceneModel({ ledger, room, landmarks, body, boxIds = new Set(), hazards = [] }) {
  const windowInner = ledger.items
    .find((entry) => entry.id === 'window_sill_height').values.standard_waist_window_inner;
  const extra = displayOnlyHeights(ledger);
  const objects = landmarks.map((landmark) => {
    const isLock = landmark.role === 'window_lock';
    const lockSize = room.lock_display_size_cm;
    const kind = landmark.role ?? (boxIds.has(landmark.id) ? 'box' : 'furniture');
    const shape = kind === 'furniture' ? SHAPES[landmark.heightOf?.[1]] ?? 'block' : kind;
    // A sofa seat with its own back in the layout draws only arms; a sofa without one draws a back too.
    const ownBack = shape === 'sofa' && !landmarks.some((other) => other !== landmark
      && other.group && other.group === landmark.group && SHAPES[other.heightOf?.[1]] === 'sofa_back');
    const top = isLock ? landmark.height + lockSize / 2 : landmark.height;
    const look = {
      chair: { back: extra.chairBack },
      sofa: { arm: extra.sofaArm, ...(ownBack ? { back: extra.sofaBack } : {}) },
    }[shape] ?? {};
    return {
      id: landmark.id,
      label: landmark.mapLabel ?? landmark.label,
      kind,
      shape,
      facing: facingOf(landmark, landmarks, shape),
      look,
      x: landmark.x,
      z: landmark.y,
      w: landmark.w,
      d: landmark.d,
      bottom: isLock ? landmark.height - lockSize / 2 : 0,
      top,
      visualTop: Math.max(top, ...Object.values(look)),
      height: landmark.height,
      state: objectState(body, landmark.height),
    };
  });
  const sill = objects.find(({ kind }) => kind === 'window');
  const pane = sill && { x: sill.x, w: sill.w, bottom: sill.top, top: sill.top + windowInner };
  // The curtain hangs beside the window, on the side with room for it.
  const windowParts = objects.filter(({ kind }) => kind === 'window' || kind === 'window_lock');
  const left = windowParts.length > 0 ? Math.min(...windowParts.map(({ x }) => x)) : 0;
  const right = windowParts.length > 0 ? Math.max(...windowParts.map(({ x, w }) => x + w)) : 0;
  const curtain = sill && (left >= CURTAIN_SPACE_CM
    ? { x: left - CURTAIN_SPACE_CM, w: CURTAIN_SPACE_CM }
    : { x: right, w: CURTAIN_SPACE_CM });
  return {
    width: room.width,
    depth: room.depth,
    wallHeight: room.wall_height.value,
    contentHeight: Math.max(pane?.top ?? 0, ...objects.map(({ visualTop }) => visualTop)),
    objects,
    hazards: hazards.map(({ id, label, kind, on, x, y, w, d, height }) => ({ id, label, kind, on, x, z: y, w, d, bottom: height })),
    pane,
    curtain,
    planes: [
      { id: 'reach', label: '立って届く高さ（床に立ったとき）', height: body.reach.value, category: body.reach.category },
      { id: 'climb', label: '登れる高さ（床に立ったとき）', height: body.climb.value, category: body.climb.category },
    ],
    childHeight: body.height.value,
  };
}
