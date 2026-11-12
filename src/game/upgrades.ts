import type { Rng } from '../core/rng';
import type { Rarity, UpgradeId } from './types';

export interface UpgradeDef {
  id: UpgradeId;
  rarity: Rarity;
  max: number;
  /** Legendary fusions: minimum levels of other upgrades before the fusion can appear. */
  requires?: Partial<Record<UpgradeId, number>>;
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
  { id: 'treasure', rarity: 'common', max: 3 },
  { id: 'magnettrail', rarity: 'common', max: 1 },
  { id: 'stardust', rarity: 'common', max: 3 },
  { id: 'retaliate', rarity: 'rare', max: 1 },
  { id: 'supernova', rarity: 'rare', max: 2 },
  { id: 'healloop', rarity: 'rare', max: 1 },
  { id: 'pierce', rarity: 'rare', max: 1 },
  { id: 'doublepulse', rarity: 'epic', max: 1 },
  { id: 'storm', rarity: 'legendary', max: 1, requires: { chain: 2, shockwave: 2 } },
  { id: 'starfrost', rarity: 'legendary', max: 1, requires: { frost: 2, pulsecharge: 1 } },
  { id: 'phoenix', rarity: 'legendary', max: 1, requires: { ember: 2, retaliate: 1 } },
];

/** Chance that an eligible legendary fusion replaces one of the offered cards. */
export const FUSION_CHANCE = 0.45;

export const fusionReady = (u: UpgradeDef, levels: UpgradeLevels): boolean =>
  !!u.requires && Object.entries(u.requires).every(([id, lv]) => (levels[id as UpgradeId] ?? 0) >= (lv ?? 0));

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10, legendary: 0 };

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
  const open = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max && !opts.exclude?.includes(u.id));
  // Legendary fusions never enter the normal draw – they appear only once their recipe is complete.
  const available = open.filter((u) => u.rarity !== 'legendary');
  const result: UpgradeId[] = [];
  const fusions = open.filter((u) => u.rarity === 'legendary' && fusionReady(u, levels));
  if (fusions.length > 0 && count > 0 && rng.chance(FUSION_CHANCE)) result.push(rng.pick(fusions).id);
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
  treasure: (l: number) => 0.4 * l,
  stardust: (l: number) => 0.15 * l,
  supernovaEvery: (l: number) => (l > 0 ? 9 - 2 * l : 0),
} as const;
