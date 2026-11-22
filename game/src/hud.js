// The head-up display and the panels: the alarm meter the bounty asks to see in one frame, the take,
// the charges left, the clock, how many eyes are on you, and the screens between the rooms. Nothing
// here touches the simulation; it reads the world and paints over the field the renderer just drew.
import { ALARM, EMP, FIELD, PALETTE, SCORE, SMOKE, TOOLS, TOOL_ORDER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_WON = 'won';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

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

function label(context, value, x, y, size, color, align, weight) {
  context.font = `${weight ? `${weight} ` : ''}${size}px ${FONT_STACK}`;
  context.fillStyle = color;
  context.textAlign = align ?? 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(value, x, y);
}

function alarmColor(value) {
  if (value >= 0.72) return PALETTE.red;
  if (value >= 0.4) return PALETTE.amber;
  return PALETTE.green;
}

function clockText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** The bar the bounty asks to see: how loud the job has gone. */
function drawAlarmMeter(context, world) {
  const x = 30;
  const y = 626;
  const w = 372;
  const h = 26;
  const value = Math.max(0, Math.min(1, world.alarm));
  label(context, 'ALARM METER', x, y - 10, 14, PALETTE.muted, 'left', '700');
  label(context, `${Math.round(value * 100)}%`, x + w, y - 10, 14, alarmColor(value), 'right', '700');
  roundedRect(context, x, y, w, h, 6);
  context.fillStyle = '#0b1220';
  context.fill();
  if (value > 0.62) {
    context.strokeStyle = `rgba(236,75,75,${0.35 + 0.35 * Math.sin(world.time * 9)})`;
    context.lineWidth = 3;
    context.stroke();
  } else {
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
  }
  const fill = Math.max(0, value * (w - 6));
  if (fill > 2) {
    roundedRect(context, x + 3, y + 3, fill, h - 6, 4);
    context.fillStyle = alarmColor(value);
    context.fill();
  }
  context.strokeStyle = 'rgba(5,7,13,0.55)';
  context.lineWidth = 1.5;
  for (let i = 1; i < 10; i += 1) {
    const tx = x + 3 + (w - 6) * (i / 10);
    context.beginPath();
    context.moveTo(tx, y + 4);
    context.lineTo(tx, y + h - 4);
    context.stroke();
  }
}

function drawTopBar(context, world) {
  const gradient = context.createLinearGradient(0, 0, 0, 76);
  gradient.addColorStop(0, 'rgba(5,7,13,0.9)');
  gradient.addColorStop(1, 'rgba(5,7,13,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, FIELD.width, 76);

  label(context, 'VELVET VAULT', 30, 32, 13, PALETTE.muted, 'left', '700');
  label(context, world.level.name, 30, 58, 24, PALETTE.text, 'left', '800');
  label(context, world.level.subtitle, 30 + context.measureText(world.level.name).width + 96, 32, 13, PALETTE.muted, 'left', '700');

  const pips = world.level.loot;
  const taken = world.lootTaken;
  const pipW = 26;
  const total = pips.length * (pipW + 8);
  let px = FIELD.width / 2 - total / 2 + 40;
  label(context, 'LOOT', px, 30, 14, PALETTE.muted, 'center', '700');
  for (let i = 0; i < pips.length; i += 1) {
    roundedRect(context, px - pipW / 2 + i * (pipW + 8), 40, pipW, 12, 3);
    context.fillStyle = i < taken ? PALETTE.loot : '#22314c';
    context.fill();
  }
  label(context, `${taken}/${pips.length}`, px + total - 10, 30, 16, PALETTE.loot, 'left', '800');

  label(context, clockText(world.time), FIELD.width - 30, 40, 30, PALETTE.text, 'right', '700');
  label(context, 'EXTRACTION FEE  $' + SCORE.clearBonus, FIELD.width - 30, 58, 12, PALETTE.muted, 'right', '700');

  let eyes = 0;
  for (const guard of world.guards) if (guard.seen) eyes += 1;
  for (const camera of world.cameras) if (camera.seen) eyes += 1;
  const eyesColor = eyes > 0 ? PALETTE.red : PALETTE.green;
  label(context, eyes > 0 ? `● ${eyes} EYE${eyes > 1 ? 'S' : ''} ON YOU` : '● UNSEEN', FIELD.width - 30, 78, 13, eyesColor, 'right', '700');
}

function drawTools(context, world) {
  const chips = TOOL_ORDER.length;
  const chipW = 168;
  const chipH = 40;
  const gap = 10;
  const startX = FIELD.width - 30 - chips * chipW - (chips - 1) * gap;
  const y = 624;
  label(context, 'TOOLKIT  ·  CLICK TO USE', startX, y - 10, 13, PALETTE.muted, 'left', '700');
  for (let i = 0; i < chips; i += 1) {
    const id = TOOL_ORDER[i];
    const tool = TOOLS[id];
    const count = world.toolCounts[id] ?? 0;
    const selected = world.selectedTool === id;
    const x = startX + i * (chipW + gap);
    roundedRect(context, x, y, chipW, chipH, 6);
    context.fillStyle = selected ? '#1d3350' : '#0d1728';
    context.fill();
    context.strokeStyle = count <= 0 ? '#2a3550' : selected ? PALETTE.wallRim : PALETTE.panelEdge;
    context.lineWidth = selected ? 2.5 : 1.5;
    context.stroke();
    const dim = count <= 0;
    label(context, `${tool.key} ${tool.short}`, x + 12, y + 26, 16, dim ? '#4b5773' : PALETTE.text, 'left', '800');
    label(context, `×${count}`, x + chipW - 12, y + 26, 18, dim ? '#4b5570' : PALETTE.loot, 'right', '800');
  }
  label(
    context,
    `SHIFT sneak  ·  ${TOOLS.emp.short} range ${EMP.range}  ·  ${TOOLS.smoke.short} r${SMOKE.radius}`,
    startX,
    y + chipH + 18,
    12,
    PALETTE.muted,
    'left',
    '700',
  );
}

function drawNotice(context, world) {
  if (!world.notice) return;
  const alpha = Math.min(1, world.notice.life * 1.4);
  context.globalAlpha = alpha;
  label(context, world.notice.text, FIELD.width / 2, 600, 24, PALETTE.loot, 'center', '800');
  context.globalAlpha = 1;
}

function drawPanel(context, title, titleColor, lines, prompt) {
  const width = 760;
  const lineHeight = 30;
  const height = 168 + lines.length * lineHeight;
  const x = (FIELD.width - width) / 2;
  const y = (FIELD.height - height) / 2 - 10;
  roundedRect(context, x, y, width, height, 12);
  context.fillStyle = 'rgba(9,14,24,0.94)';
  context.fill();
  context.strokeStyle = PALETTE.panelEdge;
  context.lineWidth = 2;
  context.stroke();
  label(context, title, FIELD.width / 2, y + 66, 44, titleColor, 'center', '800');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const color = line.color ?? PALETTE.muted;
    label(context, line.text ?? line, FIELD.width / 2, y + 112 + i * lineHeight, line.size ?? 19, color, 'center', line.weight ?? '400');
  }
  label(context, prompt, FIELD.width / 2, y + height - 30, 20, PALETTE.loot, 'center', '700');
}

function drawTitle(context, world) {
  label(context, 'VELVET VAULT', FIELD.width / 2, 250, 92, PALETTE.text, 'center', '800');
  label(context, 'a job in three rooms', FIELD.width / 2, 296, 24, PALETTE.wallRim, 'center', '700');
  drawPanel(
    context,
    '',
    PALETTE.text,
    [
      { text: 'Lift every piece of loot, then walk out through the green EXIT.', size: 21, color: PALETTE.text },
      { text: 'Guards and cameras have cones. Walls, crates and smoke break their line of sight.', size: 19 },
      { text: 'The alarm meter fills while they can see you. Fill it and the job is blown.', size: 19 },
      { text: 'WASD or arrows move  ·  SHIFT sneaks  ·  mouse aims  ·  click spends a tool  ·  1/2 pick', size: 18, color: PALETTE.wallRim },
    ],
    world.best > 0 ? `PRESS SPACE TO RUN THE JOB   ·   BEST $${world.best}` : 'PRESS SPACE TO RUN THE JOB',
  );
}

function drawBrief(context, world) {
  const level = world.level;
  const lines = [
    { text: level.brief, size: 20, color: PALETTE.text },
    { text: `${level.loot.length} pieces of loot waiting  ·  ${level.def.guards.length} guards  ·  ${level.def.cameras.length} cameras`, size: 19, color: PALETTE.wallRim },
    { text: `charges issued: ${level.tools.emp ?? 0} × ${TOOLS.emp.name}  ·  ${level.tools.smoke ?? 0} × ${TOOLS.smoke.name}`, size: 19, color: PALETTE.wallRim },
    { text: 'Keep the meter low and the take pays more. Waste nothing.', size: 18 },
  ];
  drawPanel(context, level.name, PALETTE.text, lines, 'PRESS SPACE TO STEP INSIDE');
}

function drawCaught(context, world) {
  drawPanel(
    context,
    'ALARM SOUNDED',
    PALETTE.red,
    [
      { text: 'The room closed around you before the van did.', size: 20, color: PALETTE.text },
      { text: `loot collected ${world.lootTaken}/${world.lootTotal}  ·  alarm ${Math.round(world.alarm * 100)}%`, size: 19, color: PALETTE.amber },
      { text: 'Break the line of sight: slip behind cover, spend smoke, or walk it slow.', size: 18 },
    ],
    'PRESS SPACE TO TRY THE ROOM AGAIN',
  );
}

function drawClear(context, world) {
  const score = world.score ?? { total: 0, lootValue: 0, stealth: 0, timeBonus: 0, clearBonus: 0, toolPenalty: 0 };
  const lines = [
    { text: `take $${score.lootValue}  ·  quiet $${score.stealth}  ·  speed $${score.timeBonus}  ·  charges -$${score.toolPenalty}`, size: 19, color: PALETTE.wallRim },
    { text: `room paid $${score.total} in ${clockText(score.seconds)} at ${Math.round((score.alarm ?? 0) * 100)}% alarm`, size: 20, color: PALETTE.loot },
    { text: `job so far: $${world.run.score} over ${world.run.rooms} room${world.run.rooms === 1 ? '' : 's'}`, size: 19, color: PALETTE.text },
  ];
  drawPanel(context, 'ROOM CLEAR', PALETTE.green, lines, 'PRESS SPACE FOR THE NEXT ROOM');
}

function drawWon(context, world) {
  drawPanel(
    context,
    'THE VAULT IS YOURS',
    PALETTE.loot,
    [
      { text: `job total $${world.run.score} across ${world.run.rooms} rooms in ${clockText(world.run.time)}`, size: 22, color: PALETTE.text },
      { text: `loot lifted ${world.run.loot}  ·  rooms blown ${world.run.blown}`, size: 19, color: PALETTE.wallRim },
      { text: `best $${world.best}`, size: 19, color: PALETTE.loot, weight: '700' },
    ],
    'PRESS SPACE TO RUN THE JOB AGAIN',
  );
}

function drawPaused(context, world) {
  drawPanel(context, 'PAUSED', PALETTE.text, [{ text: 'Nobody moves. The cones hold.', size: 20 }], 'PRESS P TO STEP BACK IN');
}

/** Paint the HUD and, when a screen asks for one, its panel over the room. */
export function drawHud(context, world, screen) {
  if (screen === SCREEN_TITLE) {
    context.fillStyle = 'rgba(5,7,13,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawTitle(context, world);
    return;
  }
  drawTopBar(context, world);
  drawAlarmMeter(context, world);
  drawTools(context, world);
  drawNotice(context, world);
  if (screen === SCREEN_BRIEF) drawBrief(context, world);
  else if (screen === SCREEN_PAUSED) drawPaused(context, world);
  else if (screen === SCREEN_CAUGHT) drawCaught(context, world);
  else if (screen === SCREEN_CLEAR) drawClear(context, world);
  else if (screen === SCREEN_WON) drawWon(context, world);
}

export const ALARM_LABEL = ALARM.caughtAt;
