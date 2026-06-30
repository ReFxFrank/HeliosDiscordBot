import type { Client, Guild } from 'discord.js';
import { prisma } from '@helios/database';
import {
  parseModuleConfig,
  renderCounterName,
  type StatCounts,
  type StatsCountersConfig,
} from '@helios/shared';
import { QUEUE_NAMES } from '@helios/jobs';
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

export async function scheduleNextStatsRefresh(
  guildId: string,
  intervalMinutes: number,
  jobs: JobService,
): Promise<void> {
  await jobs.schedule(
    QUEUE_NAMES.statsCounterRefresh,
    'statsCounterRefresh',
    { guildId },
    { delayMs: intervalMinutes * 60_000, jobId: statsCounterJobId(guildId) },
  );
}

/**
 * Rename each configured counter channel to its live count, then re-arm the
 * next refresh. Channel renames are heavily rate-limited by Discord, so the
 * cadence is bounded (min 5 min) and individual rename failures are swallowed.
 * Re-arms only while enabled, so disabling stops the loop.
 */
export async function refreshStatsCounters(guildId: string, deps: StatsDeps): Promise<void> {
  const { enabled, config } = await getStatsState(guildId);
  // Re-arm on enabled state (DB), not guild-cache presence, so the loop survives
  // a wrong-shard pickup; disabling or removing all counters stops it.
  if (!enabled || config.counters.length === 0) return;

  const guild = deps.client.guilds.cache.get(guildId);
  if (guild) {
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

  await scheduleNextStatsRefresh(guildId, config.intervalMinutes, deps.jobs);
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
      await scheduleNextStatsRefresh(row.guildId, config.intervalMinutes, jobs);
    }
  }
}
