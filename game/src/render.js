// Drawing only: the world in, pixels out. The 1280x720 playfield is scaled to fit the window and
// centred, and everything below is painted in the field's own coordinates, so a screenshot frame is
// the same picture whatever the window size. The HUD and the panels live in hud.js; the renderer
// paints the room, the eyes, the thief and the effects, then hands over to the HUD.
import { FIELD, FONT, PALETTE } from './config.js';
import { drawHud } from './hud.js';
import { STATE_ALERT, STATE_SUSPECT } from './guards.js';

const CONE_RGB = {
  guard: '255,198,96',
  suspect: '255,150,60',
  alert: '255,72,72',
  camera: '116,198,255',
};

function roundedRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, weight) {
    const key = `${weight ?? ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  /** Pointer position in field coordinates, so the mouse aims at what it looks like it aims at. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  function drawFloor(level) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.floorTile;
    for (let row = 0; row < level.grid.length; row += 1) {
      for (let col = 0; col < level.grid[row].length; col += 1) {
        if ((row + col) % 2 !== 0) continue;
        context.fillRect(col * 40, row * 40, 40, 40);
      }
    }
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 1;
    for (let col = 0; col <= FIELD.width; col += 40) {
      context.beginPath();
      context.moveTo(col + 0.5, 0);
      context.lineTo(col + 0.5, FIELD.height);
      context.stroke();
    }
    for (let row = 0; row <= FIELD.height; row += 40) {
      context.beginPath();
      context.moveTo(0, row + 0.5);
      context.lineTo(FIELD.width, row + 0.5);
      context.stroke();
    }
  }

  function drawSolids(level) {
    for (const solid of level.solids) {
      const { x, y, w, h } = solid.rect;
      if (solid.kind === 'wall') {
        context.fillStyle = PALETTE.wall;
        context.fillRect(x, y, w, h);
        context.fillStyle = PALETTE.wallTop;
        context.fillRect(x + 2, y + 2, w - 4, 4);
        context.fillStyle = PALETTE.wallRim;
        context.fillRect(x + 6, y + 7, Math.max(4, w - 12), 1.5);
      } else if (solid.kind === 'vault') {
        roundedRect(context, x + 2, y + 2, w - 4, h - 4, 6);
        context.fillStyle = PALETTE.vault;
        context.fill();
        context.strokeStyle = PALETTE.wallRim;
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = PALETTE.loot;
        context.beginPath();
        context.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
        context.fill();
      } else if (solid.kind === 'pillar') {
        context.fillStyle = PALETTE.wall;
        context.beginPath();
        context.arc(x + w / 2, y + h / 2, w / 2 - 4, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.wallTop;
        context.lineWidth = 3;
        context.stroke();
        context.fillStyle = PALETTE.wallRim;
        context.beginPath();
        context.arc(x + w / 2, y + h / 2, w / 2 - 10, 0, Math.PI * 2);
        context.fill();
      } else {
        roundedRect(context, x + 3, y + 3, w - 6, h - 6, 4);
        context.fillStyle = PALETTE.crate;
        context.fill();
        context.strokeStyle = PALETTE.wallTop;
        context.lineWidth = 2;
        context.stroke();
        context.strokeStyle = PALETTE.wallRim;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x + 8, y + 8);
        context.lineTo(x + w - 8, y + h - 8);
        context.moveTo(x + w - 8, y + 8);
        context.lineTo(x + 8, y + h - 8);
        context.stroke();
      }
    }
  }

  function drawCone(x, y, angle, half, range, rgb, strength) {
    const near = 0.10 + 0.22 * strength;
    const gradient = context.createRadialGradient(x, y, 4, x, y, range);
    gradient.addColorStop(0, `rgba(${rgb},${near})`);
    gradient.addColorStop(0.55, `rgba(${rgb},${near * 0.5})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, angle - half, angle + half);
    context.closePath();
    context.fill();
    context.strokeStyle = `rgba(${rgb},${Math.min(0.55, near * 2)})`;
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle - half) * range, y + Math.sin(angle - half) * range);
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle + half) * range, y + Math.sin(angle + half) * range);
    context.stroke();
  }

  function drawExtract(level, time) {
    const { x, y, w, h } = level.extract;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    context.save();
    context.fillStyle = PALETTE.extractGlow;
    context.fillRect(x, y, w, h);
    context.setLineDash([7, 6]);
    context.strokeStyle = PALETTE.extract;
    context.lineWidth = 3;
    context.strokeRect(x + 3, y + 3, w - 6, h - 6);
    context.setLineDash([]);
    context.globalAlpha = 0.5 + 0.4 * pulse;
    context.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const yy = y + h - 12 - i * 8;
      context.moveTo(x + 12, yy);
      context.lineTo(x + w / 2, yy - 7);
      context.lineTo(x + w - 12, yy);
    }
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.extract;
    context.font = font(12, '700');
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('EXIT', x + w / 2, y + 12);
    context.restore();
  }

  function drawLoot(loot, time) {
    if (loot.taken) return;
    const bob = Math.sin(time * 3 + loot.x * 0.01) * 2.5;
    const glow = context.createRadialGradient(loot.x, loot.y, 2, loot.x, loot.y, 30);
    glow.addColorStop(0, PALETTE.lootGlow);
    glow.addColorStop(1, 'rgba(255,190,60,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(loot.x, loot.y + bob, 30, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(loot.x, loot.y + bob);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.loot;
    context.fillRect(-8, -8, 16, 16);
    context.fillStyle = '#fff3c4';
    context.fillRect(-8, -8, 16, 5);
    context.restore();
  }

  function drawClouds(clouds) {
    for (const cloud of clouds) {
      const fade = Math.min(1, cloud.life * 1.6) * Math.min(1, (5.2 - cloud.life) * 0.9);
      const gradient = context.createRadialGradient(cloud.x, cloud.y, 4, cloud.x, cloud.y, cloud.radius);
      gradient.addColorStop(0, `rgba(210,218,232,${0.72 * fade})`);
      gradient.addColorStop(0.6, `rgba(190,200,216,${0.42 * fade})`);
      gradient.addColorStop(1, 'rgba(190,200,216,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawGuard(guard) {
    const rgb = guard.state === STATE_ALERT ? CONE_RGB.alert : guard.state === STATE_SUSPECT ? CONE_RGB.suspect : CONE_RGB.guard;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(guard.x, guard.y + 11, 13, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = guard.state === STATE_ALERT ? PALETTE.guardAlert : PALETTE.guard;
    context.beginPath();
    context.arc(guard.x, guard.y, 12, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(${rgb},0.9)`;
    context.lineWidth = 2.5;
    context.stroke();
    context.fillStyle = '#1b2740';
    context.beginPath();
    context.arc(guard.x + Math.cos(guard.angle) * 5, guard.y + Math.sin(guard.angle) * 5, 5.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(${rgb},0.75)`;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(guard.x + Math.cos(guard.angle) * 12, guard.y + Math.sin(guard.angle) * 12);
    context.lineTo(guard.x + Math.cos(guard.angle) * 26, guard.y + Math.sin(guard.angle) * 26);
    context.stroke();
    if (guard.pop > 0) {
      context.globalAlpha = Math.min(1, guard.pop * 1.6);
      context.fillStyle = guard.popText === '!' ? PALETTE.red : PALETTE.amber;
      context.font = font(30, '800');
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(guard.popText, guard.x, guard.y - 30);
      context.globalAlpha = 1;
    }
  }

  function drawCamera(camera, time) {
    const dark = camera.disabled > 0;
    context.save();
    context.translate(camera.x, camera.y);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = dark ? '#3a4152' : '#2b3a5c';
    roundedRect(context, -11, -9, 22, 18, 4);
    context.fill();
    context.strokeStyle = dark ? '#5a6273' : PALETTE.wallRim;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = dark ? '#6b7385' : (camera.seen ? PALETTE.red : '#7cc6ff');
    context.beginPath();
    context.arc(Math.cos(camera.angle) * 4, Math.sin(camera.angle) * 4, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = dark ? '#6b7385' : 'rgba(124,198,255,0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(Math.cos(camera.angle) * 8, Math.sin(camera.angle) * 8);
    context.lineTo(Math.cos(camera.angle) * 18, Math.sin(camera.angle) * 18);
    context.stroke();
    if (dark) {
      context.strokeStyle = PALETTE.red;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(-6, -6);
      context.lineTo(6, 6);
      context.moveTo(6, -6);
      context.lineTo(-6, 6);
      context.stroke();
    } else if (camera.pop > 0 && Math.floor(time * 8) % 2 === 0) {
      context.fillStyle = PALETTE.red;
      context.beginPath();
      context.arc(0, -14, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPlayer(player) {
    const sneak = player.sneaking;
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.beginPath();
    context.ellipse(player.x, player.y + 11, 12, 5.5, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = sneak ? 0.78 : 1;
    context.fillStyle = PALETTE.thiefCloak;
    context.beginPath();
    context.arc(player.x, player.y, sneak ? 11 : 12.5, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(player.x + Math.cos(player.heading) * 4, player.y + Math.sin(player.heading) * 4, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.wallRim;
    context.beginPath();
    context.arc(player.x + Math.cos(player.heading) * 7, player.y + Math.sin(player.heading) * 7, 2.6, 0, Math.PI * 2);
    context.fill();
    if (sneak) {
      context.strokeStyle = 'rgba(110,168,216,0.5)';
      context.lineWidth = 1.5;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.arc(player.x, player.y, 17, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
  }

  function drawEffects(effects, time) {
    for (const effect of effects) {
      const t = effect.age / effect.life;
      if (effect.kind === 'emp') {
        context.strokeStyle = `rgba(124,198,255,${1 - t})`;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(effect.x, effect.y, 10 + t * 46, 0, Math.PI * 2);
        context.stroke();
      } else if (effect.kind === 'burst') {
        context.fillStyle = `rgba(210,218,232,${0.55 * (1 - t)})`;
        context.beginPath();
        context.arc(effect.x, effect.y, 20 + t * 60, 0, Math.PI * 2);
        context.fill();
      } else if (effect.kind === 'loot') {
        context.strokeStyle = `rgba(255,211,92,${1 - t})`;
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(effect.x, effect.y, 12 + t * 34, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawPuffs(puffs) {
    for (const puff of puffs) {
      context.save();
      context.translate(puff.x, puff.y);
      context.rotate(puff.spin);
      context.fillStyle = '#c8d2e4';
      roundedRect(context, -4, -6, 8, 12, 3);
      context.fill();
      context.restore();
    }
  }

  function drawVignette() {
    const gradient = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 320, FIELD.width / 2, FIELD.height / 2, 760);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /** Paint one frame of whatever is on the table. */
  function draw(world, screen) {
    const level = world.level;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();

    drawFloor(level);
    drawExtract(level, world.time);
    for (const item of level.loot) drawLoot(item, world.time);
    drawSolids(level);

    for (const guard of world.guards) {
      const rgb = guard.state === STATE_ALERT ? CONE_RGB.alert : guard.state === STATE_SUSPECT ? CONE_RGB.suspect : CONE_RGB.guard;
      drawCone(guard.x, guard.y, guard.angle, guard.half, guard.range, rgb, guard.exposure + guard.track * 0.2);
    }
    for (const camera of world.cameras) {
      if (camera.disabled <= 0) drawCone(camera.x, camera.y, camera.angle, camera.half, camera.range, CONE_RGB.camera, camera.exposure);
    }

    drawClouds(world.clouds);
    for (const guard of world.guards) drawGuard(guard);
    for (const camera of world.cameras) drawCamera(camera, world.time);
    drawPlayer(world.player);
    drawPuffs(world.puffs);
    drawEffects(world.effects, world.time);
    drawVignette();
    context.restore();

    drawHud(context, world, screen);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, toField };
}
