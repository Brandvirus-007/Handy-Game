import type { MetaId } from './types';

export interface MetaDef {
  id: MetaId;
  max: number;
  base: number;
  growth: number;
  /** Player level needed before the item shows up in the workshop at all. */
  unlock: number;
  /** Player level needed to buy workshop level i+1 (index = current level). Missing entries mean no gate. */
  gates?: number[];
}

export const META: MetaDef[] = [
  { id: 'heart', max: 4, base: 300, growth: 2.5, unlock: 1, gates: [0, 3, 10, 50] },
  { id: 'trail', max: 10, base: 80, growth: 1.55, unlock: 1, gates: [0, 0, 0, 0, 0, 0, 0, 0, 25, 40] },
  { id: 'shards', max: 10, base: 120, growth: 1.6, unlock: 1, gates: [0, 0, 0, 0, 0, 0, 0, 0, 30, 50] },
  { id: 'magnet', max: 5, base: 90, growth: 1.6, unlock: 1 },
  { id: 'reroll', max: 4, base: 150, growth: 2, unlock: 1, gates: [0, 0, 0, 35] },
  { id: 'precharge', max: 2, base: 200, growth: 2, unlock: 1 },
  { id: 'combo', max: 5, base: 160, growth: 1.7, unlock: 4 },
  { id: 'score', max: 5, base: 250, growth: 1.75, unlock: 8 },
  { id: 'wisdom', max: 5, base: 300, growth: 1.8, unlock: 12 },
  { id: 'luck', max: 4, base: 600, growth: 2, unlock: 20, gates: [0, 0, 30, 45] },
];

export type MetaLevels = Partial<Record<MetaId, number>>;

export const metaCost = (def: MetaDef, level: number): number => Math.round((def.base * Math.pow(def.growth, level)) / 10) * 10;

export const getMeta = (id: MetaId): MetaDef => META.find((m) => m.id === id)!;

/** Player level required to buy the next workshop level (0 = no requirement). */
export const metaLevelReq = (def: MetaDef, level: number): number => Math.max(def.unlock, def.gates?.[level] ?? 0);

/** Per-level effects of the newer workshop items – shared by stats, offers and descriptions. */
export const META_VALUES = {
  /** Extra combo window in seconds. */
  combo: (l: number) => 0.12 * l,
  /** Score multiplier bonus. */
  score: (l: number) => 0.05 * l,
  /** Experience bonus. */
  wisdom: (l: number) => 0.1 * l,
  /** Shifts upgrade offers towards rare and epic cards (0..1). */
  luck: (l: number) => 0.08 * l,
} as const;
