import { META } from '../game/meta';
import { CHARACTERS } from '../game/characters';
import { ACHIEVEMENTS } from '../game/achievements';
import type { CharacterId, MetaId } from '../game/types';

export type Quality = 'auto' | 'high' | 'low';
export type LangSetting = 'auto' | 'de' | 'en';

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  shake: boolean;
  sensitivity: number;
  quality: Quality;
  lang: LangSetting;
  reducedMotion: boolean;
}

export interface LifetimeStats {
  runs: number;
  loops: number;
  kills: number;
  bossKills: number;
  playTime: number;
  shardsTotal: number;
  bestLoop: number;
  bestCombo: number;
  bestWave: number;
}

export interface SaveData {
  v: number;
  bank: number;
  best: number;
  bestWave: number;
  daily: { date: string; best: number };
  meta: Partial<Record<MetaId, number>>;
  chars: CharacterId[];
  selected: CharacterId;
  ach: Record<string, number>;
  stats: LifetimeStats;
  settings: Settings;
  tutorialDone: boolean;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'lumen-loop/save';

export const defaultSettings = (): Settings => ({
  music: 0.6,
  sfx: 0.85,
  haptics: true,
  shake: true,
  sensitivity: 1.1,
  quality: 'auto',
  lang: 'auto',
  reducedMotion: false,
});

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  bank: 0,
  best: 0,
  bestWave: 0,
  daily: { date: '', best: 0 },
  meta: {},
  chars: ['spark'],
  selected: 'spark',
  ach: {},
  stats: { runs: 0, loops: 0, kills: 0, bossKills: 0, playTime: 0, shardsTotal: 0, bestLoop: 0, bestCombo: 0, bestWave: 0 },
  settings: defaultSettings(),
  tutorialDone: false,
});

const num = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const int = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => Math.floor(num(v, def, min, max));
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Validates and repairs arbitrary JSON into a well-formed SaveData. Unknown keys are dropped,
 * wrong types fall back to defaults – a corrupted save can never crash the game.
 */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  const r = obj(raw);
  const charIds = CHARACTERS.map((c) => c.id);

  const meta: SaveData['meta'] = {};
  const rm = obj(r.meta);
  for (const m of META) {
    const lv = int(rm[m.id], 0, 0, m.max);
    if (lv > 0) meta[m.id] = lv;
  }

  const chars = Array.isArray(r.chars) ? (r.chars.filter((c) => (charIds as string[]).includes(c as string)) as CharacterId[]) : [];
  if (!chars.includes('spark')) chars.unshift('spark');
  const selected = oneOf(r.selected, charIds, 'spark');

  const ach: Record<string, number> = {};
  const ra = obj(r.ach);
  for (const a of ACHIEVEMENTS) if (typeof ra[a] === 'number') ach[a] = ra[a] as number;

  const rs = obj(r.stats);
  const stats: LifetimeStats = { ...d.stats };
  for (const k of Object.keys(stats) as (keyof LifetimeStats)[]) stats[k] = num(rs[k], 0, 0);

  const st = obj(r.settings);
  const ds = d.settings;
  const settings: Settings = {
    music: num(st.music, ds.music, 0, 1),
    sfx: num(st.sfx, ds.sfx, 0, 1),
    haptics: bool(st.haptics, ds.haptics),
    shake: bool(st.shake, ds.shake),
    sensitivity: num(st.sensitivity, ds.sensitivity, 0.5, 2),
    quality: oneOf(st.quality, ['auto', 'high', 'low'] as const, ds.quality),
    lang: oneOf(st.lang, ['auto', 'de', 'en'] as const, ds.lang),
    reducedMotion: bool(st.reducedMotion, ds.reducedMotion),
  };

  const daily = obj(r.daily);
  return {
    v: SAVE_VERSION,
    bank: int(r.bank, 0),
    best: int(r.best, 0),
    bestWave: int(r.bestWave, 0),
    daily: { date: str(daily.date, ''), best: int(daily.best, 0) },
    meta,
    chars: [...new Set(chars)],
    selected: chars.includes(selected) ? selected : 'spark',
    ach,
    stats,
    settings,
    tutorialDone: bool(r.tutorialDone, false),
  };
}

/** Minimal storage interface – lets tests inject an in-memory store. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): KV | null {
  try {
    const ls = globalThis.localStorage;
    const probe = '__lumen_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class SaveStore {
  data: SaveData;
  private kv: KV | null;

  constructor(kv: KV | null = browserStorage()) {
    this.kv = kv;
    this.data = this.load();
  }

  get persistent(): boolean {
    return this.kv !== null;
  }

  private load(): SaveData {
    if (!this.kv) return defaultSave();
    try {
      const raw = this.kv.getItem(SAVE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : defaultSave();
    } catch {
      return defaultSave();
    }
  }

  save(): void {
    if (!this.kv) return;
    try {
      this.kv.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota / private mode – the game keeps running in memory */
    }
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }
}
