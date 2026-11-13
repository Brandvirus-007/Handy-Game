import { describe, expect, it } from 'vitest';
import { World, type RunOptions } from '../src/game/world';
import { bossForWave, buildWave } from '../src/game/waves';
import { BIOMES, biomeForWave } from '../src/game/config';
import { Rng } from '../src/core/rng';
import type { Vec } from '../src/core/math';

const opts = (over: Partial<RunOptions> = {}): RunOptions => ({
  width: 390, height: 760, character: 'spark', seed: 5, modifiers: [], meta: {}, daily: false, tutorial: false, ...over,
});

const square = (cx: number, cy: number, r: number): Vec[] => [
  { x: cx - r, y: cy - r }, { x: cx + r, y: cy - r }, { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r },
];

describe('new enemies', () => {
  it('bouncers turn around at the wall', () => {
    const w = new World(opts());
    w.invuln = 99;
    const e = w.spawnDirect('bouncer', 6, 300);
    e.t = 1;
    e.state = 1;
    e.timer = 10;
    e.angle = Math.PI; // heading left, into the wall
    w.update(1 / 60);
    expect(e.vx).toBeGreaterThan(0);
  });

  it('invisible ghosts cannot be caught, visible ones can', () => {
    const w = new World(opts());
    w.invuln = 99;
    const g = w.spawnDirect('ghost', 200, 300, true);
    g.t = 1;
    g.state = 2;
    g.timer = 5;
    w.update(1 / 60);
    expect(g.shielded).toBe(true);
    const loop = (w as unknown as { resolveLoop(p: Vec[], echo: boolean): void });
    loop.resolveLoop(square(g.x, g.y, 30), false);
    expect(g.dead).toBe(false);
    g.state = 0;
    w.update(1 / 60);
    loop.resolveLoop(square(g.x, g.y, 30), false);
    expect(g.dead).toBe(true);
  });

  it('both appear in later waves', () => {
    const rng = new Rng(4);
    expect(buildWave(19, rng, []).newEnemy).toBe('bouncer');
    expect(buildWave(22, rng, []).newEnemy).toBe('ghost');
  });
});

describe('the Vortex', () => {
  it('is the sixth boss', () => {
    expect(bossForWave(30, []).boss).toBe('vortex');
    expect(bossForWave(6, ['bossonly']).boss).toBe('vortex');
  });

  it('pulls the spark towards itself', () => {
    const w = new World(opts());
    w.invuln = 99;
    const v = w.spawnDirect('vortex', 195, 300, true);
    v.t = 2;
    w.px = w.tx = 195;
    w.py = w.ty = 480;
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    expect(w.py).toBeLessThan(480);
  });
});

describe('new region', () => {
  it('waves 51 to 60 play in the crystal grotto', () => {
    expect(BIOMES[biomeForWave(51)].id).toBe('crystal');
    expect(BIOMES[biomeForWave(60)].id).toBe('crystal');
    expect(BIOMES[biomeForWave(61)].id).toBe('nebula');
  });
});

describe('weekly event', () => {
  it('changes theme every Monday', async () => {
    const { weekOf, weeklyTheme, weeklyDaysLeft } = await import('../src/economy/weekly');
    expect(weekOf('2026-11-02')).toBe(1);
    expect(weekOf('2026-11-08')).toBe(1);
    expect(weekOf('2026-11-09')).toBe(2);
    expect(weeklyTheme(1).id).not.toBe(weeklyTheme(2).id);
    expect(weeklyDaysLeft('2026-11-02')).toBe(7);
    expect(weeklyDaysLeft('2026-11-08')).toBe(1);
  });

  it('pays each goal once per week and resets the next week', async () => {
    const { recordWeekly, weeklyTheme, WEEKLY_REWARDS, ensureWeek } = await import('../src/economy/weekly');
    const { defaultSave } = await import('../src/core/storage');
    const s = defaultSave();
    const goals = weeklyTheme(1).goals;
    expect(recordWeekly(s, goals[0] - 1, '2026-11-03')).toEqual([]);
    const gems = s.diamonds;
    expect(recordWeekly(s, goals[1], '2026-11-03')).toEqual([0, 1]);
    expect(s.diamonds).toBe(gems + (WEEKLY_REWARDS[1].diamonds ?? 0));
    expect(recordWeekly(s, goals[1] + 10, '2026-11-04')).toEqual([]);
    expect(recordWeekly(s, goals[2], '2026-11-05')).toEqual([2]);
    ensureWeek(s, '2026-11-10');
    expect(s.weekly).toEqual({ week: 2, best: 0, reached: 0 });
  });
});
