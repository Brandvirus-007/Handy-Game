import type { SaveData } from '../core/storage';
import type { GameMode } from '../game/modes';
import { MILESTONES, xpForLevel, type MissionType, type Reward } from './defs';
import { PASS_FREE, PASS_TIERS, PASS_XP_PER_TIER, passTier, type PassReward } from './pass';
import { WEEKLY_REWARDS, weekOf, weeklyTheme } from './weekly';
import { levelPath, type Unlock } from './unlocks';

/*
 * "Next goals" on the result screen: what the player can reach next and how much is missing.
 * Only goals that are within reach are offered (a record far away is more frustrating than motivating),
 * the closest ones first.
 */

interface GoalBase {
  /** 0 … 1, how far the player already is. */
  progress: number;
  /** What is still missing, in the goal's own unit (points, waves, XP, mission steps). */
  missing: number;
}

export type Goal =
  | (GoalBase & { kind: 'best'; target: number })
  | (GoalBase & { kind: 'weekly'; medal: number; target: number; reward: Reward })
  | (GoalBase & { kind: 'milestone'; wave: number; reward: Reward })
  | (GoalBase & { kind: 'pass'; tier: number; reward: PassReward })
  | (GoalBase & { kind: 'mission'; type: MissionType; current: number; target: number; reward: Reward })
  | (GoalBase & { kind: 'level'; level: number; unlock: Unlock });

export interface GoalRun {
  score: number;
  wavesCleared: number;
  mode: GameMode;
  daily: boolean;
  weekly: boolean;
  campaign: boolean;
  challenge: boolean;
  newBest: boolean;
}

/** A record only counts as a goal when this run got at least this close to it. */
export const BEST_NEAR = 0.4;
/** A wave milestone only counts as a goal when this run got at least this close to it. */
export const MILESTONE_NEAR = 0.3;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** All goals the player could aim for after this run (unsorted). */
export function goalCandidates(s: SaveData, run: GoalRun, today: string): Goal[] {
  const out: Goal[] = [];

  // Record of the kind of run just played (fixed runs like campaign levels and challenges have none).
  if (!run.newBest && !run.campaign && !run.challenge && !run.weekly) {
    const best = run.daily ? (s.daily.date === today ? s.daily.best : 0) : run.mode === 'normal' ? s.best : s.modeBest[run.mode];
    const progress = best > 0 ? run.score / best : 0;
    if (best > 0 && progress >= BEST_NEAR && progress < 1) out.push({ kind: 'best', target: best, progress, missing: best - run.score });
  }

  // Next medal of the weekly event (counts the best score of the week).
  if (run.weekly && s.weekly.week === weekOf(today) && s.weekly.reached < 3) {
    const medal = s.weekly.reached;
    const target = weeklyTheme(s.weekly.week).goals[medal];
    const best = s.weekly.best;
    out.push({ kind: 'weekly', medal, target, reward: WEEKLY_REWARDS[medal], progress: clamp01(best / target), missing: Math.max(1, target - best) });
  }

  // Next wave milestone (campaign levels are too short to reach one).
  if (!run.campaign) {
    const next = MILESTONES.find((m) => !s.milestones.includes(m.wave));
    if (next) {
      const progress = run.wavesCleared / next.wave;
      if (progress >= MILESTONE_NEAR && progress < 1)
        out.push({ kind: 'milestone', wave: next.wave, reward: { diamonds: next.diamonds }, progress, missing: next.wave - run.wavesCleared });
    }
  }

  // Next light pass tier.
  const tier = passTier(s.pass.points);
  if (tier < PASS_TIERS) {
    const into = s.pass.points - tier * PASS_XP_PER_TIER;
    out.push({ kind: 'pass', tier: tier + 1, reward: PASS_FREE[tier], progress: clamp01(into / PASS_XP_PER_TIER), missing: PASS_XP_PER_TIER - into });
  }

  // Daily missions that are started but not done.
  if (s.missions.date === today) {
    for (const m of s.missions.list) {
      if (m.claimed || m.progress >= m.target) continue;
      out.push({ kind: 'mission', type: m.type, current: m.progress, target: m.target, reward: m.reward, progress: clamp01(m.progress / m.target), missing: m.target - m.progress });
    }
  }

  // Next level, but only when it brings something new.
  const step = levelPath().find((l) => l.level === s.level + 1);
  if (step && step.unlocks.length > 0) {
    const need = xpForLevel(s.level);
    out.push({ kind: 'level', level: s.level + 1, unlock: step.unlocks[0], progress: clamp01(s.xp / need), missing: Math.max(1, need - s.xp) });
  }

  return out;
}

/** The closest goals, nearest first: at most `max`, and never two missions. */
export function nextGoals(s: SaveData, run: GoalRun, today: string, max = 2): Goal[] {
  const sorted = goalCandidates(s, run, today).sort((a, b) => b.progress - a.progress);
  const picked: Goal[] = [];
  for (const g of sorted) {
    if (picked.length >= max) break;
    if (g.kind === 'mission' && picked.some((p) => p.kind === 'mission')) continue;
    picked.push(g);
  }
  return picked;
}
