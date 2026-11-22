// The thief's two tools and the puffs of smoke they leave behind.
//
// An EMP charge darkens the camera it is aimed at (or the nearest one the thief can reach): its
// lens stops tracking and the alarm stops leaning on it for a few seconds. A smoke canister flies
// to the cursor and bursts, and the cloud it leaves breaks line of sight for guards and cameras
// alike, which is what makes the tight corridors passable. Both cost a charge from the room's
// allowance, and a room cleared with charges to spare pays better.
import { CAMERA, EMP, SMOKE } from './config.js';
import { clamp, dist } from './geometry.js';

/** Where the cursor is, in the field's pixels; used to pick the camera to blind. */
function cameraUnderCursor(world, x, y) {
  let best = null;
  let bestD = 62;
  for (let i = 0; i < world.cameras.length; i += 1) {
    const camera = world.cameras[i];
    const d = dist(camera.x, camera.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = camera;
    }
  }
  return best;
}

/** The nearest camera that is still lit and within an EMP's reach of the thief. */
function nearestLiveCamera(world) {
  let best = null;
  let bestD = EMP.range;
  for (let i = 0; i < world.cameras.length; i += 1) {
    const camera = world.cameras[i];
    if (camera.disabled > 0) continue;
    const d = dist(world.player.x, world.player.y, camera.x, camera.y);
    if (d <= bestD) {
      bestD = d;
      best = camera;
    }
  }
  return best;
}

function fireEmp(world, targetX, targetY) {
  const camera = cameraUnderCursor(world, targetX, targetY) ?? nearestLiveCamera(world);
  const reachable = camera !== null && dist(world.player.x, world.player.y, camera.x, camera.y) <= EMP.range;
  if (!reachable) return { used: false, reason: 'no camera in reach' };
  camera.disabled = Math.max(camera.disabled, CAMERA.disabledSeconds);
  world.toolCounts.emp -= 1;
  world.effects.push({ kind: 'emp', x: camera.x, y: camera.y, age: 0, life: 0.8 });
  return { used: true, id: 'emp', at: { x: camera.x, y: camera.y } };
}

function fireSmoke(world, targetX, targetY) {
  const player = world.player;
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const length = Math.hypot(dx, dy) || 1;
  const reach = clamp(length, 24, SMOKE.throwRange);
  world.puffs.push({
    x: player.x + Math.cos(Math.atan2(dy, dx)) * 16,
    y: player.y + Math.sin(Math.atan2(dy, dx)) * 16,
    tx: player.x + (dx / length) * reach,
    ty: player.y + (dy / length) * reach,
    spin: 0,
  });
  world.toolCounts.smoke -= 1;
  return { used: true, id: 'smoke' };
}

/** Use the selected tool toward a point on the field. Returns {used, id?, reason?}. */
export function useTool(world, targetX, targetY) {
  const id = world.selectedTool;
  if ((world.toolCounts[id] ?? 0) <= 0) return { used: false, reason: 'out of charges' };
  if (world.status !== 'play') return { used: false, reason: 'not now' };
  return id === 'emp' ? fireEmp(world, targetX, targetY) : fireSmoke(world, targetX, targetY);
}

/** Fly the canisters, age the clouds and retire the effects. */
export function updateTools(world, dt) {
  for (let i = world.puffs.length - 1; i >= 0; i -= 1) {
    const puff = world.puffs[i];
    const dx = puff.tx - puff.x;
    const dy = puff.ty - puff.y;
    const d = Math.hypot(dx, dy);
    puff.spin += dt * 12;
    if (d < 12) {
      world.clouds.push({ x: puff.tx, y: puff.ty, radius: SMOKE.radius, life: 0, seed: i * 3.7 });
      world.effects.push({ kind: 'burst', x: puff.tx, y: puff.ty, age: 0, life: 0.5 });
      world.puffs.splice(i, 1);
      continue;
    }
    const step = Math.min(SMOKE.throwSpeed * dt, d);
    puff.x += (dx / d) * step;
    puff.y += (dy / d) * step;
  }
  for (let i = world.clouds.length - 1; i >= 0; i -= 1) {
    world.clouds[i].life += dt;
    if (world.clouds[i].life > SMOKE.seconds) world.clouds.splice(i, 1);
  }
  for (let i = world.effects.length - 1; i >= 0; i -= 1) {
    world.effects[i].age += dt;
    if (world.effects[i].age > world.effects[i].life) world.effects.splice(i, 1);
  }
}
