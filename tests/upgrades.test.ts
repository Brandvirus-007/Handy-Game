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
    expect(computeStats('comet', {}, {}, []).hitRadius).toBeLessThan(computeStats('spark', {}, {}, []).hitRadius);
    expect(computeStats('spark', {}, { nimble: 3 }, []).hitRadius).toBeLessThan(computeStats('spark', {}, {}, []).hitRadius);
    expect(computeStats('ember', {}, {}, []).ember).toBe(1);
    expect(computeStats('spark', { heart: 2 }, {}, []).maxHearts).toBe(5);
  });
});

describe('legendary fusions', () => {
  it('only appear once their recipe is complete', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const offer = rollOffer(rng, { chain: 1, shockwave: 3 });
      expect(offer).not.toContain('storm');
    }
    let seen = 0;
    for (let i = 0; i < 300; i++) if (rollOffer(rng, { chain: 2, shockwave: 2 }).includes('storm')) seen++;
    expect(seen).toBeGreaterThan(80);
    expect(seen).toBeLessThan(220);
  });

  it('are never offered twice and respect exclusions', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 200; i++) {
      expect(rollOffer(rng, { chain: 2, shockwave: 2, storm: 1 })).not.toContain('storm');
      expect(rollOffer(rng, { frost: 3, pulsecharge: 3 }, 3, { exclude: ['starfrost'] })).not.toContain('starfrost');
    }
  });

  it('change the simulation', () => {
    const base = new World(opts());
    const storm = new World(opts());
    storm.applyUpgrade('storm');
    expect(storm.stats.chain).toBe(base.stats.chain + 2);
    const frost = new World(opts());
    frost.applyUpgrade('starfrost');
    frost.pulseCharge = 1;
    frost.triggerPulse();
    expect(frost.frost.length).toBe(1);
  });
});
