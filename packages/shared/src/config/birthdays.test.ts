import { describe, expect, it } from 'vitest';
import { birthdaysConfigSchema, isValidMonthDay, nextDailyRunAt } from './birthdays';

describe('birthdaysConfigSchema', () => {
  it('defaults to no channel/role, noon UTC', () => {
    const config = birthdaysConfigSchema.parse({});
    expect(config.channelId).toBeNull();
    expect(config.roleId).toBeNull();
    expect(config.announceHourUtc).toBe(12);
  });
});

describe('isValidMonthDay', () => {
  it('accepts real dates including Feb 29', () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(12, 31)).toBe(true);
    expect(isValidMonthDay(1, 1)).toBe(true);
  });
  it('rejects impossible dates', () => {
    expect(isValidMonthDay(2, 30)).toBe(false);
    expect(isValidMonthDay(4, 31)).toBe(false);
    expect(isValidMonthDay(13, 1)).toBe(false);
    expect(isValidMonthDay(0, 5)).toBe(false);
    expect(isValidMonthDay(6, 0)).toBe(false);
  });
});

describe('nextDailyRunAt', () => {
  it('returns today at the hour when it is still ahead', () => {
    const now = new Date('2026-06-30T08:00:00Z');
    expect(nextDailyRunAt(12, now).toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });
  it('rolls to tomorrow when the hour has passed', () => {
    const now = new Date('2026-06-30T15:00:00Z');
    expect(nextDailyRunAt(12, now).toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });
  it('rolls forward when exactly at the hour (strictly after)', () => {
    const now = new Date('2026-06-30T12:00:00Z');
    expect(nextDailyRunAt(12, now).toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });
});
