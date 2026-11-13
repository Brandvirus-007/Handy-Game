import { describe, expect, it } from 'vitest';
import { defaultSave, sanitize } from '../src/core/storage';
import { creditPurchase } from '../src/economy/profile';
import {
  PASS_FREE,
  PASS_PREMIUM,
  PASS_TIERS,
  PASS_XP_PER_TIER,
  addPassXp,
  canClaim,
  claimAllPass,
  claimPass,
  ensureSeason,
  hasPremium,
  passClaimable,
  premiumTotals,
  seasonDaysLeft,
  seasonOf,
} from '../src/economy/pass';
import { levelPath } from '../src/economy/unlocks';
import { bossForWave, isBossWave } from '../src/game/waves';
import { TRAILS } from '../src/game/trails';
import { World } from '../src/game/world';

describe('light pass seasons', () => {
  it('splits time into 28-day seasons', () => {
    expect(seasonOf('2026-11-02')).toBe(1);
    expect(seasonOf('2026-11-29')).toBe(1);
    expect(seasonOf('2026-11-30')).toBe(2);
    expect(seasonOf('2027-01-01')).toBe(3);
    expect(seasonDaysLeft('2026-11-02')).toBe(28);
    expect(seasonDaysLeft('2026-11-29')).toBe(1);
  });

  it('has a reward on every tier of both tracks', () => {
    expect(PASS_FREE).toHaveLength(PASS_TIERS);
    expect(PASS_PREMIUM).toHaveLength(PASS_TIERS);
    for (const r of [...PASS_FREE, ...PASS_PREMIUM]) expect(Boolean(r.coins || r.diamonds || r.trail)).toBe(true);
    // Trail rewards must exist and must not be for sale – the pass is the only way to get them.
    for (const r of [...PASS_FREE, ...PASS_PREMIUM]) {
      if (!r.trail) continue;
      const def = TRAILS.find((t) => t.id === r.trail);
      expect(def?.price).toBe(0);
    }
  });

  it('free rewards can be claimed once per reached tier', () => {
    const s = defaultSave();
    expect(addPassXp(s, PASS_XP_PER_TIER * 2 + 10, '2026-11-10')).toBe(2);
    expect(canClaim(s, 3, 'free')).toBe(false);
    const bank = s.bank;
    expect(claimPass(s, 1, 'free')).not.toBeNull();
    expect(s.bank).toBeGreaterThan(bank);
    expect(claimPass(s, 1, 'free')).toBeNull();
    expect(canClaim(s, 1, 'premium')).toBe(false);
  });

  it('premium unlocks the second track, including tiers already reached', () => {
    const s = defaultSave();
    addPassXp(s, PASS_XP_PER_TIER * 4, '2026-11-10');
    expect(passClaimable(s)).toBe(4);
    creditPurchase(s, 'light_pass', 'pass-1', '2026-11-10');
    expect(hasPremium(s)).toBe(true);
    expect(passClaimable(s)).toBe(8);
    const sum = claimAllPass(s);
    expect(sum.diamonds + sum.coins).toBeGreaterThan(0);
    expect(passClaimable(s)).toBe(0);
  });

  it('a new season resets progress and premium', () => {
    const s = defaultSave();
    creditPurchase(s, 'light_pass', 'pass-1', '2026-11-10');
    addPassXp(s, 5000, '2026-11-10');
    ensureSeason(s, '2026-12-01');
    expect(s.pass.season).toBe(2);
    expect(s.pass.points).toBe(0);
    expect(hasPremium(s)).toBe(false);
  });

  it('the last tiers hand out the trail designs', () => {
    const s = defaultSave();
    creditPurchase(s, 'light_pass', 'pass-1', '2026-11-10');
    addPassXp(s, PASS_XP_PER_TIER * PASS_TIERS, '2026-11-10');
    claimAllPass(s);
    for (const id of [...premiumTotals().trails, 'gold']) expect(s.trails).toContain(id);
  });
});

describe('game modes', () => {
  it('boss hunt makes every wave a boss wave', () => {
    for (let n = 1; n <= 12; n++) expect(isBossWave(n, ['bossonly'])).toBe(true);
    expect(bossForWave(1, ['bossonly']).tier).toBe(0);
    expect(bossForWave(6, ['bossonly']).tier).toBe(1);
    expect(isBossWave(1, [])).toBe(false);
  });

  it('blitz ends the run when the time is up', () => {
    const w = new World({ width: 420, height: 760, character: 'spark', seed: 3, modifiers: [], meta: {}, daily: false, tutorial: false, timeLimit: 2 });
    w.start();
    w.invuln = 99;
    for (let i = 0; i < 60 * 3 && !w.over; i++) w.update(1 / 60);
    expect(w.over).toBe(true);
    expect(w.timeUp).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'timeUp')).toBe(true);
  });

  it('modes appear on the level path', () => {
    const all = levelPath().flatMap((s) => s.unlocks.map((u) => ({ ...u, level: s.level })));
    expect(all).toContainEqual({ kind: 'mode', id: 'blitz', level: 5 });
    expect(all).toContainEqual({ kind: 'mode', id: 'bosses', level: 12 });
  });

  it('save data keeps trails, pass and mode records', () => {
    const s = sanitize({
      trails: ['ember', 'nope', 'ember'],
      trail: 'ember',
      pass: { season: 3, points: 1200, free: [1, 2, 2, 'x'], premium: [1], premiumSeason: 3 },
      mode: 'blitz',
      modeBest: { blitz: 1234, bosses: 'x' },
    });
    expect(s.trails).toEqual(['default', 'ember']);
    expect(s.trail).toBe('ember');
    expect(s.pass).toEqual({ season: 3, points: 1200, free: [1, 2], premium: [1], premiumSeason: 3 });
    expect(s.mode).toBe('blitz');
    expect(s.modeBest).toEqual({ blitz: 1234, bosses: 0 });
  });
});
