import { FIELD_HEIGHT, FIELD_WIDTH } from "./data.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function rollDie(rng = Math.random) {
  return 1 + Math.floor(rng() * 6);
}

export function cellKey(x, y) {
  return `${x}:${y}`;
}

export function parseCellKey(key) {
  const [x, y] = key.split(":").map(Number);
  return { x, y };
}

export function inBounds(x, y) {
  return x >= 0 && x < FIELD_WIDTH && y >= 0 && y < FIELD_HEIGHT;
}

export function createEmptyBoard() {
  return Array.from({ length: FIELD_HEIGHT }, () =>
    Array.from({ length: FIELD_WIDTH }, () => null),
  );
}

export function orthogonalNeighbors(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((cell) => inBounds(cell.x, cell.y));
}

export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function bresenhamLine(from, to) {
  const cells = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    cells.push({ x: x0, y: y0 });
  }

  return cells;
}

export function shortestPathLength(start, canVisit, isGoal) {
  const queue = [{ ...start, steps: 0 }];
  const seen = new Set([cellKey(start.x, start.y)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (isGoal(current)) {
      return current.steps;
    }

    for (const next of orthogonalNeighbors(current.x, current.y)) {
      const key = cellKey(next.x, next.y);
      if (seen.has(key) || !canVisit(next)) {
        continue;
      }
      seen.add(key);
      queue.push({ ...next, steps: current.steps + 1 });
    }
  }

  return null;
}

export function reachableCells(start, maxSteps, canVisit) {
  const queue = [{ ...start, steps: 0 }];
  const seen = new Map([[cellKey(start.x, start.y), 0]]);
  const results = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.steps > 0) {
      results.push({ x: current.x, y: current.y, steps: current.steps });
    }
    for (const next of orthogonalNeighbors(current.x, current.y)) {
      const nextSteps = current.steps + 1;
      if (nextSteps > maxSteps) {
        continue;
      }
      const key = cellKey(next.x, next.y);
      if (!canVisit(next)) {
        continue;
      }
      const bestSeen = seen.get(key);
      if (bestSeen !== undefined && bestSeen <= nextSteps) {
        continue;
      }
      seen.set(key, nextSteps);
      queue.push({ ...next, steps: nextSteps });
    }
  }

  return results;
}

export function deepClone(value) {
  return structuredClone(value);
}

export function choose(array, size) {
  const results = [];
  const current = [];

  function step(index) {
    if (current.length === size) {
      results.push([...current]);
      return;
    }
    for (let i = index; i < array.length; i += 1) {
      current.push(array[i]);
      step(i + 1);
      current.pop();
    }
  }

  step(0);
  return results;
}
