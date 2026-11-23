import { describe, expect, it } from 'vitest';
import { reminderTime } from '../src/economy/reminder';
import { defaultSave, sanitize } from '../src/core/storage';

describe('daily reminder', () => {
  it('comes about a day later, never at night', () => {
    const afternoon = reminderTime(new Date(2026, 10, 23, 15, 42, 30));
    expect([afternoon.getDate(), afternoon.getHours(), afternoon.getMinutes(), afternoon.getSeconds()]).toEqual([24, 15, 42, 0]);
    const late = reminderTime(new Date(2026, 10, 23, 23, 10));
    expect([late.getDate(), late.getHours(), late.getMinutes()]).toEqual([24, 19, 0]);
    const early = reminderTime(new Date(2026, 10, 23, 6, 5));
    expect([early.getDate(), early.getHours(), early.getMinutes()]).toEqual([24, 10, 0]);
    // Month end rolls over.
    const monthEnd = reminderTime(new Date(2026, 10, 30, 12, 0));
    expect([monthEnd.getMonth(), monthEnd.getDate()]).toEqual([11, 1]);
  });

  it('is off until the player agrees, and survives saving', () => {
    const s = defaultSave();
    expect(s.settings.reminder).toBe(false);
    expect(s.reminderAsked).toBe(false);
    s.settings.reminder = true;
    s.reminderAsked = true;
    const back = sanitize(JSON.parse(JSON.stringify(s)));
    expect(back.settings.reminder).toBe(true);
    expect(back.reminderAsked).toBe(true);
    expect(sanitize({ settings: { reminder: 'yes' }, reminderAsked: 1 }).settings.reminder).toBe(false);
  });
});
