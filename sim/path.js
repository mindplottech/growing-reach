// Walking routes around furniture: a grid over the floor, A* through the free cells, and the
// route straightened wherever a straight line stays clear. Deterministic: the same room and the
// same two points always give the same route.

const DIAGONAL = Math.SQRT2;
const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL],
];

/** The floor as cells of `cell` cm; a cell is blocked if furniture, widened by `clearance`, covers its centre. */
export function createGrid(room, landmarks, { cell, clearance }) {
  const cols = Math.ceil(room.width / cell);
  const rows = Math.ceil(room.depth / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * cell;
      const y = (row + 0.5) * cell;
      const covered = landmarks.some((item) => x > item.x - clearance && x < item.x + item.w + clearance
        && y > item.y - clearance && y < item.y + item.d + clearance)
        // Partition walls block too, with half the clearance so a door's gap stays open.
        || (room.walls ?? []).some((wall) => x > wall.x - clearance / 2 && x < wall.x + wall.w + clearance / 2
          && y > wall.y - clearance / 2 && y < wall.y + wall.d + clearance / 2);
      if (covered) blocked[row * cols + col] = 1;
    }
  }
  return { cols, rows, cell, blocked };
}

const cellOf = (grid, { x, y }) => [
  Math.min(Math.max(Math.floor(x / grid.cell), 0), grid.cols - 1),
  Math.min(Math.max(Math.floor(y / grid.cell), 0), grid.rows - 1),
];
const centreOf = (grid, col, row) => ({ x: (col + 0.5) * grid.cell, y: (row + 0.5) * grid.cell });
const isFree = (grid, col, row) => col >= 0 && row >= 0 && col < grid.cols && row < grid.rows
  && !grid.blocked[row * grid.cols + col];

/** The nearest free cell, searching outwards ring by ring in a fixed order. */
function nearestFree(grid, [col, row]) {
  if (isFree(grid, col, row)) return [col, row];
  for (let radius = 1; radius < Math.max(grid.cols, grid.rows); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius && isFree(grid, col + dx, row + dy)) return [col + dx, row + dy];
      }
    }
  }
  return null;
}

/** True if the straight line between two points crosses no blocked cell. */
export function lineIsClear(grid, from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / (grid.cell / 2)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const [col, row] = cellOf(grid, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    if (!isFree(grid, col, row)) return false;
  }
  return true;
}

function astar(grid, start, goal) {
  const size = grid.cols * grid.rows;
  const cost = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const index = (col, row) => row * grid.cols + col;
  const [goalCol, goalRow] = goal;
  const estimate = (col, row) => {
    const dx = Math.abs(col - goalCol);
    const dy = Math.abs(row - goalRow);
    return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy);
  };
  // A small binary heap ordered by estimated total, then by insertion, so ties break the same way every time.
  const heap = [];
  let order = 0;
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (entry) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!less(heap[i], heap[up])) break;
      [heap[i], heap[up]] = [heap[up], heap[i]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let best = i;
        if (left < heap.length && less(heap[left], heap[best])) best = left;
        if (right < heap.length && less(heap[right], heap[best])) best = right;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top;
  };

  const startIndex = index(...start);
  cost[startIndex] = 0;
  push([estimate(...start), order++, startIndex]);
  while (heap.length > 0) {
    const [, , current] = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const col = current % grid.cols;
    const row = (current - col) / grid.cols;
    if (col === goalCol && row === goalRow) break;
    for (const [dx, dy, step] of NEIGHBOURS) {
      const nextCol = col + dx;
      const nextRow = row + dy;
      if (!isFree(grid, nextCol, nextRow)) continue;
      // No cutting a corner between two blocked cells.
      if (dx !== 0 && dy !== 0 && (!isFree(grid, col + dx, row) || !isFree(grid, col, row + dy))) continue;
      const next = index(nextCol, nextRow);
      const through = cost[current] + step;
      if (through < cost[next]) {
        cost[next] = through;
        parent[next] = current;
        push([through + estimate(nextCol, nextRow), order++, next]);
      }
    }
  }
  const goalIndex = index(goalCol, goalRow);
  if (!closed[goalIndex]) return null;
  const cells = [];
  for (let at = goalIndex; at !== -1; at = parent[at]) cells.push(at);
  return cells.reverse().map((at) => centreOf(grid, at % grid.cols, Math.floor(at / grid.cols)));
}

/**
 * The points to walk through from `from` to `to`, ending exactly at `to`. A straight line is
 * used when it is clear; with no way round, the child walks straight there.
 */
export function findPath(grid, from, to) {
  if (lineIsClear(grid, from, to)) return [{ ...to }];
  const start = nearestFree(grid, cellOf(grid, from));
  const goal = nearestFree(grid, cellOf(grid, to));
  const cells = start && goal ? astar(grid, start, goal) : null;
  if (!cells) return [{ ...to }];
  const points = [...cells, { ...to }];
  const route = [];
  let here = from;
  let i = 0;
  while (i < points.length) {
    let far = i;
    for (let j = points.length - 1; j > i; j -= 1) {
      if (lineIsClear(grid, here, points[j])) {
        far = j;
        break;
      }
    }
    route.push(points[far]);
    here = points[far];
    i = far + 1;
  }
  return route;
}

/** Total length of walking `route` starting at `from`. */
export function routeLength(from, route) {
  let length = 0;
  let here = from;
  for (const point of route) {
    length += Math.hypot(point.x - here.x, point.y - here.y);
    here = point;
  }
  return length;
}

/**
 * A free spot inside one area of the room (a room of the house), nearest its middle: where the
 * child starts when that room is chosen. Uses the same grid as the routes. Null if none.
 */
export function freeSpotIn(room, landmarks, area, { cell, clearance }) {
  const grid = createGrid(room, landmarks, { cell, clearance });
  const inside = (col, row) => {
    const { x, y } = centreOf(grid, col, row);
    return x > area.x + clearance && x < area.x + area.w - clearance && y > area.y + clearance && y < area.y + area.d - clearance;
  };
  const [col0, row0] = cellOf(grid, { x: area.x + area.w / 2, y: area.y + area.d / 2 });
  for (let radius = 0; radius < Math.max(grid.cols, grid.rows); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const col = col0 + dx;
        const row = row0 + dy;
        if (isFree(grid, col, row) && inside(col, row)) return centreOf(grid, col, row);
      }
    }
  }
  return null;
}
