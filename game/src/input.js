// Keyboard and pointer input. Held keys give a direction and a sneak flag; one-shot presses (start,
// pause, restart, pick a tool) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. The pointer's position is kept in the field's
// own coordinates, so clicking a camera blinds that camera whatever the window size.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const PICK = { Digit1: 'emp', Digit2: 'smoke' };
const CYCLE = 'KeyQ';

export function createInput(canvas, toField) {
  const held = { left: false, right: false, up: false, down: false, sneak: false };
  const aim = { x: 640, y: 360 };
  let actions = 0;
  let pendingTool = null;
  let clicked = null;

  function release() {
    held.left = false;
    held.right = false;
    held.up = false;
    held.down = false;
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (SNEAK.has(event.code)) held.sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (PICK[event.code]) {
      pendingTool = PICK[event.code];
    } else if (event.code === CYCLE) {
      pendingTool = event.shiftKey ? 'smoke' : 'emp';
    } else return;
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (SNEAK.has(event.code)) held.sneak = false;
  });

  // A key or a button released while the tab is hidden never sends its event: let go of everything.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = toField(event.clientX, event.clientY);
    aim.x = point.x;
    aim.y = point.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    aim.x = point.x;
    aim.y = point.y;
    if (event.button === 0) {
      clicked = { x: point.x, y: point.y };
      actions |= ACTION_CONFIRM;
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    aim,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last left click on the field this frame, or null. */
    takeClick() {
      const taken = clicked;
      clicked = null;
      return taken;
    },
    /** A tool picked since the last call, or null. */
    takeTool() {
      const taken = pendingTool;
      pendingTool = null;
      return taken;
    },
    /** Everything the simulation needs for one step. */
    intent() {
      return {
        left: held.left,
        right: held.right,
        up: held.up,
        down: held.down,
        sneak: held.sneak,
        aimX: aim.x,
        aimY: aim.y,
      };
    },
  };
}
