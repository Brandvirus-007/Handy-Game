/*
 * Daily reminder: one notification about a day after the last session, never in the night.
 * Playing again moves it to the next day, so players who come back daily never get one.
 */

/** Earliest and latest time of day for the reminder (minutes after midnight, local time). */
export const REMINDER_EARLIEST = 10 * 60;
export const REMINDER_LATEST = 20 * 60 + 30;
/** Used when the same time tomorrow would be too late in the evening. */
export const REMINDER_EVENING = 19 * 60;

export function reminderTime(now: Date): Date {
  // Same local time tomorrow (setDate keeps the clock time across daylight saving changes).
  const at = new Date(now.getTime());
  at.setDate(at.getDate() + 1);
  at.setSeconds(0, 0);
  const minutes = at.getHours() * 60 + at.getMinutes();
  if (minutes < REMINDER_EARLIEST) at.setHours(Math.floor(REMINDER_EARLIEST / 60), REMINDER_EARLIEST % 60, 0, 0);
  else if (minutes > REMINDER_LATEST) at.setHours(Math.floor(REMINDER_EVENING / 60), REMINDER_EVENING % 60, 0, 0);
  return at;
}
