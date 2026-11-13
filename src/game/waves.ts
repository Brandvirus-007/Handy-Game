import type { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { ENEMIES, SPAWNABLE, TUNING } from './config';
import type { BossType, EnemyType, ModifierId } from './types';

export interface SpawnGroup {
  /** Seconds after wave start. */
  at: number;
  type: EnemyType;
  count: number;
  elite: boolean[];
}

export interface WavePlan {
  wave: number;
  boss: BossType | null;
  bossTier: number;
  groups: SpawnGroup[];
  /** Max enemies alive at once – further groups wait. */
  cap: number;
  /** Enemy type introduced this wave (for the "new enemy" hint). */
  newEnemy: EnemyType | null;
  speedMul: number;
}

const BOSS_ORDER: BossType[] = ['maw', 'weaver', 'twins', 'hydra', 'eye', 'vortex'];

export const waveBudget = (n: number): number => 5 + 2.6 * n + 0.22 * n * n;

const bossEvery = (mods: readonly ModifierId[]): number => (mods.includes('bossonly') ? 1 : mods.includes('bossrush') ? 3 : TUNING.wave.bossEvery);

export function isBossWave(n: number, mods: readonly ModifierId[]): boolean {
  const every = bossEvery(mods);
  return n > 0 && n % every === 0;
}

export function bossForWave(n: number, mods: readonly ModifierId[]): { boss: BossType; tier: number } {
  const every = bossEvery(mods);
  const index = Math.floor(n / every) - 1;
  return { boss: BOSS_ORDER[index % BOSS_ORDER.length], tier: Math.floor(index / BOSS_ORDER.length) };
}

export function unlockWave(type: EnemyType, mods: readonly ModifierId[]): number {
  if (type === 'gnat' && mods.includes('swarmy')) return 2;
  return ENEMIES[type].unlock;
}

export function speedMulForWave(n: number, mods: readonly ModifierId[]): number {
  const base = 1 + Math.min(TUNING.wave.maxSpeedBonus, TUNING.wave.speedPerWave * (n - 1));
  return base * (mods.includes('haste') ? 1.25 : 1);
}

export function eliteChance(n: number): number {
  if (n < TUNING.wave.eliteFrom) return 0;
  return Math.min(TUNING.wave.eliteMax, (n - TUNING.wave.eliteFrom + 1) * TUNING.wave.elitePerWave);
}

/** Builds the full spawn schedule of wave `n`. Pure function of (n, rng state, modifiers). */
export function buildWave(n: number, rng: Rng, mods: readonly ModifierId[]): WavePlan {
  const speedMul = speedMulForWave(n, mods);
  const cap = Math.min(55, 12 + 2 * n);
  const unlocked = SPAWNABLE.filter((t) => unlockWave(t, mods) <= n);
  const newEnemy = SPAWNABLE.find((t) => unlockWave(t, mods) === n) ?? null;

  if (isBossWave(n, mods)) {
    const { boss, tier } = bossForWave(n, mods);
    const groups: SpawnGroup[] = [];
    // A few escorts so the arena never feels empty while the boss enters.
    const escorts = 2 + Math.min(4, Math.floor(n / 5));
    groups.push({ at: 2.5, type: 'mote', count: escorts, elite: Array(escorts).fill(false) });
    return { wave: n, boss, bossTier: tier, groups, cap, newEnemy: null, speedMul };
  }

  let budget = waveBudget(n);
  const duration = clamp(14 + n, 14, 40);
  const picks: { type: EnemyType; count: number }[] = [];

  // Introduce the new enemy right away so the player can learn it.
  if (newEnemy) {
    const def = ENEMIES[newEnemy];
    const count = newEnemy === 'gnat' ? rng.int(def.group[0], def.group[1]) : Math.max(1, def.group[0]);
    picks.push({ type: newEnemy, count });
    budget -= def.cost * count;
  }

  let guard = 0;
  while (budget > 0.5 && guard++ < 400) {
    const type = rng.weighted(unlocked, (t) => {
      let w = ENEMIES[t].weight;
      if (t === 'mote') w = Math.max(1.5, w - n * 0.12);
      if (t === 'gnat' && mods.includes('swarmy')) w *= 3;
      return w;
    });
    const def = ENEMIES[type];
    const count = rng.int(def.group[0], def.group[1]);
    const cost = def.cost * count;
    if (cost > budget + 1.5 && type !== 'mote') continue;
    picks.push({ type, count });
    budget -= cost;
  }

  const elite = eliteChance(n);
  const groups: SpawnGroup[] = picks.map((p, i) => {
    const slot = picks.length > 1 ? i / (picks.length - 1) : 0;
    const at = i === 0 ? 0.6 : 0.6 + slot * duration + rng.range(-0.8, 0.8);
    const elites = Array.from({ length: p.count }, () => p.type !== 'gnat' && rng.chance(elite));
    return { at: Math.max(0.6, at), type: p.type, count: p.count, elite: elites };
  });
  groups.sort((a, b) => a.at - b.at);
  return { wave: n, boss: null, bossTier: 0, groups, cap, newEnemy, speedMul };
}
