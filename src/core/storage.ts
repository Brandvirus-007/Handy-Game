import { META } from '../game/meta';
import { CHARACTERS } from '../game/characters';
import { ACHIEVEMENTS } from '../game/achievements';
import { TRAILS, type TrailId } from '../game/trails';
import type { GameMode } from '../game/modes';
import type { CharacterId, MetaId } from '../game/types';
import type { BoosterId, MissionType, Reward } from '../economy/defs';

export type Quality = 'auto' | 'high' | 'low';
/** direct: the spark hovers above the finger · relative: trackpad-style steering. */
export type ControlMode = 'direct' | 'relative';
export type TouchOffset = 'small' | 'medium' | 'large';
export type LangSetting = 'auto' | 'de' | 'en';

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  shake: boolean;
  sensitivity: number;
  control: ControlMode;
  offset: TouchOffset;
  quality: Quality;
  lang: LangSetting;
  reducedMotion: boolean;
  /** WebGL light filter (bloom, distortion). */
  glow: boolean;
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

export interface MissionState {
  type: MissionType;
  target: number;
  progress: number;
  reward: Reward;
  claimed: boolean;
}

export interface SaveData {
  v: number;
  /** Shards (soft currency). */
  bank: number;
  /** Diamonds (premium currency). */
  diamonds: number;
  level: number;
  xp: number;
  /** Wave milestones already rewarded. */
  milestones: number[];
  /** 7-day login calendar: date of the last claim and index of the next day to claim. */
  login: { last: string; day: number };
  missions: { date: string; list: MissionState[]; bonusClaimed: boolean };
  ads: { date: string; freeDiamonds: number; lastInterstitial: number; lastRewarded: number; runsSinceInterstitial: number };
  owned: { noAds: boolean; starter: boolean };
  /** Boosters selected for the next run (remembered between runs). */
  boosters: BoosterId[];
  /** Purchase tokens already credited – prevents double grants after a crash or restore. */
  grantedTokens: string[];
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
  /** App version whose "What's new" notes were already shown. */
  seenVersion: string;
  /** Trail designs owned and the one in use. */
  trails: TrailId[];
  trail: TrailId;
  /** Campaign: stars per level (index 0 = world 1, level 1). */
  campaign: number[];
  /** Mastery XP per spark. */
  mastery: Partial<Record<CharacterId, number>>;
  /** In-app review prompt: when it was last requested and how often. */
  review: { last: number; count: number };
  /** Weekly event: week number, best event score and how many goals were reached. */
  weekly: { week: number; best: number; reached: number };
  /** Last picked mode and best scores of the extra modes. */
  mode: GameMode;
  modeBest: { blitz: number; bosses: number };
  /** Light pass of the current season: points, claimed tiers per track and the season premium was bought for. */
  pass: { season: number; points: number; free: number[]; premium: number[]; premiumSeason: number };
}

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'lumen-loop/save';

export const defaultSettings = (): Settings => ({
  music: 0.6,
  sfx: 0.85,
  haptics: true,
  shake: true,
  sensitivity: 1.1,
  control: 'direct',
  offset: 'medium',
  quality: 'auto',
  lang: 'auto',
  reducedMotion: false,
  glow: true,
});

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  bank: 0,
  diamonds: 0,
  level: 1,
  xp: 0,
  milestones: [],
  login: { last: '', day: 0 },
  missions: { date: '', list: [], bonusClaimed: false },
  ads: { date: '', freeDiamonds: 0, lastInterstitial: 0, lastRewarded: 0, runsSinceInterstitial: 0 },
  owned: { noAds: false, starter: false },
  boosters: [],
  grantedTokens: [],
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
  seenVersion: '',
  trails: ['default'],
  trail: 'default',
  pass: { season: 0, points: 0, free: [], premium: [], premiumSeason: 0 },
  mode: 'normal',
  modeBest: { blitz: 0, bosses: 0 },
  weekly: { week: 0, best: 0, reached: 0 },
  mastery: {},
  review: { last: 0, count: 0 },
  campaign: [],
});

const num = (v: unknown, def: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const int = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => Math.floor(num(v, def, min, max));
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
const MISSION_TYPES: MissionType[] = ['kills', 'loops', 'wave', 'bigloop', 'boss', 'shards', 'pulse', 'runs', 'combo'];
const BOOSTER_IDS: BoosterId[] = ['shield', 'heart', 'charge', 'lucky', 'magnet', 'headstart'];

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

  const pass = obj(r.pass);
  const tiers = (v: unknown): number[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 100))] : [];
  const trailIds = TRAILS.map((tr) => tr.id) as string[];
  const trails: TrailId[] = ['default', ...(Array.isArray(r.trails) ? (r.trails.filter((x) => trailIds.includes(x as string) && x !== 'default') as TrailId[]) : [])];

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
    control: oneOf(st.control, ['direct', 'relative'] as const, ds.control),
    offset: oneOf(st.offset, ['small', 'medium', 'large'] as const, ds.offset),
    quality: oneOf(st.quality, ['auto', 'high', 'low'] as const, ds.quality),
    lang: oneOf(st.lang, ['auto', 'de', 'en'] as const, ds.lang),
    reducedMotion: bool(st.reducedMotion, ds.reducedMotion),
    glow: bool(st.glow, ds.glow),
  };

  const daily = obj(r.daily);
  const login = obj(r.login);
  const missions = obj(r.missions);
  const ads = obj(r.ads);
  const owned = obj(r.owned);
  const missionList: MissionState[] = Array.isArray(missions.list)
    ? (missions.list as unknown[]).slice(0, 5).flatMap((m) => {
        const o = obj(m);
        if (typeof o.type !== 'string' || !MISSION_TYPES.includes(o.type as MissionType)) return [];
        const rw = obj(o.reward);
        return [{
          type: o.type as MissionType,
          target: int(o.target, 1, 1),
          progress: int(o.progress, 0),
          reward: { coins: int(rw.coins, 0), diamonds: int(rw.diamonds, 0) },
          claimed: bool(o.claimed, false),
        }];
      })
    : [];
  return {
    v: SAVE_VERSION,
    bank: int(r.bank, 0),
    diamonds: int(r.diamonds, 0),
    level: int(r.level, 1, 1, 999),
    xp: int(r.xp, 0),
    milestones: Array.isArray(r.milestones) ? [...new Set(r.milestones.filter((x): x is number => typeof x === 'number'))] : [],
    login: { last: str(login.last, ''), day: int(login.day, 0, 0, 6) },
    missions: { date: str(missions.date, ''), list: missionList, bonusClaimed: bool(missions.bonusClaimed, false) },
    ads: {
      date: str(ads.date, ''),
      freeDiamonds: int(ads.freeDiamonds, 0),
      lastInterstitial: num(ads.lastInterstitial, 0, 0),
      lastRewarded: num(ads.lastRewarded, 0, 0),
      runsSinceInterstitial: int(ads.runsSinceInterstitial, 0),
    },
    owned: { noAds: bool(owned.noAds, false), starter: bool(owned.starter, false) },
    boosters: Array.isArray(r.boosters) ? (r.boosters.filter((b) => BOOSTER_IDS.includes(b as BoosterId)) as BoosterId[]) : [],
    grantedTokens: Array.isArray(r.grantedTokens) ? r.grantedTokens.filter((x): x is string => typeof x === 'string').slice(-100) : [],
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
    seenVersion: str(r.seenVersion, ''),
    trails: [...new Set(trails)],
    mode: oneOf(r.mode, ['normal', 'blitz', 'bosses'] as const, 'normal'),
    mastery: Object.fromEntries(
      Object.entries(obj(r.mastery)).filter(([k, v]) => (charIds as string[]).includes(k) && typeof v === 'number' && v > 0).map(([k, v]) => [k, Math.floor(v as number)]),
    ) as SaveData['mastery'],
    review: { last: num(obj(r.review).last, 0, 0), count: int(obj(r.review).count, 0, 0, 99) },
    campaign: Array.isArray(r.campaign) ? r.campaign.slice(0, 60).map((v) => int(v, 0, 0, 3)) : [],
    weekly: { week: int(obj(r.weekly).week, 0), best: int(obj(r.weekly).best, 0), reached: int(obj(r.weekly).reached, 0, 0, 3) },
    modeBest: { blitz: int(obj(r.modeBest).blitz, 0), bosses: int(obj(r.modeBest).bosses, 0) },
    pass: {
      season: int(pass.season, 0),
      points: int(pass.points, 0),
      free: tiers(pass.free),
      premium: tiers(pass.premium),
      premiumSeason: int(pass.premiumSeason, 0),
    },
    trail: trails.includes(r.trail as TrailId) ? (r.trail as TrailId) : 'default',
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
  /** Called after every successful write (the app uses it to schedule the cloud backup). */
  onSave: (() => void) | null = null;
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
      this.onSave?.();
    } catch {
      /* quota / private mode – the game keeps running in memory */
    }
  }

  /** Replaces the whole save (cloud import). */
  replace(data: SaveData): void {
    this.data = sanitize(data);
    this.save();
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }
}
