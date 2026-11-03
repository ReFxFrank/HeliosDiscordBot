import type { EmbedBuilder, GuildMember } from 'discord.js';
import { prisma } from '@refx/database';
import type { EscalationRung, ModerationConfig } from '@refx/shared';
import type { BotContext } from '../framework/context';

/** True if the member holds one of the guild's moderation-immune roles. */
export function isImmuneMember(member: GuildMember, immuneRoleIds: string[]): boolean {
  return immuneRoleIds.some((id) => member.roles.cache.has(id));
}

/** Count a member's active WARN cases — the input to the escalation ladder. */
export function activeWarnCount(guildId: string, userId: string): Promise<number> {
  return prisma.moderationCase.count({
    where: { guildId, targetId: userId, type: 'WARN', active: true },
  });
}

/**
 * The escalation rung that fires at EXACTLY `warnCount` active warns, if any.
 * Exact-match (not ≥) so each configured threshold triggers once as warns
 * accrue, instead of re-punishing on every warn past the highest rung.
 */
export function matchEscalation(
  escalation: EscalationRung[],
  warnCount: number,
): EscalationRung | null {
  return escalation.find((rung) => rung.threshold === warnCount) ?? null;
}

/**
 * Validate a moderation target before acting. Returns a user-facing error
 * string, or `null` when the action may proceed. `actionVerb` is interpolated
 * into the self/bot/owner messages (e.g. "warn", "kick", "time out").
 */
export function moderationTargetError(params: {
  targetId: string;
  actorId: string;
  botId: string | undefined;
  guildOwnerId: string;
  targetMember: GuildMember | null;
  immuneRoleIds: string[];
  actionVerb: string;
}): string | null {
  const { targetId, actorId, botId, guildOwnerId, targetMember, immuneRoleIds, actionVerb } =
    params;
  if (targetId === actorId) return `You can’t ${actionVerb} yourself.`;
  if (botId && targetId === botId) return `I can’t ${actionVerb} myself.`;
  if (targetId === guildOwnerId) return `You can’t ${actionVerb} the server owner.`;
  if (targetMember && isImmuneMember(targetMember, immuneRoleIds)) {
    return 'That member has a moderation-immune role and can’t be actioned.';
  }
  return null;
}

/**
 * Post a moderation-case embed to the guild's configured mod-log channel.
 * Best-effort: swallows any failure so logging can never fail a completed
 * moderation action.
 */
export async function postModLog(
  ctx: BotContext,
  guildId: string,
  config: Pick<ModerationConfig, 'modLogChannelId'>,
  embed: EmbedBuilder,
): Promise<void> {
  const channelId = config.modLogChannelId;
  if (!channelId) return;
  try {
    const channel = await ctx.client.channels.fetch(channelId);
    if (channel?.isTextBased() && 'send' in channel) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    ctx.logger.warn({ err, guildId, channelId }, 'Failed to post mod-log entry');
  }
}
