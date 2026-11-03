import type { Client, Guild } from 'discord.js';
import { prisma } from '@refx/database';
import {
  parseModuleConfig,
  renderCounterName,
  type StatCounts,
  type StatsCountersConfig,
} from '@refx/shared';
import { QUEUE_NAMES } from '@refx/jobs';
import { statsCounterJobId, type JobService } from '../services/jobs';
import type { Logger } from '../logger';

export interface StatsDeps {
  client: Client;
  logger: Logger;
  jobs: JobService;
}

async function getStatsState(
  guildId: string,
): Promise<{ enabled: boolean; config: StatsCountersConfig }> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'STATS_COUNTERS' } },
    select: { enabled: true, config: true },
  });
  return {
    enabled: row?.enabled ?? false,
    config: parseModuleConfig('STATS_COUNTERS', row?.config ?? {}),
  };
}

function countsFor(guild: Guild): StatCounts {
  return {
    members: guild.memberCount,
    boosts: guild.premiumSubscriptionCount ?? 0,
    roles: guild.roles.cache.size,
    channels: guild.channels.cache.size,
  };
}

/**
 * Arm the recurring stats refresh via BullMQ's native scheduler. A handler
 * can't re-arm its own jobId (the active key is locked, then removeOnComplete
 * deletes it — the loop dies after one run), so the scheduler owns the cadence.
 * Idempotent per guild; re-calling updates the interval.
 */
export async function scheduleStatsRefresh(
  guildId: string,
  intervalMinutes: number,
  jobs: JobService,
): Promise<void> {
  await jobs.scheduleRecurring(
    QUEUE_NAMES.statsCounterRefresh,
    statsCounterJobId(guildId),
    intervalMinutes * 60_000,
    'statsCounterRefresh',
    { guildId },
  );
}

export async function cancelStatsRefresh(guildId: string, jobs: JobService): Promise<void> {
  await jobs.cancelRecurring(QUEUE_NAMES.statsCounterRefresh, statsCounterJobId(guildId));
}

/**
 * Rename each configured counter channel to its live count. Channel renames are
 * heavily rate-limited by Discord, so the cadence is bounded (min 5 min) and
 * individual rename failures are swallowed. The scheduler re-arms automatically;
 * a guild with no counters left cancels it, and merely-disabled ticks idle so
 * re-enabling resumes without a restart.
 */
export async function refreshStatsCounters(guildId: string, deps: StatsDeps): Promise<void> {
  const { enabled, config } = await getStatsState(guildId);
  if (config.counters.length === 0) {
    await cancelStatsRefresh(guildId, deps.jobs); // nothing to ever do — stop ticking
    return;
  }
  if (!enabled) return; // idle tick; re-enabling takes effect on the next run

  const guild = deps.client.guilds.cache.get(guildId);
  if (!guild) return;
  const counts = countsFor(guild);
  for (const counter of config.counters) {
    const channel =
      guild.channels.cache.get(counter.channelId) ??
      (await guild.channels.fetch(counter.channelId).catch(() => null));
    // Any guild channel (voice/category/text) can be renamed via setName.
    if (!channel || channel.isDMBased()) continue;
    const name = renderCounterName(counter, counts);
    if (channel.name !== name) await channel.setName(name).catch(() => undefined);
  }
}

/** Re-arm stats-counter refresh for enabled guilds this shard owns. */
export async function reconcileStatsCounters(client: Client, jobs: JobService): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const rows = await prisma.guildModuleConfig.findMany({
    where: { module: 'STATS_COUNTERS', enabled: true, guildId: { in: guildIds } },
    select: { guildId: true, config: true },
  });
  for (const row of rows) {
    const config = parseModuleConfig('STATS_COUNTERS', row.config ?? {});
    if (config.counters.length > 0) {
      await scheduleStatsRefresh(row.guildId, config.intervalMinutes, jobs);
    }
  }
}
