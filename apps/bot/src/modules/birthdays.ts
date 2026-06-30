import type { Client, Guild, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { prisma } from '@helios/database';
import { nextDailyRunAt, parseModuleConfig, type BirthdaysConfig } from '@helios/shared';
import { QUEUE_NAMES } from '@helios/jobs';
import { applyPlaceholders, type PlaceholderMember } from '../lib/placeholders';
import { birthdayJobId, type JobService } from '../services/jobs';
import type { Logger } from '../logger';

export interface BirthdayDeps {
  client: Client;
  logger: Logger;
  jobs: JobService;
}

async function getBirthdaysState(
  guildId: string,
): Promise<{ enabled: boolean; config: BirthdaysConfig }> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'BIRTHDAYS' } },
    select: { enabled: true, config: true },
  });
  return {
    enabled: row?.enabled ?? false,
    config: parseModuleConfig('BIRTHDAYS', row?.config ?? {}),
  };
}

function memberPlaceholder(member: GuildMember, guild: Guild): PlaceholderMember {
  return {
    user: {
      id: member.id,
      tag: member.user.tag,
      username: member.user.username,
      createdTimestamp: member.user.createdTimestamp,
    },
    guild: { name: guild.name, memberCount: guild.memberCount },
  };
}

/** (Re)schedule a guild's daily birthday job for the next configured UTC hour. */
export async function scheduleNextBirthdayRun(
  guildId: string,
  config: BirthdaysConfig,
  jobs: JobService,
): Promise<void> {
  const next = nextDailyRunAt(config.announceHourUtc, new Date());
  await jobs.schedule(
    QUEUE_NAMES.birthdayAnnounce,
    'birthdayAnnounce',
    { guildId },
    { delayMs: next.getTime() - Date.now(), jobId: birthdayJobId(guildId) },
  );
}

/**
 * Daily birthday run: rotate the optional birthday role (remove yesterday's,
 * add today's) and announce today's birthdays. Always re-arms the next day so
 * the loop persists. No-ops the announce when the module is disabled.
 */
export async function runBirthdayAnnounce(guildId: string, deps: BirthdayDeps): Promise<void> {
  const { enabled, config } = await getBirthdaysState(guildId);
  // Re-arm based on enabled state (read from the DB), not guild-cache presence,
  // so the daily loop survives a wrong-shard pickup; disabling stops it.
  if (!enabled) return;
  const guild = deps.client.guilds.cache.get(guildId);

  if (guild) {
    const now = new Date();
    const todayMonth = now.getUTCMonth() + 1;
    const todayDay = now.getUTCDate();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const role = config.roleId ? guild.roles.cache.get(config.roleId) : null;
    if (role) {
      const past = await prisma.birthday.findMany({
        where: { guildId, month: yesterday.getUTCMonth() + 1, day: yesterday.getUTCDate() },
        select: { userId: true },
      });
      for (const entry of past) {
        const member = await guild.members.fetch(entry.userId).catch(() => null);
        if (member?.roles.cache.has(role.id))
          await member.roles.remove(role.id).catch(() => undefined);
      }
    }

    const todays = await prisma.birthday.findMany({
      where: { guildId, month: todayMonth, day: todayDay },
      select: { userId: true },
    });
    if (todays.length > 0) {
      const lines: string[] = [];
      const mentioned: string[] = [];
      for (const entry of todays) {
        const member = await guild.members.fetch(entry.userId).catch(() => null);
        if (!member) continue;
        if (role) await member.roles.add(role.id).catch(() => undefined);
        lines.push(applyPlaceholders(config.message, memberPlaceholder(member, guild)));
        mentioned.push(member.id);
      }
      if (config.channelId && lines.length > 0) {
        const channel =
          guild.channels.cache.get(config.channelId) ??
          (await guild.channels.fetch(config.channelId).catch(() => null));
        if (channel && channel.isTextBased() && !channel.isDMBased()) {
          await (channel as GuildTextBasedChannel)
            .send({
              content: lines.join('\n').slice(0, 2000),
              allowedMentions: { users: mentioned },
            })
            .catch(() => undefined);
        }
      }
    }
  }

  await scheduleNextBirthdayRun(guildId, config, deps.jobs);
}

/** Re-arm daily birthday jobs for enabled guilds this shard owns. */
export async function reconcileBirthdays(client: Client, jobs: JobService): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const rows = await prisma.guildModuleConfig.findMany({
    where: { module: 'BIRTHDAYS', enabled: true, guildId: { in: guildIds } },
    select: { guildId: true, config: true },
  });
  for (const row of rows) {
    await scheduleNextBirthdayRun(
      row.guildId,
      parseModuleConfig('BIRTHDAYS', row.config ?? {}),
      jobs,
    );
  }
}
