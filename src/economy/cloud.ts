import { sanitize, type SaveData } from '../core/storage';

/*
 * Cloud save (Google Play Games "Saved Games"). The whole save travels as JSON; settings stay on the
 * device. When the cloud holds more progress than the device, the player decides which one to keep.
 */

const TAG = 'lumen-loop';

export interface CloudSave {
  at: number;
  save: SaveData;
}

export function packCloud(s: SaveData, now: number): string {
  return JSON.stringify({ app: TAG, at: now, save: s });
}

export function unpackCloud(text: string): CloudSave | null {
  try {
    const raw = JSON.parse(text) as { app?: unknown; at?: unknown; save?: unknown };
    if (!raw || raw.app !== TAG || !raw.save) return null;
    const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
    return { at, save: sanitize(raw.save) };
  } catch {
    return null;
  }
}

/** > 0 when `a` holds more progress than `b`: level first, then runs, then play time. */
export function compareProgress(a: SaveData, b: SaveData): number {
  return a.level - b.level || a.stats.runs - b.stats.runs || a.stats.playTime - b.stats.playTime;
}

/**
 * The save to use after the player picked the cloud: progress from the cloud, settings from this
 * device, and nothing bought here gets lost (purchase tokens, sparks, trails and paid flags are merged).
 */
export function mergeForImport(local: SaveData, cloud: SaveData): SaveData {
  const union = <T>(a: T[], b: T[]): T[] => [...new Set([...a, ...b])];
  return sanitize({
    ...cloud,
    settings: local.settings,
    seenVersion: local.seenVersion,
    grantedTokens: union(cloud.grantedTokens, local.grantedTokens),
    chars: union(cloud.chars, local.chars),
    trails: union(cloud.trails, local.trails),
    owned: { noAds: cloud.owned.noAds || local.owned.noAds, starter: cloud.owned.starter || local.owned.starter },
    pass: { ...cloud.pass, premiumSeason: Math.max(cloud.pass.premiumSeason, local.pass.premiumSeason) },
  });
}

/** Short label shown in the Play Games save list. */
export const cloudLabel = (s: SaveData): string => `LUMEN LOOP · Lv ${s.level} · ${s.stats.runs} runs`;
