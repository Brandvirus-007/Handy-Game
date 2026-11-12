import type { Rng } from '../core/rng';
import type { Rarity, UpgradeId } from './types';

export interface UpgradeDef {
  id: UpgradeId;
  rarity: Rarity;
  max: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'trail', rarity: 'common', max: 5 },
  { id: 'afterglow', rarity: 'common', max: 3 },
  { id: 'nimble', rarity: 'common', max: 3 },
  { id: 'magnet', rarity: 'common', max: 3 },
  { id: 'shardrain', rarity: 'common', max: 3 },
  { id: 'combo', rarity: 'common', max: 3 },
  { id: 'heart', rarity: 'rare', max: 3 },
  { id: 'shockwave', rarity: 'rare', max: 3 },
  { id: 'frost', rarity: 'rare', max: 3 },
  { id: 'chain', rarity: 'rare', max: 3 },
  { id: 'ember', rarity: 'rare', max: 3 },
  { id: 'pulsecharge', rarity: 'rare', max: 3 },
  { id: 'shield', rarity: 'rare', max: 3 },
  { id: 'echo', rarity: 'epic', max: 2 },
  { id: 'slowmo', rarity: 'epic', max: 2 },
  { id: 'double', rarity: 'epic', max: 2 },
  { id: 'secondwind', rarity: 'epic', max: 1 },
];

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 };

export const getUpgrade = (id: UpgradeId): UpgradeDef => UPGRADES.find((u) => u.id === id)!;

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export interface OfferOptions {
  /** Excluded because the run disables them (e.g. pulse upgrades with the no-pulse modifier). */
  exclude?: UpgradeId[];
  /** Guarantees at least one rare-or-better option (after boss waves). */
  guaranteeRare?: boolean;
}

/** Rolls `count` distinct, not-yet-maxed upgrades. Rarity is rolled first, then an upgrade of that rarity. */
export function rollOffer(rng: Rng, levels: UpgradeLevels, count = 3, opts: OfferOptions = {}): UpgradeId[] {
  const available = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max && !opts.exclude?.includes(u.id));
  const result: UpgradeId[] = [];
  const pool = [...available];
  while (result.length < count && pool.length > 0) {
    const wantRare = opts.guaranteeRare && result.length === 0;
    const rarities: Rarity[] = wantRare ? ['rare', 'epic'] : ['common', 'rare', 'epic'];
    const present = rarities.filter((r) => pool.some((u) => u.rarity === r));
    const rarity = present.length > 0 ? rng.weighted(present, (r) => RARITY_WEIGHT[r]) : pool[0].rarity;
    const candidates = pool.filter((u) => u.rarity === rarity);
    const pick = rng.pick(candidates.length > 0 ? candidates : pool);
    result.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return result;
}

/** Numeric parameters per level – used both by the simulation and by card descriptions. */
export const UPGRADE_VALUES = {
  trail: (l: number) => 0.2 * l,
  afterglow: (l: number) => 0.25 * l,
  nimble: (l: number) => 1 - 0.12 * l,
  magnet: (l: number) => 0.4 * l,
  shardrain: (l: number) => 0.25 * l,
  combo: (l: number) => 0.5 * l,
  shockRadius: (l: number) => (l > 0 ? 38 + 14 * l : 0),
  frostSlow: (l: number) => (l > 0 ? 0.55 - 0.05 * l : 1),
  frostTime: (l: number) => (l > 0 ? 2 + 0.75 * l : 0),
  emberTick: (l: number) => Math.max(0.35, 1.05 - 0.3 * (l - 1)),
  slowmoTime: (l: number) => 0.45 + 0.35 * l,
} as const;
