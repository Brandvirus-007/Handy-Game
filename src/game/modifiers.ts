import { Rng } from '../core/rng';
import type { CharacterId, ModifierId } from './types';
import { DAILY_CHARACTERS } from './characters';

export const MODIFIERS: ModifierId[] = ['glass', 'haste', 'swarmy', 'longtrail', 'bossrush', 'nopulse'];

export interface DailySetup {
  date: string;
  seed: number;
  character: CharacterId;
  modifiers: ModifierId[];
}

/** The daily challenge is fully derived from the date seed – identical for everyone on the same day. */
export function dailySetup(date: string, seed: number): DailySetup {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const character = rng.pick(DAILY_CHARACTERS);
  const mods = rng.shuffle([...MODIFIERS]);
  const first = mods[0];
  // glass (1 heart) + nopulse together is too punishing – never combine them.
  const clash = (a: ModifierId, b: ModifierId) =>
    (a === 'glass' && b === 'nopulse') || (a === 'nopulse' && b === 'glass');
  const second = mods.slice(1).find((m) => !clash(first, m))!;
  const modifiers: ModifierId[] = [first, second];
  return { date, seed, character, modifiers };
}
