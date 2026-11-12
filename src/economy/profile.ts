import { Rng, hashString } from '../core/rng';
import type { SaveData, MissionState } from '../core/storage';
import {
  ACHIEVEMENT_DIAMONDS,
  BOOSTERS,
  LOGIN_REWARDS,
  MILESTONES,
  MISSION_BONUS,
  MISSION_TEMPLATES,
  MISSIONS_PER_DAY,
  FREE_DIAMOND_ADS_PER_DAY,
  levelReward,
  xpForLevel,
  type BoosterId,
  type Currency,
  type Reward,
} from './defs';

/* Pure economy rules operating on the save data. The app persists after calling them. */

export function grant(s: SaveData, r: Reward): void {
  if (r.coins) s.bank += r.coins;
  if (r.diamonds) s.diamonds += r.diamonds;
}

export const balance = (s: SaveData, c: Currency): number => (c === 'coins' ? s.bank : s.diamonds);

export function canAfford(s: SaveData, c: Currency, amount: number): boolean {
  return balance(s, c) >= amount;
}

/** Spends currency if possible. Returns false (and changes nothing) otherwise. */
export function spend(s: SaveData, c: Currency, amount: number): boolean {
  if (amount < 0 || !canAfford(s, c, amount)) return false;
  if (c === 'coins') s.bank -= amount;
  else s.diamonds -= amount;
  return true;
}

export const addReward = (a: Reward, b: Reward): Reward => ({
  coins: (a.coins ?? 0) + (b.coins ?? 0),
  diamonds: (a.diamonds ?? 0) + (b.diamonds ?? 0),
});

// ───────────────────────── Levels ─────────────────────────

export interface LevelUp {
  level: number;
  reward: Reward;
}

/** Adds XP, applies level-ups (with rewards granted) and returns them. */
export function addXp(s: SaveData, xp: number): LevelUp[] {
  const ups: LevelUp[] = [];
  s.xp += Math.max(0, Math.floor(xp));
  let guard = 0;
  while (s.xp >= xpForLevel(s.level) && guard++ < 200) {
    s.xp -= xpForLevel(s.level);
    s.level++;
    const reward = levelReward(s.level);
    grant(s, reward);
    ups.push({ level: s.level, reward });
  }
  return ups;
}

// ───────────────────────── Milestones ─────────────────────────

/** Grants the milestone for `wave` if it is one and not yet claimed. Returns the diamonds granted. */
export function claimMilestone(s: SaveData, wave: number): number {
  const m = MILESTONES.find((x) => x.wave === wave);
  if (!m || s.milestones.includes(wave)) return 0;
  s.milestones.push(wave);
  s.diamonds += m.diamonds;
  return m.diamonds;
}

export function achievementDiamonds(id: string): number {
  return ACHIEVEMENT_DIAMONDS[id] ?? 5;
}

// ───────────────────────── Daily login ─────────────────────────

export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Index (0–6) of the login reward that can be claimed today, or null if already claimed. */
export function loginDayToClaim(s: SaveData, today: string): number | null {
  if (s.login.last === today) return null;
  if (s.login.last === dayBefore(today)) return s.login.day % LOGIN_REWARDS.length;
  return 0;
}

export function claimLogin(s: SaveData, today: string): Reward | null {
  const day = loginDayToClaim(s, today);
  if (day === null) return null;
  const reward = LOGIN_REWARDS[day];
  grant(s, reward);
  s.login = { last: today, day: (day + 1) % LOGIN_REWARDS.length };
  return reward;
}

// ───────────────────────── Missions ─────────────────────────

/** Difficulty tier from the player's progress. */
export const missionTier = (s: SaveData): 0 | 1 | 2 => (s.stats.bestWave >= 12 ? 2 : s.stats.bestWave >= 6 ? 1 : 0);

/** Makes sure today's missions exist (deterministic per date and tier). */
export function ensureMissions(s: SaveData, today: string): void {
  if (s.missions.date === today && s.missions.list.length === MISSIONS_PER_DAY) return;
  const tier = missionTier(s);
  const rng = new Rng(hashString('missions/' + today) ^ (tier * 7919));
  const templates = rng.shuffle([...MISSION_TEMPLATES]).slice(0, MISSIONS_PER_DAY);
  s.missions = {
    date: today,
    bonusClaimed: false,
    list: templates.map((tpl) => ({ type: tpl.type, target: tpl.targets[tier], progress: 0, reward: { ...tpl.reward }, claimed: false })),
  };
}

export interface RunProgress {
  kills: number;
  loops: number;
  wave: number;
  bestLoop: number;
  bosses: number;
  shards: number;
  pulses: number;
  maxCombo: number;
}

/** Applies a finished run to today's missions. Returns the missions that just became complete. */
export function progressMissions(s: SaveData, r: RunProgress): MissionState[] {
  const done: MissionState[] = [];
  const value: Record<MissionState['type'], number> = {
    kills: r.kills,
    loops: r.loops,
    wave: r.wave,
    bigloop: r.bestLoop,
    boss: r.bosses,
    shards: r.shards,
    pulse: r.pulses,
    runs: 1,
    combo: r.maxCombo,
  };
  for (const m of s.missions.list) {
    if (m.claimed) continue;
    const before = m.progress;
    const tpl = MISSION_TEMPLATES.find((t) => t.type === m.type)!;
    m.progress = Math.min(m.target, tpl.max ? Math.max(m.progress, value[m.type]) : m.progress + value[m.type]);
    if (before < m.target && m.progress >= m.target) done.push(m);
  }
  return done;
}

export function claimMission(s: SaveData, index: number): Reward | null {
  const m = s.missions.list[index];
  if (!m || m.claimed || m.progress < m.target) return null;
  m.claimed = true;
  grant(s, m.reward);
  return m.reward;
}

export const missionsClaimable = (s: SaveData): number =>
  s.missions.list.filter((m) => !m.claimed && m.progress >= m.target).length + (canClaimMissionBonus(s) ? 1 : 0);

export const canClaimMissionBonus = (s: SaveData): boolean =>
  !s.missions.bonusClaimed && s.missions.list.length > 0 && s.missions.list.every((m) => m.claimed);

export function claimMissionBonus(s: SaveData): Reward | null {
  if (!canClaimMissionBonus(s)) return null;
  s.missions.bonusClaimed = true;
  grant(s, MISSION_BONUS);
  return MISSION_BONUS;
}

// ───────────────────────── Ads bookkeeping ─────────────────────────

export function freeDiamondAdsLeft(s: SaveData, today: string): number {
  if (s.ads.date !== today) return FREE_DIAMOND_ADS_PER_DAY;
  return Math.max(0, FREE_DIAMOND_ADS_PER_DAY - s.ads.freeDiamonds);
}

export function countFreeDiamondAd(s: SaveData, today: string): void {
  if (s.ads.date !== today) {
    s.ads.date = today;
    s.ads.freeDiamonds = 0;
  }
  s.ads.freeDiamonds++;
}

// ───────────────────────── Boosters ─────────────────────────

export const availableBoosters = (s: SaveData) => BOOSTERS.filter((b) => s.stats.bestWave >= b.requiresWave);

/** Total price of a booster selection per currency. */
export function boosterCost(ids: readonly BoosterId[]): Reward {
  let r: Reward = {};
  for (const id of ids) {
    const b = BOOSTERS.find((x) => x.id === id);
    if (b) r = addReward(r, { [b.currency]: b.price });
  }
  return r;
}

/** Pays for the selected boosters. Returns false (nothing spent) if not affordable. */
export function payBoosters(s: SaveData, ids: readonly BoosterId[]): boolean {
  const cost = boosterCost(ids);
  if (s.bank < (cost.coins ?? 0) || s.diamonds < (cost.diamonds ?? 0)) return false;
  s.bank -= cost.coins ?? 0;
  s.diamonds -= cost.diamonds ?? 0;
  return true;
}
