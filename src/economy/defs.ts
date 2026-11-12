/* All economy numbers in one place: prices, rewards, missions, milestones. */

export type Currency = 'coins' | 'diamonds';

export interface Reward {
  coins?: number;
  diamonds?: number;
}

// ───────────────────────── Revive ─────────────────────────

/** Paid revive prices escalate with the number of paid revives in the current run. */
export const REVIVE_COINS = [400, 1000, 2500, 5000, 9000];
export const REVIVE_DIAMONDS = [15, 30, 60, 100, 150];
export const reviveCost = (table: number[], paidRevives: number): number => table[Math.min(paidRevives, table.length - 1)];
/** Seconds the continue dialog waits before giving up automatically. */
export const REVIVE_COUNTDOWN = 7;

// ───────────────────────── Boosters ─────────────────────────

export type BoosterId = 'shield' | 'heart' | 'charge' | 'lucky' | 'magnet' | 'headstart';

export interface BoosterDef {
  id: BoosterId;
  currency: Currency;
  price: number;
  /** Best wave needed before the booster is offered. */
  requiresWave: number;
}

export const BOOSTERS: BoosterDef[] = [
  { id: 'shield', currency: 'coins', price: 150, requiresWave: 0 },
  { id: 'charge', currency: 'coins', price: 200, requiresWave: 0 },
  { id: 'heart', currency: 'coins', price: 350, requiresWave: 3 },
  { id: 'magnet', currency: 'diamonds', price: 6, requiresWave: 0 },
  { id: 'lucky', currency: 'diamonds', price: 8, requiresWave: 0 },
  { id: 'headstart', currency: 'diamonds', price: 15, requiresWave: 10 },
];

export const HEADSTART_WAVE = 6;

// ───────────────────────── Shop ─────────────────────────

import type { CharacterId } from '../game/types';

export type ProductId =
  | 'diamonds_80'
  | 'diamonds_450'
  | 'diamonds_1000'
  | 'diamonds_2200'
  | 'diamonds_6000'
  | 'starter_pack'
  | 'no_ads'
  | 'spark_aurora';

export interface ProductDef {
  id: ProductId;
  consumable: boolean;
  reward: Reward;
  /** Unlocks a character (starter pack, store-exclusive sparks). */
  unlocks?: CharacterId;
  /** Fallback price label shown when the store price is not available (web demo). */
  fallbackPrice: string;
  badge?: 'popular' | 'best';
  bonusPct?: number;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'diamonds_80', consumable: true, reward: { diamonds: 80 }, fallbackPrice: '0,99 €' },
  { id: 'diamonds_450', consumable: true, reward: { diamonds: 450 }, fallbackPrice: '4,99 €', bonusPct: 12 },
  { id: 'diamonds_1000', consumable: true, reward: { diamonds: 1000 }, fallbackPrice: '9,99 €', bonusPct: 25, badge: 'popular' },
  { id: 'diamonds_2200', consumable: true, reward: { diamonds: 2200 }, fallbackPrice: '19,99 €', bonusPct: 38 },
  { id: 'diamonds_6000', consumable: true, reward: { diamonds: 6000 }, fallbackPrice: '49,99 €', bonusPct: 50, badge: 'best' },
  { id: 'starter_pack', consumable: false, reward: { diamonds: 300, coins: 3000 }, unlocks: 'nova', fallbackPrice: '2,99 €' },
  { id: 'no_ads', consumable: false, reward: { diamonds: 100 }, fallbackPrice: '3,99 €' },
  /** Store-exclusive spark – real money only, never for shards or diamonds. */
  { id: 'spark_aurora', consumable: false, reward: { diamonds: 150 }, unlocks: 'aurora', fallbackPrice: '5,99 €' },
];

export const getProduct = (id: ProductId): ProductDef => PRODUCTS.find((p) => p.id === id)!;

/** Diamonds → shards exchange offers. */
export const EXCHANGE = [
  { diamonds: 20, coins: 1000 },
  { diamonds: 90, coins: 5000 },
  { diamonds: 160, coins: 10000 },
];

/** Diamonds needed to buy a workshop level instantly when shards are missing. */
export const diamondsForCoins = (coins: number): number => Math.max(1, Math.ceil(coins / 45));

// ───────────────────────── Ads ─────────────────────────

export const FREE_DIAMOND_ADS_PER_DAY = 3;
export const FREE_DIAMOND_AD_REWARD = 3;
export const INTERSTITIAL = {
  /** No interstitial before this many finished runs (lifetime). */
  minRuns: 4,
  /** At most one interstitial every N runs … */
  everyRuns: 3,
  /** … and every N seconds. */
  minGapSec: 180,
  /** Never right after a rewarded ad. */
  afterRewardedSec: 90,
};

// ───────────────────────── Progression ─────────────────────────

/** Wave milestones ("Etappen") – first clear grants diamonds. */
export const MILESTONES: { wave: number; diamonds: number }[] = [
  { wave: 5, diamonds: 5 },
  { wave: 10, diamonds: 10 },
  { wave: 15, diamonds: 15 },
  { wave: 20, diamonds: 20 },
  { wave: 25, diamonds: 25 },
  { wave: 30, diamonds: 30 },
  { wave: 40, diamonds: 40 },
  { wave: 50, diamonds: 50 },
  { wave: 75, diamonds: 75 },
  { wave: 100, diamonds: 100 },
];

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number): number => 300 + 150 * level;

export const levelReward = (newLevel: number): Reward => ({
  coins: 100 + 20 * newLevel,
  diamonds: 3 + (newLevel % 5 === 0 ? 25 : 0),
});

export interface RunXpInput {
  score: number;
  kills: number;
  wavesCleared: number;
}

export const xpForRun = (r: RunXpInput): number => Math.floor(r.score / 20) + r.kills * 2 + r.wavesCleared * 15;

/** 7-day login calendar. Missing a day resets the streak. */
export const LOGIN_REWARDS: Reward[] = [
  { coins: 100 },
  { coins: 200 },
  { diamonds: 5 },
  { coins: 300 },
  { diamonds: 8 },
  { coins: 500 },
  { diamonds: 20, coins: 500 },
];

// ───────────────────────── Missions ─────────────────────────

export type MissionType = 'kills' | 'loops' | 'wave' | 'bigloop' | 'boss' | 'shards' | 'pulse' | 'runs' | 'combo';

export interface MissionTemplate {
  type: MissionType;
  /** Target per difficulty tier (0 = new player … 2 = experienced). */
  targets: [number, number, number];
  reward: Reward;
  /** true: progress is the best single-run value; false: values add up over the day. */
  max: boolean;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  { type: 'kills', targets: [40, 80, 140], reward: { coins: 150 }, max: false },
  { type: 'loops', targets: [25, 45, 70], reward: { coins: 150 }, max: false },
  { type: 'wave', targets: [4, 8, 13], reward: { diamonds: 3 }, max: true },
  { type: 'bigloop', targets: [3, 5, 7], reward: { diamonds: 3 }, max: true },
  { type: 'boss', targets: [1, 1, 2], reward: { diamonds: 4 }, max: false },
  { type: 'shards', targets: [60, 150, 300], reward: { diamonds: 2 }, max: false },
  { type: 'pulse', targets: [4, 8, 12], reward: { coins: 120 }, max: false },
  { type: 'runs', targets: [3, 4, 5], reward: { coins: 120 }, max: false },
  { type: 'combo', targets: [4, 6, 9], reward: { diamonds: 3 }, max: true },
];

export const MISSIONS_PER_DAY = 3;
export const MISSION_BONUS: Reward = { diamonds: 5 };

/** Diamonds granted per achievement. */
export const ACHIEVEMENT_DIAMONDS: Record<string, number> = {
  first_loop: 5,
  multi5: 5,
  multi10: 15,
  combo10: 10,
  pulse5: 10,
  wave5: 5,
  wave10: 10,
  wave15: 15,
  wave20: 20,
  wave30: 25,
  wave50: 40,
  flawless5: 15,
  boss_maw: 10,
  boss_weaver: 10,
  boss_twins: 15,
  boss_hydra: 15,
  boss_eye: 20,
  score10k: 10,
  score50k: 20,
  shards1000: 10,
  all_chars: 25,
  daily: 5,
  level10: 15,
  level25: 30,
  revived: 5,
  shopper: 10,
  legend: 25,
  level50: 100,
  galaxy: 30,
};
