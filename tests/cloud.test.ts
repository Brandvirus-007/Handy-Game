import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/storage';
import { compareProgress, mergeForImport, packCloud, unpackCloud } from '../src/economy/cloud';

describe('cloud save', () => {
  it('round-trips a save and rejects foreign data', () => {
    const s = defaultSave();
    s.level = 12;
    s.bank = 4321;
    s.stats.runs = 80;
    const back = unpackCloud(packCloud(s, 1234));
    expect(back?.at).toBe(1234);
    expect(back?.save.level).toBe(12);
    expect(back?.save.bank).toBe(4321);
    expect(unpackCloud('{"app":"other","save":{}}')).toBeNull();
    expect(unpackCloud('not json')).toBeNull();
    expect(unpackCloud('')).toBeNull();
  });

  it('repairs broken cloud data instead of crashing', () => {
    const back = unpackCloud(JSON.stringify({ app: 'lumen-loop', at: 'x', save: { level: 'high', bank: -5, chars: 7 } }));
    expect(back).not.toBeNull();
    expect(back!.at).toBe(0);
    expect(back!.save.level).toBeGreaterThanOrEqual(1);
    expect(back!.save.bank).toBeGreaterThanOrEqual(0);
    expect(back!.save.chars).toContain('spark');
  });

  it('compares progress by level, then runs, then play time', () => {
    const a = defaultSave();
    const b = defaultSave();
    expect(compareProgress(a, b)).toBe(0);
    a.stats.runs = 5;
    expect(compareProgress(a, b)).toBeGreaterThan(0);
    b.level = 2;
    expect(compareProgress(a, b)).toBeLessThan(0);
    a.level = 2;
    b.stats.runs = 5;
    b.stats.playTime = 10;
    expect(compareProgress(b, a)).toBeGreaterThan(0);
  });

  it('keeps device settings and anything bought on this device when loading the cloud', () => {
    const local = defaultSave();
    local.settings.music = 0.1;
    local.settings.lang = 'en';
    local.grantedTokens = ['tok-local'];
    local.chars = ['spark', 'aurora'];
    local.owned.noAds = true;
    local.pass.premiumSeason = 3;
    const cloud = defaultSave();
    cloud.level = 30;
    cloud.diamonds = 900;
    cloud.grantedTokens = ['tok-cloud'];
    cloud.chars = ['spark', 'comet'];
    const merged = mergeForImport(local, cloud);
    expect(merged.level).toBe(30);
    expect(merged.diamonds).toBe(900);
    expect(merged.settings.music).toBe(0.1);
    expect(merged.settings.lang).toBe('en');
    expect(merged.grantedTokens).toEqual(expect.arrayContaining(['tok-local', 'tok-cloud']));
    expect(merged.chars).toEqual(expect.arrayContaining(['spark', 'aurora', 'comet']));
    expect(merged.owned.noAds).toBe(true);
    expect(merged.pass.premiumSeason).toBe(3);
  });
});
