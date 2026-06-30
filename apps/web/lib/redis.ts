import { Redis } from 'ioredis';
import { REDIS_CHANNELS, type Module } from '@helios/shared';

/** Lazy Redis singleton (created on first use, never at module import). */
let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return client;
}

/**
 * Publish the cache-invalidation message the bot subscribes to (§4.1). This is
 * what makes a dashboard edit take effect on the live bot within ~1s.
 */
export async function publishConfigUpdate(guildId: string, module: Module): Promise<void> {
  await getRedis().publish(REDIS_CHANNELS.configUpdate, JSON.stringify({ guildId, module }));
}
