import type { Vec } from '../core/math';
import type { Bounds } from '../core/geometry';

export type EnemyType =
  | 'mote'
  | 'dart'
  | 'cutter'
  | 'splitter'
  | 'mini'
  | 'brute'
  | 'spitter'
  | 'gnat'
  | 'maw'
  | 'weaver'
  | 'twin';

export type BossType = 'maw' | 'weaver' | 'twins';

export type CharacterId = 'spark' | 'comet' | 'ember' | 'prism';

export type UpgradeId =
  | 'trail'
  | 'afterglow'
  | 'nimble'
  | 'magnet'
  | 'shardrain'
  | 'combo'
  | 'heart'
  | 'shockwave'
  | 'frost'
  | 'chain'
  | 'ember'
  | 'pulsecharge'
  | 'shield'
  | 'echo'
  | 'slowmo'
  | 'double'
  | 'secondwind';

export type Rarity = 'common' | 'rare' | 'epic';

export type MetaId = 'heart' | 'trail' | 'shards' | 'reroll' | 'precharge' | 'magnet';

export type ModifierId = 'glass' | 'haste' | 'swarmy' | 'longtrail' | 'bossrush' | 'nopulse';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Knockback velocity, decays independently from steering. */
  kx: number;
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  /** Age in seconds. */
  t: number;
  state: number;
  timer: number;
  /** Direction / generic per-type scalars. */
  ax: number;
  ay: number;
  angle: number;
  orbit: number;
  /** Scratch position (weaver jump origin, twin orbit centre). */
  bx: number;
  by: number;
  elite: boolean;
  boss: boolean;
  dead: boolean;
  hitFlash: number;
  /** Current speed multiplier from slows (1 = none). */
  slow: number;
  stun: number;
  emberAcc: number;
  score: number;
  shards: number;
  seed: number;
  flock: number;
  partner: number;
  phase: number;
  /** Knockback resistance 0..1. */
  mass: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  dead: boolean;
}

export type PickupKind = 'shard' | 'bigshard' | 'heart';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
  magnet: boolean;
  dead: boolean;
}

export interface SpawnMarker {
  x: number;
  y: number;
  t: number;
  total: number;
  type: EnemyType;
  elite: boolean;
  flock: number;
}

/** Hazard line (weaver threads). Becomes deadly after `warn` seconds. */
export interface Thread {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  warn: number;
  life: number;
  maxLife: number;
}

export interface FrostField {
  poly: Vec[];
  bounds: Bounds;
  life: number;
  maxLife: number;
}

export interface EchoLoop {
  poly: Vec[];
  bounds: Bounds;
  at: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

export interface PlayerStats {
  speed: number;
  hitRadius: number;
  trailLength: number;
  trailLife: number;
  magnet: number;
  maxHearts: number;
  shardMul: number;
  scoreMul: number;
  comboWindow: number;
  loopDamage: number;
  shockwave: number;
  frost: number;
  chain: number;
  echo: number;
  slowmo: number;
  ember: number;
  pulseLevel: number;
  pulseRadius: number;
  pulseGain: number;
  shield: number;
  secondWind: boolean;
  cometCharge: boolean;
  noPulse: boolean;
}

export interface RunStats {
  score: number;
  shards: number;
  kills: number;
  loops: number;
  bestLoop: number;
  maxCombo: number;
  wave: number;
  wavesCleared: number;
  bossesKilled: BossType[];
  damageTaken: number;
  bestPulse: number;
  time: number;
  flawlessStreak: number;
}

export type KillSource = 'loop' | 'echo' | 'shockwave' | 'chain' | 'ember' | 'pulse' | 'boss' | 'other';

export type GameEvent =
  | { type: 'loop'; poly: Vec[]; cx: number; cy: number; area: number; kills: number; combo: number; echo: boolean }
  | { type: 'kill'; x: number; y: number; enemy: EnemyType; elite: boolean; r: number; score: number; source: KillSource }
  | { type: 'enemyHit'; x: number; y: number; enemy: EnemyType }
  | { type: 'playerHit'; x: number; y: number; hearts: number }
  | { type: 'shieldBreak'; x: number; y: number }
  | { type: 'shieldUp' }
  | { type: 'playerDeath'; x: number; y: number }
  | { type: 'revive'; x: number; y: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number; value: number }
  | { type: 'pulse'; x: number; y: number; radius: number; kills: number }
  | { type: 'pulseReady' }
  | { type: 'trailCut'; x: number; y: number }
  | { type: 'spawnWarn'; x: number; y: number; enemy: EnemyType }
  | { type: 'spawn'; x: number; y: number; enemy: EnemyType; elite: boolean }
  | { type: 'shoot'; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; r: number }
  | { type: 'chain'; ax: number; ay: number; bx: number; by: number }
  | { type: 'waveStart'; wave: number; boss: BossType | null; newEnemy: EnemyType | null }
  | { type: 'waveClear'; wave: number; flawless: boolean; bonus: number; boss: boolean }
  | { type: 'bossSpawn'; boss: BossType; x: number; y: number }
  | { type: 'bossPhase'; x: number; y: number }
  | { type: 'bossDeath'; boss: BossType; x: number; y: number }
  | { type: 'bossAttack'; x: number; y: number }
  | { type: 'slowmo'; duration: number }
  | { type: 'combo'; combo: number }
  | { type: 'comboLost'; combo: number }
  | { type: 'thread'; ax: number; ay: number; bx: number; by: number }
  | { type: 'heal'; x: number; y: number };
