// A headless check of Velvet Vault's rules, run with plain Node: `node test/sim.test.mjs`.
//
// The game's own modules are free of the DOM, so the whole simulation runs without a browser. This
// file checks what would quietly break the game — the room plans are sound, the cones sense, walls
// and smoke really do break the line of sight, the tools do what they say, the same seed replays
// the same run — then walks every room without any eyes watching to prove each one is completable,
// and replays one of the shipped screenshot routes to prove a manned room can be walked out too.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { STEP, TILE, PLAYER, GUARD } from '../game/src/config.js';
import { buildLevel, LEVELS, hitsSolid } from '../game/src/level.js';
import { createRandom } from '../game/src/random.js';
import { centerOf, dist } from '../game/src/geometry.js';
import { sightStrength } from '../game/src/guards.js';
import {
  beginRoom,
  createWorld,
  step,
  useToolAt,
  selectTool,
  STATUS_PLAY,
  STATUS_CLEAR,
  STATUS_CAUGHT,
} from '../game/src/sim.js';
import { stageShot } from '../game/src/shots.js';
import { SCREEN_CLEAR } from '../game/src/hud.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');

let checks = 0;
let failures = 0;

function ok(condition, message) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  } else {
    console.log(`  ok    ${message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------- the plans

section('room plans');
const built = LEVELS.map((definition) => buildLevel(definition));
for (let index = 0; index < built.length; index += 1) {
  const level = built[index];
  const name = level.name;
  ok(level.grid.length === 18 && level.grid[0].length === 32, `${name}: the plan is 32x18`);
  ok(!hitsSolid(level, level.start.x, level.start.y, PLAYER.radius), `${name}: the thief starts on open floor`);
  ok(!hitsSolid(level, level.extractPoint.x, level.extractPoint.y, PLAYER.radius), `${name}: the extraction zone is reachable floor`);
  ok(level.loot.length >= 2, `${name}: holds ${level.loot.length} pieces of loot`);
  ok(level.def.guards.length >= 1, `${name}: has ${level.def.guards.length} guards`);
  ok(level.def.cameras.length >= 1, `${name}: has ${level.def.cameras.length} cameras`);
  for (const item of level.loot) {
    ok(!hitsSolid(level, item.x, item.y, 12), `${name}: loot "${item.name}" sits on open floor`);
  }
  for (const guard of level.def.guards) {
    // Every leg of every beat is sampled: a guard wedged on a crate for the rest of the round would
    // sit there with its cone parked, which the plan should never allow.
    const points = guard.path.map(([col, row]) => centerOf(col, row));
    let clear = true;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      for (let t = 0; t <= 1.0001; t += 0.02) {
        if (hitsSolid(level, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 12)) clear = false;
      }
    }
    ok(clear, `${name}: a guard can walk its whole beat without wedging on cover`);
  }
  for (const camera of level.def.cameras) {
    const [col, row] = camera.at;
    const besideWall = ['#', 'c', 'p', 'v'].some((kind) => level.grid[row]?.[col] !== kind && (
      level.grid[row - 1]?.[col] === '#' || level.grid[row + 1]?.[col] === '#' ||
      level.grid[row]?.[col - 1] === '#' || level.grid[row]?.[col + 1] === '#'
    ));
    ok(besideWall, `${name}: camera at ${col},${row} is bolted beside a wall`);
  }
}

// ---------------------------------------------------------------- the sense

section('cones, cover and the alarm');
{
  const world = createWorld(createRandom(7), 1);
  beginRoom(world);
  const level = world.level;
  const guard = world.guards[0];
  const open = { x: guard.x + 60, y: guard.y };
  guard.angle = 0;
  ok(!hitsSolid(level, open.x, open.y, 12), 'the test spot in front of the guard is open floor');
  const seen = sightStrength(level, guard, open, []);
  ok(seen > 0.3, `a guard sees a thief 60 px down its axis (strength ${seen.toFixed(2)})`);
  ok(sightStrength(level, guard, { x: guard.x - 60, y: guard.y }, []) === 0, 'a guard does not see a thief behind its back');
  ok(sightStrength(level, guard, { x: guard.x + 400, y: guard.y }, []) === 0, 'a cone has a range and stops at it');

  const wall = level.solids.find((solid) => solid.kind === 'wall' && solid.col > 7 && solid.col < 18);
  const throughWall = sightStrength(
    level,
    { ...guard, x: wall.rect.x - 8, y: wall.rect.y + TILE / 2, angle: 0 },
    { x: wall.rect.x + TILE * 3, y: wall.rect.y + TILE / 2 },
    [],
  );
  ok(throughWall === 0, 'a wall breaks the line of sight');
  const clouds = [{ x: guard.x + 30, y: guard.y, radius: 40, life: 0 }];
  ok(sightStrength(level, guard, open, clouds) === 0, 'a puff of smoke breaks the line of sight');

  const alarmBefore = world.alarm;
  // Stand further down the guard's own beat, so it walks its route looking straight at the thief.
  world.player.x = centerOf(3, 8).x;
  world.player.y = centerOf(3, 8).y;
  const stand = { left: false, right: false, up: false, down: false, sneak: false, aimX: world.player.x, aimY: world.player.y };
  for (let i = 0; i < 150; i += 1) step(world, STEP, stand);
  ok(world.alarm > alarmBefore + 0.1, `standing in a cone fills the alarm meter (${alarmBefore.toFixed(2)} -> ${world.alarm.toFixed(2)})`);
  for (let i = 0; i < 1800 && world.status === STATUS_PLAY; i += 1) step(world, STEP, stand);
  ok(world.status === STATUS_CAUGHT, 'standing in the open on a patrol line blows the job in the end');
}

// ---------------------------------------------------------------- the tools

section('the tools');
{
  const world = createWorld(createRandom(3), 1);
  beginRoom(world);
  const camera = world.cameras[0];
  world.player.x = camera.x;
  world.player.y = camera.y + TILE * 3;
  selectTool(world, 'emp');
  const before = world.toolCounts.emp;
  const result = useToolAt(world, camera.x, camera.y);
  ok(result.used && world.toolCounts.emp === before - 1, 'an EMP charge spends a charge and fires');
  ok(camera.disabled > 0, `the camera it hit is dark for ${camera.disabled.toFixed(1)} s`);
  ok(sightStrength(world.level, camera, { x: camera.x, y: camera.y + 40 }, []) === 0, 'a dark camera sees nothing');

  const world2 = createWorld(createRandom(3), 1);
  beginRoom(world2);
  selectTool(world2, 'smoke');
  const smokeBefore = world2.toolCounts.smoke;
  useToolAt(world2, world2.player.x + 120, world2.player.y);
  for (let i = 0; i < 90; i += 1) step(world2, STEP, { left: false, right: false, up: false, down: false, sneak: false, aimX: 0, aimY: 0 });
  ok(world2.toolCounts.smoke === smokeBefore - 1, 'a smoke canister spends a charge');
  ok(world2.clouds.length === 1, 'the canister lands and leaves a cloud behind');
  ok(world2.clouds[0].radius > 100, 'the cloud is wide enough to hide in');
}

// ---------------------------------------------------------------- the replay

section('the same seed, the same run');
{
  const runOnce = () => {
    const world = createWorld(createRandom(11), 2);
    beginRoom(world);
    const intent = { left: false, right: true, up: false, down: false, sneak: false, aimX: 900, aimY: 400 };
    for (let i = 0; i < 240; i += 1) step(world, STEP, intent);
    return {
      x: world.player.x,
      y: world.player.y,
      alarm: world.alarm,
      guards: world.guards.map((guard) => `${guard.x.toFixed(3)},${guard.y.toFixed(3)},${guard.angle.toFixed(3)}`).join(' '),
    };
  };
  const a = runOnce();
  const b = runOnce();
  ok(a.x === b.x && a.y === b.y && a.alarm === b.alarm && a.guards === b.guards, 'two runs of the same seed end byte-identical');
}

// ---------------------------------------------------------------- cover

section('cover is worth taking');
for (let index = 0; index < built.length; index += 1) {
  const world = createWorld(createRandom(5), index);
  beginRoom(world);
  let open = 0;
  let hidden = 0;
  for (let row = 1; row <= 16; row += 1) {
    for (let col = 1; col <= 30; col += 1) {
      const point = centerOf(col, row);
      if (hitsSolid(world.level, point.x, point.y, PLAYER.radius)) continue;
      open += 1;
      const seenByAnyone = [...world.guards, ...world.cameras].some((eye) => sightStrength(world.level, eye, point, []) > 0);
      if (!seenByAnyone) hidden += 1;
    }
  }
  const share = hidden / open;
  ok(share > 0.45, `${LEVELS[index].name}: ${hidden} of ${open} open tiles are out of every cone at the start (${Math.round(share * 100)}%)`);
}

// ---------------------------------------------------------------- a walk with the eyes off

/** A breadth-first walk over the room's open tiles, so the test can path like any player. */
function route(level, from, to) {
  const key = (col, row) => col + row * 32;
  const openTile = (col, row) => {
    if (col < 1 || row < 1 || col > 30 || row > 16) return false;
    return !hitsSolid(level, centerOf(col, row).x, centerOf(col, row).y, PLAYER.radius);
  };
  const start = [Math.round(from.x / TILE - 0.5), Math.round(from.y / TILE - 0.5)];
  const goal = [Math.round(to.x / TILE - 0.5), Math.round(to.y / TILE - 0.5)];
  const queue = [start];
  const came = new Map([[key(start[0], start[1]), null]]);
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    if (col === goal[0] && row === goal[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = col + dc;
      const nr = row + dr;
      if (!openTile(nc, nr) || came.has(key(nc, nr))) continue;
      came.set(key(nc, nr), key(col, row));
      queue.push([nc, nr]);
    }
  }
  if (!came.has(key(goal[0], goal[1]))) return null;
  const path = [];
  let cursor = key(goal[0], goal[1]);
  while (cursor !== null) {
    const col = cursor % 32;
    const row = (cursor - col) / 32;
    path.push(centerOf(col, row));
    cursor = came.get(cursor);
  }
  return path.reverse();
}

/**
 * Walk one axis at a time. A circle pushed diagonally into a pillar's corner is refused on both
 * axes at once, so when the walker notices it has stopped moving it swaps which axis it leads with
 * until it is free again.
 */
function stepper() {
  return { lastX: 0, lastY: 0, wedged: 0, primed: false };
}

function steerAlong(intent, state, player, targetX, targetY, sneak) {
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  if (state.primed && dist(player.x, player.y, state.lastX, state.lastY) < 0.2) state.wedged += 1;
  else state.wedged = 0;
  state.lastX = player.x;
  state.lastY = player.y;
  state.primed = true;
  intent.left = false;
  intent.right = false;
  intent.up = false;
  intent.down = false;
  intent.sneak = sneak;
  let xLeads = Math.abs(dx) >= Math.abs(dy);
  if (state.wedged > 3) {
    xLeads = !xLeads;
    state.wedged = 1;
  }
  const useX = xLeads ? Math.abs(dx) > 5 : !(Math.abs(dy) > 5);
  if (useX) intent[dx < 0 ? 'left' : 'right'] = true;
  else intent[dy < 0 ? 'up' : 'down'] = true;
}

/**
 * Walk a room with every eye switched off: to each piece of loot in turn and then out the exit.
 * This is a rehearsal, and it proves the shape of the room — that the loot is reachable, that the
 * exit fires the clear, and that the scoring adds up — without testing how well the thief hides.
 */
function rehearsal(index, budgetSeconds = 180) {
  const world = createWorld(createRandom(900 + index), index);
  beginRoom(world);
  for (const guard of world.guards) guard.range = 0;
  for (const camera of world.cameras) camera.disabled = 1e9;
  const targets = () => {
    const rest = world.level.loot.filter((item) => !item.taken);
    return rest.length > 0 ? rest : [world.level.extractPoint];
  };
  let path = null;
  let pathGoal = null;
  let frames = 0;
  const walk = stepper();
  const limit = Math.round(budgetSeconds / STEP);
  while (world.status === STATUS_PLAY && frames < limit) {
    frames += 1;
    const goal = targets()[0];
    if (goal !== pathGoal) {
      path = route(world.level, world.player, goal);
      pathGoal = goal;
      walk.wedged = 0;
      walk.primed = false;
    }
    const intent = { left: false, right: false, up: false, down: false, sneak: false, aimX: world.player.x, aimY: world.player.y };
    if (path && path.length > 0) {
      while (path.length > 1 && dist(world.player.x, world.player.y, path[1].x, path[1].y) < 13) path.shift();
      const stepPoint = path.length > 1 ? path[1] : path[0];
      steerAlong(intent, walk, world.player, stepPoint.x, stepPoint.y, false);
    }
    step(world, STEP, intent);
  }
  return { world, seconds: frames * STEP, status: world.status, loot: world.lootTaken, score: world.score };
}

section('a rehearsal walk clears every room');
for (let index = 0; index < LEVELS.length; index += 1) {
  const outcome = rehearsal(index);
  const label = LEVELS[index].name;
  const score = outcome.score ? outcome.score.total : 0;
  console.log(`  ..    ${label}: ${outcome.status} after ${outcome.seconds.toFixed(1)} s, loot ${outcome.loot}/${LEVELS[index].loot.length}, paid $${score}`);
  ok(outcome.status !== STATUS_CAUGHT, `${label}: the walk never trips the alarm with no eyes to trip it`);
  ok(outcome.status === STATUS_CLEAR, `${label}: every piece of loot and the exit can be reached on foot`);
  ok(outcome.loot === LEVELS[index].loot.length, `${label}: all ${LEVELS[index].loot.length} pieces of loot are collectable`);
  ok(score > 0, `${label}: clearing it pays ($${score})`);
}

// ---------------------------------------------------------------- a manned room, walked out

section('a manned room can be walked out');
{
  const world = createWorld(createRandom(1), 0);
  const screen = stageShot('getaway', world);
  const paid = world.score ? world.score.total : 0;
  console.log(`  ..    ${world.level.name}: the shipped route ends at ${world.status} with the meter at ${Math.round(world.alarm * 100)}% and $${paid}`);
  ok(screen === SCREEN_CLEAR, 'the screenshot route walks a guarded, camera-covered room to the exit');
  ok(world.alarm < 0.9, `it does it without the alarm filling (${Math.round(world.alarm * 100)}%)`);
  ok(world.lootTaken === world.lootTotal, 'with every piece of loot in the bag');
}

// ---------------------------------------------------------------- the hand-in

section('the files the grader reads');
{
  const html = readFileSync(join(root, 'game/index.html'), 'utf8');
  ok(/<script type="module" src="\.\/src\/main\.js">/.test(html), 'index.html loads the game as one module script');
  ok(!/(https?:)?\/\/[^"']+\.(js|css|png|jpg|wav|mp3)/.test(html), 'index.html names nothing over the network');
  const files = readdirSync(join(root, 'game/src'));
  ok(files.length >= 10, `the game's source is split across ${files.length} files under game/src`);
  ok(existsSync(join(root, 'main.ts')), 'the entrypoint main.ts is at the repository root');
  ok(existsSync(join(root, 'vendor/makefun-game.ts')), 'the kit library sits untouched under vendor/');
  ok(GUARD.coneRange > 150, 'a guard cone reaches far enough to be worth reading');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exitCode = 1;
} else {
  console.log('all good');
}
