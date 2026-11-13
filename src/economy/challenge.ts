import { CHARACTERS } from '../game/characters';
import type { GameMode } from '../game/modes';
import type { CharacterId } from '../game/types';

/* Friend challenges: a short code that replays the same run (same seed, spark and mode) and carries the score to beat. */

export interface Challenge {
  seed: number;
  character: CharacterId;
  mode: GameMode;
  score: number;
}

const MODES: GameMode[] = ['normal', 'blitz', 'bosses'];
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const checksum = (body: string): string => {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum = (sum + B36.indexOf(body[i]) * (i + 1)) % 36;
  return B36[sum];
};

export function encodeChallenge(c: Challenge): string {
  const charIdx = Math.max(0, CHARACTERS.findIndex((x) => x.id === c.character));
  const kind = charIdx * MODES.length + Math.max(0, MODES.indexOf(c.mode));
  const body =
    (c.seed >>> 0).toString(36).toUpperCase().padStart(7, '0') +
    kind.toString(36).toUpperCase().padStart(2, '0') +
    // Score padded to 6 digits so the code always splits into four even blocks.
    Math.max(0, Math.floor(c.score)).toString(36).toUpperCase().padStart(6, '0');
  const raw = body + checksum(body);
  return 'LL-' + (raw.match(/.{1,4}/g) ?? [raw]).join('-');
}

/** Parses a code typed or pasted by the player. Returns null when it is not a valid code. */
export function decodeChallenge(input: string): Challenge | null {
  let raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.startsWith('LL')) raw = raw.slice(2);
  if (raw.length < 11) return null;
  const body = raw.slice(0, -1);
  if (checksum(body) !== raw.slice(-1)) return null;
  const seed = parseInt(body.slice(0, 7), 36);
  const kind = parseInt(body.slice(7, 9), 36);
  const score = parseInt(body.slice(9), 36);
  const char = CHARACTERS[Math.floor(kind / MODES.length)];
  const mode = MODES[kind % MODES.length];
  if (!Number.isFinite(seed) || seed > 0xffffffff || !char || !mode || !Number.isFinite(score)) return null;
  return { seed, character: char.id, mode, score };
}
