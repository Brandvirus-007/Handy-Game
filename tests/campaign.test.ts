import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { LEVEL_COUNT, LEVELS_PER_WORLD, WORLDS, campaignLevels, getLevel, starsFor } from '../src/game/campaign';

describe('campaign', () => {
  it('has 60 levels, every world ends with its boss', () => {
    expect(campaignLevels()).toHaveLength(LEVEL_COUNT);
    expect(LEVEL_COUNT).toBe(60);
    WORLDS.forEach((w, i) => {
      const last = getLevel(i * LEVELS_PER_WORLD + LEVELS_PER_WORLD - 1);
      expect(last.waves[last.waves.length - 1].boss).toBe(w.boss);
    });
  });

  it('is the same on every device (fixed level data)', () => {
    const a = JSON.stringify(campaignLevels()[13]);
    expect(JSON.stringify(getLevel(13))).toBe(a);
    expect(getLevel(13).starScore).toBeGreaterThan(0);
  });

  it('every level can be finished: clearing the last wave wins', () => {
    for (const lv of campaignLevels()) {
      const w = new World({ width: 390, height: 760, character: 'spark', seed: lv.index, modifiers: lv.modifiers, meta: {}, daily: false, tutorial: false, script: lv.waves });
      w.start();
      w.invuln = 1e9;
      for (let t = 0; t < 60 * 600 && !w.over; t++) {
        if (w.phase === 'upgrade') w.nextWave();
        // Stand-in for a perfect player: every shadow that is on the field gets caught.
        for (const e of w.enemies) if (!e.dead && e.t > 0.5) w.damage(e, 99, 'loop');
        w.update(1 / 60);
        w.drainEvents();
      }
      expect(w.victory, `level ${lv.world + 1}-${lv.number}`).toBe(true);
      expect(w.wave).toBe(lv.waves.length);
    }
  }, 120000);

  it('awards stars for clearing, few hits and the score goal', () => {
    const lv = getLevel(0);
    expect(starsFor(lv, false, 0, 1e9)).toEqual([false, false, false]);
    expect(starsFor(lv, true, 3, 0)).toEqual([true, false, false]);
    expect(starsFor(lv, true, 1, lv.starScore)).toEqual([true, true, true]);
  });
});

describe('campaign progress', () => {
  it('pays new stars once and unlocks the next level', async () => {
    const { defaultSave } = await import('../src/core/storage');
    const { recordLevel, levelUnlocked, totalStars, nextLevel } = await import('../src/economy/campaign');
    const s = defaultSave();
    expect(levelUnlocked(s, 0)).toBe(true);
    expect(levelUnlocked(s, 1)).toBe(false);
    const first = recordLevel(s, 0, [true, false, false]);
    expect(first.gained).toBe(1);
    expect(levelUnlocked(s, 1)).toBe(true);
    expect(nextLevel(s)).toBe(1);
    const again = recordLevel(s, 0, [true, false, false]);
    expect(again.gained).toBe(0);
    expect(again.reward.coins).toBe(0);
    const full = recordLevel(s, 0, [true, true, true]);
    expect(full.gained).toBe(2);
    expect(full.reward.diamonds).toBe(5);
    expect(totalStars(s)).toBe(3);
    // Losing never removes stars.
    recordLevel(s, 0, [false, false, false]);
    expect(totalStars(s)).toBe(3);
  });
});
