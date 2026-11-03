import type { Client, GuildMember } from 'discord.js';
import { prisma } from '@refx/database';
import {
  ACHIEVEMENT_TIER_EMOJI,
  ACHIEVEMENT_TIER_LABELS,
  isTieredAchievement,
  parseModuleConfig,
  tierAt,
  type Achievement,
  type AchievementTierDef,
  type AchievementType,
  type AchievementsConfig,
} from '@refx/shared';
import { brandedEmbed } from '../lib/embeds';
import type { Logger } from '../logger';

export interface AchievementDeps {
  client: Client;
  logger: Logger;
}

export interface UserStats {
  level: number;
  messages: number;
  voiceMinutes: number;
  reactionsAdded: number;
  threadsCreated: number;
  threadsJoined: number;
  invites: number;
  giveawaysJoined: number;
  boosted: number;
  birthdaySet: number;
}

/** The member's current value for the stat an achievement tracks. */
export function statForType(type: AchievementType, stats: UserStats): number {
  switch (type) {
    case 'LEVEL':
      return stats.level;
    case 'MESSAGES':
      return stats.messages;
    case 'VOICE_MINUTES':
      return stats.voiceMinutes;
    case 'REACTIONS':
      return stats.reactionsAdded;
    case 'THREADS_CREATED':
      return stats.threadsCreated;
    case 'THREADS_JOINED':
      return stats.threadsJoined;
    case 'INVITES':
      return stats.invites;
    case 'GIVEAWAYS_JOINED':
      return stats.giveawaysJoined;
    case 'SERVER_BOOSTED':
      return stats.boosted;
    case 'BIRTHDAY_SET':
      return stats.birthdaySet;
    default:
      return 0;
  }
}

async function loadStats(guildId: string, userId: string): Promise<UserStats> {
  const [level, ms, invites] = await Promise.all([
    prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { level: true, messages: true, voiceMinutes: true },
    }),
    prisma.memberStat.findUnique({
      where: { guildId_userId: { guildId, userId } },
    }),
    // Invites come from the authoritative InviteUse table (deduped per invited
    // member) rather than a counter, so leave/rejoin can't inflate the total.
    prisma.inviteUse.count({ where: { guildId, inviterId: userId } }),
  ]);
  return {
    level: level?.level ?? 0,
    messages: level?.messages ?? 0,
    voiceMinutes: level?.voiceMinutes ?? 0,
    reactionsAdded: ms?.reactionsAdded ?? 0,
    threadsCreated: ms?.threadsCreated ?? 0,
    threadsJoined: ms?.threadsJoined ?? 0,
    invites,
    giveawaysJoined: ms?.giveawaysJoined ?? 0,
    boosted: ms?.boosted ?? 0,
    birthdaySet: ms?.birthdaySet ?? 0,
  };
}

async function grantRewards(
  guildId: string,
  userId: string,
  member: GuildMember | null,
  tier: AchievementTierDef,
): Promise<void> {
  if (tier.rewardXp > 0) {
    await prisma.userLevel.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { xp: { increment: tier.rewardXp } },
      create: { guildId, userId, xp: tier.rewardXp },
    });
  }
  if (tier.rewardRoleId && member && member.guild.roles.cache.has(tier.rewardRoleId)) {
    await member.roles.add(tier.rewardRoleId, 'Achievement reward').catch(() => undefined);
  }
}

async function announce(
  guildId: string,
  userId: string,
  ach: Achievement,
  tierIndex: number,
  tier: AchievementTierDef,
  config: AchievementsConfig,
  deps: AchievementDeps,
): Promise<void> {
  if (!config.announce || !config.announceChannelId) return;
  const channel =
    deps.client.channels.cache.get(config.announceChannelId) ??
    (await deps.client.channels.fetch(config.announceChannelId).catch(() => null));
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  const tiered = isTieredAchievement(ach);
  const tierName = tierAt(tierIndex);
  const rewards = [
    tier.rewardRoleId ? `<@&${tier.rewardRoleId}>` : null,
    tier.rewardXp ? `${tier.rewardXp.toLocaleString('en-US')} XP` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  await channel
    .send({
      embeds: [
        brandedEmbed({
          kind: 'success',
          title: tiered
            ? `${ACHIEVEMENT_TIER_EMOJI[tierName]} ${ACHIEVEMENT_TIER_LABELS[tierName]} unlocked!`
            : '🏆 Achievement unlocked!',
          description:
            `<@${userId}> unlocked **${ach.name}**` +
            (tiered ? ` — ${ACHIEVEMENT_TIER_LABELS[tierName]}` : '') +
            (ach.description ? `\n${ach.description}` : '') +
            (rewards ? `\n\n**Rewards:** ${rewards}` : ''),
        }),
      ],
      allowedMentions: { users: [userId], roles: [] },
    })
    .catch(() => undefined);
}

/** Composite key for an unlocked tier. */
const unlockKey = (achievementId: string, tier: number): string => `${achievementId}:${tier}`;

/** A member's current stats + the set of `${achievementId}:${tier}` they've unlocked. */
export async function getAchievementStatus(
  guildId: string,
  userId: string,
): Promise<{ stats: UserStats; unlocked: Set<string> }> {
  const [stats, rows] = await Promise.all([
    loadStats(guildId, userId),
    prisma.userAchievement.findMany({
      where: { guildId, userId },
      select: { achievementId: true, tier: true },
    }),
  ]);
  return {
    stats,
    unlocked: new Set(
      rows.map((r: { achievementId: string; tier: number }) => unlockKey(r.achievementId, r.tier)),
    ),
  };
}

/**
 * Check a member's stats against every tier of every achievement and unlock any
 * newly-earned tiers (granting rewards + announcing once each). Idempotent: the
 * unique (guild,user,achievement,tier) row makes a double-grant impossible under
 * races. Called at cheap checkpoints (level-ups, economy earns), never per-message.
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

    const { stats, unlocked } = await getAchievementStatus(guildId, userId);

    // Collect the (achievement, tierIndex) pairs newly crossed.
    const newlyEarned: { ach: Achievement; tierIndex: number; tier: AchievementTierDef }[] = [];
    for (const ach of config.achievements) {
      if (ach.enabled === false) continue;
      const value = statForType(ach.type, stats);
      ach.tiers.forEach((tier, tierIndex) => {
        if (value >= tier.threshold && !unlocked.has(unlockKey(ach.id, tierIndex))) {
          newlyEarned.push({ ach, tierIndex, tier });
        }
      });
    }
    if (newlyEarned.length === 0) return;

    const guild = deps.client.guilds.cache.get(guildId);
    const member = guild
      ? (guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null)))
      : null;

    for (const { ach, tierIndex, tier } of newlyEarned) {
      try {
        // Unique constraint is the source of truth — a concurrent evaluation that
        // already unlocked this tier makes create throw, so we skip the rewards.
        await prisma.userAchievement.create({
          data: { guildId, userId, achievementId: ach.id, tier: tierIndex },
        });
      } catch {
        continue;
      }
      await grantRewards(guildId, userId, member, tier);
      await announce(guildId, userId, ach, tierIndex, tier, config, deps);
    }
  } catch (err) {
    deps.logger.warn({ err, guildId, userId }, 'Achievement evaluation failed');
  }
}
