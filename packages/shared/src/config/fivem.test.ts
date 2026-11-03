import { describe, expect, it } from 'vitest';
import {
  discordIdFromIdentifiers,
  fivemConfigSchema,
  fivemConnectAddress,
  nextRestart,
} from './fivem';

describe('nextRestart', () => {
  const base = { timezone: 'America/New_York' };

  it('returns null with no restart times', () => {
    expect(nextRestart({ ...base, restartTimes: [] }, new Date())).toBeNull();
  });

  it('picks the next time later today in the zone', () => {
    // 2026-11-02 10:00 EST (UTC-5) = 15:00Z
    const now = new Date('2026-11-02T15:00:00Z');
    const next = nextRestart({ ...base, restartTimes: ['06:00', '18:00'] }, now);
    expect(next?.toISOString()).toBe('2026-11-02T23:00:00.000Z');
  });

  it('rolls over to tomorrow once every time today has passed', () => {
    const now = new Date('2026-11-03T00:30:00Z'); // 19:30 EST
    const next = nextRestart({ ...base, restartTimes: ['06:00', '18:00'] }, now);
    expect(next?.toISOString()).toBe('2026-11-03T11:00:00.000Z');
  });

  it('treats a restart at exactly now as the next day', () => {
    const now = new Date('2026-11-02T23:00:00Z'); // 18:00 EST
    const next = nextRestart({ ...base, restartTimes: ['18:00'] }, now);
    expect(next?.toISOString()).toBe('2026-11-03T23:00:00.000Z');
  });

  it('falls back to UTC for an unknown zone', () => {
    const now = new Date('2026-11-02T10:00:00Z');
    const next = nextRestart({ timezone: 'Not/AZone', restartTimes: ['12:00'] }, now);
    expect(next?.toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});

describe('fivemConnectAddress', () => {
  it('prefers the explicit connect address', () => {
    expect(
      fivemConnectAddress({ connectAddress: 'play.refx.gg', host: '1.2.3.4', port: 30120 }),
    ).toBe('play.refx.gg');
  });

  it('omits the default port', () => {
    expect(fivemConnectAddress({ connectAddress: '', host: '1.2.3.4', port: 30120 })).toBe(
      '1.2.3.4',
    );
    expect(fivemConnectAddress({ connectAddress: '', host: '1.2.3.4', port: 30121 })).toBe(
      '1.2.3.4:30121',
    );
  });
});

describe('discordIdFromIdentifiers', () => {
  it('extracts the discord snowflake', () => {
    expect(
      discordIdFromIdentifiers(['license:abc', 'discord:141900973129256141', 'ip:1.2.3.4']),
    ).toBe('141900973129256141');
  });

  it('returns null when absent or malformed', () => {
    expect(discordIdFromIdentifiers(['license:abc'])).toBeNull();
    expect(discordIdFromIdentifiers(['discord:notanid'])).toBeNull();
  });
});

describe('fivemConfigSchema', () => {
  it('fills defaults and rejects bad restart times', () => {
    const parsed = fivemConfigSchema.parse({});
    expect(parsed.port).toBe(30120);
    expect(parsed.whitelistEnabled).toBe(false);
    expect(() => fivemConfigSchema.parse({ restartTimes: ['25:00'] })).toThrow();
  });
});
