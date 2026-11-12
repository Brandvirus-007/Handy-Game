import type { CharacterId } from './types';

export interface CharacterDef {
  id: CharacterId;
  /** Price in shards (0 = not buyable with shards). */
  price: number;
  /** Alternative price in diamonds (0 = not buyable with diamonds). */
  diamondPrice: number;
  /** Premium sparks can only be bought with diamonds (or come with a store pack). */
  premium: boolean;
  /** Store-exclusive sparks: only sold for real money in the shop – never for shards or diamonds. */
  exclusive: boolean;
  /** Player level needed before the spark can be bought. */
  unlockLevel: number;
  color: string;
  /** Secondary colour used for the trail gradient. */
  trail: string;
  /** Collision radius multiplier (smaller = harder to hit). */
  hitMul: number;
  trailMul: number;
  /** Trail lifetime multiplier. */
  lifeMul: number;
  heartsDelta: number;
  scoreMul: number;
  shardMul: number;
  pulseGainMul: number;
  innateEmber: number;
  innateChain: number;
  innateEcho: number;
  innateFrost: number;
  innateShockwave: number;
  pulseRadiusMul: number;
  phase: boolean;
  cometCharge: boolean;
  /** Survives one lethal hit per run (like the Second Wind upgrade). */
  secondWind: boolean;
  /** Starts every run with a random epic upgrade. */
  startEpic: boolean;
  /** Visual style of the orb and trail. */
  look: 'plain' | 'rainbow' | 'solar' | 'aurora';
}

const BASE = {
  hitMul: 1,
  trailMul: 1,
  lifeMul: 1,
  heartsDelta: 0,
  scoreMul: 1,
  shardMul: 1,
  pulseGainMul: 1,
  innateEmber: 0,
  innateChain: 0,
  innateEcho: 0,
  innateFrost: 0,
  innateShockwave: 0,
  pulseRadiusMul: 1,
  phase: false,
  cometCharge: false,
  secondWind: false,
  startEpic: false,
  premium: false,
  exclusive: false,
  unlockLevel: 1,
  look: 'plain' as const,
};

export const CHARACTERS: CharacterDef[] = [
  { ...BASE, id: 'spark', price: 0, diamondPrice: 0, color: '#7df9ff', trail: '#4d7bff' },
  { ...BASE, id: 'comet', price: 400, diamondPrice: 30, unlockLevel: 2, color: '#7cff9b', trail: '#22d3a6', hitMul: 0.72, trailMul: 0.8, cometCharge: true },
  { ...BASE, id: 'ember', price: 900, diamondPrice: 60, unlockLevel: 4, color: '#ffae5c', trail: '#ff4d2e', trailMul: 1.3, lifeMul: 0.85, innateEmber: 1 },
  { ...BASE, id: 'prism', price: 1500, diamondPrice: 100, unlockLevel: 7, color: '#f2e9ff', trail: '#c38bff', heartsDelta: -1, scoreMul: 1.25, innateChain: 1, look: 'rainbow' },
  { ...BASE, id: 'nova', price: 0, diamondPrice: 250, premium: true, color: '#ffe08a', trail: '#ff9f1c', innateEcho: 1, pulseRadiusMul: 1.2 },
  { ...BASE, id: 'phantom', price: 0, diamondPrice: 400, premium: true, unlockLevel: 10, color: '#b8fff1', trail: '#7c5cff', heartsDelta: 1, phase: true, trailMul: 1.1 },
  { ...BASE, id: 'glacier', price: 2500, diamondPrice: 150, unlockLevel: 15, color: '#d4f6ff', trail: '#4fb3ff', hitMul: 0.88, innateFrost: 1, lifeMul: 1.1 },
  { ...BASE, id: 'volt', price: 6000, diamondPrice: 300, unlockLevel: 25, color: '#fff27a', trail: '#2f8bff', innateShockwave: 1, innateChain: 1, pulseGainMul: 1.25, trailMul: 0.95 },
  {
    ...BASE,
    id: 'solar',
    price: 12000,
    diamondPrice: 600,
    unlockLevel: 50,
    color: '#fff4c2',
    trail: '#ff7a1a',
    heartsDelta: 1,
    innateEmber: 1,
    pulseRadiusMul: 1.25,
    startEpic: true,
    look: 'solar',
  },
  {
    ...BASE,
    id: 'aurora',
    price: 0,
    diamondPrice: 0,
    exclusive: true,
    unlockLevel: 1,
    color: '#c9fff0',
    trail: '#8a5cff',
    heartsDelta: 1,
    trailMul: 1.2,
    innateEcho: 1,
    innateChain: 1,
    shardMul: 1.3,
    scoreMul: 1.1,
    secondWind: true,
    look: 'aurora',
  },
];

export const getCharacter = (id: CharacterId): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/** Sparks that take part in the daily challenge – fixed so every app version picks the same one. */
export const DAILY_CHARACTERS: CharacterId[] = ['spark', 'comet', 'ember', 'prism', 'nova', 'phantom'];
