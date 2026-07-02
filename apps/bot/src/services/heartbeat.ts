import type { Client } from 'discord.js';
import {
  shardStatusKey,
  statusMinutesKey,
  STATUS_MINUTES_TTL_DAYS,
  type ShardStatus,
} from '@solari/shared';
import { redis } from './redis';

const INTERVAL_MS = 30_000;
/** 3 missed beats before the shard reads as down on /status. */
const TTL_SECONDS = 90;

/**
 * Publish this shard's health to Redis on a short TTL so the public /status
 * page can show live bot state without touching the Discord API. Returns a
 * stop function for shutdown.
 */
export function startHeartbeat(client: Client<true>, shardId: number): () => void {
  const beat = async (): Promise<void> => {
    const status: ShardStatus = {
      shardId,
      ping: Math.round(client.ws.ping),
      guilds: client.guilds.cache.size,
      uptimeMs: client.uptime ?? 0,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(shardStatusKey(shardId), JSON.stringify(status), 'EX', TTL_SECONDS);

    // Uptime ledger for /status history: mark the current UTC minute as "up".
    // Idempotent across shards (any shard alive counts the bot as up).
    const now = new Date();
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    const dayKey = statusMinutesKey(now);
    await redis
      .multi()
      .setbit(dayKey, minuteOfDay, 1)
      .expire(dayKey, STATUS_MINUTES_TTL_DAYS * 86_400)
      .exec();
  };
  // Swallow Redis hiccups — the TTL turning the key stale IS the failure signal.
  const safeBeat = (): void => void beat().catch(() => undefined);
  safeBeat();
  const timer = setInterval(safeBeat, INTERVAL_MS);
  return () => clearInterval(timer);
}
