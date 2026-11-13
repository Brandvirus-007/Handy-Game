import type { SaveData } from '../core/storage';
import type { ModifierId } from '../game/types';
import { dayNumber } from './pass';
import type { Reward } from './defs';

/* Weekly event: one theme per week (Monday to Sunday) with three score goals. */

export interface WeeklyTheme {
  id: 'swarm' | 'haste' | 'glass' | 'bosses' | 'comet' | 'silent';
  modifiers: ModifierId[];
  /** Score needed for bronze, silver and gold. */
  goals: [number, number, number];
}

export const WEEKLY_THEMES: WeeklyTheme[] = [
  { id: 'swarm', modifiers: ['swarmy'], goals: [6000, 18000, 45000] },
  { id: 'haste', modifiers: ['haste'], goals: [5000, 15000, 35000] },
  { id: 'glass', modifiers: ['glass'], goals: [3000, 9000, 22000] },
  { id: 'bosses', modifiers: ['bossrush'], goals: [6000, 18000, 45000] },
  { id: 'comet', modifiers: ['longtrail'], goals: [6000, 18000, 45000] },
  { id: 'silent', modifiers: ['nopulse'], goals: [5000, 15000, 35000] },
];

/** Reward per goal: bronze, silver, gold. */
export const WEEKLY_REWARDS: Reward[] = [{ coins: 300 }, { diamonds: 15 }, { diamonds: 40 }];

/** Week number, counted from the light pass launch (both start on a Monday). */
export const weekOf = (dateKey: string): number => Math.max(1, Math.floor(dayNumber(dateKey) / 7) + 1);

export const weeklyTheme = (week: number): WeeklyTheme => WEEKLY_THEMES[(week - 1) % WEEKLY_THEMES.length];

export const weeklyDaysLeft = (dateKey: string): number => 7 - (Math.max(0, dayNumber(dateKey)) % 7);

/** Starts a fresh week when a new one began. */
export function ensureWeek(s: SaveData, dateKey: string): void {
  const week = weekOf(dateKey);
  if (s.weekly.week !== week) s.weekly = { week, best: 0, reached: 0 };
}

/**
 * Records an event run. Grants the rewards of every goal reached for the first time this week
 * and returns their indices (0 = bronze … 2 = gold).
 */
export function recordWeekly(s: SaveData, score: number, dateKey: string): number[] {
  ensureWeek(s, dateKey);
  s.weekly.best = Math.max(s.weekly.best, score);
  const goals = weeklyTheme(s.weekly.week).goals;
  const gained: number[] = [];
  for (let i = s.weekly.reached; i < goals.length && s.weekly.best >= goals[i]; i++) {
    const r = WEEKLY_REWARDS[i];
    if (r.coins) s.bank += r.coins;
    if (r.diamonds) s.diamonds += r.diamonds;
    gained.push(i);
  }
  s.weekly.reached += gained.length;
  return gained;
}
