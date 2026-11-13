import type { AchievementId } from '../game/achievements';

/*
 * Google Play Games IDs from the Play Console (Play Games Services → Leaderboards / Achievements).
 * Empty strings are skipped, so the game works without any of them. See docs/PLAY_GAMES_SETUP.md.
 */

export type LeaderboardKey = 'score' | 'wave' | 'blitz' | 'bosses' | 'weekly';

export const LEADERBOARD_IDS: Record<LeaderboardKey, string> = {
  score: '',
  wave: '',
  blitz: '',
  bosses: '',
  weekly: '',
};

export const ACHIEVEMENT_IDS: Partial<Record<AchievementId, string>> = {};
