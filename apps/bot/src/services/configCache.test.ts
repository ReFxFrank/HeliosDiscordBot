import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS_CHANNELS } from '@refx/shared';
import { prisma } from '@refx/database';
import { ConfigCache } from './configCache';
import { closeRedis, redis } from './redis';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

const GUILD_ID = `test-guild-cache-${Date.now()}`;

async function setModLogChannel(channelId: string): Promise<void> {
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId: GUILD_ID, module: 'MODERATION' } },
    update: { config: { modLogChannelId: channelId } },
    create: {
      guildId: GUILD_ID,
      module: 'MODERATION',
      enabled: true,
      config: { modLogChannelId: channelId },
    },
  });
}

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
}

suite('ConfigCache (integration)', () => {
  beforeAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
    await prisma.guild.create({ data: { id: GUILD_ID } });
    await setModLogChannel('channel-A');
  });
  afterAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
    await closeRedis();
    await prisma.$disconnect();
  });

  it('caches reads and serves stale until invalidated, then reflects the new value', async () => {
    const cache = new ConfigCache();
    await cache.start();

    const first = await cache.getConfig(GUILD_ID, 'MODERATION');
    expect(first.modLogChannelId).toBe('channel-A');

    // Change the DB; the cache should still serve the cached value.
    await setModLogChannel('channel-B');
    const stillCached = await cache.getConfig(GUILD_ID, 'MODERATION');
    expect(stillCached.modLogChannelId).toBe('channel-A');

    // Publish the invalidation the dashboard would send (§4.1).
    await redis.publish(
      REDIS_CHANNELS.configUpdate,
      JSON.stringify({ guildId: GUILD_ID, module: 'MODERATION' }),
    );

    const afterInvalidate = await waitFor(
      () => cache.getConfig(GUILD_ID, 'MODERATION'),
      (cfg) => cfg.modLogChannelId === 'channel-B',
    );
    expect(afterInvalidate.modLogChannelId).toBe('channel-B');
  });

  it('self-heals via the TTL backstop when no invalidation arrives', async () => {
    const cache = new ConfigCache(50); // 50ms TTL
    await setModLogChannel('channel-C');
    const initial = await cache.getConfig(GUILD_ID, 'MODERATION');
    expect(initial.modLogChannelId).toBe('channel-C');

    await setModLogChannel('channel-D');
    // No invalidation published — rely on the TTL.
    await new Promise((r) => setTimeout(r, 80));
    const healed = await cache.getConfig(GUILD_ID, 'MODERATION');
    expect(healed.modLogChannelId).toBe('channel-D');
  });
});
