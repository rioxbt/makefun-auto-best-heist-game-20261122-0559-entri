// Every tuning number, colour and string in one place. The playfield is a fixed 1280x720 logical
// area (32x18 tiles of 40 px); the renderer scales it to the window, so no rule below depends on
// the screen size. Nothing here touches the DOM: the simulation modules and the headless test read
// this file directly.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  speed: 196,          // px/s walking
  sneakScale: 0.52,    // hold Shift: slower
  sneakDetect: 0.42,   // ...and harder to spot
  walkNoise: 168,      // px a walking footstep carries to a guard
  sneakNoise: 62,
  noisePeriod: 0.42,   // seconds between footstep pulses
  pickupRadius: 26,
};

export const GUARD = {
  speed: 68,
  chaseSpeed: 132,
  pause: 1.5,          // seconds a guard holds at a waypoint
  turnRate: 3.4,       // rad/s it turns its head
  coneHalfAngle: 0.60, // radians, ~34 degrees each side
  coneRange: 236,
  closeRange: 90,      // inside this the cone sees at full strength
  rate: 1.0,           // detection units a second at point blank: a guard resolves to alert in
                       // about a second, ahead of the alarm meter, so the chase is what blows you
  hearRate: 0.30,      // suspicion from a footstep pulse
  suspectAt: 0.34,     // cone turns amber, the guard looks your way
  alertAt: 1.0,        // cone turns red, the guard chases
  loseAfter: 3.2,      // seconds out of sight before an alert guard gives up
  searchSeconds: 3.0,
};

export const CAMERA = {
  coneHalfAngle: 0.44, // ~25 degrees each side
  range: 268,
  rate: 0.55,
  disabledSeconds: 6.5, // an EMP charge keeps a camera dark this long
};

export const ALARM = {
  decay: 0.085,        // units a second the meter falls when nobody sees you
  gainScale: 0.95,     // meter units per unit of guard detection
  caughtAt: 1.0,
};

export const SMOKE = {
  radius: 118,
  seconds: 5.2,
  throwSpeed: 470,
  throwRange: 360,
};

export const EMP = {
  range: 300,
};

/** Per-room tool allowance. Tools cost the run: fewer used is a larger stealth bonus. */
export const TOOLS = {
  emp: { id: 'emp', name: 'EMP CHARGE', short: 'EMP', key: '1' },
  smoke: { id: 'smoke', name: 'SMOKE CANISTER', short: 'SMOKE', key: '2' },
};

export const TOOL_ORDER = ['emp', 'smoke'];

export const SCORE = {
  loot: 500,
  stealthBonus: 1200,  // scaled by how quiet the alarm stayed
  timePar: 75,         // seconds a room is "on par"; faster pays
  timeBonusMax: 600,
  toolPenalty: 150,    // per tool spent
  clearBonus: 900,
};

export const PALETTE = {
  backdrop: '#05070d',
  floor: '#0d1524',
  floorLine: '#16233a',
  floorTile: '#101c30',
  wall: '#1b2740',
  wallTop: '#395887',
  wallRim: '#6ea8d8',
  crate: '#2b3a5c',
  vault: '#243350',
  loot: '#ffd35c',
  lootGlow: 'rgba(255,190,60,0.30)',
  extract: '#5ee08c',
  extractGlow: 'rgba(94,224,140,0.22)',
  thief: '#eef2fb',
  thiefCloak: '#7f93bb',
  guard: '#ef7a45',
  guardAlert: '#ff3d3d',
  cone: 'rgba(255,198,96,0.15)',
  coneSuspect: 'rgba(255,146,60,0.24)',
  coneAlert: 'rgba(255,74,74,0.26)',
  coneCamera: 'rgba(120,200,255,0.14)',
  smoke: 'rgba(196,205,220,0.50)',
  text: '#e8eefb',
  muted: '#8595b5',
  panel: '#0e1626',
  panelEdge: '#2b3d5e',
  green: '#43c98a',
  amber: '#f2b53c',
  red: '#ec4b4b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
