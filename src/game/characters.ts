import type { CharacterId } from './types';

export interface CharacterDef {
  id: CharacterId;
  price: number;
  color: string;
  /** Secondary colour used for the trail gradient. */
  trail: string;
  speedMul: number;
  trailMul: number;
  heartsDelta: number;
  scoreMul: number;
  innateEmber: number;
  innateChain: number;
  cometCharge: boolean;
  rainbow: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'spark', price: 0, color: '#7df9ff', trail: '#4d7bff', speedMul: 1, trailMul: 1, heartsDelta: 0, scoreMul: 1, innateEmber: 0, innateChain: 0, cometCharge: false, rainbow: false },
  { id: 'comet', price: 400, color: '#7cff9b', trail: '#22d3a6', speedMul: 1.25, trailMul: 0.8, heartsDelta: 0, scoreMul: 1, innateEmber: 0, innateChain: 0, cometCharge: true, rainbow: false },
  { id: 'ember', price: 900, color: '#ffae5c', trail: '#ff4d2e', speedMul: 0.85, trailMul: 1.3, heartsDelta: 0, scoreMul: 1, innateEmber: 1, innateChain: 0, cometCharge: false, rainbow: false },
  { id: 'prism', price: 1500, color: '#f2e9ff', trail: '#c38bff', speedMul: 1, trailMul: 1, heartsDelta: -1, scoreMul: 1.25, innateEmber: 0, innateChain: 1, cometCharge: false, rainbow: true },
];

export const getCharacter = (id: CharacterId): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
