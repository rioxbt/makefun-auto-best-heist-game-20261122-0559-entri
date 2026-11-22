// Geometry only: angles, distances, rectangle and circle tests, a vision cone test and line of
// sight. No state and no drawing, so both the simulation and the renderer can lean on it.
import { TILE } from './config.js';

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** The shortest signed difference from angle `a` to angle `b`, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `a` toward `b` by at most `maxStep` radians. */
export function turnToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function rectOf(col, row) {
  return { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
}

export function centerOf(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

export function circleRectHit(cx, cy, radius, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** Does the segment a->b cross the axis-aligned rect? Used for walls, crates and smoke. */
export function segmentRectHit(ax, ay, bx, by, rect) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - rect.x, rect.x + rect.w - ax, ay - rect.y, rect.y + rect.h - ay];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function segmentCircleHit(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1);
  const px = ax + dx * t;
  const py = ay + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= radius * radius;
}

/** Is `point` inside the cone that starts at (ox, oy) facing `angle` with `half` and `range`? */
export function pointInCone(ox, oy, angle, half, range, px, py) {
  const dx = px - ox;
  const dy = py - oy;
  const d2 = dx * dx + dy * dy;
  if (d2 > range * range) return false;
  if (d2 < 1) return true;
  const a = Math.atan2(dy, dx);
  return Math.abs(angleDelta(angle, a)) <= half;
}

/**
 * Detection strength 0..1 of a point already inside the cone: full inside `close` range and on the
 * cone's axis, easing to a floor at the far edge. A step closer, or a step toward the axis, matters.
 */
export function coneStrength(ox, oy, angle, half, range, px, py, close) {
  const d = dist(ox, oy, px, py);
  const near = clamp(1 - (d - close) / Math.max(1, range - close), 0.3, 1);
  const off = Math.abs(angleDelta(angle, Math.atan2(py - oy, px - ox))) / half;
  return near * (1 - 0.4 * clamp(off, 0, 1));
}
