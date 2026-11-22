// Boot and the one loop. Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between screens: title, the room's briefing, play, paused, caught, room clear and the job
// done.
//
// ?seed=N fixes the small variation between runs (where the cameras start their sweep, how long a
// guard waits at its first waypoint). ?shot=cover|wing|alarm|getaway stages one of the screenshot
// scenes instead of running the loop, paints it, prints what it staged and sets window.__shotReady
// for the screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { LEVELS } from './level.js';
import {
  beginRoom,
  createWorld,
  loadRoom,
  nextRoom,
  selectTool,
  step,
  useToolAt,
  EVENT_ALERT,
  EVENT_CAUGHT,
  EVENT_CLEAR,
  EVENT_LOOT,
  STATUS_CAUGHT,
  STATUS_CLEAR,
  STATUS_PLAY,
} from './sim.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { initAudio, setMuted, sfx } from './audio.js';
import {
  SCREEN_BRIEF,
  SCREEN_CAUGHT,
  SCREEN_CLEAR,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WON,
} from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const BEST_KEY = 'velvet-vault.best';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Date.now() & 0xffffffff);

const canvas = document.getElementById('game');
const announcement = document.getElementById('status');
document.getElementById('boot')?.remove();
const world = createWorld(createRandom(seed), 0);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off in a private window: the best then lasts this visit only.
  }
}

world.best = readBest();

function announce(message) {
  announcement.textContent = message;
}

/** Hand the screenshot scenes the whole job. */
function runShot(name) {
  const screen = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, screen);
    painted += 1;
    if (painted < 3) {
      window.requestAnimationFrame(paint);
      return;
    }
    window.__shotInfo = {
      scene: name,
      screen,
      room: world.level.name,
      time: Number(world.time.toFixed(1)),
      alarm: Number(world.alarm.toFixed(3)),
      loot: `${world.lootTaken}/${world.lootTotal}`,
      eyes: world.guards.filter((guard) => guard.seen).length + world.cameras.filter((camera) => camera.seen).length,
      thief: { x: Math.round(world.player.x), y: Math.round(world.player.y), sneak: world.player.sneaking },
      guards: world.guards.map((guard) => ({ state: guard.state, x: Math.round(guard.x), y: Math.round(guard.y) })),
      cameras: world.cameras.map((camera) => ({ x: Math.round(camera.x), y: Math.round(camera.y), angle: Number(camera.angle.toFixed(2)), disabled: Number(camera.disabled.toFixed(1)) })),
      clouds: world.clouds.map((cloud) => ({ x: Math.round(cloud.x), y: Math.round(cloud.y) })),
    };
    window.__shotReady = true;
    console.log(`SHOT_READY ${JSON.stringify(window.__shotInfo)}`);
  }
  window.requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toField);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function resetJob() {
    world.run = { score: 0, time: 0, loot: 0, tools: 0, rooms: 0, blown: 0 };
  }

  function enterRoom(index) {
    loadRoom(world, index);
    screen = SCREEN_BRIEF;
    announce(`${world.level.name}. ${world.level.brief} Press Space to step inside.`);
  }

  function startRoom() {
    beginRoom(world);
    screen = SCREEN_PLAY;
    announce(`Inside ${world.level.name}. Collect ${world.lootTotal} pieces of loot and reach the exit.`);
  }

  function retryRoom() {
    loadRoom(world, world.levelIndex);
    screen = SCREEN_BRIEF;
    announce(`${world.level.name} again. Press Space to step inside.`);
  }

  function afterClear() {
    if (world.levelIndex + 1 >= LEVELS.length) {
      if (world.run.score > world.best) {
        world.best = world.run.score;
        saveBest(world.best);
      }
      screen = SCREEN_WON;
      announce(`The job is done. Total $${world.run.score}. Press Space to run it again.`);
      sfx.won();
      return;
    }
    enterRoom(world.levelIndex + 1);
  }

  function restartJob() {
    resetJob();
    enterRoom(0);
  }

  function handleActions() {
    const actions = input.takeActions();
    const tool = input.takeTool();
    if (tool) selectTool(world, tool);
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CAUGHT)) {
      retryRoom();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        initAudio();
        screen = SCREEN_BRIEF;
        announce(`${world.level.name}. ${world.level.brief} Press Space to step inside.`);
      } else if (screen === SCREEN_BRIEF) {
        initAudio();
        startRoom();
      } else if (screen === SCREEN_CAUGHT) {
        retryRoom();
      } else if (screen === SCREEN_CLEAR) {
        afterClear();
      } else if (screen === SCREEN_WON) {
        restartJob();
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function consumeEvents(events) {
    if (events & EVENT_LOOT) sfx.loot();
    if (events & EVENT_ALERT) sfx.alert();
    if (events & EVENT_CAUGHT) {
      sfx.caught();
      screen = SCREEN_CAUGHT;
      announce(`The alarm sounded in ${world.level.name}. Press Space to try again.`);
    }
    if (events & EVENT_CLEAR) {
      sfx.clear();
      screen = SCREEN_CLEAR;
      announce(`Room clear, $${world.score ? world.score.total : 0}. Press Space to go on.`);
    }
  }

  function advance() {
    if (screen === SCREEN_BRIEF) {
      // The room stands still behind the briefing, but its cones keep sweeping: a live briefing.
      for (const guard of world.guards) guard.angle += 0.004;
      return;
    }
    const click = input.takeClick();
    if (click && screen === SCREEN_PLAY) {
      const result = useToolAt(world, click.x, click.y);
      if (!result.used) sfx.denied();
      else sfx[result.id === 'emp' ? 'emp' : 'smoke']();
    }
    const intent = input.intent();
    if (world.player.moving) sfx.step();
    const events = step(world, STEP, intent);
    consumeEvents(events);
  }

  function frame(now) {
    window.requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) accumulator = 0;
    while (accumulator >= STEP) {
      if (screen === SCREEN_PLAY || screen === SCREEN_BRIEF) advance();
      else accumulator = 0;
      accumulator -= STEP;
    }
    renderer.draw(world, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyM') return;
    setMuted(!window.__vaultMuted);
    window.__vaultMuted = !window.__vaultMuted;
  });

  announce('Velvet Vault. Press Space or click to run the job.');
  window.requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
