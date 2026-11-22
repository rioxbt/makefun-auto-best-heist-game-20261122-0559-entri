// The screenshot scenes behind ?shot=cover|wing|alarm|getaway. Each one loads a room, turns control
// over to a scripted route walked at the simulation's own fixed step, and uses the real tools where
// the route says to: the frame that comes out is a real state of the game, not a pose, and the same
// seed always reproduces it. main.js paints whatever screen stageShot reports.
import { STEP } from './config.js';
import { centerOf } from './geometry.js';
import { beginRoom, loadRoom, selectTool, step, useToolAt, STATUS_CAUGHT, STATUS_CLEAR, STATUS_PLAY } from './sim.js';
import { SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_PLAY } from './hud.js';

/** How a leg of a route is walked: to a tile, sneaking or not, with a tool spent on arrival. */
const SCENES = {
  cover: {
    room: 1,
    stopAlarm: 0.38,
    script: [
      { to: [2, 10], sneak: false },
      { to: [16, 10], sneak: false },
      { to: [16, 12], sneak: true },
      { to: [13, 5], sneak: true, wait: 10 },
    ],
  },
  wing: {
    room: 2,
    stopAlarm: 0.99,
    script: [
      { to: [2, 12], sneak: false },
      { to: [12, 12], sneak: false },
      { tool: { id: 'smoke', aim: [12, 12] } },
      { wait: 2.0, sneak: true },
    ],
  },
  alarm: {
    room: 1,
    stopAlarm: 0.9,
    script: [
      { to: [3, 10], sneak: false },
      { to: [3, 13], sneak: false, wait: 7 },
    ],
  },
  getaway: {
    room: 0,
    stopAlarm: 0.95,
    script: [
      { to: [16, 15], sneak: true },
      { to: [26, 15], sneak: true },
      { to: [26, 3], sneak: true },
      { to: [29, 16], sneak: true, wait: 0.6 },
    ],
  },
};

function idle(world, sneak, aim) {
  const player = world.player;
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    sneak,
    aimX: aim ? aim.x : player.aimX,
    aimY: aim ? aim.y : player.aimY,
  };
}

/** True when the scene has reached the alarm level it is staged to end on. */
function atStopAlarm(world, spec) {
  return spec.stopAlarm !== undefined && world.alarm >= spec.stopAlarm;
}

/** Walk a leg. Returns true when the alarm threshold ended it early. */
function walkTo(world, to, sneak, aim, spec) {
  const target = centerOf(to[0], to[1]);
  let guard = 0;
  let lastX = world.player.x;
  let lastY = world.player.y;
  let wedged = 0;
  // A circle pushed diagonally into a pillar's corner is refused on both axes at once, so when the
  // walk stops making progress the route leads with the other axis until it is free again.
  while (world.status === STATUS_PLAY && guard < 2600) {
    const player = world.player;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (Math.hypot(dx, dy) < 13) break;
    if (Math.hypot(player.x - lastX, player.y - lastY) < 0.2) wedged += 1;
    else wedged = 0;
    lastX = player.x;
    lastY = player.y;
    let xLeads = Math.abs(dx) >= Math.abs(dy);
    if (wedged > 3) {
      xLeads = !xLeads;
      wedged = 1;
    }
    const useX = xLeads ? Math.abs(dx) > 5 : !(Math.abs(dy) > 5);
    const intent = {
      left: useX && dx < 0,
      right: useX && dx > 0,
      up: !useX && dy < 0,
      down: !useX && dy > 0,
      sneak,
      aimX: aim ? aim.x : player.aimX,
      aimY: aim ? aim.y : player.aimY,
    };
    step(world, STEP, intent);
    guard += 1;
    if (atStopAlarm(world, spec)) return true;
  }
  return false;
}

function hold(world, seconds, sneak, aim, spec) {
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames && world.status === STATUS_PLAY; i += 1) {
    step(world, STEP, idle(world, sneak, aim));
    if (atStopAlarm(world, spec)) return true;
  }
  return false;
}

/**
 * Stage a named scene in `world` and return the screen to draw over it. Unknown names fall back to
 * the cover, so a stray query string still paints a real frame.
 */
export function stageShot(name, world) {
  const spec = SCENES[name] ?? SCENES.cover;
  loadRoom(world, spec.room);
  beginRoom(world);
  for (const leg of spec.script) {
    if (world.status !== STATUS_PLAY) break;
    const aim = leg.aim ? centerOf(leg.aim[0], leg.aim[1]) : null;
    let done = false;
    if (leg.to) done = walkTo(world, leg.to, !!leg.sneak, aim, spec);
    if (world.status !== STATUS_PLAY) break;
    if (leg.tool) {
      selectTool(world, leg.tool.id);
      const point = centerOf(leg.tool.aim[0], leg.tool.aim[1]);
      useToolAt(world, point.x, point.y);
    }
    if (!done && leg.wait) done = hold(world, leg.wait, !!leg.sneak, aim, spec);
    if (done) break;
  }
  if (world.status === STATUS_CAUGHT) return SCREEN_CAUGHT;
  if (world.status === STATUS_CLEAR) return SCREEN_CLEAR;
  return SCREEN_PLAY;
}

export const SCENE_NAMES = Object.keys(SCENES);
