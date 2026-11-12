import type { MetaId } from './types';

export interface MetaDef {
  id: MetaId;
  max: number;
  base: number;
  growth: number;
}

export const META: MetaDef[] = [
  { id: 'heart', max: 2, base: 300, growth: 2.5 },
  { id: 'trail', max: 5, base: 80, growth: 1.6 },
  { id: 'shards', max: 5, base: 120, growth: 1.7 },
  { id: 'magnet', max: 3, base: 90, growth: 1.6 },
  { id: 'reroll', max: 3, base: 150, growth: 2 },
  { id: 'precharge', max: 2, base: 200, growth: 2 },
];

export type MetaLevels = Partial<Record<MetaId, number>>;

export const metaCost = (def: MetaDef, level: number): number => Math.round((def.base * Math.pow(def.growth, level)) / 10) * 10;

export const getMeta = (id: MetaId): MetaDef => META.find((m) => m.id === id)!;
