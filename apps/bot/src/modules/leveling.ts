import { ChannelType, type Client, type Guild, type GuildMember, type Message } from 'discord.js';
import { prisma } from '@helios/database';
import {
  eligibleVoiceMembers,
  levelFromXp,
  parseModuleConfig,
  type LevelingConfig,
  type VoiceChannelView,
} from '@helios/shared';
import { QUEUE_NAMES } from '@helios/jobs';
import { applyPlaceholders, type PlaceholderMember } from '../lib/placeholders';
import { voiceXpJobId, type JobService } from '../services/jobs';
import type { Logger } from '../logger';
import type { BotContext } from '../framework/context';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildPlaceholderMember(
  user: { id: string; tag: string; username: string; createdTimestamp: number },
  guild: Guild,
): PlaceholderMember {
  return {
    user: {
      id: user.id,
      tag: user.tag,
      username: user.username,
      createdTimestamp: user.createdTimestamp,
    },
    guild: { name: guild.name, memberCount: guild.memberCount },
  };
}

export interface AwardXpParams {
  guildId: string;
  userId: string;
  min: number;
  max: number;
  cooldownSeconds: number;
  /** Override the clock (tests). */
  now?: number;
}

export interface AwardXpResult {
  awarded: boolean;
  xp: number;
  level: number;
  previousLevel: number;
  leveledUp: boolean;
}

/**
 * Award text XP to a user, respecting the per-user cooldown. Pure data layer
 * (no Discord) so it's unit-testable against the DB.
 */
export async function awardXp(params: AwardXpParams): Promise<AwardXpResult> {
  const now = params.now ?? Date.now();
  const where = { guildId_userId: { guildId: params.guildId, userId: params.userId } };
  const existing = await prisma.userLevel.findUnique({ where });

  if (existing?.lastXpAt && now - existing.lastXpAt.getTime() < params.cooldownSeconds * 1000) {
    return {
      awarded: false,
      xp: existing.xp,
      level: existing.level,
      previousLevel: existing.level,
      leveledUp: false,
    };
  }

  const xp = (existing?.xp ?? 0) + randomInt(params.min, params.max);
  const level = levelFromXp(xp);
  const previousLevel = existing?.level ?? 0;

  await prisma.userLevel.upsert({
    where,
    update: { xp, level, messages: { increment: 1 }, lastXpAt: new Date(now) },
    create: {
      guildId: params.guildId,
      userId: params.userId,
      xp,
      level,
      messages: 1,
      lastXpAt: new Date(now),
    },
  });

  return { awarded: true, xp, level, previousLevel, leveledUp: level > previousLevel };
}

/** messageCreate handler: award XP and announce/reward level-ups. */
export async function handleMessageXp(message: Message, ctx: BotContext): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.system) return;
  if (!(await ctx.config.isEnabled(message.guildId, 'LEVELING'))) return;

  const config = await ctx.config.getConfig(message.guildId, 'LEVELING');
  if (config.noXpChannelIds.includes(message.channelId)) return;
  if (message.member && config.noXpRoleIds.some((id) => message.member?.roles.cache.has(id)))
    return;

  const result = await awardXp({
    guildId: message.guildId,
    userId: message.author.id,
    min: config.textXpMin,
    max: config.textXpMax,
    cooldownSeconds: config.xpCooldownSeconds,
  });
  if (!result.leveledUp) return;

  await announceLevelUp(message, config, result.level, ctx);
  await applyRoleRewards(message.member, config, result.level);
}

async function announceLevelUp(
  message: Message<true>,
  config: LevelingConfig,
  level: number,
  ctx: BotContext,
): Promise<void> {
  if (config.announce === 'OFF') return;
  const member = buildPlaceholderMember(message.author, message.guild);
  const text = applyPlaceholders(config.levelUpMessage, member, { '{level}': String(level) });

  try {
    if (config.announce === 'DM') {
      await message.author.send(text);
      return;
    }
    if (config.announce === 'CHANNEL' && config.announceChannelId) {
      const channel = message.guild.channels.cache.get(config.announceChannelId);
      if (channel?.isTextBased() && !channel.isDMBased()) await channel.send(text);
      return;
    }
    if (message.channel.isSendable()) await message.channel.send(text);
  } catch (err) {
    ctx.logger.warn({ err, guildId: message.guildId }, 'Level-up announcement failed');
  }
}

async function applyRoleRewards(
  member: GuildMember | null,
  config: LevelingConfig,
  level: number,
): Promise<void> {
  if (!member || config.rewards.length === 0) return;
  const earned = config.rewards.filter((reward) => reward.level <= level);
  if (earned.length === 0) return;
  const exists = (id: string): boolean => member.guild.roles.cache.has(id);

  if (config.roleRewardStack) {
    const toAdd = earned.map((reward) => reward.roleId).filter(exists);
    if (toAdd.length) await member.roles.add(toAdd, 'Level reward').catch(() => undefined);
    return;
  }

  const highest = earned.reduce((a, b) => (b.level > a.level ? b : a));
  const toRemove = config.rewards
    .filter((reward) => reward.roleId !== highest.roleId)
    .map((reward) => reward.roleId)
    .filter((id) => member.roles.cache.has(id));
  if (toRemove.length)
    await member.roles.remove(toRemove, 'Level reward (replace)').catch(() => undefined);
  if (exists(highest.roleId))
    await member.roles.add(highest.roleId, 'Level reward').catch(() => undefined);
}

// ── Voice XP ─────────────────────────────────────────────────────────────────

export interface VoiceXpDeps {
  client: Client;
  logger: Logger;
  jobs: JobService;
}

/** Voice XP runs in a job (no ConfigCache), so read state from the DB directly. */
async function getLevelingState(
  guildId: string,
): Promise<{ enabled: boolean; config: LevelingConfig }> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'LEVELING' } },
    select: { enabled: true, config: true },
  });
  return {
    enabled: row?.enabled ?? false,
    config: parseModuleConfig('LEVELING', row?.config ?? {}),
  };
}

/**
 * Award a fixed amount of voice XP with an atomic increment (so it can't clobber
 * a concurrent text-XP write), then fix the cached level if it changed. The
 * voice-minute counter bumps too. `lastXpAt` is left untouched — it gates the
 * text cooldown only.
 */
export async function awardVoiceXp(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ level: number; previousLevel: number; leveledUp: boolean }> {
  const where = { guildId_userId: { guildId, userId } };
  const row = await prisma.userLevel.upsert({
    where,
    update: { xp: { increment: amount }, voiceMinutes: { increment: 1 } },
    create: {
      guildId,
      userId,
      xp: amount,
      level: levelFromXp(amount),
      voiceMinutes: 1,
    },
  });
  const level = levelFromXp(row.xp);
  const previousLevel = row.level;
  if (level !== previousLevel) {
    await prisma.userLevel.update({ where, data: { level } });
  }
  return { level, previousLevel, leveledUp: level > previousLevel };
}

/** Announce a voice level-up. Voice has no "current" channel, so CURRENT/OFF stay quiet. */
async function announceVoiceLevelUp(
  member: GuildMember,
  config: LevelingConfig,
  level: number,
  logger: Logger,
): Promise<void> {
  const placeholder = buildPlaceholderMember(
    {
      id: member.id,
      tag: member.user.tag,
      username: member.user.username,
      createdTimestamp: member.user.createdTimestamp,
    },
    member.guild,
  );
  const text = applyPlaceholders(config.levelUpMessage, placeholder, { '{level}': String(level) });
  try {
    if (config.announce === 'DM') {
      await member.send(text);
      return;
    }
    if (config.announce === 'CHANNEL' && config.announceChannelId) {
      const channel = member.guild.channels.cache.get(config.announceChannelId);
      if (channel?.isTextBased() && !channel.isDMBased()) await channel.send(text);
    }
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id }, 'Voice level-up announcement failed');
  }
}

/** Re-arm the per-guild voice tick 60s out (idempotent; resets the delay). */
export async function scheduleNextVoiceXp(guildId: string, jobs: JobService): Promise<void> {
  await jobs.schedule(
    QUEUE_NAMES.voiceXp,
    'voiceXp',
    { guildId },
    { delayMs: 60_000, jobId: voiceXpJobId(guildId) },
  );
}

/** Start the voice tick for a guild only if it isn't already running (no starve). */
export async function ensureVoiceXpTick(guildId: string, jobs: JobService): Promise<void> {
  await jobs.ensureScheduled(
    QUEUE_NAMES.voiceXp,
    'voiceXp',
    { guildId },
    { delayMs: 60_000, jobId: voiceXpJobId(guildId) },
  );
}

/**
 * One voice-XP tick for a guild: award the per-minute amount to every eligible
 * member in voice, announce/reward level-ups, then re-arm — but only while
 * there's still someone to reward. When voice empties out the loop stops
 * (re-armed again by `voiceStateUpdate` on the next join). Re-arm hinges on the
 * DB-enabled flag (not cache presence) so a wrong-shard pickup ends cleanly.
 */
export async function runVoiceXpTick(guildId: string, deps: VoiceXpDeps): Promise<void> {
  const { enabled, config } = await getLevelingState(guildId);
  if (!enabled || config.voiceXpPerMinute <= 0) return;

  const guild = deps.client.guilds.cache.get(guildId);
  if (!guild) return; // not this shard's guild → let the owning shard run it

  const afkChannelId = guild.afkChannelId;
  const recipients: string[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
      continue;
    }
    const view: VoiceChannelView = {
      channelId: channel.id,
      isAfkChannel: channel.id === afkChannelId,
      members: channel.members.map((member) => ({
        id: member.id,
        bot: member.user.bot,
        deaf: member.voice.deaf ?? false,
        roleIds: [...member.roles.cache.keys()],
      })),
    };
    recipients.push(...eligibleVoiceMembers(view, config.noXpChannelIds, config.noXpRoleIds));
  }

  if (recipients.length === 0) return; // voice is empty/idle → let the loop rest

  for (const userId of recipients) {
    try {
      const result = await awardVoiceXp(guildId, userId, config.voiceXpPerMinute);
      if (!result.leveledUp) continue;
      const member =
        guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
      if (!member) continue;
      await announceVoiceLevelUp(member, config, result.level, deps.logger);
      await applyRoleRewards(member, config, result.level);
    } catch (err) {
      deps.logger.warn({ err, guildId, userId }, 'Voice XP award failed');
    }
  }

  await scheduleNextVoiceXp(guildId, deps.jobs);
}

/** Re-arm voice ticks for guilds this shard owns that currently have voice members. */
export async function reconcileVoiceXp(client: Client, jobs: JobService): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const rows = await prisma.guildModuleConfig.findMany({
    where: { module: 'LEVELING', enabled: true, guildId: { in: guildIds } },
    select: { guildId: true },
  });
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guildId);
    const hasVoiceHumans = guild?.channels.cache.some(
      (channel) =>
        (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) &&
        channel.members.some((member) => !member.user.bot),
    );
    if (hasVoiceHumans) await ensureVoiceXpTick(row.guildId, jobs);
  }
}
