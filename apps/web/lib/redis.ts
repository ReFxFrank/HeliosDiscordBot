import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  REDIS_CHANNELS,
  liveResultKey,
  type LiveCommandResult,
  type LiveCommandType,
  type Module,
} from '@refx/shared';

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

/** Publish a live "do it now" command to the bot (§4.3). */
export async function publishLiveCommand(
  guildId: string,
  type: LiveCommandType,
  payload?: unknown,
): Promise<void> {
  await getRedis().publish(REDIS_CHANNELS.command, JSON.stringify({ type, guildId, payload }));
}

/**
 * Publish a live command and wait for the bot to report how it went. Returns
 * null when no result arrives in time (bot offline or busy); the caller decides
 * what that means. `payload` gets a `requestId` the bot answers under.
 */
export async function runLiveCommand(
  guildId: string,
  type: LiveCommandType,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<LiveCommandResult | null> {
  const requestId = randomUUID();
  const redis = getRedis();
  await publishLiveCommand(guildId, type, { ...payload, requestId });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const raw = await redis.get(liveResultKey(requestId)).catch(() => null);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as LiveCommandResult;
    } catch {
      return null;
    }
  }
  return null;
}
