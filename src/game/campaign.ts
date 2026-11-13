import { Rng, hashString } from '../core/rng';
import { ENEMIES } from './config';
import type { SpawnGroup, WavePlan } from './waves';
import type { BossType, EnemyType, ModifierId } from './types';

/*
 * Campaign: 6 worlds × 10 levels. Every world follows the same arc – meet the new shadows, mix them,
 * a level with a special rule, a swarm, an elite test, a long gauntlet and a boss at the end – so the
 * difficulty climbs evenly while each world still brings something new.
 */

export const LEVELS_PER_WORLD = 10;

export interface WorldDef {
  /** Region (biome index) the world plays in. */
  biome: number;
  /** Shadows introduced in this world. */
  fresh: EnemyType[];
  boss: BossType;
  /** Special rules for levels 4, 6 and 8. */
  rules: [ModifierId, ModifierId, ModifierId];
}

export const WORLDS: WorldDef[] = [
  { biome: 0, fresh: ['mote', 'dart'], boss: 'maw', rules: ['haste', 'longtrail', 'nopulse'] },
  { biome: 1, fresh: ['cutter', 'splitter'], boss: 'weaver', rules: ['longtrail', 'haste', 'swarmy'] },
  { biome: 2, fresh: ['brute', 'spitter', 'gnat'], boss: 'twins', rules: ['swarmy', 'nopulse', 'haste'] },
  { biome: 3, fresh: ['warden', 'blinker'], boss: 'hydra', rules: ['haste', 'swarmy', 'glass'] },
  { biome: 4, fresh: ['bomber', 'bouncer'], boss: 'eye', rules: ['nopulse', 'longtrail', 'glass'] },
  { biome: 5, fresh: ['ghost'], boss: 'vortex', rules: ['glass', 'haste', 'swarmy'] },
];

export const LEVEL_COUNT = WORLDS.length * LEVELS_PER_WORLD;

export interface LevelDef {
  /** 0-based index over the whole campaign. */
  index: number;
  world: number;
  /** 1-based number inside the world. */
  number: number;
  modifiers: ModifierId[];
  /** Score needed for the third star. */
  starScore: number;
  /** Ready-made wave schedule. */
  waves: WavePlan[];
}

type Pick = [EnemyType, number];

/** Every shadow the player has met up to (and including) world `w`. */
const known = (w: number): EnemyType[] => WORLDS.slice(0, w + 1).flatMap((x) => x.fresh);

function wave(n: number, world: number, picks: Pick[], opts: { elite?: number; boss?: BossType; newEnemy?: EnemyType | null; haste?: boolean }, rng: Rng): WavePlan {
  const speedMul = (1 + 0.05 * world + 0.008 * n) * (opts.haste ? 1.25 : 1);
  const duration = 8 + picks.length * 3;
  const groups: SpawnGroup[] = picks.map(([type, count], i) => {
    const at = i === 0 ? 0.6 : 0.6 + (i / Math.max(1, picks.length - 1)) * duration + rng.range(-0.5, 0.5);
    const elite = Array.from({ length: count }, () => type !== 'gnat' && rng.chance(opts.elite ?? 0));
    return { at: Math.max(0.6, at), type, count, elite };
  });
  groups.sort((a, b) => a.at - b.at);
  return { wave: n, boss: opts.boss ?? null, bossTier: 0, groups, cap: 14 + 4 * world, newEnemy: opts.newEnemy ?? null, speedMul };
}

/** A group of `type` sized to the world (bigger groups for swarm-like shadows). */
function group(type: EnemyType, world: number, scale = 1): Pick {
  const def = ENEMIES[type];
  const base = type === 'gnat' ? 7 : def.group[1] >= 2 ? 2 : 1;
  return [type, Math.max(1, Math.round((base + world * 0.5) * scale))];
}

function mixWave(n: number, world: number, size: number, rng: Rng, opts: { elite?: number; haste?: boolean; prefer?: EnemyType[] } = {}): WavePlan {
  const pool = known(world).filter((t) => t !== 'mini');
  const picks: Pick[] = [];
  for (let i = 0; i < size; i++) {
    const type = opts.prefer && rng.chance(0.55) ? rng.pick(opts.prefer) : rng.pick(pool);
    picks.push(group(type, world));
  }
  return wave(n, world, picks, opts, rng);
}

function buildLevel(world: number, number: number): LevelDef {
  const w = WORLDS[world];
  const rng = new Rng(hashString(`lumen-campaign-${world}-${number}`));
  const [a, b] = [w.fresh[0], w.fresh[w.fresh.length - 1]];
  const ruleFor = (n: number): ModifierId[] => (n === 4 ? [w.rules[0]] : n === 6 ? [w.rules[1]] : n === 8 ? [w.rules[2]] : []);
  const modifiers = ruleFor(number);
  const haste = modifiers.includes('haste');
  const base = 2 + world;
  let waves: WavePlan[];
  switch (number) {
    case 1:
      waves = [
        wave(1, world, [group(a, world), ['mote', 2]], { newEnemy: a }, rng),
        wave(2, world, [group(a, world), group(a, world), ['mote', 3]], {}, rng),
      ];
      break;
    case 2:
      waves = [
        wave(1, world, [group(b, world), ['mote', 2]], { newEnemy: b === a ? null : b }, rng),
        wave(2, world, [group(b, world), group(a, world), group(b, world)], {}, rng),
      ];
      break;
    case 3:
      waves = [1, 2, 3].map((n) => mixWave(n, world, base, rng, { prefer: w.fresh }));
      break;
    case 5:
      // Swarm: lots of small shadows – rewards one huge loop.
      waves = [1, 2, 3].map((n) =>
        wave(n, world, [['gnat', 8 + world * 2], ['mote', 3 + world], ['gnat', 8 + world * 2]], { newEnemy: world === 0 && n === 1 ? 'gnat' : null }, rng),
      );
      break;
    case 7:
      // Elite test: fewer shadows, all of them elite.
      waves = [1, 2, 3].map((n) => mixWave(n, world, Math.max(2, base - 1), rng, { elite: 1, prefer: w.fresh }));
      break;
    case 9:
      // Gauntlet: four waves that keep growing.
      waves = [1, 2, 3, 4].map((n) => mixWave(n, world, base + n, rng, { elite: 0.15 + 0.05 * world }));
      break;
    case 10:
      waves = [
        mixWave(1, world, base, rng, { prefer: w.fresh }),
        wave(2, world, [['mote', 2 + world]], { boss: w.boss }, rng),
      ];
      break;
    default:
      // Levels 4, 6 and 8 play with a special rule.
      waves = [1, 2, 3].map((n) => mixWave(n, world, base + (number === 8 ? 0 : 1), rng, { haste, elite: 0.1 * world }));
  }
  // Third star: roughly what a good run scores – catching groups together, not one by one.
  let raw = 0;
  for (const wv of waves) {
    for (const g of wv.groups) raw += ENEMIES[g.type].score * g.count;
    if (wv.boss) raw += ENEMIES[wv.boss === 'twins' ? 'twin' : wv.boss].score;
    raw += 100 * wv.wave;
  }
  const starScore = Math.max(500, Math.round((raw * 1.5) / 50) * 50);
  return { index: world * LEVELS_PER_WORLD + number - 1, world, number, modifiers, starScore, waves };
}

let cache: LevelDef[] | null = null;

export function campaignLevels(): LevelDef[] {
  if (!cache) {
    cache = [];
    for (let w = 0; w < WORLDS.length; w++) for (let n = 1; n <= LEVELS_PER_WORLD; n++) cache.push(buildLevel(w, n));
  }
  return cache;
}

export const getLevel = (index: number): LevelDef => campaignLevels()[index];

/** Stars for a finished level: cleared · at most one hit · score goal. */
export function starsFor(level: LevelDef, victory: boolean, hits: number, score: number): [boolean, boolean, boolean] {
  return [victory, victory && hits <= 1, victory && score >= level.starScore];
}
