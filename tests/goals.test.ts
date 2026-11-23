import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/storage';
import { goalCandidates, nextGoals, BEST_NEAR, type GoalRun } from '../src/economy/goals';
import { PASS_TIERS, PASS_XP_PER_TIER } from '../src/economy/pass';
import { MILESTONES } from '../src/economy/defs';
import { weekOf, weeklyTheme } from '../src/economy/weekly';

const TODAY = '2026-11-23';
const run = (o: Partial<GoalRun> = {}): GoalRun => ({
  score: 0,
  wavesCleared: 0,
  mode: 'normal',
  daily: false,
  weekly: false,
  campaign: false,
  challenge: false,
  newBest: false,
  ...o,
});

describe('next goals after a run', () => {
  it('offers the record only when the run came close', () => {
    const s = defaultSave();
    s.best = 10000;
    const near = goalCandidates(s, run({ score: 8800 }), TODAY).find((g) => g.kind === 'best');
    expect(near).toMatchObject({ kind: 'best', target: 10000, missing: 1200 });
    expect(goalCandidates(s, run({ score: 10000 * BEST_NEAR - 1 }), TODAY).some((g) => g.kind === 'best')).toBe(false);
    // A new record or a fixed run (campaign, challenge) has no record goal.
    expect(goalCandidates(s, run({ score: 12000, newBest: true }), TODAY).some((g) => g.kind === 'best')).toBe(false);
    expect(goalCandidates(s, run({ score: 9000, campaign: true }), TODAY).some((g) => g.kind === 'best')).toBe(false);
    expect(goalCandidates(s, run({ score: 9000, challenge: true }), TODAY).some((g) => g.kind === 'best')).toBe(false);
  });

  it('uses the record of the mode that was played', () => {
    const s = defaultSave();
    s.best = 100000;
    s.modeBest.blitz = 5000;
    const g = goalCandidates(s, run({ score: 4000, mode: 'blitz' }), TODAY).find((x) => x.kind === 'best');
    expect(g).toMatchObject({ target: 5000, missing: 1000 });
    s.daily = { date: TODAY, best: 3000 };
    expect(goalCandidates(s, run({ score: 2500, daily: true }), TODAY).find((x) => x.kind === 'best')).toMatchObject({ target: 3000 });
  });

  it('points to the next wave milestone that is not claimed yet', () => {
    const s = defaultSave();
    s.milestones = [5, 10];
    const g = goalCandidates(s, run({ wavesCleared: 13 }), TODAY).find((x) => x.kind === 'milestone');
    expect(g).toMatchObject({ wave: 15, missing: 2, reward: { diamonds: MILESTONES[2].diamonds } });
    expect(goalCandidates(s, run({ wavesCleared: 13, campaign: true }), TODAY).some((x) => x.kind === 'milestone')).toBe(false);
  });

  it('shows the next pass tier until the pass is complete', () => {
    const s = defaultSave();
    s.pass.points = PASS_XP_PER_TIER * 6 + 215;
    expect(goalCandidates(s, run(), TODAY).find((x) => x.kind === 'pass')).toMatchObject({ tier: 7, missing: PASS_XP_PER_TIER - 215 });
    s.pass.points = PASS_XP_PER_TIER * PASS_TIERS;
    expect(goalCandidates(s, run(), TODAY).some((x) => x.kind === 'pass')).toBe(false);
  });

  it('lists only open missions of today and never two at once', () => {
    const s = defaultSave();
    s.missions = {
      date: TODAY,
      bonusClaimed: false,
      list: [
        { type: 'kills', target: 40, progress: 36, reward: { coins: 150 }, claimed: false },
        { type: 'loops', target: 25, progress: 24, reward: { coins: 150 }, claimed: false },
        { type: 'wave', target: 8, progress: 8, reward: { diamonds: 3 }, claimed: false },
      ],
    };
    const missions = goalCandidates(s, run(), TODAY).filter((x) => x.kind === 'mission');
    expect(missions).toHaveLength(2);
    const picked = nextGoals(s, run(), TODAY, 3);
    expect(picked.filter((x) => x.kind === 'mission')).toHaveLength(1);
    expect(picked[0]).toMatchObject({ kind: 'mission', type: 'loops', missing: 1 });
    s.missions.date = '2026-11-22';
    expect(goalCandidates(s, run(), TODAY).some((x) => x.kind === 'mission')).toBe(false);
  });

  it('names the next level only when it unlocks something', () => {
    const s = defaultSave();
    s.level = 1;
    s.xp = 100;
    const g = goalCandidates(s, run(), TODAY).find((x) => x.kind === 'level');
    expect(g?.kind === 'level' && g.level).toBe(2);
  });

  it('shows the next medal of the weekly event', () => {
    const s = defaultSave();
    const week = weekOf(TODAY);
    const goals = weeklyTheme(week).goals;
    s.weekly = { week, best: goals[0] + 100, reached: 1 };
    const g = goalCandidates(s, run({ weekly: true, score: goals[0] + 100 }), TODAY).find((x) => x.kind === 'weekly');
    expect(g).toMatchObject({ medal: 1, target: goals[1], missing: goals[1] - goals[0] - 100 });
  });

  it('sorts by how close the goal is and keeps every progress between 0 and 1', () => {
    const s = defaultSave();
    s.best = 10000;
    s.pass.points = 10;
    const picked = nextGoals(s, run({ score: 9500 }), TODAY);
    expect(picked[0].kind).toBe('best');
    for (const g of goalCandidates(s, run({ score: 9500 }), TODAY)) {
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThanOrEqual(1);
      expect(g.missing).toBeGreaterThan(0);
    }
  });
});
