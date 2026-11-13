import type { EnemyType } from './types';

/** Every gameplay number lives here so balancing happens in one place. */
export const TUNING = {
  dt: 1 / 60,
  player: {
    radius: 8,
    /** Collision radius is smaller than the visual – forgiving hitbox. */
    hitRadius: 6,
    /** Movement cap (units/s). High on purpose: touch steering is 1:1 relative, so the spark
     *  traces exactly what the finger draws – this only prevents teleport-like flicks. */
    speed: 950,
    /** Max distance the steering target may lead the spark (excess finger travel is dropped). */
    maxLead: 150,
    /** Keyboard movement speed (desktop). */
    keyboardSpeed: 300,
    hearts: 3,
    invuln: 1.6,
    hitKnockRadius: 95,
    hitKnock: 320,
  },
  trail: {
    length: 520,
    /** Seconds a trail point lives – generous so calm, deliberate circles still close. */
    life: 2.6,
    pointSpacing: 5,
    minLoopArea: 650,
    /** Neighbouring segments skipped during self-intersection tests. */
    skipSegments: 2,
    /** Magnetic closing: coming this close to an older trail point closes the loop. */
    snapRadius: 11,
    /** …but only for points at least this far back along the trail. */
    snapMinArc: 90,
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
    cometPerUnit: 0.00011,
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
  warden: { r: 13, hp: 1, speed: 30, score: 45, shards: 3, cost: 4, unlock: 11, weight: 1.3, color: '#cfd8ff', mass: 0.4, group: [1, 1] },
  blinker: { r: 9, hp: 1, speed: 46, score: 30, shards: 2, cost: 3, unlock: 13, weight: 1.6, color: '#ff4dff', mass: 0, group: [1, 2] },
  bomber: { r: 12, hp: 1, speed: 36, score: 30, shards: 2, cost: 2.5, unlock: 16, weight: 1.8, color: '#ff6a1a', mass: 0.2, group: [1, 3] },
  maw: { r: 36, hp: 8, speed: 24, score: 1500, shards: 40, cost: 0, unlock: 99, weight: 0, color: '#ff3d5a', mass: 1, group: [1, 1] },
  weaver: { r: 24, hp: 6, speed: 0, score: 2000, shards: 45, cost: 0, unlock: 99, weight: 0, color: '#c77dff', mass: 1, group: [1, 1] },
  twin: { r: 20, hp: 5, speed: 22, score: 1200, shards: 25, cost: 0, unlock: 99, weight: 0, color: '#4dd8ff', mass: 1, group: [1, 1] },
  hydra: { r: 32, hp: 6, speed: 26, score: 800, shards: 15, cost: 0, unlock: 99, weight: 0, color: '#3dff8f', mass: 1, group: [1, 1] },
  head: { r: 17, hp: 3, speed: 58, score: 600, shards: 12, cost: 0, unlock: 99, weight: 0, color: '#3dff8f', mass: 1, group: [1, 1] },
  eye: { r: 30, hp: 8, speed: 12, score: 2400, shards: 50, cost: 0, unlock: 99, weight: 0, color: '#ffcf3d', mass: 1, group: [1, 1] },
  bouncer: { r: 10, hp: 1, speed: 150, score: 35, shards: 2, cost: 3, unlock: 19, weight: 1.5, color: '#4dffd2', mass: 0.1, group: [1, 2] },
  ghost: { r: 12, hp: 1, speed: 44, score: 40, shards: 2.5, cost: 3.5, unlock: 22, weight: 1.4, color: '#b8c4ff', mass: 0.1, group: [1, 2] },
  vortex: { r: 30, hp: 8, speed: 18, score: 2600, shards: 55, cost: 0, unlock: 99, weight: 0, color: '#5ab0ff', mass: 1, group: [1, 1] },
};

/** Second twin gets its own colour so the pair reads as two individuals. */
export const TWIN_COLORS = ['#4dd8ff', '#ff6bd6'] as const;

export const SPAWNABLE: EnemyType[] = ['mote', 'dart', 'cutter', 'splitter', 'brute', 'spitter', 'gnat', 'warden', 'blinker', 'bomber', 'bouncer', 'ghost'];

export const BOSS_TYPES: EnemyType[] = ['maw', 'weaver', 'twin', 'hydra', 'head', 'eye', 'vortex'];

export const WARDEN_AURA = 78;
export const BOMB = { fuse: 0.75, radius: 64 };

/** Every 10 waves the arena moves to a new region with its own colours. */
export const BIOMES = [
  { id: 'nebula', edge: '#7d6bff', blobs: ['rgba(92,52,190,0.28)', 'rgba(30,110,170,0.20)', 'rgba(150,40,140,0.18)', 'rgba(40,60,160,0.22)', 'rgba(70,40,150,0.12)'], top: '#0b0820' },
  { id: 'ember', edge: '#ff8a4d', blobs: ['rgba(190,70,30,0.26)', 'rgba(160,40,60,0.22)', 'rgba(200,120,40,0.14)', 'rgba(110,30,70,0.22)', 'rgba(150,60,30,0.14)'], top: '#1a0a10' },
  { id: 'deep', edge: '#3de0d0', blobs: ['rgba(20,120,150,0.28)', 'rgba(20,70,140,0.24)', 'rgba(30,160,140,0.14)', 'rgba(20,50,110,0.22)', 'rgba(40,120,160,0.12)'], top: '#04121c' },
  { id: 'aurora', edge: '#6dff9d', blobs: ['rgba(40,170,100,0.24)', 'rgba(170,60,170,0.20)', 'rgba(60,200,150,0.14)', 'rgba(90,50,170,0.22)', 'rgba(40,140,90,0.14)'], top: '#07160f' },
  { id: 'void', edge: '#e6e6f0', blobs: ['rgba(120,120,140,0.16)', 'rgba(80,80,110,0.16)', 'rgba(160,160,180,0.08)', 'rgba(60,60,80,0.18)', 'rgba(100,100,120,0.10)'], top: '#0a0a0e' },
  { id: 'crystal', edge: '#ff7ad9', blobs: ['rgba(200,60,160,0.22)', 'rgba(40,170,180,0.20)', 'rgba(150,90,220,0.16)', 'rgba(220,120,200,0.12)', 'rgba(50,120,160,0.18)'], top: '#14081a' },
] as const;

export const biomeForWave = (wave: number): number => Math.floor(Math.max(0, wave - 1) / 10) % BIOMES.length;

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
