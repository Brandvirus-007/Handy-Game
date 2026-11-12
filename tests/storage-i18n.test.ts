import { describe, expect, it } from 'vitest';
import { SaveStore, sanitize, defaultSave, SAVE_KEY, type KV } from '../src/core/storage';
import { DICTS, t, setLang } from '../src/core/i18n';
import { UPGRADES } from '../src/game/upgrades';
import { META } from '../src/game/meta';
import { CHARACTERS } from '../src/game/characters';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { MODIFIERS } from '../src/game/modifiers';
import { ENEMIES } from '../src/game/config';

class MemKV implements KV {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('save data', () => {
  it('round-trips', () => {
    const kv = new MemKV();
    const a = new SaveStore(kv);
    a.data.bank = 1234;
    a.data.chars.push('comet');
    a.data.meta.trail = 3;
    a.save();
    const b = new SaveStore(kv);
    expect(b.data.bank).toBe(1234);
    expect(b.data.chars).toContain('comet');
    expect(b.data.meta.trail).toBe(3);
  });

  it('survives garbage and wrong types', () => {
    const kv = new MemKV();
    kv.setItem(SAVE_KEY, '{not json');
    expect(new SaveStore(kv).data).toEqual(defaultSave());
    const s = sanitize({ bank: 'lots', meta: { trail: 99, bogus: 3 }, chars: ['comet', 'hacker'], selected: 'hacker', settings: { music: 7, lang: 'xx' } });
    expect(s.bank).toBe(0);
    expect(s.meta.trail).toBe(8);
    expect((s.meta as Record<string, number>).bogus).toBeUndefined();
    expect(s.chars).toEqual(['spark', 'comet']);
    expect(s.selected).toBe('spark');
    expect(s.settings.music).toBe(1);
    expect(s.settings.lang).toBe('auto');
  });

  it('works without any storage (private mode)', () => {
    const s = new SaveStore(null);
    s.data.bank = 5;
    expect(() => s.save()).not.toThrow();
    expect(s.persistent).toBe(false);
  });

  it('reset keeps settings', () => {
    const s = new SaveStore(new MemKV());
    s.data.settings.music = 0.1;
    s.data.bank = 99;
    s.reset();
    expect(s.data.bank).toBe(0);
    expect(s.data.settings.music).toBe(0.1);
  });
});

describe('i18n', () => {
  it('German and English have identical keys and no empty strings', () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(Object.keys(DICTS.de).sort());
    for (const d of Object.values(DICTS)) for (const v of Object.values(d)) expect(v.length).toBeGreaterThan(0);
  });

  it('every content id has texts', () => {
    const keys = new Set(Object.keys(DICTS.de));
    for (const u of UPGRADES) expect(keys.has(`upgrade.${u.id}.name`) && keys.has(`upgrade.${u.id}.desc`)).toBe(true);
    for (const m of META) expect(keys.has(`meta.${m.id}.name`)).toBe(true);
    for (const c of CHARACTERS) expect(keys.has(`char.${c.id}.desc`)).toBe(true);
    for (const a of ACHIEVEMENTS) expect(keys.has(`ach.${a}.desc`)).toBe(true);
    for (const m of MODIFIERS) expect(keys.has(`mod.${m}.desc`)).toBe(true);
    for (const e of Object.keys(ENEMIES)) expect(keys.has(`enemy.${e}`) && keys.has(`hint.${e}`)).toBe(true);
  });

  it('interpolates parameters', () => {
    setLang('de');
    expect(t('hud.wave', { n: 7 })).toBe('Welle 7');
    setLang('en');
    expect(t('common.level', { n: 2, max: 5 })).toBe('Level 2/5');
    setLang('de');
  });
});
