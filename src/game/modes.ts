import type { ModifierId } from './types';

/** Ways to play a run besides the daily challenge. */
export type GameMode = 'normal' | 'blitz' | 'bosses';

export interface ModeDef {
  id: GameMode;
  /** Player level needed to pick the mode. */
  unlockLevel: number;
  modifiers: ModifierId[];
  /** Run ends after this many seconds (0 = no limit). */
  timeLimit: number;
}

export const MODES: ModeDef[] = [
  { id: 'normal', unlockLevel: 1, modifiers: [], timeLimit: 0 },
  { id: 'blitz', unlockLevel: 5, modifiers: [], timeLimit: 180 },
  { id: 'bosses', unlockLevel: 12, modifiers: ['bossonly'], timeLimit: 0 },
];

export const getMode = (id: GameMode): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0];
