import { CHARACTERS } from '../game/characters';
import { META, metaCost, metaLevelReq, type MetaDef } from '../game/meta';
import { UPGRADES } from '../game/upgrades';
import type { CharacterId, MetaId, UpgradeId } from '../game/types';
import type { SaveData } from '../core/storage';

/** Something that becomes available at a certain player level. */
export type Unlock =
  | { kind: 'char'; id: CharacterId }
  | { kind: 'meta'; id: MetaId; rank: number }
  | { kind: 'upgrade'; id: UpgradeId };

export interface LevelStep {
  level: number;
  unlocks: Unlock[];
}

/** All level-gated content, sorted by level ("Stufenpfad"). */
export function levelPath(): LevelStep[] {
  const map = new Map<number, Unlock[]>();
  const add = (level: number, u: Unlock) => {
    if (level <= 1) return;
    if (!map.has(level)) map.set(level, []);
    map.get(level)!.push(u);
  };
  for (const c of CHARACTERS) if (!c.exclusive) add(c.unlockLevel, { kind: 'char', id: c.id });
  for (const m of META) {
    if (m.unlock > 1) add(m.unlock, { kind: 'meta', id: m.id, rank: 1 });
    m.gates?.forEach((lvl, i) => {
      if (lvl > m.unlock) add(lvl, { kind: 'meta', id: m.id, rank: i + 1 });
    });
  }
  for (const u of UPGRADES) if (u.minLevel) add(u.minLevel, { kind: 'upgrade', id: u.id });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([level, unlocks]) => ({ level, unlocks }));
}

/** Content unlocked by going from level `from` to level `to` (exclusive → inclusive). */
export function unlocksBetween(from: number, to: number): Unlock[] {
  return levelPath()
    .filter((s) => s.level > from && s.level <= to)
    .flatMap((s) => s.unlocks);
}

/** The next level that unlocks something, if any. */
export const nextUnlockLevel = (level: number): number | null => levelPath().find((s) => s.level > level)?.level ?? null;

/** Can the next workshop rank be bought right now (level gate + shards)? */
export function metaBuyable(s: SaveData, m: MetaDef): boolean {
  const lv = s.meta[m.id] ?? 0;
  return lv < m.max && metaLevelReq(m, lv) <= s.level && s.bank >= metaCost(m, lv);
}

export const anyMetaBuyable = (s: SaveData): boolean => META.some((m) => metaBuyable(s, m));
