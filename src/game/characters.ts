import type { CharacterId } from './types';

export interface CharacterDef {
  id: CharacterId;
  /** Price in shards (0 = not buyable with shards). */
  price: number;
  /** Alternative price in diamonds. */
  diamondPrice: number;
  /** Premium sparks can only be bought with diamonds (or come with the starter pack). */
  premium: boolean;
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
  innateEmber: number;
  innateChain: number;
  innateEcho: number;
  pulseRadiusMul: number;
  phase: boolean;
  cometCharge: boolean;
  rainbow: boolean;
}

const BASE = { hitMul: 1, trailMul: 1, lifeMul: 1, heartsDelta: 0, scoreMul: 1, innateEmber: 0, innateChain: 0, innateEcho: 0, pulseRadiusMul: 1, phase: false, cometCharge: false, rainbow: false, premium: false };

export const CHARACTERS: CharacterDef[] = [
  { ...BASE, id: 'spark', price: 0, diamondPrice: 0, color: '#7df9ff', trail: '#4d7bff' },
  { ...BASE, id: 'comet', price: 400, diamondPrice: 30, color: '#7cff9b', trail: '#22d3a6', hitMul: 0.72, trailMul: 0.8, cometCharge: true },
  { ...BASE, id: 'ember', price: 900, diamondPrice: 60, color: '#ffae5c', trail: '#ff4d2e', trailMul: 1.3, lifeMul: 0.85, innateEmber: 1 },
  { ...BASE, id: 'prism', price: 1500, diamondPrice: 100, color: '#f2e9ff', trail: '#c38bff', heartsDelta: -1, scoreMul: 1.25, innateChain: 1, rainbow: true },
  { ...BASE, id: 'nova', price: 0, diamondPrice: 250, premium: true, color: '#ffe08a', trail: '#ff9f1c', innateEcho: 1, pulseRadiusMul: 1.2 },
  { ...BASE, id: 'phantom', price: 0, diamondPrice: 400, premium: true, color: '#b8fff1', trail: '#7c5cff', heartsDelta: 1, phase: true, trailMul: 1.1 },
];

export const getCharacter = (id: CharacterId): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
