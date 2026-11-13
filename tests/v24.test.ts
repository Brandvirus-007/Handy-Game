import { describe, expect, it } from 'vitest';
import { defaultSave, sanitize } from '../src/core/storage';
import { MASTERY_MAX, addMastery, masteryLevel, masteryXpFor, masteryReward } from '../src/economy/mastery';
import { decodeChallenge, encodeChallenge } from '../src/economy/challenge';
import { computeStats } from '../src/game/stats';
import { World } from '../src/game/world';
import { CHARACTERS } from '../src/game/characters';

describe('spark mastery', () => {
  it('levels follow the XP table and stop at 10', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(masteryXpFor(1) - 1)).toBe(0);
    expect(masteryLevel(masteryXpFor(1))).toBe(1);
    expect(masteryLevel(masteryXpFor(10))).toBe(MASTERY_MAX);
    expect(masteryLevel(10_000_000)).toBe(MASTERY_MAX);
  });

  it('pays diamonds for every level reached, once', () => {
    const s = defaultSave();
    const gained = addMastery(s, 'spark', masteryXpFor(5));
    expect(gained).toEqual([1, 2, 3, 4, 5]);
    expect(s.diamonds).toBe([1, 2, 3, 4, 5].reduce((n, lv) => n + masteryReward(lv), 0));
    expect(addMastery(s, 'spark', 10)).toEqual([]);
  });

  it('raises score and shards by 1 % per level in a run', () => {
    const base = new World({ width: 390, height: 760, character: 'spark', seed: 1, modifiers: [], meta: {}, daily: false, tutorial: false });
    const master = new World({ width: 390, height: 760, character: 'spark', seed: 1, modifiers: [], meta: {}, daily: false, tutorial: false, mastery: 10 });
    expect(master.stats.scoreMul).toBeCloseTo(base.stats.scoreMul * 1.1);
    expect(master.stats.shardMul).toBeCloseTo(base.stats.shardMul * 1.1);
    expect(computeStats('spark', {}, {}, []).scoreMul).toBe(base.stats.scoreMul);
  });

  it('survives saving and loading', () => {
    const s = sanitize({ mastery: { spark: 1234, nope: 5, comet: -3 }, review: { last: 99, count: 2 } });
    expect(s.mastery).toEqual({ spark: 1234 });
    expect(s.review).toEqual({ last: 99, count: 2 });
  });
});

describe('challenge codes', () => {
  it('round-trip every spark and mode', () => {
    for (const c of CHARACTERS) {
      for (const mode of ['normal', 'blitz', 'bosses'] as const) {
        const ch = { seed: 0xdeadbeef, character: c.id, mode, score: 123456 };
        const code = encodeChallenge(ch);
        expect(code).toMatch(/^LL-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
        expect(decodeChallenge(code)).toEqual(ch);
        // Players may type it in lower case and without dashes.
        expect(decodeChallenge(code.toLowerCase().replace(/-/g, ' '))).toEqual(ch);
      }
    }
  });

  it('reject typos and junk', () => {
    const code = encodeChallenge({ seed: 42, character: 'comet', mode: 'blitz', score: 9000 });
    const last = code.slice(-1);
    const typo = code.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    expect(decodeChallenge(typo)).toBeNull();
    expect(decodeChallenge('')).toBeNull();
    expect(decodeChallenge('hallo welt')).toBeNull();
  });

  it('replays the same run: same seed gives the same first wave', () => {
    const a = new World({ width: 390, height: 760, character: 'spark', seed: 777, modifiers: [], meta: {}, daily: false, tutorial: false });
    const b = new World({ width: 390, height: 760, character: 'spark', seed: 777, modifiers: [], meta: {}, daily: false, tutorial: false });
    a.start();
    b.start();
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
  });
});
