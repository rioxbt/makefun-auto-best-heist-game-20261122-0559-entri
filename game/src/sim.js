// The rules of the job, with no drawing and no browser in it: the room, the thief, the eyes and the
// tools, stepped forward a fixed 1/60 s at a time. step() returns what happened as bit flags, so the
// loop outside can react (sound, screens) without the simulation knowing about either.
//
// The one number that decides the run is the alarm meter. Every guard and camera that has you in
// sight or is hunting you feeds it; the moment it reads full the room is blown. Clear the room by
// taking every piece of loot and walking out through the extraction zone with the meter as low as
// you can keep it: the lower it stands when you leave, and the fewer charges you spent, the more the
// take pays.
import { ALARM, CAMERA, SCORE, STEP, TOOL_ORDER } from './config.js';
import { buildLevel, LEVELS } from './level.js';
import { clamp, dist, pointInRect } from './geometry.js';
import { createCamera, createGuard, hearPulse, STATE_ALERT, updateCamera, updateGuard } from './guards.js';
import { createPlayer, updatePlayer } from './player.js';
import { updateTools, useTool } from './tools.js';

export const EVENT_LOOT = 1;
export const EVENT_ALERT = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_CLEAR = 8;
export const EVENT_TOOL = 16;

export const STATUS_BRIEF = 'brief';
export const STATUS_PLAY = 'play';
export const STATUS_CAUGHT = 'caught';
export const STATUS_CLEAR = 'clear';

/** Load one room of the job into the world, in its opening state (the briefing screen). */
export function loadRoom(world, index) {
  const level = buildLevel(LEVELS[index % LEVELS.length]);
  world.levelIndex = index;
  world.level = level;
  world.player = createPlayer(level);
  world.guards = level.def.guards.map((definition) => createGuard(level, definition));
  world.cameras = level.def.cameras.map((definition) => createCamera(level, definition));
  if (world.random) {
    for (const camera of world.cameras) camera.sweep = world.random();
    for (const guard of world.guards) guard.wait = world.random() * 0.6;
  }
  world.clouds = [];
  world.puffs = [];
  world.effects = [];
  world.alarm = 0;
  world.alarmPeak = 0;
  world.time = 0;
  world.lootTaken = 0;
  world.lootTotal = level.loot.length;
  world.toolCounts = { ...level.tools };
  world.selectedTool = TOOL_ORDER.find((id) => (world.toolCounts[id] ?? 0) > 0) ?? 'emp';
  world.status = STATUS_BRIEF;
  world.notice = null;
  world.score = null;
  world.stepCount = 0;
}

export function createWorld(random, levelIndex = 0) {
  const world = {
    random,
    status: STATUS_BRIEF,
    run: { score: 0, time: 0, loot: 0, tools: 0, rooms: 0, blown: 0 },
    best: 0,
  };
  loadRoom(world, levelIndex);
  return world;
}

/** Leave the briefing and take control. */
export function beginRoom(world) {
  world.status = STATUS_PLAY;
  world.time = 0;
}

/** Advance to the next room, or wrap to the first when the job is done. */
export function nextRoom(world) {
  loadRoom(world, world.levelIndex + 1);
}

export function useToolAt(world, x, y) {
  return useTool(world, x, y);
}

export function selectTool(world, id) {
  if (world.toolCounts[id] === undefined) return false;
  world.selectedTool = id;
  return true;
}

function notice(world, text) {
  world.notice = { text, life: 1.6 };
}

/** The take of one room: loot, quiet, speed, the clear fee and what the charges cost. */
function scoreRoom(world) {
  const lootValue = world.level.loot.reduce((sum, item) => sum + item.value, 0);
  const quiet = 1 - clamp(world.alarm, 0, 1);
  const stealth = Math.round(SCORE.stealthBonus * quiet);
  const timeBonus = Math.min(SCORE.timeBonusMax, Math.max(0, Math.round((SCORE.timePar - world.time) * 10)));
  const clearBonus = SCORE.clearBonus;
  const spent = world.level.loot.length * 0 + usedCharges(world);
  const toolPenalty = spent * SCORE.toolPenalty;
  const total = Math.max(0, lootValue + stealth + timeBonus + clearBonus - toolPenalty);
  return { lootValue, stealth, timeBonus, clearBonus, toolPenalty, spent, total, seconds: world.time, alarm: world.alarm };
}

function usedCharges(world) {
  return Object.keys(world.toolCounts).reduce((sum, id) => sum + (world.level.tools[id] ?? 0) - Math.max(0, world.toolCounts[id]), 0);
}

/**
 * One fixed step of the job. `intent` is the held input for this step: {left, right, up, down,
 * sneak, aimX, aimY}. Returns the step's events as EVENT_* flags.
 */
export function step(world, dt, intent) {
  if (world.status !== STATUS_PLAY) return 0;
  let events = 0;
  world.time += dt;
  world.stepCount += 1;

  const level = world.level;
  const player = world.player;
  const previousAlarm = world.alarm;

  updatePlayer(level, player, dt, intent);

  if (player.noisePulse) {
    for (const guard of world.guards) hearPulse(guard, player.x, player.y, player.noiseRadius);
  }

  for (const item of level.loot) {
    if (item.taken) continue;
    if (dist(player.x, player.y, item.x, item.y) < 30) {
      item.taken = true;
      world.lootTaken += 1;
      events |= EVENT_LOOT;
      world.effects.push({ kind: 'loot', x: item.x, y: item.y, age: 0, life: 0.6, name: item.name });
      notice(world, `${item.name.toUpperCase()}  +${item.value}`);
    }
  }

  let exposure = 0;
  for (const guard of world.guards) {
    const wasAlert = guard.state === STATE_ALERT;
    updateGuard(level, guard, dt, world);
    exposure += guard.exposure + (guard.state === STATE_ALERT ? 0.28 : 0);
    if (!wasAlert && guard.state === STATE_ALERT) events |= EVENT_ALERT;
  }
  for (const camera of world.cameras) {
    updateCamera(level, camera, dt, world);
    exposure += camera.exposure;
  }
  exposure = Math.min(exposure, 1.8);

  if (exposure > 0.001) world.alarm = Math.min(1.05, world.alarm + dt * 0.62 * ALARM.gainScale * exposure);
  else world.alarm = Math.max(0, world.alarm - dt * ALARM.decay);
  world.alarmPeak = Math.max(world.alarmPeak, world.alarm);

  updateTools(world, dt);
  if (world.notice) {
    world.notice.life -= dt;
    if (world.notice.life <= 0) world.notice = null;
  }

  if (world.alarm >= ALARM.caughtAt) {
    world.status = STATUS_CAUGHT;
    world.run.blown += 1;
    events |= EVENT_CAUGHT;
    return events;
  }

  if (world.lootTaken >= world.lootTotal && pointInRect(player.x, player.y, level.extract)) {
    world.status = STATUS_CLEAR;
    world.score = scoreRoom(world);
    if (world.score.alarm > previousAlarm) world.score.alarm = world.alarm;
    world.run.score += world.score.total;
    world.run.time += world.time;
    world.run.loot += world.lootTaken;
    world.run.rooms += 1;
    events |= EVENT_CLEAR;
  }
  return events;
}
