import type { EnemyType } from './types';

/** Every gameplay number lives here so balancing happens in one place. */
export const TUNING = {
  dt: 1 / 60,
  player: {
    radius: 8,
    /** Collision radius is smaller than the visual – forgiving hitbox. */
    hitRadius: 6,
    speed: 265,
    /** Max distance the steering target may lead the spark. */
    maxLead: 70,
    hearts: 3,
    invuln: 1.6,
    hitKnockRadius: 95,
    hitKnock: 320,
  },
  trail: {
    length: 520,
    life: 1.8,
    pointSpacing: 5,
    minLoopArea: 650,
    /** Neighbouring segments skipped during self-intersection tests. */
    skipSegments: 2,
  },
  combo: { window: 2.2, perStep: 0.1, max: 3 },
  multiKillBonus: 0.5,
  magnet: 58,
  pickup: { life: 14, blinkAt: 3, attract: 900, friction: 3.2 },
  pulse: {
    radius: 125,
    perLevelRadius: 18,
    gainPerKill: 0.075,
    gainPerLoop: 0.03,
    knock: 300,
    invuln: 0.6,
    cometPerUnit: 0.0004,
    /** Passive regen per second – guarantees a way out of stalemates. */
    passive: 0.022,
  },
  shield: { regen: [0, 25, 20, 15] as const },
  spawn: { warn: 0.9, bossWarn: 1.6, minPlayerDist: 140, edgeInset: 22 },
  wave: {
    breakDelay: 1.3,
    startDelay: 1.6,
    bossEvery: 5,
    speedPerWave: 0.025,
    maxSpeedBonus: 0.6,
    eliteFrom: 7,
    elitePerWave: 0.03,
    eliteMax: 0.35,
  },
  heartDropChance: 0.012,
  eliteHeartDropChance: 0.05,
} as const;

export interface EnemyDef {
  r: number;
  hp: number;
  speed: number;
  score: number;
  shards: number;
  /** Wave-budget cost (for spawnable enemies). */
  cost: number;
  unlock: number;
  weight: number;
  color: string;
  mass: number;
  group: [number, number];
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  mote: { r: 10, hp: 1, speed: 40, score: 10, shards: 1, cost: 1, unlock: 1, weight: 4, color: '#a66bff', mass: 0, group: [2, 4] },
  dart: { r: 9, hp: 1, speed: 34, score: 20, shards: 1.5, cost: 2, unlock: 2, weight: 3, color: '#ff4d6d', mass: 0, group: [1, 2] },
  cutter: { r: 11, hp: 1, speed: 115, score: 25, shards: 2, cost: 2.5, unlock: 3, weight: 2.4, color: '#ff9a3c', mass: 0.2, group: [1, 2] },
  splitter: { r: 15, hp: 1, speed: 30, score: 30, shards: 2, cost: 3, unlock: 4, weight: 2, color: '#ff5ad1', mass: 0.3, group: [1, 1] },
  mini: { r: 6, hp: 1, speed: 78, score: 5, shards: 0.3, cost: 0, unlock: 99, weight: 0, color: '#ff8fe0', mass: 0, group: [1, 1] },
  brute: { r: 18, hp: 2, speed: 27, score: 50, shards: 3, cost: 4, unlock: 6, weight: 1.6, color: '#5b8cff', mass: 0.75, group: [1, 1] },
  spitter: { r: 12, hp: 1, speed: 70, score: 35, shards: 2, cost: 3.5, unlock: 7, weight: 1.8, color: '#c6ff4d', mass: 0.1, group: [1, 2] },
  gnat: { r: 5, hp: 1, speed: 84, score: 6, shards: 0.3, cost: 0.55, unlock: 8, weight: 1.2, color: '#ff7eb6', mass: 0, group: [8, 12] },
  maw: { r: 36, hp: 8, speed: 24, score: 1500, shards: 40, cost: 0, unlock: 99, weight: 0, color: '#ff3d5a', mass: 1, group: [1, 1] },
  weaver: { r: 24, hp: 7, speed: 0, score: 2000, shards: 45, cost: 0, unlock: 99, weight: 0, color: '#c77dff', mass: 1, group: [1, 1] },
  twin: { r: 20, hp: 5, speed: 22, score: 1200, shards: 25, cost: 0, unlock: 99, weight: 0, color: '#4dd8ff', mass: 1, group: [1, 1] },
};

/** Second twin gets its own colour so the pair reads as two individuals. */
export const TWIN_COLORS = ['#4dd8ff', '#ff6bd6'] as const;

export const SPAWNABLE: EnemyType[] = ['mote', 'dart', 'cutter', 'splitter', 'brute', 'spitter', 'gnat'];

export const COLORS = {
  bg0: '#05040c',
  bg1: '#0d0a22',
  shard: '#ffd166',
  heart: '#ff5577',
  frost: '#8fdcff',
  shield: '#9fe8ff',
  danger: '#ff3d5a',
  white: '#ffffff',
  threadWarn: 'rgba(199,125,255,0.35)',
  projectile: '#ff6b8b',
};
