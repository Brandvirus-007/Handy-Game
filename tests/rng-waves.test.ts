import { describe, expect, it } from 'vitest';
import { Rng, dailySeed, hashString } from '../src/core/rng';
import { buildWave, isBossWave, waveBudget, bossForWave } from '../src/game/waves';
import { ENEMIES } from '../src/game/config';
import { dailySetup } from '../src/game/modifiers';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it('hashes and daily seeds are stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(dailySeed('2026-11-12')).not.toBe(dailySeed('2026-11-13'));
  });
});

describe('waves', () => {
  it('budget grows monotonically', () => {
    for (let n = 1; n < 40; n++) expect(waveBudget(n + 1)).toBeGreaterThan(waveBudget(n));
  });

  it('only spawns unlocked enemies and roughly spends the budget', () => {
    for (let n = 1; n <= 30; n++) {
      if (isBossWave(n, [])) continue;
      const plan = buildWave(n, new Rng(n * 99), []);
      let cost = 0;
      for (const g of plan.groups) {
        expect(ENEMIES[g.type].unlock).toBeLessThanOrEqual(n);
        cost += ENEMIES[g.type].cost * g.count;
        expect(g.elite.length).toBe(g.count);
      }
      expect(cost).toBeGreaterThanOrEqual(waveBudget(n) - 1);
      expect(cost).toBeLessThanOrEqual(waveBudget(n) + 8);
      for (let i = 1; i < plan.groups.length; i++) expect(plan.groups[i].at).toBeGreaterThanOrEqual(plan.groups[i - 1].at);
    }
  });

  it('introduces new enemies on their unlock wave', () => {
    const plan = buildWave(3, new Rng(1), []);
    expect(plan.newEnemy).toBe('cutter');
    expect(plan.groups.some((g) => g.type === 'cutter')).toBe(true);
  });

  it('boss rotation', () => {
    expect(isBossWave(5, [])).toBe(true);
    expect(bossForWave(5, []).boss).toBe('maw');
    expect(bossForWave(10, []).boss).toBe('weaver');
    expect(bossForWave(15, []).boss).toBe('twins');
    expect(bossForWave(20, []).boss).toBe('hydra');
    expect(bossForWave(25, []).boss).toBe('eye');
    expect(bossForWave(30, [])).toEqual({ boss: 'vortex', tier: 0 });
    expect(bossForWave(35, [])).toEqual({ boss: 'maw', tier: 1 });
    expect(isBossWave(3, ['bossrush'])).toBe(true);
  });

  it('daily setup is deterministic and never combines glass + nopulse', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`;
      const a = dailySetup(date, dailySeed(date));
      const b = dailySetup(date, dailySeed(date));
      expect(a).toEqual(b);
      expect(a.modifiers.length).toBe(2);
      expect(new Set(a.modifiers).size).toBe(2);
      expect(a.modifiers.includes('glass') && a.modifiers.includes('nopulse')).toBe(false);
    }
  });
});
