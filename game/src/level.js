// The three rooms of the job and the code that turns a room's text plan into runtime geometry.
//
// A plan is ROWS strings of COLS characters: '#' a wall, 'c' a crate, 'p' a pillar, 'v' a vault
// safe, '.' open floor. Walls crush against movement and stop sight and gunfire of the eye alike;
// crates, pillars and safes are cover you can break the line of sight with. Everything the thief
// wants and everything that watches him sits in the lists beside the plan, in tile coordinates.
//
//   guards   waypoints the guard walks, in order, then loops; its cone follows its heading
//   cameras  a mount tile and the arc its lens sweeps between, forever, both ways
//   loot     the take: a name, a value and where it sits
//   start    where the thief enters; extract where the van waits
//
// buildLevel() checks the plan's shape, collects the solid tiles into the rect list the collision
// and line-of-sight tests use, and resolves the tile coordinates to pixels.
import { COLS, PLAYER, ROWS, TILE } from './config.js';
import { centerOf, circleRectHit, clamp, segmentCircleHit, segmentRectHit } from './geometry.js';

const SOLID = { '#': 'wall', c: 'crate', p: 'pillar', v: 'vault' };

/** The Atrium: one hall, one camera, one guard and two coins in the fountain. Teaches the read. */
const ATRIUM = {
  name: 'THE ATRIUM',
  subtitle: 'Room 1 of 3',
  brief: 'Slip the coin and the deed out from under the night guard.',
  tools: { emp: 1, smoke: 1 },
  grid: [
    '################################',
    '#..............................#',
    '#..pp....c........c....pp......#',
    '#..pp...................pp.....#',
    '#..............................#',
    '#....c..............c..........#',
    '#.........pp...pp..............#',
    '#.........pp...pp.......c......#',
    '#..............................#',
    '#....pp................pp......#',
    '#....pp................pp......#',
    '#.........c........c...........#',
    '#..............................#',
    '#....pp..........pp............#',
    '#....pp..........pp............#',
    '#..............................#',
    '#..............................#',
    '################################',
  ],
  guards: [{ path: [[8, 4], [22, 4], [22, 12], [8, 12]] }],
  cameras: [{ at: [2, 1], arc: [0.55, 1.15], period: 6.0 }],
  loot: [
    { at: [26, 3], name: 'The Night Coin', value: 500 },
    { at: [16, 15], name: 'Bearer Deed', value: 400 },
  ],
  start: [2, 16],
  extract: [29, 16],
};

/** The Vault Floor: three corridors joined at the waist. Read the two lenses before you commit. */
const VAULT_FLOOR = {
  name: 'THE VAULT FLOOR',
  subtitle: 'Room 2 of 3',
  brief: 'Three corridors, two lenses, one take. Pick your line and keep the cones off your back.',
  tools: { emp: 2, smoke: 2 },
  grid: [
    '################################',
    '#......#...........#...........#',
    '#...c..#...........#...........#',
    '#......#..c.....c..#....pp.....#',
    '#......#...........#...........#',
    '#....c.#...........#......c....#',
    '#......#...........#...........#',
    '#......#...........#...........#',
    '#......#....pp.....#...........#',
    '#..............................#',
    '#..............................#',
    '#......#...........#...........#',
    '#......#...........#...........#',
    '#......#....pp.....#....cc.....#',
    '#......#...........#...........#',
    '#......#...........#...........#',
    '#......#...........#...........#',
    '################################',
  ],
  guards: [
    { path: [[3, 3], [3, 14]] },
    { path: [[22, 4], [27, 4], [27, 14], [22, 14], [22, 3]] },
  ],
  cameras: [
    { at: [13, 1], arc: [1.34, 1.80], period: 5.2 },
    { at: [25, 16], arc: [4.40, 5.02], period: 4.6 },
  ],
  loot: [
    { at: [3, 8], name: 'Gold Bonds', value: 500 },
    { at: [16, 12], name: 'The Emerald Ledger', value: 800 },
    { at: [27, 8], name: 'Bearer Bonds', value: 500 },
  ],
  start: [2, 15],
  extract: [29, 9],
};

/** The Executive Wing: a locked vault in a walled room, ringed by patrols. The getaway room. */
const EXECUTIVE_WING = {
  name: 'THE EXECUTIVE WING',
  subtitle: 'Room 3 of 3',
  brief: 'The vault sits in the middle of the floor plan and everyone walks a ring around it.',
  tools: { emp: 2, smoke: 2 },
  grid: [
    '################################',
    '#..............................#',
    '#...c......................c...#',
    '#..pp......................pp..#',
    '#..............................#',
    '#.......pp...##########...pp...#',
    '#............#........#........#',
    '#............#........#........#',
    '#.....c......#........#......c.#',
    '#.....................#........#',
    '#............#..vv....#........#',
    '#............#........#........#',
    '#............##########........#',
    '#..............................#',
    '#..c.......................c...#',
    '#......pp............pp........#',
    '#..............................#',
    '################################',
  ],
  guards: [
    { path: [[5, 3], [25, 3], [25, 13], [5, 13]] },
    { path: [[9, 6], [11, 6], [11, 11], [9, 11]] },
    { path: [[14, 8], [19, 8], [19, 11], [14, 11]] },
  ],
  cameras: [
    { at: [1, 1], arc: [0.55, 1.15], period: 4.4 },
    { at: [30, 1], arc: [2.00, 2.60], period: 5.6 },
  ],
  loot: [
    { at: [15, 10], name: 'The Sable Diamond', value: 1200 },
    { at: [4, 15], name: 'Petty Cash', value: 300 },
    { at: [28, 4], name: 'Master Keys', value: 400 },
  ],
  start: [2, 15],
  extract: [29, 15],
};

export const LEVELS = [ATRIUM, VAULT_FLOOR, EXECUTIVE_WING];

/** Turn one plan into the runtime room: solid rects, pixel positions and the entity definitions. */
export function buildLevel(def) {
  if (def.grid.length !== ROWS) throw new Error(`${def.name}: ${def.grid.length} rows, expected ${ROWS}`);
  const solids = [];
  for (let row = 0; row < def.grid.length; row += 1) {
    const line = def.grid[row];
    if (line.length !== COLS) throw new Error(`${def.name}: row ${row} is ${line.length} wide, expected ${COLS}`);
    for (let col = 0; col < COLS; col += 1) {
      const kind = SOLID[line[col]];
      if (kind === undefined) continue;
      const rect = { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
      solids.push({ kind, rect, col, row });
    }
  }
  const start = centerOf(def.start[0], def.start[1]);
  const extract = { x: def.extract[0] * TILE, y: def.extract[1] * TILE, w: TILE, h: TILE };
  return {
    def,
    name: def.name,
    subtitle: def.subtitle,
    brief: def.brief,
    tools: { ...def.tools },
    grid: def.grid.map((line) => line.split('')),
    solids,
    start: { x: start.x, y: start.y },
    extract,
    extractPoint: { x: extract.x + TILE / 2, y: extract.y + TILE / 2 },
    loot: def.loot.map((item) => ({ ...centerOf(item.at[0], item.at[1]), name: item.name, value: item.value, taken: false })),
  };
}

/** True when a circle at (x, y) overlaps any solid tile of the room. */
export function hitsSolid(level, x, y, radius) {
  const solids = level.solids;
  for (let i = 0; i < solids.length; i += 1) {
    if (circleRectHit(x, y, radius, solids[i].rect)) return true;
  }
  return false;
}

/**
 * Move a circle by (dx, dy), one axis at a time, so a blocked step slides along a wall instead of
 * stopping dead. Returns the resolved position.
 */
export function moveCircle(level, x, y, radius, dx, dy) {
  let nx = x;
  let ny = y;
  if (dx !== 0 && !hitsSolid(level, x + dx, y, radius)) nx = x + dx;
  if (dy !== 0 && !hitsSolid(level, nx, y + dy, radius)) ny = y + dy;
  nx = clamp(nx, radius, level.def.grid[0].length * TILE - radius);
  ny = clamp(ny, radius, level.def.grid.length * TILE - radius);
  return { x: nx, y: ny };
}

/** True when the segment from a to b is broken by a solid tile or a puff of smoke. */
export function blocked(level, ax, ay, bx, by, clouds) {
  const solids = level.solids;
  for (let i = 0; i < solids.length; i += 1) {
    if (segmentRectHit(ax, ay, bx, by, solids[i].rect)) return true;
  }
  for (let i = 0; i < clouds.length; i += 1) {
    const cloud = clouds[i];
    if (segmentCircleHit(ax, ay, bx, by, cloud.x, cloud.y, cloud.radius)) return true;
  }
  return false;
}

/** Re-exported for callers that only import the level module. */
export const moveRadius = PLAYER.radius;
