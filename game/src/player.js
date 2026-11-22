// The thief: the thing the player is. Movement is a circle pushed against the room's solid tiles,
// with a sneak toggle that halves the pace and the noise and buys back most of the cone's reach.
// The module owns no input and no drawing; it takes an intent (which ways are held, where the mouse
// points) and leaves the thief's position, heading and this step's footstep pulse behind.
import { PLAYER } from './config.js';
import { moveCircle } from './level.js';

export function createPlayer(level) {
  return {
    kind: 'player',
    x: level.start.x,
    y: level.start.y,
    radius: PLAYER.radius,
    heading: -Math.PI / 2,   // the way he is turned, for the sprite
    aimX: level.start.x,
    aimY: level.start.y - 40,
    moving: false,
    sneaking: false,
    speed: 0,
    stepTimer: PLAYER.noisePeriod,
    noisePulse: false,
    noiseRadius: PLAYER.walkNoise,
    bob: 0,
    cloak: 0,
  };
}

/**
 * Advance the thief one step. `intent` carries the held directions, the sneak flag and the cursor.
 * Returns nothing: the caller reads player.moving, player.noisePulse and player.noiseRadius after.
 */
export function updatePlayer(level, player, dt, intent) {
  const dx = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  const dy = (intent.down ? 1 : 0) - (intent.up ? 1 : 0);
  const length = Math.hypot(dx, dy);
  player.sneaking = !!intent.sneak;
  player.aimX = intent.aimX ?? player.aimX;
  player.aimY = intent.aimY ?? player.aimY;

  const speed = PLAYER.speed * (player.sneaking ? PLAYER.sneakScale : 1);
  player.noiseRadius = player.sneaking ? PLAYER.sneakNoise : PLAYER.walkNoise;
  player.moving = length > 0;
  player.noisePulse = false;

  if (player.moving) {
    const ux = (dx / length) * speed * dt;
    const uy = (dy / length) * speed * dt;
    const moved = moveCircle(level, player.x, player.y, player.radius, ux, uy);
    player.x = moved.x;
    player.y = moved.y;
    player.heading = Math.atan2(dy, dx);
    player.bob += dt * speed * 0.05;
    player.speed = speed;
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer += player.noisePeriod * (player.sneaking ? 1.35 : 1);
      player.noisePulse = true;
    }
  } else {
    player.speed = 0;
    player.stepTimer = Math.min(player.stepTimer, PLAYER.noisePeriod * 0.6);
  }
}
