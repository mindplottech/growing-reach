import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, findPath, lineIsClear, routeLength } from '../sim/path.js';
import { landmarkHeight } from '../sim/room.js';
import { ledger, roomLayout, settings } from './helpers.js';

const landmarks = roomLayout.landmarks.map((l) => ({ ...l, height: landmarkHeight(ledger, l.heightOf) }));
const options = { cell: settings.path_grid_cm, clearance: settings.path_clearance_cm };
const grid = createGrid(roomLayout, landmarks, options);
const insideFurniture = ({ x, y }) => landmarks.some((l) => x > l.x && x < l.x + l.w && y > l.y && y < l.y + l.d);

function walkedPoints(from, route, step = 2) {
  const points = [];
  let here = from;
  for (const next of route) {
    const length = Math.hypot(next.x - here.x, next.y - here.y);
    for (let s = 0; s <= length; s += step) {
      const t = length === 0 ? 0 : s / length;
      points.push({ x: here.x + (next.x - here.x) * t, y: here.y + (next.y - here.y) * t });
    }
    here = next;
  }
  return points;
}

test('the grid uses the cell size and clearance from params', () => {
  assert.equal(grid.cols, Math.ceil(roomLayout.width / settings.path_grid_cm));
  assert.equal(grid.rows, Math.ceil(roomLayout.depth / settings.path_grid_cm));
  const sofa = landmarks.find(({ id }) => id === 'sofa');
  const col = Math.floor((sofa.x + sofa.w / 2) / grid.cell);
  const row = Math.floor((sofa.y + sofa.d / 2) / grid.cell);
  assert.equal(grid.blocked[row * grid.cols + col], 1);
});

test('a clear straight line is walked straight', () => {
  const from = { x: 100, y: 160 };
  const to = { x: 300, y: 170 };
  assert.ok(lineIsClear(grid, from, to));
  assert.deepEqual(findPath(grid, from, to), [to]);
});

test('a partition wall is not walked through: the way into the washroom goes round by its door', () => {
  const wall = roomLayout.walls[0];
  const from = { x: wall.x - 20, y: 100 };
  const to = { x: wall.x + wall.w + 20, y: 100 };
  assert.ok(!lineIsClear(grid, from, to));
  const route = findPath(grid, from, to);
  assert.ok(route.length > 1, 'goes round');
  assert.ok(route.some(({ y }) => y > wall.y + wall.d), 'through the gap below the wall');
});

test('routes between every pair of approach points stay out of the furniture', () => {
  for (const a of landmarks) {
    for (const b of landmarks) {
      if (a === b) continue;
      const route = findPath(grid, a.approach, b.approach);
      assert.deepEqual(route.at(-1), b.approach);
      // The approach points themselves sit beside furniture; check the walk in between.
      const middle = walkedPoints(a.approach, route).slice(5, -5);
      for (const point of middle) assert.ok(!insideFurniture(point), `${a.id}→${b.id} crosses furniture at ${point.x},${point.y}`);
    }
  }
});

test('going round furniture is longer than the straight line, and the same every time', () => {
  const from = { x: 120, y: 120 };
  const to = { x: 120, y: 10 };
  const route = findPath(grid, from, to);
  assert.ok(route.length > 1, 'should go round the sofa');
  assert.ok(routeLength(from, route) > Math.hypot(to.x - from.x, to.y - from.y));
  assert.deepEqual(findPath(grid, from, to), route);
});

test('with no way round, the child walks straight to the point', () => {
  const walled = { width: 100, depth: 100 };
  const ring = [
    { x: 30, y: 30, w: 40, d: 5 }, { x: 30, y: 65, w: 40, d: 5 },
    { x: 30, y: 30, w: 5, d: 40 }, { x: 65, y: 30, w: 5, d: 40 },
  ];
  const closed = createGrid(walled, ring, { cell: 5, clearance: 0 });
  assert.deepEqual(findPath(closed, { x: 5, y: 5 }, { x: 50, y: 50 }), [{ x: 50, y: 50 }]);
});

test('a chosen room gives a free starting spot inside it, off the furniture', async () => {
  const { freeSpotIn } = await import('../sim/path.js');
  const { roomLayout, settings } = await import('./helpers.js');
  for (const area of roomLayout.rooms) {
    const spot = freeSpotIn(roomLayout, roomLayout.landmarks, area, { cell: settings.path_grid_cm, clearance: settings.path_clearance_cm });
    assert.ok(spot, area.id);
    assert.ok(spot.x > area.x && spot.x < area.x + area.w && spot.y > area.y && spot.y < area.y + area.d, area.id);
    for (const item of roomLayout.landmarks) {
      assert.ok(!(spot.x > item.x && spot.x < item.x + item.w && spot.y > item.y && spot.y < item.y + item.d), `${area.id} in ${item.id}`);
    }
  }
});
