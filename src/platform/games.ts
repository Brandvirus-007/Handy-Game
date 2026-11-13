import { registerPlugin } from '@capacitor/core';
import { ACHIEVEMENT_IDS, LEADERBOARD_IDS, type LeaderboardKey } from './games-ids';
import type { AchievementId } from '../game/achievements';

interface PlayGamesPlugin {
  status(): Promise<{ configured: boolean; signedIn: boolean }>;
  signIn(): Promise<{ signedIn: boolean }>;
  submitScore(o: { leaderboardId: string; score: number }): Promise<void>;
  unlockAchievement(o: { achievementId: string }): Promise<void>;
  showLeaderboards(): Promise<void>;
  showAchievements(): Promise<void>;
}

/**
 * Google Play Games (Android only). Everything is a silent no-op when the app runs in the browser,
 * when no Play Games project is configured, or when the player is not signed in.
 */
export class GameServices {
  configured = false;
  signedIn = false;
  private plugin: PlayGamesPlugin | null;

  constructor(native: boolean) {
    this.plugin = native ? registerPlugin<PlayGamesPlugin>('PlayGames') : null;
  }

  /** Reads the sign-in state (Play Games signs players in automatically on launch). */
  async init(): Promise<void> {
    if (!this.plugin) return;
    try {
      const s = await this.plugin.status();
      this.configured = s.configured;
      this.signedIn = s.signedIn;
    } catch {
      this.configured = false;
    }
  }

  async signIn(): Promise<boolean> {
    if (!this.plugin || !this.configured) return false;
    try {
      this.signedIn = (await this.plugin.signIn()).signedIn;
    } catch {
      this.signedIn = false;
    }
    return this.signedIn;
  }

  submit(key: LeaderboardKey, score: number): void {
    const id = LEADERBOARD_IDS[key];
    if (!this.plugin || !this.signedIn || !id || score <= 0) return;
    void this.plugin.submitScore({ leaderboardId: id, score: Math.floor(score) }).catch(() => undefined);
  }

  unlock(ach: AchievementId): void {
    const id = ACHIEVEMENT_IDS[ach];
    if (!this.plugin || !this.signedIn || !id) return;
    void this.plugin.unlockAchievement({ achievementId: id }).catch(() => undefined);
  }

  async showLeaderboards(): Promise<boolean> {
    if (!this.plugin || !this.configured) return false;
    if (!this.signedIn && !(await this.signIn())) return false;
    try {
      await this.plugin.showLeaderboards();
      return true;
    } catch {
      return false;
    }
  }

  async showAchievements(): Promise<boolean> {
    if (!this.plugin || !this.configured) return false;
    if (!this.signedIn && !(await this.signIn())) return false;
    try {
      await this.plugin.showAchievements();
      return true;
    } catch {
      return false;
    }
  }
}
