import type { SaveData } from '../core/storage';
import type { CharacterId } from '../game/types';

/* Spark mastery: every spark levels up by being played (levels 1–10). */

export const MASTERY_MAX = 10;

/** Total mastery XP needed for a level: 600, 1.800, 3.600 … 33.000. */
export const masteryXpFor = (level: number): number => 300 * level * (level + 1);

export const masteryLevel = (xp: number): number => {
  let lv = 0;
  while (lv < MASTERY_MAX && xp >= masteryXpFor(lv + 1)) lv++;
  return lv;
};

/** Score and shard bonus of a mastery level (1 % per level). */
export const masteryBonus = (level: number): number => 0.01 * level;

/** Diamonds for reaching a mastery level. */
export const masteryReward = (level: number): number => (level === MASTERY_MAX ? 30 : level === 5 ? 15 : 5);

export const sparkMastery = (s: SaveData, id: CharacterId): number => masteryLevel(s.mastery[id] ?? 0);

/** Adds mastery XP to a spark and grants the diamonds of every level reached. Returns the new levels. */
export function addMastery(s: SaveData, id: CharacterId, xp: number): number[] {
  const before = masteryLevel(s.mastery[id] ?? 0);
  s.mastery[id] = (s.mastery[id] ?? 0) + Math.max(0, Math.floor(xp));
  const after = masteryLevel(s.mastery[id] ?? 0);
  const levels: number[] = [];
  for (let lv = before + 1; lv <= after; lv++) {
    s.diamonds += masteryReward(lv);
    levels.push(lv);
  }
  return levels;
}
