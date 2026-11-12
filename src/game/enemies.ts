import { TAU, clamp, len } from '../core/math';
import type { World } from './world';
import type { Enemy } from './types';

/** Steering helpers – behaviours only set the desired velocity (vx, vy); the world integrates. */
function seek(e: Enemy, tx: number, ty: number, speed: number, wobble = 0, wobbleFreq = 2): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  let a = Math.atan2(dy, dx);
  if (wobble) a += Math.sin(e.t * wobbleFreq + e.seed) * wobble;
  e.vx = Math.cos(a) * speed;
  e.vy = Math.sin(a) * speed;
}

export const DART_AIM = 0.65;
export const BLINK_WARN = 0.6;
export const DART_DASH_SPEED = 330;
export const SPITTER_CHARGE = 0.6;

export function updateEnemy(w: World, e: Enemy, dt: number): void {
  const px = w.px;
  const py = w.py;
  switch (e.type) {
    case 'mote': {
      // Moth-like flutter: bursts of movement with short pauses – gives windows to loop them.
      const flutter = 0.25 + 0.95 * Math.max(0, Math.sin(e.t * 2.6 + e.seed));
      seek(e, px, py, e.speed * flutter, 0.65, 2.1);
      break;
    }

    case 'mini':
      seek(e, px, py, e.speed, 0.25, 4);
      break;

    case 'gnat': {
      seek(e, px, py, e.speed, 0.35, 5);
      const c = w.flockCenter(e.flock);
      if (c) {
        // Cohesion keeps the swarm together → rewards one huge loop.
        e.vx += (c.x - e.x) * 0.9;
        e.vy += (c.y - e.y) * 0.9;
      }
      break;
    }

    case 'splitter':
      seek(e, px, py, e.speed, 0.4, 1.3);
      break;

    case 'brute':
      seek(e, px, py, e.speed, 0.1, 0.8);
      break;

    case 'dart': {
      e.timer -= dt;
      if (e.state === 0) {
        // Drift – slow approach, then lock on.
        seek(e, px, py, e.speed, 0.9, 1.4);
        if (e.timer <= 0) {
          e.state = 1;
          e.timer = DART_AIM;
          const d = len(px - e.x, py - e.y) || 1;
          e.ax = (px - e.x) / d;
          e.ay = (py - e.y) / d;
        }
      } else if (e.state === 1) {
        // Aim – frozen, telegraph line visible.
        e.vx = 0;
        e.vy = 0;
        if (e.timer <= 0) {
          e.state = 2;
          e.timer = 0.55;
        }
      } else if (e.state === 2) {
        e.vx = e.ax * DART_DASH_SPEED * w.speedMul;
        e.vy = e.ay * DART_DASH_SPEED * w.speedMul;
        const hitWall = e.x <= e.r + 1 || e.x >= w.w - e.r - 1 || e.y <= e.r + 1 || e.y >= w.h - e.r - 1;
        if (e.timer <= 0 || (hitWall && e.timer < 0.5)) {
          e.state = 3;
          e.timer = 0.85;
        }
      } else {
        // Recover – vulnerable window.
        e.vx *= 0.9;
        e.vy *= 0.9;
        if (e.timer <= 0) {
          e.state = 0;
          e.timer = w.rng.range(1.1, 1.9);
        }
      }
      break;
    }

    case 'cutter': {
      e.angle += e.orbit * 1.5 * dt;
      const radius = 112 + 26 * Math.sin(e.t * 0.7 + e.seed);
      const tx = clamp(px + Math.cos(e.angle) * radius, e.r, w.w - e.r);
      const ty = clamp(py + Math.sin(e.angle) * radius, e.r, w.h - e.r);
      const d = len(tx - e.x, ty - e.y);
      const sp = Math.min(e.speed, d * 4);
      if (d > 0.001) {
        e.vx = ((tx - e.x) / d) * sp;
        e.vy = ((ty - e.y) / d) * sp;
      }
      break;
    }

    case 'spitter': {
      const dx = px - e.x;
      const dy = py - e.y;
      const d = len(dx, dy) || 1;
      e.timer -= dt;
      if (e.state === 0) {
        const nx = dx / d;
        const ny = dy / d;
        let fwd = 0;
        if (d < 150) fwd = -1;
        else if (d > 235) fwd = 1;
        // Strafe perpendicular while keeping distance.
        e.vx = (nx * fwd + -ny * e.orbit * 0.8) * e.speed;
        e.vy = (ny * fwd + nx * e.orbit * 0.8) * e.speed;
        if (Math.sin(e.t * 0.5 + e.seed) > 0.97) e.orbit = -e.orbit;
        if (e.timer <= 0) {
          e.state = 1;
          e.timer = SPITTER_CHARGE;
        }
      } else {
        e.vx *= 0.85;
        e.vy *= 0.85;
        e.ax = dx / d;
        e.ay = dy / d;
        if (e.timer <= 0) {
          w.shoot(e.x + e.ax * e.r, e.y + e.ay * e.r, Math.atan2(dy, dx), 118 * Math.min(1.35, w.speedMul), 5);
          e.state = 0;
          e.timer = w.rng.range(2.3, 3.1);
        }
      }
      break;
    }

    case 'warden':
      // Stays a little behind the pack so its aura covers other shadows.
      seek(e, px, py, e.speed, 0.3, 1.1);
      break;

    case 'bomber':
      seek(e, px, py, e.speed, 0.5, 1.7);
      break;

    case 'blinker': {
      e.timer -= dt;
      if (e.state === 0) {
        seek(e, px, py, e.speed, 0.5, 2.2);
        if (e.timer <= 0) {
          // Pick a destination near the player and announce it.
          const a = w.rng.range(0, TAU);
          const r = w.rng.range(85, 135);
          e.bx = clamp(px + Math.cos(a) * r, e.r + 6, w.w - e.r - 6);
          e.by = clamp(py + Math.sin(a) * r, e.r + 6, w.h - e.r - 6);
          e.state = 1;
          e.timer = BLINK_WARN;
          w.emit({ type: 'blink', x: e.bx, y: e.by });
        }
      } else if (e.state === 1) {
        e.vx = 0;
        e.vy = 0;
        if (e.timer <= 0) {
          w.emit({ type: 'blink', x: e.x, y: e.y });
          e.x = e.bx;
          e.y = e.by;
          e.state = 2;
          e.timer = 0.4;
        }
      } else {
        // Just arrived: harmless for a moment (fair after a teleport).
        e.vx = 0;
        e.vy = 0;
        if (e.timer <= 0) {
          e.state = 0;
          e.timer = w.rng.range(2.1, 3);
        }
      }
      break;
    }

    default:
      break;
  }
}

/** Enemies that may not deal contact damage right now. */
export const isHarmless = (e: Enemy): boolean => e.type === 'blinker' && e.state === 2;

/** Spawn burst of minis when a splitter dies. */
export function splitterBurst(w: World, e: Enemy): void {
  const base = w.rng.range(0, TAU);
  for (let i = 0; i < 3; i++) {
    const a = base + (i / 3) * TAU;
    const m = w.createEnemy('mini', e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6, false);
    m.kx = Math.cos(a) * 190;
    m.ky = Math.sin(a) * 190;
    m.t = 0.2; // shorter spawn grace – they come from an existing body
    w.queueSpawn(m);
  }
}
