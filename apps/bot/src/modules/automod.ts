import { PermissionFlagsBits, type Message } from 'discord.js';
import {
  containsDisallowedLink,
  containsInvite,
  exceedsCaps,
  matchBlockedWord,
  type AutomodConfig,
  type AutomodRule,
} from '@helios/shared';
import { createModerationCase } from '../lib/cases';
import { brandedEmbed } from '../lib/embeds';
import type { BotContext } from '../framework/context';

/** Per-shard sliding window of recent message timestamps for spam detection. */
const spamWindows = new Map<string, number[]>();

interface Trigger {
  rule: AutomodRule;
  reason: string;
}

function isExempt(message: Message<true>, config: AutomodConfig): boolean {
  if (config.exemptChannelIds.includes(message.channelId)) return true;
  const member = message.member;
  if (!member) return false;
  // Moderators (Manage Messages) are never auto-moderated.
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return config.exemptRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function checkSpam(message: Message<true>, maxMessages: number, windowSeconds: number): boolean {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  const recent = (spamWindows.get(key) ?? []).filter((ts) => ts > cutoff);
  recent.push(now);
  spamWindows.set(key, recent);
  return recent.length > maxMessages;
}

/** Find the first enabled filter this message trips. Order: cheap → expensive. */
function evaluate(message: Message<true>, config: AutomodConfig): Trigger | null {
  const content = message.content;
  if (config.invites.enabled && containsInvite(content)) {
    return { rule: config.invites, reason: 'Posting a Discord invite' };
  }
  if (config.links.enabled && containsDisallowedLink(content, config.links.allowlist)) {
    return { rule: config.links, reason: 'Posting a disallowed link' };
  }
  if (config.mentions.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size;
    if (count > config.mentions.maxMentions)
      return { rule: config.mentions, reason: 'Mass mentions' };
  }
  if (config.caps.enabled && exceedsCaps(content, config.caps.percent, config.caps.minLength)) {
    return { rule: config.caps, reason: 'Excessive caps' };
  }
  if (config.words.enabled && matchBlockedWord(content, config.words.list)) {
    return { rule: config.words, reason: 'Blocked word' };
  }
  if (
    config.spam.enabled &&
    checkSpam(message, config.spam.maxMessages, config.spam.windowSeconds)
  ) {
    return { rule: config.spam, reason: 'Spam (message flood)' };
  }
  return null;
}

async function applyAction(
  message: Message<true>,
  trigger: Trigger,
  ctx: BotContext,
): Promise<void> {
  const { rule, reason } = trigger;
  const member = message.member;
  const fullReason = `Automod: ${reason}`;

  await message.delete().catch(() => undefined);

  // Best-effort DM so the user knows why.
  await message.author
    .send({
      embeds: [
        brandedEmbed({
          kind: 'warning',
          description: `Your message in **${message.guild.name}** was removed — ${reason}.`,
        }),
      ],
    })
    .catch(() => undefined);

  const botId = ctx.client.user?.id ?? 'system';
  try {
    if (rule.action === 'timeout' && member?.moderatable) {
      await member.timeout(rule.timeoutMinutes * 60_000, fullReason);
      await createModerationCase({
        guildId: message.guildId,
        type: 'MUTE',
        targetId: message.author.id,
        moderatorId: botId,
        reason,
        durationSeconds: rule.timeoutMinutes * 60,
      });
    } else if (rule.action === 'kick' && member?.kickable) {
      await member.kick(fullReason);
      await createModerationCase({
        guildId: message.guildId,
        type: 'KICK',
        targetId: message.author.id,
        moderatorId: botId,
        reason,
      });
    } else if (rule.action === 'ban' && member?.bannable) {
      await member.ban({ reason: fullReason, deleteMessageSeconds: 0 });
      await createModerationCase({
        guildId: message.guildId,
        type: 'BAN',
        targetId: message.author.id,
        moderatorId: botId,
        reason,
      });
    } else if (rule.action === 'warn') {
      await createModerationCase({
        guildId: message.guildId,
        type: 'WARN',
        targetId: message.author.id,
        moderatorId: botId,
        reason,
      });
    }
  } catch (err) {
    ctx.logger.warn(
      { err, guildId: message.guildId, action: rule.action },
      'Automod action failed',
    );
  }
}

/**
 * Scan a message and act on the first tripped filter. Returns whether it acted
 * (so the caller can skip XP/tags for a removed message). Module-enabled and
 * non-bot/in-guild checks are the caller's responsibility.
 */
export async function handleAutomodMessage(
  message: Message<true>,
  ctx: BotContext,
): Promise<boolean> {
  const config = await ctx.config.getConfig(message.guildId, 'AUTOMOD');
  if (isExempt(message, config)) return false;
  const trigger = evaluate(message, config);
  if (!trigger) return false;
  await applyAction(message, trigger, ctx);
  return true;
}
