// The room's eyes: the guards who walk the plan and the cameras bolted to its walls.
//
// Both kinds share one sense — a cone that has to see you, with the line of sight unbroken by a
// wall, a crate or a puff of smoke — and one ramp, `track`, that softens the first instant of a
// sighting so a swept cone gives you a beat of warning before the meter moves. What differs is what
// they do about it: a guard escalates patrol -> suspect -> alert and comes after you, a camera can
// only keep the lens on you and lean on the alarm.
import { CAMERA, GUARD, PLAYER } from './config.js';
import { blocked, moveCircle } from './level.js';
import { centerOf, coneStrength, dist, lerp, pointInCone, turnToward } from './geometry.js';

export const STATE_PATROL = 'patrol';
export const STATE_SUSPECT = 'suspect';
export const STATE_ALERT = 'alert';
export const STATE_SEARCH = 'search';

/** How strongly `entity` sees `target` right now: 0 when the cone, the range or the cover says no. */
export function sightStrength(level, entity, target, clouds) {
  if (entity.disabled !== undefined && entity.disabled > 0) return 0;
  const d = dist(entity.x, entity.y, target.x, target.y);
  if (d > entity.range) return 0;
  if (!pointInCone(entity.x, entity.y, entity.angle, entity.half, entity.range, target.x, target.y)) return 0;
  if (blocked(level, entity.x, entity.y, target.x, target.y, clouds)) return 0;
  const close = entity.close ?? 90;
  return coneStrength(entity.x, entity.y, entity.angle, entity.half, entity.range, target.x, target.y, close);
}

export function createGuard(level, def) {
  const path = def.path.map(([col, row]) => centerOf(col, row));
  return {
    kind: 'guard',
    x: path[0].x,
    y: path[0].y,
    angle: Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x),
    path,
    index: 1,
    wait: 0,
    scan: 0,
    slow: 0,
    speed: def.speed ?? GUARD.speed,
    half: def.half ?? GUARD.coneHalfAngle,
    range: def.range ?? GUARD.coneRange,
    close: GUARD.closeRange,
    detect: 0,
    track: 0,
    exposure: 0,
    state: STATE_PATROL,
    lost: 0,
    searchFor: 0,
    seen: false,
    pop: 0,
    popText: '',
    lastSeenX: path[0].x,
    lastSeenY: path[0].y,
  };
}

function walkPath(level, guard, dt) {
  const next = guard.path[guard.index];
  const d = dist(guard.x, guard.y, next.x, next.y);
  const wanted = Math.atan2(next.y - guard.y, next.x - guard.x);
  guard.angle = turnToward(guard.angle, wanted, GUARD.turnRate * dt);
  if (d < 5) {
    guard.index = (guard.index + 1) % guard.path.length;
    guard.wait = GUARD.pause;
    return;
  }
  const step = Math.min(guard.speed * dt, d);
  const beforeX = guard.x;
  const beforeY = guard.y;
  const moved = moveCircle(level, guard.x, guard.y, 12, Math.cos(guard.angle) * step, Math.sin(guard.angle) * step);
  guard.x = moved.x;
  guard.y = moved.y;
  // A patrol line runs through cover only if the plan is wrong, but a guard wedged on a crate for
  // the rest of the round would be worse than one that walks on: if it stops making progress for
  // most of a second, it gives up on that waypoint and takes the next.
  guard.slow = Math.hypot(guard.x - beforeX, guard.y - beforeY) < 0.35 ? guard.slow + dt : 0;
  if (guard.slow > 0.9) {
    guard.slow = 0;
    guard.index = (guard.index + 1) % guard.path.length;
  }
}

/** A guard holding at a waypoint sweeps its head, so its cone keeps sweeping even standing still. */
function scanAtWaypoint(guard, dt) {
  const next = guard.path[guard.index];
  const base = Math.atan2(next.y - guard.y, next.x - guard.x);
  guard.scan += dt;
  guard.angle = base + Math.sin(guard.scan * 1.7) * 0.7;
}

function chase(level, guard, dt, tx, ty) {
  const wanted = Math.atan2(ty - guard.y, tx - guard.x);
  guard.angle = turnToward(guard.angle, wanted, GUARD.turnRate * 1.6 * dt);
  const step = GUARD.chaseSpeed * dt;
  const moved = moveCircle(level, guard.x, guard.y, 12, Math.cos(wanted) * step, Math.sin(wanted) * step);
  guard.x = moved.x;
  guard.y = moved.y;
}

/**
 * One step of a guard: sense, escalate, then act. `world` supplies the thief, the smoke and the
 * noise pulses other modules raise; the guard writes back only its own fields.
 */
export function updateGuard(level, guard, dt, world) {
  const thief = world.player;
  const strength = sightStrength(level, guard, thief, world.clouds);
  const sneakFactor = thief.sneaking ? PLAYER.sneakDetect : 1;

  guard.seen = strength > 0;
  guard.track = guard.seen ? Math.min(1, guard.track + dt * 2.4) : Math.max(0, guard.track - dt * 1.4);
  guard.exposure = strength * guard.track;

  if (guard.seen) {
    guard.lastSeenX = thief.x;
    guard.lastSeenY = thief.y;
    guard.lost = 0;
    guard.detect = Math.min(1.8, guard.detect + dt * GUARD.rate * strength * sneakFactor);
  } else {
    guard.lost += dt;
    guard.detect = Math.max(0, guard.detect - dt * (guard.state === STATE_ALERT ? 0.22 : 0.7));
  }

  if (guard.pop > 0) guard.pop = Math.max(0, guard.pop - dt);

  if (guard.state !== STATE_ALERT && guard.detect >= GUARD.alertAt) {
    guard.state = STATE_ALERT;
    guard.pop = 1.4;
    guard.popText = '!';
  } else if (guard.state === STATE_PATROL && guard.detect >= GUARD.suspectAt) {
    guard.state = STATE_SUSPECT;
    guard.pop = 1.6;
    guard.popText = '?';
  }

  if (guard.state === STATE_ALERT) {
    if (guard.seen) chase(level, guard, dt, thief.x, thief.y);
    else chase(level, guard, dt, guard.lastSeenX, guard.lastSeenY);
    if (guard.lost > GUARD.loseAfter) {
      guard.state = STATE_SEARCH;
      guard.searchFor = GUARD.searchSeconds;
    }
    return;
  }

  if (guard.state === STATE_SUSPECT) {
    const wanted = Math.atan2(guard.lastSeenY - guard.y, guard.lastSeenX - guard.x);
    guard.angle = turnToward(guard.angle, wanted, GUARD.turnRate * 1.2 * dt);
    if (!guard.seen && guard.detect < GUARD.suspectAt * 0.55) guard.state = STATE_PATROL;
    if (guard.detect >= GUARD.alertAt) guard.state = STATE_ALERT;
    return;
  }

  if (guard.state === STATE_SEARCH) {
    guard.searchFor -= dt;
    guard.scan += dt;
    const home = guard.path[0];
    const base = Math.atan2(home.y - guard.y, home.x - guard.x);
    guard.angle = base + Math.sin(guard.scan * 2.3) * 1.1;
    if (guard.searchFor <= 0) {
      guard.state = STATE_PATROL;
      guard.detect = 0;
    }
    return;
  }

  if (guard.wait > 0) {
    guard.wait -= dt;
    scanAtWaypoint(guard, dt);
    return;
  }
  walkPath(level, guard, dt);
}

/** A guard's ear: a footstep pulse within `radius` adds a little suspicion, whatever it is facing. */
export function hearPulse(guard, x, y, radius) {
  const d = dist(guard.x, guard.y, x, y);
  if (d > radius) return;
  const weight = 1 - d / radius;
  guard.detect = Math.min(1.8, guard.detect + GUARD.hearRate * weight);
  if (guard.state === STATE_PATROL && guard.detect >= GUARD.suspectAt) {
    guard.state = STATE_SUSPECT;
    guard.pop = 1.6;
    guard.popText = '?';
  }
}

export function createCamera(level, def) {
  const at = centerOf(def.at[0], def.at[1]);
  return {
    kind: 'camera',
    x: at.x,
    y: at.y,
    mount: { col: def.at[0], row: def.at[1] },
    arc: def.arc,
    period: def.period ?? 5,
    sweep: def.phase ?? 0,
    angle: def.arc[0],
    half: CAMERA.coneHalfAngle,
    range: CAMERA.range,
    close: 70,
    disabled: 0,
    track: 0,
    exposure: 0,
    seen: false,
    pop: 0,
  };
}

export function updateCamera(level, camera, dt, world) {
  if (camera.pop > 0) camera.pop = Math.max(0, camera.pop - dt);
  if (camera.disabled > 0) {
    camera.disabled = Math.max(0, camera.disabled - dt);
    camera.track = Math.max(0, camera.track - dt * 2);
    camera.exposure = 0;
    camera.seen = false;
    return;
  }
  camera.sweep = (camera.sweep + dt / camera.period) % 1;
  const t = 0.5 - 0.5 * Math.cos(camera.sweep * Math.PI * 2);
  camera.angle = lerp(camera.arc[0], camera.arc[1], t);

  const strength = sightStrength(level, camera, world.player, world.clouds);
  camera.seen = strength > 0;
  camera.track = camera.seen ? Math.min(1, camera.track + dt * 2.6) : Math.max(0, camera.track - dt * 1.6);
  camera.exposure = strength * camera.track;
  if (camera.seen && camera.track > 0.5 && camera.pop <= 0) camera.pop = 0.9;
}
