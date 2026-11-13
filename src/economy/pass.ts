import type { SaveData } from '../core/storage';
import type { TrailId } from '../game/trails';

/* Light pass: a 28-day season with a free and a premium reward track. Pure rules on the save data. */

export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 250;
/**
 * Pass XP comes from playing regularly, not from the score: a run gives 10 plus 4 per cleared wave
 * (at most 100), each daily mission 40 and the bonus for all three 60. All 30 tiers take about two to
 * three and a half weeks of daily play.
 */
export const PASS_RUN_MAX = 100;
export const PASS_MISSION_XP = 40;
export const PASS_BONUS_XP = 60;
export const passXpForRun = (wavesCleared: number): number => Math.min(PASS_RUN_MAX, 10 + 4 * Math.max(0, Math.floor(wavesCleared)));
export const SEASON_DAYS = 28;
/** Day 0 of season 1 (a Monday, launch of the light pass). */
const SEASON_START = Date.UTC(2026, 10, 2);
const DAY = 86_400_000;

export interface PassReward {
  coins?: number;
  diamonds?: number;
  trail?: TrailId;
}

export type PassTrack = 'free' | 'premium';

/** Free track: shards every tier, diamonds every 5th, the gold trail at the end. */
export const PASS_FREE: PassReward[] = Array.from({ length: PASS_TIERS }, (_, i) => {
  const tier = i + 1;
  if (tier === PASS_TIERS) return { trail: 'gold', diamonds: 10 };
  return tier % 5 === 0 ? { diamonds: 10 } : { coins: 100 + 10 * tier };
});

/** Premium track: diamonds and shards on every tier, two trail designs. */
export const PASS_PREMIUM: PassReward[] = Array.from({ length: PASS_TIERS }, (_, i) => {
  const tier = i + 1;
  if (tier === 10) return { trail: 'neon', diamonds: 30 };
  if (tier === 20) return { diamonds: 60, coins: 1000 };
  if (tier === PASS_TIERS) return { trail: 'void', diamonds: 60 };
  return tier % 2 === 0 ? { diamonds: 20 } : { coins: 250 };
});

/** Days since the start of season 1 (also used for weekly events). */
export const dayNumber = (dateKey: string): number => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - SEASON_START) / DAY);
};

/** Season number (1, 2, …) for a local date key. */
export const seasonOf = (dateKey: string): number => Math.max(1, Math.floor(dayNumber(dateKey) / SEASON_DAYS) + 1);

/** Days left in the season, counting today. */
export const seasonDaysLeft = (dateKey: string): number => {
  const day = Math.max(0, dayNumber(dateKey));
  return SEASON_DAYS - (day % SEASON_DAYS);
};

export const passTier = (points: number): number => Math.min(PASS_TIERS, Math.floor(points / PASS_XP_PER_TIER));

/** Starts a fresh pass when a new season began. Premium only carries over within its own season. */
export function ensureSeason(s: SaveData, dateKey: string): void {
  const season = seasonOf(dateKey);
  if (s.pass.season === season) return;
  s.pass = { season, points: 0, free: [], premium: [], premiumSeason: s.pass.premiumSeason === season ? season : 0 };
}

export const hasPremium = (s: SaveData): boolean => s.pass.premiumSeason === s.pass.season;

/** Adds pass experience. Returns how many tiers were gained. */
export function addPassXp(s: SaveData, xp: number, dateKey: string): number {
  ensureSeason(s, dateKey);
  const before = passTier(s.pass.points);
  s.pass.points += Math.max(0, Math.floor(xp));
  return passTier(s.pass.points) - before;
}

export function canClaim(s: SaveData, tier: number, track: PassTrack): boolean {
  if (tier < 1 || tier > passTier(s.pass.points)) return false;
  if (track === 'premium' && !hasPremium(s)) return false;
  return !(track === 'free' ? s.pass.free : s.pass.premium).includes(tier);
}

function grantPass(s: SaveData, r: PassReward): void {
  if (r.coins) s.bank += r.coins;
  if (r.diamonds) s.diamonds += r.diamonds;
  if (r.trail && !s.trails.includes(r.trail)) s.trails.push(r.trail);
}

export function claimPass(s: SaveData, tier: number, track: PassTrack): PassReward | null {
  if (!canClaim(s, tier, track)) return null;
  const r = (track === 'free' ? PASS_FREE : PASS_PREMIUM)[tier - 1];
  grantPass(s, r);
  (track === 'free' ? s.pass.free : s.pass.premium).push(tier);
  return r;
}

/** Claims everything that is ready. Returns the summed reward (trails listed). */
export function claimAllPass(s: SaveData): { coins: number; diamonds: number; trails: TrailId[] } {
  const sum = { coins: 0, diamonds: 0, trails: [] as TrailId[] };
  for (let tier = 1; tier <= PASS_TIERS; tier++) {
    for (const track of ['free', 'premium'] as PassTrack[]) {
      const r = claimPass(s, tier, track);
      if (!r) continue;
      sum.coins += r.coins ?? 0;
      sum.diamonds += r.diamonds ?? 0;
      if (r.trail) sum.trails.push(r.trail);
    }
  }
  return sum;
}

export function passClaimable(s: SaveData): number {
  let n = 0;
  for (let tier = 1; tier <= PASS_TIERS; tier++) {
    if (canClaim(s, tier, 'free')) n++;
    if (canClaim(s, tier, 'premium')) n++;
  }
  return n;
}

/** What the premium track contains in total – shown on the purchase card. */
export function premiumTotals(): { coins: number; diamonds: number; trails: TrailId[] } {
  const sum = { coins: 0, diamonds: 0, trails: [] as TrailId[] };
  for (const r of PASS_PREMIUM) {
    sum.coins += r.coins ?? 0;
    sum.diamonds += r.diamonds ?? 0;
    if (r.trail) sum.trails.push(r.trail);
  }
  return sum;
}
