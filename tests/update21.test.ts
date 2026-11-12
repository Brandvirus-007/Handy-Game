import { describe, expect, it } from 'vitest';
import { Rng, dailySeed } from '../src/core/rng';
import { defaultSave, sanitize } from '../src/core/storage';
import { creditPurchase } from '../src/economy/profile';
import { getProduct } from '../src/economy/defs';
import { anyMetaBuyable, levelPath, metaBuyable, nextUnlockLevel, unlocksBetween } from '../src/economy/unlocks';
import { CHARACTERS, DAILY_CHARACTERS, getCharacter } from '../src/game/characters';
import { META, getMeta, metaLevelReq } from '../src/game/meta';
import { dailySetup } from '../src/game/modifiers';
import { computeStats } from '../src/game/stats';
import { UPGRADES, getUpgrade, rollOffer } from '../src/game/upgrades';
import { World, type RunOptions } from '../src/game/world';
import type { Vec } from '../src/core/math';

const opts = (over: Partial<RunOptions> = {}): RunOptions => ({
  width: 420, height: 760, character: 'spark', seed: 99, modifiers: [], meta: {}, daily: false, tutorial: false, ...over,
});

describe('workshop level gates', () => {
  it('higher ranks need a player level', () => {
    const heart = getMeta('heart');
    expect(metaLevelReq(heart, 0)).toBe(1);
    expect(metaLevelReq(heart, 3)).toBe(50);
    expect(metaLevelReq(getMeta('luck'), 0)).toBe(20);
  });

  it('metaBuyable respects level and shards', () => {
    const s = defaultSave();
    s.bank = 1_000_000;
    s.meta.heart = 3;
    s.level = 49;
    expect(metaBuyable(s, getMeta('heart'))).toBe(false);
    s.level = 50;
    expect(metaBuyable(s, getMeta('heart'))).toBe(true);
    const poor = defaultSave();
    expect(anyMetaBuyable(poor)).toBe(false);
  });

  it('every gate list fits its item', () => {
    for (const m of META) if (m.gates) expect(m.gates.length).toBeLessThanOrEqual(m.max);
  });
});

describe('level path', () => {
  it('is sorted and contains the new content', () => {
    const path = levelPath();
    const levels = path.map((s) => s.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    const at50 = path.find((s) => s.level === 50)!;
    expect(at50.unlocks).toContainEqual({ kind: 'char', id: 'solar' });
    // Store exclusives are never part of the free path.
    expect(path.flatMap((s) => s.unlocks)).not.toContainEqual({ kind: 'char', id: 'aurora' });
  });

  it('reports what a level-up unlocked', () => {
    expect(unlocksBetween(14, 15)).toContainEqual({ kind: 'char', id: 'glacier' });
    expect(unlocksBetween(15, 15)).toEqual([]);
    expect(nextUnlockLevel(1)).toBe(2);
    expect(nextUnlockLevel(50)).toBeNull();
  });
});

describe('level-gated upgrades and luck', () => {
  it('locked upgrades never show up below their level', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 400; i++) {
      const offer = rollOffer(rng, {}, 3, { level: 1 });
      expect(offer).not.toContain('gravity');
      expect(offer).not.toContain('orbit');
    }
    let seen = 0;
    for (let i = 0; i < 400; i++) if (rollOffer(rng, {}, 3, { level: 20 }).includes('orbit')) seen++;
    expect(seen).toBeGreaterThan(0);
  });

  it('galaxy needs both its recipe and level 30', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 200; i++) expect(rollOffer(rng, { orbit: 2, gravity: 1 }, 3, { level: 29 })).not.toContain('galaxy');
    let seen = 0;
    for (let i = 0; i < 200; i++) if (rollOffer(rng, { orbit: 2, gravity: 1 }, 3, { level: 30 }).includes('galaxy')) seen++;
    expect(seen).toBeGreaterThan(40);
  });

  it('luck makes epic cards more common', () => {
    const count = (luck: number) => {
      const rng = new Rng(21);
      let epic = 0;
      for (let i = 0; i < 2000; i++) for (const id of rollOffer(rng, {}, 3, { luck })) if (getUpgrade(id).rarity === 'epic') epic++;
      return epic;
    };
    expect(count(0.32)).toBeGreaterThan(count(0) * 1.3);
  });

  it('`only` restricts the rarity', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 100; i++) for (const id of rollOffer(rng, {}, 3, { only: 'epic' })) expect(getUpgrade(id).rarity).toBe('epic');
  });

  it('every upgrade has a valid recipe', () => {
    for (const u of UPGRADES) for (const id of Object.keys(u.requires ?? {})) expect(UPGRADES.some((x) => x.id === id)).toBe(true);
  });
});

describe('new sparks', () => {
  it('Sun Core starts with an epic upgrade', () => {
    const w = new World(opts({ character: 'solar' }));
    const owned = Object.keys(w.upgrades).filter((id) => (w.upgrades as Record<string, number>)[id] > 0);
    expect(owned.length).toBe(1);
    expect(getUpgrade(owned[0] as never).rarity).toBe('epic');
  });

  it('Aurora is strong and never offered Second Wind', () => {
    const a = computeStats('aurora', {}, {}, []);
    const s = computeStats('spark', {}, {}, []);
    expect(a.maxHearts).toBe(s.maxHearts + 1);
    expect(a.secondWind).toBe(true);
    expect(a.shardMul).toBeCloseTo(1.3);
    const w = new World(opts({ character: 'aurora' }));
    expect(w.offerExclusions()).toContain('secondwind');
  });

  it('Frost and Volt bring their innate upgrades', () => {
    expect(computeStats('glacier', {}, {}, []).frost).toBe(1);
    const v = computeStats('volt', {}, {}, []);
    expect(v.shockwave).toBe(1);
    expect(v.chain).toBe(1);
  });

  it('Aurora is store-exclusive and unlocked by its product', () => {
    const c = getCharacter('aurora');
    expect(c.exclusive).toBe(true);
    expect(c.price).toBe(0);
    expect(c.diamondPrice).toBe(0);
    const s = defaultSave();
    expect(creditPurchase(s, 'spark_aurora', 'tok-1')).toBe(true);
    expect(s.chars).toContain('aurora');
    expect(s.diamonds).toBe(getProduct('spark_aurora').reward.diamonds);
    expect(creditPurchase(s, 'spark_aurora', 'tok-1')).toBe(false);
    expect(s.chars.filter((id) => id === 'aurora').length).toBe(1);
  });

  it('every buyable spark has a level gate, prices grow with it', () => {
    const buyable = CHARACTERS.filter((c) => c.price > 0).sort((a, b) => a.unlockLevel - b.unlockLevel);
    for (let i = 1; i < buyable.length; i++) expect(buyable[i].price).toBeGreaterThanOrEqual(buyable[i - 1].price);
    expect(getCharacter('solar').unlockLevel).toBe(50);
  });

  it('the daily challenge only uses the original sparks', () => {
    for (let d = 1; d <= 60; d++) {
      const date = `2026-01-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;
      expect(DAILY_CHARACTERS).toContain(dailySetup(date, dailySeed(date) + d).character);
    }
  });

  it('save data keeps the new ids', () => {
    const s = sanitize({ chars: ['spark', 'solar', 'aurora', 'nope'], selected: 'aurora', meta: { luck: 2, wisdom: 9 }, seenVersion: '2.1.0' });
    expect(s.chars).toEqual(['spark', 'solar', 'aurora']);
    expect(s.selected).toBe('aurora');
    expect(s.meta.luck).toBe(2);
    expect(s.meta.wisdom).toBe(5);
    expect(s.seenVersion).toBe('2.1.0');
  });
});

describe('gravity loops and satellites', () => {
  const square = (cx: number, cy: number, r: number): Vec[] => [
    { x: cx - r, y: cy - r }, { x: cx + r, y: cy - r }, { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r },
  ];

  it('a gravity loop drags survivors towards its centre', () => {
    const w = new World(opts());
    w.applyUpgrade('gravity');
    const e = w.spawnDirect('brute', 300, 300, true);
    e.t = 1;
    (w as unknown as { resolveLoop(p: Vec[], echo: boolean): void }).resolveLoop(square(200, 300, 30), false);
    expect(e.kx).toBeLessThan(0);
    expect(w.drainEvents().some((ev) => ev.type === 'gravity')).toBe(true);
  });

  it('satellites hurt enemies they touch, with a cooldown', () => {
    const w = new World(opts());
    w.applyUpgrade('orbit');
    expect(w.stats.orbiters).toBe(2);
    w.invuln = 99;
    const [sat] = w.orbiterPositions();
    const e = w.spawnDirect('brute', sat.x, sat.y, true);
    e.t = 1;
    const hp = e.hp;
    w.update(1 / 60);
    expect(e.hp).toBeLessThan(hp);
    const after = e.hp;
    // Same spot again right away: still on cooldown.
    (w as unknown as { orbitAngle: number }).orbitAngle -= 1 / 60 * 2.8;
    w.update(1 / 60);
    expect(e.dead || e.hp === after).toBe(true);
  });

  it('galaxy adds satellites and widens the orbit', () => {
    const w = new World(opts());
    w.applyUpgrade('orbit');
    w.applyUpgrade('orbit');
    const r = w.stats.orbitRadius;
    w.applyUpgrade('galaxy');
    expect(w.stats.orbiters).toBe(5);
    expect(w.stats.orbitRadius).toBeGreaterThan(r);
  });
});
