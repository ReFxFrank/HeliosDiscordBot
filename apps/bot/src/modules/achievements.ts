import type { Client, GuildMember } from 'discord.js';
import { prisma } from '@solari/database';
import {
  parseModuleConfig,
  type Achievement,
  type AchievementType,
  type AchievementsConfig,
} from '@solari/shared';
import { brandedEmbed } from '../lib/embeds';
import { addWallet, getEconomyUser } from '../lib/economy';
import type { Logger } from '../logger';

export interface AchievementDeps {
  client: Client;
  logger: Logger;
}

export interface UserStats {
  level: number;
  messages: number;
  coins: number;
  voiceMinutes: number;
}

/** The member's current value for the stat an achievement tracks. */
export function statForType(type: AchievementType, stats: UserStats): number {
  switch (type) {
    case 'LEVEL':
      return stats.level;
    case 'MESSAGES':
      return stats.messages;
    case 'COINS':
      return stats.coins;
    case 'VOICE_MINUTES':
      return stats.voiceMinutes;
    default:
      return 0;
  }
}

function meets(type: AchievementType, stats: UserStats, threshold: number): boolean {
  return statForType(type, stats) >= threshold;
}

async function loadStats(guildId: string, userId: string): Promise<UserStats> {
  const [level, eco] = await Promise.all([
    prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { level: true, messages: true, voiceMinutes: true },
    }),
    prisma.economyUser.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { wallet: true, bank: true },
    }),
  ]);
  return {
    level: level?.level ?? 0,
    messages: level?.messages ?? 0,
    voiceMinutes: level?.voiceMinutes ?? 0,
    coins: (eco?.wallet ?? 0) + (eco?.bank ?? 0),
  };
}

async function grantRewards(
  guildId: string,
  userId: string,
  member: GuildMember | null,
  ach: Achievement,
): Promise<void> {
  if (ach.rewardCoins > 0) {
    await getEconomyUser(guildId, userId, 0);
    await addWallet(guildId, userId, ach.rewardCoins);
  }
  if (ach.rewardXp > 0) {
    await prisma.userLevel.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { xp: { increment: ach.rewardXp } },
      create: { guildId, userId, xp: ach.rewardXp },
    });
  }
  if (ach.rewardRoleId && member && member.guild.roles.cache.has(ach.rewardRoleId)) {
    await member.roles.add(ach.rewardRoleId, 'Achievement reward').catch(() => undefined);
  }
}

async function announce(
  guildId: string,
  userId: string,
  ach: Achievement,
  config: AchievementsConfig,
  deps: AchievementDeps,
): Promise<void> {
  if (!config.announce || !config.announceChannelId) return;
  const channel =
    deps.client.channels.cache.get(config.announceChannelId) ??
    (await deps.client.channels.fetch(config.announceChannelId).catch(() => null));
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  const rewards = [
    ach.rewardRoleId ? `<@&${ach.rewardRoleId}>` : null,
    ach.rewardCoins ? `${ach.rewardCoins.toLocaleString('en-US')} coins` : null,
    ach.rewardXp ? `${ach.rewardXp.toLocaleString('en-US')} XP` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  await channel
    .send({
      embeds: [
        brandedEmbed({
          kind: 'success',
          title: '🏆 Achievement unlocked!',
          description:
            `<@${userId}> unlocked **${ach.name}**` +
            (ach.description ? `\n${ach.description}` : '') +
            (rewards ? `\n\n**Rewards:** ${rewards}` : ''),
        }),
      ],
      allowedMentions: { users: [userId], roles: [] },
    })
    .catch(() => undefined);
}

/** A member's current stats + the set of achievement ids they've unlocked. */
export async function getAchievementStatus(
  guildId: string,
  userId: string,
): Promise<{ stats: UserStats; unlocked: Set<string> }> {
  const [stats, rows] = await Promise.all([
    loadStats(guildId, userId),
    prisma.userAchievement.findMany({ where: { guildId, userId }, select: { achievementId: true } }),
  ]);
  return { stats, unlocked: new Set(rows.map((r: { achievementId: string }) => r.achievementId)) };
}

/**
 * Check a member's current stats against the guild's achievements and unlock any
 * newly-earned ones (granting rewards + announcing once). Idempotent: the unique
 * (guild,user,achievement) row makes a double-grant impossible under races.
 * Called at cheap checkpoints (level-ups, economy earns), never per-message.
 */
export async function evaluateAchievements(
  guildId: string,
  userId: string,
  deps: AchievementDeps,
): Promise<void> {
  try {
    const row = await prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId, module: 'ACHIEVEMENTS' } },
      select: { enabled: true, config: true },
    });
    if (!row?.enabled) return;
    const config = parseModuleConfig('ACHIEVEMENTS', row.config ?? {});
    if (config.achievements.length === 0) return;

    const [stats, unlockedRows] = await Promise.all([
      loadStats(guildId, userId),
      prisma.userAchievement.findMany({ where: { guildId, userId }, select: { achievementId: true } }),
    ]);
    const unlocked = new Set(unlockedRows.map((r: { achievementId: string }) => r.achievementId));

    const earned = config.achievements.filter(
      (a) => !unlocked.has(a.id) && meets(a.type, stats, a.threshold),
    );
    if (earned.length === 0) return;

    const guild = deps.client.guilds.cache.get(guildId);
    const member = guild
      ? (guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null)))
      : null;

    for (const ach of earned) {
      try {
        // The unique constraint is the source of truth — if this throws, a
        // concurrent evaluation already unlocked it, so we skip the rewards.
        await prisma.userAchievement.create({ data: { guildId, userId, achievementId: ach.id } });
      } catch {
        continue;
      }
      await grantRewards(guildId, userId, member, ach);
      await announce(guildId, userId, ach, config, deps);
    }
  } catch (err) {
    deps.logger.warn({ err, guildId, userId }, 'Achievement evaluation failed');
  }
}
