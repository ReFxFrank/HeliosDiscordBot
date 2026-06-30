import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { REDIS_CHANNELS } from '@helios/shared';
import { prisma } from '@helios/database';
import { applyModuleEnabled } from './config-core';
import { getRedis } from './redis';
import { canManageGuild, type DiscordGuildSummary } from './discord';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

const GUILD_ID = `test-guild-web-${Date.now()}`;
const USER_ID = 'dash-user-1';

suite('applyModuleEnabled (integration)', () => {
  let sub: Redis;

  beforeAll(async () => {
    sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
  });
  afterAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
    await prisma.$disconnect();
    await sub.quit();
    await getRedis().quit();
  });

  it('writes the config row + audit entry and publishes the invalidation', async () => {
    // Only resolve for *our* guild — other test files publish on this same
    // shared channel concurrently, so ignore their messages.
    const received = new Promise<string>((resolve) => {
      sub.on('message', (_channel, message) => {
        const parsed = JSON.parse(message) as { guildId: string };
        if (parsed.guildId === GUILD_ID) resolve(message);
      });
    });
    await sub.subscribe(REDIS_CHANNELS.configUpdate);

    await applyModuleEnabled(GUILD_ID, 'LEVELING', true, USER_ID);

    // Postgres write
    const row = await prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: GUILD_ID, module: 'LEVELING' } },
    });
    expect(row?.enabled).toBe(true);
    expect(row?.updatedBy).toBe(USER_ID);

    // Audit entry
    const audit = await prisma.dashboardAuditLog.findFirst({
      where: { guildId: GUILD_ID, action: 'MODULE_ENABLED' },
    });
    expect(audit?.module).toBe('LEVELING');

    // Redis invalidation (what the bot subscribes to → live in <1s)
    const message = JSON.parse(await received) as { guildId: string; module: string };
    expect(message).toEqual({ guildId: GUILD_ID, module: 'LEVELING' });
  });
});

describe('canManageGuild', () => {
  const base: DiscordGuildSummary = {
    id: '1',
    name: 'g',
    icon: null,
    owner: false,
    permissions: '0',
  };

  it('accepts owners, Administrators, and Manage-Server holders; rejects others', () => {
    expect(canManageGuild({ ...base, owner: true })).toBe(true);
    expect(canManageGuild({ ...base, permissions: '8' })).toBe(true); // Administrator (0x8)
    expect(canManageGuild({ ...base, permissions: '32' })).toBe(true); // Manage Server (0x20)
    expect(canManageGuild({ ...base, permissions: '1024' })).toBe(false); // View Channels only
    expect(canManageGuild(base)).toBe(false);
  });
});
