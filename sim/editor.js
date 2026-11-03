// Editing the room: adding, moving and removing things, placing the child, and undo.
// Every function returns a new room (or null when the change is not allowed) and never
// changes the room it was given.

const WINDOW_ROLES = new Set(['window', 'window_lock']);

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const inside = (point, rect) => point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.d;

function bounds(items) {
  const left = Math.min(...items.map(({ x }) => x));
  const top = Math.min(...items.map(({ y }) => y));
  const right = Math.max(...items.map(({ x, w }) => x + w));
  const bottom = Math.max(...items.map(({ y, d }) => y + d));
  return { x: left, y: top, w: right - left, d: bottom - top };
}

/** A floor point beside `rect`, inside the room and clear of the other things. */
function approachFor(room, rect, others) {
  const gap = room.cardboard_box.approach_gap;
  const sides = [
    { x: rect.x + rect.w / 2, y: rect.y - gap },
    { x: rect.x + rect.w / 2, y: rect.y + rect.d + gap },
    { x: rect.x - gap, y: rect.y + rect.d / 2 },
    { x: rect.x + rect.w + gap, y: rect.y + rect.d / 2 },
  ];
  const inRoom = (p) => p.x >= 0 && p.x <= room.width && p.y >= 0 && p.y <= room.depth;
  return sides.find((p) => inRoom(p) && !others.some((other) => inside(p, other)))
    ?? sides.find(inRoom);
}

export const isWindowPart = (landmark) => WINDOW_ROLES.has(landmark.role);

/** The things that move and go together with `id`: its group, or the window with its lock. */
export function membersOf(room, id) {
  const object = room.landmarks.find((landmark) => landmark.id === id);
  if (!object) return [];
  if (isWindowPart(object)) return room.landmarks.filter(isWindowPart);
  if (object.group) return room.landmarks.filter(({ group }) => group === object.group);
  return [object];
}

/** The window and its lock are needed by the calculation, so they can move but not go. */
export const canRemove = (room, id) => membersOf(room, id).length > 0 && !membersOf(room, id).some(isWindowPart);

/** Shifts `members` so that their bounds are centred on `point`, kept inside the room. */
function shifted(room, members, point) {
  const box = bounds(members);
  const x = clamp(point.x - box.w / 2, 0, room.width - box.w);
  const y = clamp(point.y - box.d / 2, 0, room.depth - box.d);
  return members.map((item) => ({ ...item, x: item.x + (x - box.x), y: item.y + (y - box.y) }));
}

function withApproaches(room, moved, others) {
  return moved.map((item) => ({ ...item, approach: approachFor(room, item, [...others, ...moved.filter((m) => m !== item)]) }));
}

/** The next number for a kind of furniture, so ids and box labels stay unique. */
function nextNumber(room, kind) {
  const used = room.landmarks
    .map(({ id }) => new RegExp(`^${kind}-(\\d+)`).exec(id)?.[1])
    .filter(Boolean)
    .map(Number);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

/** Adds one catalogue item centred on `point`, or null if it does not fit there. */
export function addFurniture(room, item, point) {
  const number = nextNumber(room, item.kind);
  const multi = item.parts.length > 1;
  const box = room.cardboard_box;
  const parts = item.parts.map((part) => {
    const id = multi ? `${item.kind}-${number}-${part.key}` : `${item.kind}-${number}`;
    const shape = part.box
      ? { height: box.height, w: box.w, d: box.d, temporary: true, label: `${box.label}${number}` }
      : { heightOf: part.heightOf, w: part.w, d: part.d, label: part.label };
    return {
      id,
      scaffold: true,
      x: part.dx ?? 0,
      y: part.dy ?? 0,
      ...shape,
      ...(multi ? { group: `${item.kind}-${number}`, groupLabel: item.groupLabel ?? item.label } : {}),
    };
  });
  const placed = shifted(room, parts, point);
  if (placed.some((part) => room.landmarks.some((other) => overlaps(part, other)))) return null;
  return { ...room, landmarks: [...room.landmarks, ...withApproaches(room, placed, room.landmarks)] };
}

/** Moves the window and its lock along the wall they are on, to `point.x`. */
export function moveWindow(room, point) {
  const members = room.landmarks.filter(isWindowPart);
  const box = bounds(members);
  const x = clamp(point.x - box.w / 2, 0, room.width - box.w);
  const dx = x - box.x;
  const moved = new Map(members.map((item) => [item.id, {
    ...item,
    x: item.x + dx,
    approach: { x: clamp(item.approach.x + dx, 0, room.width), y: item.approach.y },
  }]));
  return { ...room, landmarks: room.landmarks.map((item) => moved.get(item.id) ?? item) };
}

/** Moves a thing (with its group) so it is centred on `point`, or null if it would overlap. */
export function moveObject(room, id, point) {
  const members = membersOf(room, id);
  if (members.length === 0) return null;
  if (members.some(isWindowPart)) return moveWindow(room, point);
  const memberIds = new Set(members.map((member) => member.id));
  const others = room.landmarks.filter((item) => !memberIds.has(item.id));
  const placed = shifted(room, members, point);
  if (placed.some((part) => others.some((other) => overlaps(part, other)))) return null;
  const moved = new Map(withApproaches(room, placed, others).map((item) => [item.id, item]));
  return { ...room, landmarks: room.landmarks.map((item) => moved.get(item.id) ?? item) };
}

/** Removes a thing with its group; the window cannot be removed. */
export function removeObject(room, id) {
  if (!canRemove(room, id)) return null;
  const memberIds = new Set(membersOf(room, id).map((member) => member.id));
  return { ...room, landmarks: room.landmarks.filter((item) => !memberIds.has(item.id)) };
}

/** Puts the child at `point` on the floor, or null if that is inside a piece of furniture. */
export function placeChild(room, point) {
  const start = { x: clamp(point.x, 0, room.width), y: clamp(point.y, 0, room.depth) };
  if (room.landmarks.some((item) => inside(start, item))) return null;
  return { ...room, start };
}

/** A list of rooms to step back through. Reset is a step too, so it can be undone. */
export function createHistory(initial) {
  const rooms = [initial];
  return {
    current: () => rooms[rooms.length - 1],
    canUndo: () => rooms.length > 1,
    push(room) {
      rooms.push(room);
      return room;
    },
    undo() {
      if (rooms.length > 1) rooms.pop();
      return rooms[rooms.length - 1];
    },
  };
}
