import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { UPGRADES, rollOffer } from '../src/game/upgrades';
import { computeStats } from '../src/game/stats';
import { World } from '../src/game/world';

const opts = (over = {}) => ({
  width: 420, height: 760, character: 'spark' as const, seed: 1, modifiers: [], meta: {}, daily: false, tutorial: false, ...over,
});

describe('upgrades', () => {
  it('offers distinct, not-maxed upgrades', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const offer = rollOffer(rng, { trail: 5, echo: 2 });
      expect(new Set(offer).size).toBe(offer.length);
      expect(offer).not.toContain('trail');
      expect(offer).not.toContain('echo');
    }
  });

  it('returns fewer options when almost everything is maxed', () => {
    const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
    delete levels.magnet;
    expect(rollOffer(new Rng(1), levels)).toEqual(['magnet']);
  });

  it('guaranteeRare puts a rare or epic first', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 100; i++) {
      const [first] = rollOffer(rng, {}, 3, { guaranteeRare: true });
      expect(UPGRADES.find((u) => u.id === first)!.rarity).not.toBe('common');
    }
  });

  it('applyUpgrade clamps at max and updates stats', () => {
    const w = new World(opts());
    const base = w.stats.trailLength;
    for (let i = 0; i < 10; i++) w.applyUpgrade('trail');
    expect(w.upgrades.trail).toBe(5);
    expect(w.stats.trailLength).toBeCloseTo(base * 2);
    expect(w.trail.maxLength).toBeCloseTo(w.stats.trailLength);
  });

  it('heart upgrade raises max and heals', () => {
    const w = new World(opts());
    w.hearts = 1;
    w.applyUpgrade('heart');
    expect(w.stats.maxHearts).toBe(4);
    expect(w.hearts).toBe(2);
  });

  it('modifiers and characters shape stats', () => {
    expect(computeStats('spark', {}, {}, ['glass']).maxHearts).toBe(1);
    expect(computeStats('prism', {}, {}, []).maxHearts).toBe(2);
    expect(computeStats('comet', {}, {}, []).speed).toBeGreaterThan(computeStats('spark', {}, {}, []).speed);
    expect(computeStats('ember', {}, {}, []).ember).toBe(1);
    expect(computeStats('spark', { heart: 2 }, {}, []).maxHearts).toBe(5);
  });
});
