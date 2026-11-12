import { describe, expect, it } from 'vitest';
import { World, type RunOptions } from '../src/game/world';
import type { GameEvent } from '../src/game/types';

const DT = 1 / 60;

const baseOpts = (over: Partial<RunOptions> = {}): RunOptions => ({
  width: 420, height: 760, character: 'spark', seed: 12345, modifiers: [], meta: {}, daily: false, tutorial: false, ...over,
});

/** A simple bot: circles around the centroid of nearby enemies, pulses when ready. */
function botStep(w: World, a: { angle: number }): void {
  let cx = w.w / 2;
  let cy = w.h / 2;
  if (w.enemies.length) {
    // Target the enemy closest to the player and loop around it and its neighbours.
    let best = w.enemies[0];
    let bd = Infinity;
    for (const e of w.enemies) {
      // Prefer bosses while they hold still, otherwise the closest enemy.
      const d = (e.x - w.px) ** 2 + (e.y - w.py) ** 2 - (e.boss && e.state === 0 ? 1e6 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    cx = best.x;
    cy = best.y;
  }
  a.angle += DT * 4.2;
  const r = 62;
  const tx = cx + Math.cos(a.angle) * r;
  const ty = cy + Math.sin(a.angle) * r;
  w.steer((tx - w.px) * 0.5, (ty - w.py) * 0.5);
  const inRange = w.enemies.filter((e) => (e.x - w.px) ** 2 + (e.y - w.py) ** 2 < (w.stats.pulseRadius * 0.8) ** 2).length;
  if (w.pulseReady && inRange >= Math.min(3, w.enemies.length)) w.triggerPulse();
}

function play(w: World, seconds: number, godMode: boolean, untilWave = Infinity) {
  const events: GameEvent[] = [];
  const bot = { angle: 0 };
  w.start();
  for (let i = 0; i < seconds / DT; i++) {
    if (godMode) w.invuln = 10;
    botStep(w, bot);
    w.update(DT);
    events.push(...w.drainEvents());
    if (w.awaitingUpgrade) {
      const offer = w.rollOffer();
      if (offer.length) w.applyUpgrade(offer[0]);
      if (w.wave >= untilWave) break;
      w.nextWave();
    }
    // Invariants every tick.
    expect(Number.isFinite(w.px) && Number.isFinite(w.py)).toBe(true);
    for (const e of w.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) throw new Error(`NaN enemy ${e.type}`);
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(w.w);
    }
    if (w.over) break;
  }
  return events;
}

describe('headless simulation', () => {
  it('a normal run progresses, loops and kills without errors', () => {
    const w = new World(baseOpts());
    const events = play(w, 240, false);
    expect(w.run.loops).toBeGreaterThan(3);
    expect(w.run.kills).toBeGreaterThan(5);
    expect(events.some((e) => e.type === 'waveClear')).toBe(true);
    expect(w.run.score).toBeGreaterThan(0);
  });

  it('god-mode bot reaches and defeats all three bosses', () => {
    const w = new World(baseOpts({ seed: 777 }));
    const events = play(w, 1500, true, 16);
    const bossSpawns = events.filter((e) => e.type === 'bossSpawn').map((e) => (e as { boss: string }).boss);
    expect(bossSpawns).toEqual(expect.arrayContaining(['maw', 'weaver', 'twins']));
    expect(w.run.bossesKilled).toEqual(expect.arrayContaining(['maw', 'weaver', 'twins']));
    expect(w.wave).toBeGreaterThanOrEqual(15);
  }, 60_000);

  it('is deterministic for the same seed and inputs', () => {
    const a = new World(baseOpts({ seed: 99 }));
    const b = new World(baseOpts({ seed: 99 }));
    play(a, 60, true);
    play(b, 60, true);
    expect(a.run.score).toBe(b.run.score);
    expect(a.run.kills).toBe(b.run.kills);
    expect(a.px).toBe(b.px);
  });

  it('every modifier and character combination runs', () => {
    const chars = ['spark', 'comet', 'ember', 'prism'] as const;
    const mods = ['glass', 'haste', 'swarmy', 'longtrail', 'bossrush', 'nopulse'] as const;
    for (const c of chars) {
      for (const m of mods) {
        const w = new World(baseOpts({ character: c, modifiers: [m], seed: c.length * 31 + m.length }));
        play(w, 40, true);
        expect(w.wave).toBeGreaterThanOrEqual(1);
      }
    }
  }, 60_000);

  it('player dies eventually without god mode and second wind revives once', () => {
    const w = new World(baseOpts({ seed: 5 }));
    w.applyUpgrade('secondwind');
    const events: GameEvent[] = [];
    w.start();
    // Stand still in the middle – enemies will reach the player.
    for (let i = 0; i < 60 * 400 && !w.over; i++) {
      w.update(DT);
      events.push(...w.drainEvents());
      if (w.awaitingUpgrade) w.nextWave();
    }
    expect(w.over).toBe(true);
    expect(events.filter((e) => e.type === 'revive').length).toBe(1);
    expect(events.some((e) => e.type === 'playerDeath')).toBe(true);
  });

  it('tutorial mode never damages hearts and has no waves', () => {
    const w = new World(baseOpts({ tutorial: true }));
    w.start();
    w.spawnDirect('mote', w.px, w.py - 30);
    for (let i = 0; i < 600; i++) w.update(DT);
    expect(w.hearts).toBe(w.stats.maxHearts);
    expect(w.wave).toBe(0);
  });
});
