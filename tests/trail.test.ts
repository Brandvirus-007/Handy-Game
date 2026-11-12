import { describe, expect, it } from 'vitest';
import { Trail } from '../src/game/trail';
import { pointInPolygon } from '../src/core/geometry';

/** Drives the trail along a circle and returns the first loop. */
function drawCircle(trail: Trail, cx: number, cy: number, r: number, turns = 1.2, steps = 120) {
  let t = 0;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 * turns;
    t += 1 / 120;
    const loop = trail.update(cx + Math.cos(a) * r, cy + Math.sin(a) * r, t);
    if (loop) return loop;
  }
  return null;
}

describe('trail loop detection', () => {
  it('detects a closed circle and its interior', () => {
    const trail = new Trail(2000, 10);
    const loop = drawCircle(trail, 100, 100, 50);
    expect(loop).not.toBeNull();
    expect(loop!.area).toBeGreaterThan(Math.PI * 50 * 50 * 0.8);
    expect(pointInPolygon(100, 100, loop!.poly)).toBe(true);
    expect(pointInPolygon(200, 100, loop!.poly)).toBe(false);
  });

  it('does not loop on a straight line or zig-zag without crossing', () => {
    const trail = new Trail(2000, 10);
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 0.01;
      expect(trail.update(i * 6, 100 + (i % 2) * 3, t)).toBeNull();
    }
  });

  it('ignores tiny jitter loops', () => {
    const trail = new Trail(2000, 10);
    expect(drawCircle(trail, 100, 100, 8, 1.5, 40)).toBeNull();
  });

  it('respects max length (trail too short to close)', () => {
    const trail = new Trail(150, 10);
    expect(drawCircle(trail, 100, 100, 60)).toBeNull();
    expect(trail.totalLength).toBeLessThanOrEqual(160);
  });

  it('expires old points by lifetime', () => {
    const trail = new Trail(5000, 0.5);
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 0.05;
      trail.update(i * 6, 0, t);
    }
    for (const p of trail.points) expect(t - p.t).toBeLessThanOrEqual(0.55);
  });

  it('restarts from the crossing point after a loop', () => {
    const trail = new Trail(2000, 10);
    const loop = drawCircle(trail, 100, 100, 50);
    expect(loop).not.toBeNull();
    expect(trail.points.length).toBeLessThanOrEqual(2);
  });

  it('cuts by circle and keeps the head part', () => {
    const trail = new Trail(5000, 10);
    let t = 0;
    for (let i = 0; i < 50; i++) trail.update(i * 6, 0, (t += 0.01));
    const before = trail.points.length;
    const cut = trail.cutByCircle(60, 0, 4);
    expect(cut).not.toBeNull();
    expect(trail.points.length).toBeLessThan(before);
    expect(trail.points[0].x).toBeGreaterThanOrEqual(54);
  });
});
