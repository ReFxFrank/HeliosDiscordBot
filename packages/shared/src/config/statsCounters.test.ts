import { describe, expect, it } from 'vitest';
import { renderCounterName, statsCountersConfigSchema } from './statsCounters';

describe('statsCountersConfigSchema', () => {
  it('defaults to no counters and a 10-minute interval', () => {
    const config = statsCountersConfigSchema.parse({});
    expect(config.counters).toEqual([]);
    expect(config.intervalMinutes).toBe(10);
  });

  it('rejects a bad channel id and clamps interval bounds', () => {
    expect(
      statsCountersConfigSchema.safeParse({ counters: [{ channelId: 'nope', type: 'members' }] })
        .success,
    ).toBe(false);
    expect(statsCountersConfigSchema.safeParse({ intervalMinutes: 1 }).success).toBe(false);
    expect(statsCountersConfigSchema.safeParse({ intervalMinutes: 9999 }).success).toBe(false);
  });
});

describe('renderCounterName', () => {
  it('substitutes the live count for the counter type', () => {
    const counts = { members: 1234, boosts: 7, roles: 25, channels: 40 };
    expect(
      renderCounterName({ channelId: '1', type: 'members', template: 'Members: {count}' }, counts),
    ).toBe('Members: 1234');
    expect(
      renderCounterName({ channelId: '1', type: 'boosts', template: '🚀 {count}' }, counts),
    ).toBe('🚀 7');
  });
});
