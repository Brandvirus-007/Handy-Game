import type { SaveData } from '../core/storage';
import { LEVEL_COUNT, LEVELS_PER_WORLD, getLevel } from '../game/campaign';
import type { Reward } from './defs';

/* Campaign progress and rewards. Stars are stored per level (0–3). */

export const levelStars = (s: SaveData, index: number): number => s.campaign[index] ?? 0;

/** A level is open when it is the first one or the one before it was cleared. */
export const levelUnlocked = (s: SaveData, index: number): boolean => index === 0 || levelStars(s, index - 1) > 0;

export const totalStars = (s: SaveData): number => s.campaign.reduce((n, v) => n + (v ?? 0), 0);

export const worldStars = (s: SaveData, world: number): number => {
  let n = 0;
  for (let i = 0; i < LEVELS_PER_WORLD; i++) n += levelStars(s, world * LEVELS_PER_WORLD + i);
  return n;
};

/** The next level to play: the first one without stars (or the last one when everything is done). */
export const nextLevel = (s: SaveData): number => {
  for (let i = 0; i < LEVEL_COUNT; i++) if (levelStars(s, i) === 0) return i;
  return LEVEL_COUNT - 1;
};

/**
 * Saves a finished level and pays for every star reached for the first time:
 * shards per star, diamonds for three stars and for beating a world's boss.
 */
export function recordLevel(s: SaveData, index: number, stars: [boolean, boolean, boolean]): { gained: number; reward: Reward } {
  const lv = getLevel(index);
  const count = stars.filter(Boolean).length;
  const before = levelStars(s, index);
  const gained = Math.max(0, count - before);
  const reward: Reward = { coins: gained * (40 + 20 * lv.world), diamonds: 0 };
  if (count === 3 && before < 3) reward.diamonds! += 5;
  if (lv.number === LEVELS_PER_WORLD && before === 0 && stars[0]) reward.diamonds! += 25;
  if (count > before) {
    while (s.campaign.length <= index) s.campaign.push(0);
    s.campaign[index] = count;
  }
  s.bank += reward.coins ?? 0;
  s.diamonds += reward.diamonds ?? 0;
  return { gained, reward };
}
