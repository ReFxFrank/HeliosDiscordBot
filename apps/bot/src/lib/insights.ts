import type { Client } from 'discord.js';
import type { PrismaClient } from '@refx/database';
import type { Redis } from 'ioredis';
import type { Logger } from '../logger';

/**
 * Server Insights collection. The hot paths (every message, join, leave) do
 * nothing but fire-and-forget Redis increments; a periodic flush turns the
 * per-day counters into GuildInsightsDay rows the dashboard charts read.
 *
 * Keys (all UTC-day scoped, 3-day TTL — they only need to outlive the flush):
 *   helios:insights:{guildId}:{yyyy-mm-dd}:messages   counter
 *   helios:insights:{guildId}:{yyyy-mm-dd}:joins      counter
 *   helios:insights:{guildId}:{yyyy-mm-dd}:leaves     counter
 *   helios:insights:{guildId}:{yyyy-mm-dd}:chatters   HyperLogLog of user ids
 *   helios:insights:{guildId}:{yyyy-mm-dd}:channels   hash channelId -> count
 */

const PREFIX = 'helios:insights:';
const TTL_SECONDS = 3 * 86_400;
const FLUSH_INTERVAL_MS = 5 * 60_000;
const RETENTION_DAYS = 90;
const TOP_CHANNELS_KEPT = 15;

function utcDay(offsetDays = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

function key(guildId: string, date: string, part: string): string {
  return `${PREFIX}${guildId}:${date}:${part}`;
}

/** Count a (non-bot, guild) message. Never throws — insights must not affect chat handling. */
export function recordMessageInsight(
  redis: Redis,
  guildId: string,
  channelId: string,
  userId: string,
): void {
  const date = utcDay();
  const pipeline = redis.pipeline();
  pipeline.incr(key(guildId, date, 'messages'));
  pipeline.expire(key(guildId, date, 'messages'), TTL_SECONDS);
  pipeline.pfadd(key(guildId, date, 'chatters'), userId);
  pipeline.expire(key(guildId, date, 'chatters'), TTL_SECONDS);
  pipeline.hincrby(key(guildId, date, 'channels'), channelId, 1);
  pipeline.expire(key(guildId, date, 'channels'), TTL_SECONDS);
  void pipeline.exec().catch(() => undefined);
}

/** Count a member join/leave. Never throws. */
export function recordMemberFlowInsight(
  redis: Redis,
  guildId: string,
  kind: 'joins' | 'leaves',
): void {
  const date = utcDay();
  const pipeline = redis.pipeline();
  pipeline.incr(key(guildId, date, kind));
  pipeline.expire(key(guildId, date, kind), TTL_SECONDS);
  void pipeline.exec().catch(() => undefined);
}

async function flushGuildDay(
  prisma: PrismaClient,
  redis: Redis,
  guildId: string,
  date: string,
  memberCount: number | null,
): Promise<void> {
  const [messages, joins, leaves, activeMembers, channels] = await Promise.all([
    redis.get(key(guildId, date, 'messages')),
    redis.get(key(guildId, date, 'joins')),
    redis.get(key(guildId, date, 'leaves')),
    redis.pfcount(key(guildId, date, 'chatters')),
    redis.hgetall(key(guildId, date, 'channels')),
  ]);

  const counts = {
    messages: Number(messages ?? 0),
    joins: Number(joins ?? 0),
    leaves: Number(leaves ?? 0),
    activeMembers,
  };
  const hasActivity = counts.messages + counts.joins + counts.leaves > 0;
  // Still write a row for "today" when we have a member count, so the member
  // growth chart gets a point even on fully quiet days.
  if (!hasActivity && memberCount === null) return;

  const topChannels = Object.entries(channels)
    .map(([channelId, count]) => ({ channelId, count: Number(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_CHANNELS_KEPT);

  const day = new Date(`${date}T00:00:00.000Z`);
  const data = {
    ...counts,
    topChannels,
    ...(memberCount !== null ? { memberCount } : {}),
  };
  await prisma.guildInsightsDay.upsert({
    where: { guildId_date: { guildId, date: day } },
    create: { guildId, date: day, ...data },
    update: data,
  });
}

/**
 * Start the periodic flush for every guild this shard owns. Flushes today and
 * yesterday (so counts written just before midnight UTC still land), prunes
 * rows past retention, and returns a stop function for shutdown.
 */
export function startInsightsFlush(
  client: Client<true>,
  prisma: PrismaClient,
  redis: Redis,
  logger: Logger,
): () => void {
  const flush = async (): Promise<void> => {
    const today = utcDay();
    const yesterday = utcDay(-1);
    for (const guild of client.guilds.cache.values()) {
      try {
        await flushGuildDay(prisma, redis, guild.id, today, guild.memberCount);
        await flushGuildDay(prisma, redis, guild.id, yesterday, null);
      } catch (err) {
        logger.warn({ err, guildId: guild.id }, 'Insights flush failed for guild');
      }
    }
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await prisma.guildInsightsDay
      .deleteMany({ where: { date: { lt: cutoff } } })
      .catch((err: unknown) => logger.warn({ err }, 'Insights prune failed'));
  };

  void flush().catch((err: unknown) => logger.warn({ err }, 'Initial insights flush failed'));
  const timer = setInterval(() => {
    void flush().catch((err: unknown) => logger.warn({ err }, 'Insights flush failed'));
  }, FLUSH_INTERVAL_MS);
  return () => clearInterval(timer);
}
