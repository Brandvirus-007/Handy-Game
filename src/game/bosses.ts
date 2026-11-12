import { TAU, clamp, len } from '../core/math';
import { ENEMIES } from './config';
import type { World } from './world';
import type { Enemy } from './types';

export const MAW_TELEGRAPH = 0.9;
export const WEAVER_AIM = 0.7;

const tierSpeed = (e: Enemy) => 1 + 0.15 * e.orbit; // `orbit` stores the boss tier

export function updateBoss(w: World, e: Enemy, dt: number): void {
  switch (e.type) {
    case 'maw':
      return updateMaw(w, e, dt);
    case 'weaver':
      return updateWeaver(w, e, dt);
    case 'twin':
      return updateTwin(w, e, dt);
    case 'hydra':
      return updateHydra(w, e, dt);
    case 'head':
      return updateHead(w, e, dt);
    case 'eye':
      return updateEye(w, e, dt);
    default:
      return;
  }
}

/* ───────────── Der Schlund ───────────── */
function updateMaw(w: World, e: Enemy, dt: number): void {
  const enraged = e.phase > 0;
  const sp = e.speed * (enraged ? 1.4 : 1) * tierSpeed(e);
  e.angle += dt * (enraged ? 1.4 : 0.8);
  e.timer -= dt;
  e.ax -= dt; // summon timer

  if (e.state === 0) {
    const dx = w.px - e.x;
    const dy = w.py - e.y;
    const d = len(dx, dy) || 1;
    e.vx = (dx / d) * sp;
    e.vy = (dy / d) * sp;
    if (e.timer <= 0) {
      e.state = 1;
      e.timer = MAW_TELEGRAPH;
      w.emit({ type: 'bossAttack', x: e.x, y: e.y });
    }
  } else if (e.state === 1) {
    e.vx *= 0.9;
    e.vy *= 0.9;
    if (e.timer <= 0) {
      fireRing(w, e, enraged ? 18 : 14, w.rng.range(0, TAU));
      if (enraged) {
        e.state = 2;
        e.timer = 0.38;
      } else {
        e.state = 0;
        e.timer = 4.5 / tierSpeed(e);
      }
    }
  } else {
    e.vx *= 0.9;
    e.vy *= 0.9;
    if (e.timer <= 0) {
      fireRing(w, e, 18, e.bx + Math.PI / 18);
      e.state = 0;
      e.timer = 3.4 / tierSpeed(e);
    }
  }

  if (e.ax <= 0) {
    e.ax = enraged ? 6 : 8;
    if (w.countType('mote') < 8) {
      for (let i = 0; i < 2; i++) {
        const a = w.rng.range(0, TAU);
        w.queueMarker('mote', clamp(e.x + Math.cos(a) * 60, 20, w.w - 20), clamp(e.y + Math.sin(a) * 60, 20, w.h - 20), false, 0);
      }
    }
  }
}

function fireRing(w: World, e: Enemy, count: number, offset: number): void {
  // A gap of three bullets guarantees an escape route.
  const gapStart = w.rng.int(0, count - 1);
  for (let i = 0; i < count; i++) {
    const k = (i - gapStart + count) % count;
    if (k < 3) continue;
    const a = offset + (i / count) * TAU;
    w.shoot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 88 * tierSpeed(e), 5.5);
  }
  e.bx = offset;
  w.emit({ type: 'shoot', x: e.x, y: e.y });
}

/* ───────────── Die Weberin ───────────── */
function updateWeaver(w: World, e: Enemy, dt: number): void {
  const enraged = e.phase > 0;
  e.timer -= dt;
  e.angle += dt * 2;
  if (e.state === 0) {
    // Idle: drift towards the arena centre.
    const cx = w.w / 2;
    const cy = w.h / 2;
    e.vx = (cx - e.x) * 0.35;
    e.vy = (cy - e.y) * 0.35;
    if (e.timer <= 0) {
      const a = w.rng.range(0, TAU);
      const r = w.rng.range(70, 130);
      e.ax = clamp(w.px + Math.cos(a) * r, e.r + 10, w.w - e.r - 10);
      e.ay = clamp(w.py + Math.sin(a) * r, e.r + 10, w.h - e.r - 10);
      e.state = 1;
      e.timer = WEAVER_AIM / tierSpeed(e);
      w.emit({ type: 'bossAttack', x: e.x, y: e.y });
    }
  } else if (e.state === 1) {
    e.vx = 0;
    e.vy = 0;
    if (e.timer <= 0) {
      e.state = 2;
      e.bx = e.x;
      e.by = e.y;
    }
  } else {
    const dx = e.ax - e.x;
    const dy = e.ay - e.y;
    const d = len(dx, dy);
    const sp = 640 * tierSpeed(e);
    if (d < sp * dt + 1) {
      e.x = e.ax;
      e.y = e.ay;
      e.vx = 0;
      e.vy = 0;
      w.addThread(e.bx, e.by, e.x, e.y);
      e.state = 0;
      e.timer = (enraged ? 1.05 : 1.45) / tierSpeed(e);
      e.flock++; // weaver uses `flock` as jump counter
      if (enraged && e.flock % 3 === 0 && w.countType('cutter') < 2) {
        w.queueMarker('cutter', e.x, e.y, false, 0);
      }
    } else {
      e.vx = (dx / d) * sp;
      e.vy = (dy / d) * sp;
    }
  }
}

/* ───────────── Die Zwillinge ───────────── */
function updateTwin(w: World, e: Enemy, dt: number): void {
  const partner = w.enemyById(e.partner);
  const alone = !partner || partner.dead;
  e.timer -= dt;

  if (alone) {
    // Enraged survivor: chase and fire small rings.
    const dx = w.px - e.x;
    const dy = w.py - e.y;
    const d = len(dx, dy) || 1;
    const sp = 72 * tierSpeed(e);
    e.vx = (dx / d) * sp;
    e.vy = (dy / d) * sp;
    if (e.timer <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + e.t;
        w.shoot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 95 * tierSpeed(e), 5);
      }
      w.emit({ type: 'shoot', x: e.x, y: e.y });
      e.timer = 3 / tierSpeed(e);
    }
    return;
  }

  // The leader (lower id) owns the shared orbit centre.
  const leader = e.id < partner.id ? e : partner;
  if (leader === e) {
    const dx = w.px - e.bx;
    const dy = w.py - e.by;
    const d = len(dx, dy) || 1;
    const sp = ENEMIES.twin.speed * tierSpeed(e) * e.slow;
    e.bx += (dx / d) * sp * dt;
    e.by += (dy / d) * sp * dt;
    e.angle += dt * 0.95 * tierSpeed(e) * (e.stun > 0 ? 0.2 : 1);
    // Periodic pinch: the pair snaps together, sweeping the beam.
    const cycle = (e.t % 7.5) / 7.5;
    const pinch = cycle > 0.85 ? Math.sin(((cycle - 0.85) / 0.15) * Math.PI) : 0;
    e.ax = (95 + 50 * Math.sin(e.t * 0.9)) * (1 - pinch * 0.7);
    if (cycle > 0.8 && cycle < 0.81) w.emit({ type: 'bossAttack', x: e.bx, y: e.by });
  }
  const a = leader === e ? e.angle : leader.angle + Math.PI;
  const spread = leader.ax || 100;
  const tx = clamp(leader.bx + Math.cos(a) * spread, e.r, w.w - e.r);
  const ty = clamp(leader.by + Math.sin(a) * spread, e.r, w.h - e.r);
  e.vx = (tx - e.x) * 7;
  e.vy = (ty - e.y) * 7;
}

/* ───────────── Die Hydra ───────────── */
export const HYDRA_TELEGRAPH = 0.7;

function updateHydra(w: World, e: Enemy, dt: number): void {
  if (e.phase > 0) {
    w.splitHydra(e);
    return;
  }
  e.timer -= dt;
  e.angle += dt;
  const dx = w.px - e.x;
  const dy = w.py - e.y;
  const d = len(dx, dy) || 1;
  if (e.state === 0) {
    const sp = e.speed * tierSpeed(e);
    e.vx = (dx / d) * sp;
    e.vy = (dy / d) * sp;
    if (e.timer <= 0) {
      e.state = 1;
      e.timer = HYDRA_TELEGRAPH;
      w.emit({ type: 'bossAttack', x: e.x, y: e.y });
    }
  } else {
    e.vx *= 0.9;
    e.vy *= 0.9;
    if (e.timer <= 0) {
      // Fan of five venom orbs towards the player.
      const base = Math.atan2(dy, dx);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.24;
        w.shoot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 100 * tierSpeed(e), 5.5);
      }
      w.emit({ type: 'shoot', x: e.x, y: e.y });
      e.state = 0;
      e.timer = 4.6 / tierSpeed(e);
    }
  }
}

function updateHead(w: World, e: Enemy, dt: number): void {
  e.timer -= dt;
  const dx = w.px - e.x;
  const dy = w.py - e.y;
  const d = len(dx, dy) || 1;
  const a = Math.atan2(dy, dx) + Math.sin(e.t * 1.7 + e.seed) * 0.7;
  const sp = e.speed * tierSpeed(e);
  e.vx = Math.cos(a) * sp;
  e.vy = Math.sin(a) * sp;
  if (e.timer <= 0) {
    w.shoot(e.x + (dx / d) * e.r, e.y + (dy / d) * e.r, Math.atan2(dy, dx), 110 * tierSpeed(e), 5);
    w.emit({ type: 'shoot', x: e.x, y: e.y });
    e.timer = w.rng.range(2.8, 3.8) / tierSpeed(e);
  }
}

/* ───────────── Das Auge ───────────── */
export const EYE_CHARGE = 2.4;
export const EYE_FIRE = 3.6;

function updateEye(w: World, e: Enemy, dt: number): void {
  const enraged = e.phase > 0;
  e.timer -= dt;
  e.ax -= dt; // summon timer
  e.vx = (w.w / 2 - e.x) * 0.25;
  e.vy = (w.h / 2 - e.y) * 0.25;
  e.angle += dt * (e.state === 1 ? (enraged ? 0.8 : 0.58) * tierSpeed(e) : 0.12);
  if (e.timer <= 0) {
    if (e.state === 0) {
      e.state = 1;
      e.timer = EYE_FIRE;
      w.emit({ type: 'bossAttack', x: e.x, y: e.y });
    } else {
      e.state = 0;
      e.timer = (enraged ? EYE_CHARGE * 0.8 : EYE_CHARGE) / tierSpeed(e);
    }
  }
  if (e.ax <= 0) {
    e.ax = enraged ? 6 : 8;
    if (w.countType('mote') < 6) {
      for (let i = 0; i < 2; i++) {
        const a = w.rng.range(0, TAU);
        w.queueMarker('mote', clamp(e.x + Math.cos(a) * 90, 20, w.w - 20), clamp(e.y + Math.sin(a) * 90, 20, w.h - 20), false, 0);
      }
    }
  }
}

export interface Beam {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Rendering hint. */
  kind: 'twin' | 'eye';
}

/** Rays of the eye boss; `armed` = currently dangerous (false = telegraph only). */
export function eyeRays(w: World, armed: boolean): Beam[] {
  const out: Beam[] = [];
  for (const e of w.enemies) {
    if (e.type !== 'eye' || e.dead || e.t < 1) continue;
    if ((e.state === 1) !== armed) continue;
    const n = e.phase > 0 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const a = e.angle + (k * TAU) / n;
      out.push({ ax: e.x + Math.cos(a) * e.r, ay: e.y + Math.sin(a) * e.r, bx: e.x + Math.cos(a) * 1400, by: e.y + Math.sin(a) * 1400, kind: 'eye' });
    }
  }
  return out;
}

/** All boss hazard beams that hurt the player and cut the trail right now. */
export function hazardBeams(w: World): Beam[] {
  const out = eyeRays(w, true);
  const tb = twinBeam(w);
  if (tb) out.push({ ...tb, kind: 'twin' });
  return out;
}

/** The beam between living, non-stunned twins. */
export function twinBeam(w: World): { ax: number; ay: number; bx: number; by: number } | null {
  for (const e of w.enemies) {
    if (e.type !== 'twin' || e.dead) continue;
    const p = w.enemyById(e.partner);
    if (!p || p.dead || e.id > p.id) continue;
    if (e.stun > 0 || p.stun > 0 || e.t < 1 || p.t < 1) return null;
    return { ax: e.x, ay: e.y, bx: p.x, by: p.y };
  }
  return null;
}
