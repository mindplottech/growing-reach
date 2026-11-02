function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** A floor point just beside the box, on the first side that is inside the room. */
function approachPoint(room, { x, y, w, d }, gap) {
  const sides = [
    { x: x + w / 2, y: y - gap },
    { x: x + w / 2, y: y + d + gap },
    { x: x - gap, y: y + d / 2 },
    { x: x + w + gap, y: y + d / 2 },
  ];
  return sides.find((p) => p.x >= 0 && p.x <= room.width && p.y >= 0 && p.y <= room.depth);
}

/**
 * A cardboard box centred on `point` and kept inside the room, built like a landmark so
 * it can be visited and stood on. Returns null if it would overlap anything in `existing`.
 */
export function placeBox(room, existing, point, number) {
  const { label, height, w, d, approach_gap: gap } = room.cardboard_box;
  const footprint = {
    x: clamp(point.x - w / 2, 0, room.width - w),
    y: clamp(point.y - d / 2, 0, room.depth - d),
    w,
    d,
  };
  if (existing.some((other) => overlaps(footprint, other))) return null;
  return {
    id: `box-${number}`,
    label: `${label}${number}`,
    height,
    scaffold: true,
    temporary: true,
    ...footprint,
    approach: approachPoint(room, footprint, gap),
  };
}
