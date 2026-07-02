import { SHARD_STATUS_PREFIX, statusMinutesKey, type ShardStatus } from '@solari/shared';
import { getRedis } from './redis';

/**
 * Read every shard's TTL'd heartbeat key (written by the bot every ~30s).
 * Returns [] when no shard is reporting (bot down) and null when Redis itself
 * is unreachable — the /status page renders the two differently.
 */
export async function fetchShardStatuses(): Promise<ShardStatus[] | null> {
  const read = async (): Promise<ShardStatus[]> => {
    const redis = getRedis();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        `${SHARD_STATUS_PREFIX}*`,
        'COUNT',
        500,
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length === 0) return [];

    const values = await redis.mget(...keys);
    const parsed: ShardStatus[] = [];
    for (const value of values) {
      if (!value) continue;
      try {
        parsed.push(JSON.parse(value) as ShardStatus);
      } catch {
        // Skip a malformed entry rather than blank the whole section.
      }
    }
    return parsed.sort((a, b) => a.shardId - b.shardId);
  };

  // The shared Redis client retries forever (maxRetriesPerRequest: null), so a
  // dead Redis would hang the page render without an explicit deadline.
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

export interface UptimeDay {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  /** 0–100 uptime for that day, or null when no ledger data exists for it. */
  pct: number | null;
}

/**
 * Trailing per-day bot uptime from the heartbeat's minute-bitmap ledger
 * (oldest first, ending today). A day with no key predates the ledger (or the
 * bot was down the entire day) and reads as null — rendered "no data" rather
 * than a false 0%. Today is measured against minutes elapsed so far.
 */
export async function fetchUptimeHistory(days = 90): Promise<UptimeDay[] | null> {
  const read = async (): Promise<UptimeDay[]> => {
    const redis = getRedis();
    const now = new Date();
    const dates: Date[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      dates.push(new Date(now.getTime() - i * 86_400_000));
    }

    const pipeline = redis.pipeline();
    for (const date of dates) {
      const key = statusMinutesKey(date);
      pipeline.exists(key);
      pipeline.bitcount(key);
    }
    const replies = (await pipeline.exec()) ?? [];

    const todayKey = statusMinutesKey(now);
    const minutesElapsedToday = Math.max(1, now.getUTCHours() * 60 + now.getUTCMinutes() + 1);

    return dates.map((date, index) => {
      const exists = Number(replies[index * 2]?.[1] ?? 0) === 1;
      const upMinutes = Number(replies[index * 2 + 1]?.[1] ?? 0);
      if (!exists) return { date: date.toISOString().slice(0, 10), pct: null };
      const expected = statusMinutesKey(date) === todayKey ? minutesElapsedToday : 1440;
      return {
        date: date.toISOString().slice(0, 10),
        pct: Math.min(100, Math.round((upMinutes / expected) * 1000) / 10),
      };
    });
  };

  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

/** "3d 4h" / "2h 05m" / "45s" — coarse on purpose, it's a status page. */
export function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}
