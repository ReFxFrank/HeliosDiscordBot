import { z } from 'zod';

export const birthdaysConfigSchema = z.object({
  /** Channel birthday announcements are posted to. */
  channelId: z.string().nullable().default(null),
  /** Optional role granted on a member's birthday and removed the next day. */
  roleId: z.string().nullable().default(null),
  message: z.string().max(1500).default('🎉 Happy birthday {user}!'),
  /** UTC hour (0–23) the daily announcement runs. */
  announceHourUtc: z.number().int().min(0).max(23).default(12),
});

export type BirthdaysConfig = z.infer<typeof birthdaysConfigSchema>;

/** Validate a calendar month/day (rejects e.g. 2/30, 4/31, 13/1). */
export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  // Leap-safe: allow Feb 29 (year-agnostic birthdays).
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 31);
}

/** The next instant it is `hourUtc:00` UTC, strictly after `now`. */
export function nextDailyRunAt(hourUtc: number, now: Date): Date {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0),
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
