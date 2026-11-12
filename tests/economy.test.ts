import { describe, expect, it } from 'vitest';
import { defaultSave, sanitize } from '../src/core/storage';
import {
  addXp, claimLogin, claimMilestone, claimMission, claimMissionBonus, dayBefore, ensureMissions,
  freeDiamondAdsLeft, countFreeDiamondAd, loginDayToClaim, payBoosters, progressMissions, spend, boosterCost,
} from '../src/economy/profile';
import { LOGIN_REWARDS, xpForLevel, reviveCost, REVIVE_DIAMONDS, MISSIONS_PER_DAY } from '../src/economy/defs';

describe('wallet', () => {
  it('spend never goes negative', () => {
    const s = defaultSave();
    s.bank = 100;
    expect(spend(s, 'coins', 150)).toBe(false);
    expect(s.bank).toBe(100);
    expect(spend(s, 'coins', 100)).toBe(true);
    expect(s.bank).toBe(0);
    expect(spend(s, 'diamonds', -5)).toBe(false);
  });

  it('boosters are paid atomically across currencies', () => {
    const s = defaultSave();
    s.bank = 1000;
    s.diamonds = 5;
    expect(boosterCost(['shield', 'lucky'])).toEqual({ coins: 150, diamonds: 8 });
    expect(payBoosters(s, ['shield', 'lucky'])).toBe(false);
    expect(s.bank).toBe(1000);
    s.diamonds = 8;
    expect(payBoosters(s, ['shield', 'lucky'])).toBe(true);
    expect(s.bank).toBe(850);
    expect(s.diamonds).toBe(0);
  });

  it('revive prices escalate and cap', () => {
    expect(reviveCost(REVIVE_DIAMONDS, 0)).toBe(15);
    expect(reviveCost(REVIVE_DIAMONDS, 1)).toBe(30);
    expect(reviveCost(REVIVE_DIAMONDS, 99)).toBe(REVIVE_DIAMONDS[REVIVE_DIAMONDS.length - 1]);
  });
});

describe('progression', () => {
  it('levels up with rewards and keeps the remainder', () => {
    const s = defaultSave();
    const ups = addXp(s, xpForLevel(1) + xpForLevel(2) + 10);
    expect(ups.map((u) => u.level)).toEqual([2, 3]);
    expect(s.level).toBe(3);
    expect(s.xp).toBe(10);
    expect(s.diamonds).toBeGreaterThan(0);
    expect(s.bank).toBeGreaterThan(0);
  });

  it('milestones pay once', () => {
    const s = defaultSave();
    expect(claimMilestone(s, 5)).toBe(5);
    expect(claimMilestone(s, 5)).toBe(0);
    expect(claimMilestone(s, 6)).toBe(0);
    expect(s.diamonds).toBe(5);
  });

  it('login streak advances daily and resets after a gap', () => {
    const s = defaultSave();
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(claimLogin(s, '2026-11-10')).toEqual(LOGIN_REWARDS[0]);
    expect(claimLogin(s, '2026-11-10')).toBeNull();
    expect(loginDayToClaim(s, '2026-11-11')).toBe(1);
    claimLogin(s, '2026-11-11');
    expect(loginDayToClaim(s, '2026-11-13')).toBe(0); // missed the 12th
  });

  it('login calendar wraps after day 7', () => {
    const s = defaultSave();
    for (let d = 1; d <= 7; d++) claimLogin(s, `2026-11-0${d}`);
    expect(loginDayToClaim(s, '2026-11-08')).toBe(0);
  });
});

describe('missions', () => {
  it('are deterministic per day and complete from run results', () => {
    const a = defaultSave();
    const b = defaultSave();
    ensureMissions(a, '2026-11-12');
    ensureMissions(b, '2026-11-12');
    expect(a.missions.list).toEqual(b.missions.list);
    expect(a.missions.list.length).toBe(MISSIONS_PER_DAY);
    const huge = { kills: 999, loops: 999, wave: 99, bestLoop: 99, bosses: 9, shards: 9999, pulses: 99, maxCombo: 99 };
    const done = progressMissions(a, huge);
    expect(done.length).toBe(MISSIONS_PER_DAY);
    for (let i = 0; i < MISSIONS_PER_DAY; i++) expect(claimMission(a, i)).not.toBeNull();
    expect(claimMission(a, 0)).toBeNull();
    expect(claimMissionBonus(a)).toEqual({ diamonds: 5 });
    expect(claimMissionBonus(a)).toBeNull();
  });

  it('max-type missions take the best run, sum-type missions add up', () => {
    const s = defaultSave();
    s.missions = {
      date: 'x', bonusClaimed: false,
      list: [
        { type: 'wave', target: 8, progress: 0, reward: { diamonds: 3 }, claimed: false },
        { type: 'kills', target: 50, progress: 0, reward: { coins: 150 }, claimed: false },
      ],
    };
    const run = { kills: 30, loops: 0, wave: 5, bestLoop: 0, bosses: 0, shards: 0, pulses: 0, maxCombo: 0 };
    progressMissions(s, run);
    progressMissions(s, run);
    expect(s.missions.list[0].progress).toBe(5);
    expect(s.missions.list[1].progress).toBe(50);
  });
});

describe('ads bookkeeping and save migration', () => {
  it('limits free diamond ads per day', () => {
    const s = defaultSave();
    expect(freeDiamondAdsLeft(s, 'd1')).toBe(3);
    countFreeDiamondAd(s, 'd1');
    countFreeDiamondAd(s, 'd1');
    expect(freeDiamondAdsLeft(s, 'd1')).toBe(1);
    expect(freeDiamondAdsLeft(s, 'd2')).toBe(3);
  });

  it('migrates a v1 save without losing shards', () => {
    const v1 = { v: 1, bank: 777, best: 1234, chars: ['spark', 'comet'], meta: { trail: 2 }, tutorialDone: true };
    const s = sanitize(v1);
    expect(s.v).toBe(2);
    expect(s.bank).toBe(777);
    expect(s.diamonds).toBe(0);
    expect(s.level).toBe(1);
    expect(s.chars).toContain('comet');
    expect(s.owned.noAds).toBe(false);
  });
});
