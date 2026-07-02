import { AuditLogEvent, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import type { AntiNukeConfig } from '@solari/shared';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';
import { createModerationCase } from '../lib/cases';
import type { BotContext } from '../framework/context';

/**
 * Anti-nuke (§8): watches audit-log entries (always delivered on the guild's
 * own shard) and counts destructive actions PER ACTOR in a rolling window. A
 * compromised or rogue mod that mass-bans / mass-deletes trips a threshold and
 * gets sanctioned (roles stripped by default) with an alert to staff.
 *
 * The guild owner and this bot are always exempt: the owner can't be
 * meaningfully sanctioned, and the bot's own raid actions must never trip it.
 * State is per-shard and in-memory — a restart forgets counts, which only
 * means a nuker gets a fresh window, never a false positive.
 */

type Bucket = 'banKick' | 'channelDelete' | 'roleDelete';

const WATCHED: Partial<Record<number, Bucket>> = {
  [AuditLogEvent.MemberBanAdd]: 'banKick',
  [AuditLogEvent.MemberKick]: 'banKick',
  [AuditLogEvent.ChannelDelete]: 'channelDelete',
  [AuditLogEvent.RoleDelete]: 'roleDelete',
};

const THRESHOLD_KEY: Record<Bucket, keyof Pick<AntiNukeConfig, 'banKickThreshold' | 'channelDeleteThreshold' | 'roleDeleteThreshold'>> = {
  banKick: 'banKickThreshold',
  channelDelete: 'channelDeleteThreshold',
  roleDelete: 'roleDeleteThreshold',
};

const BUCKET_LABEL: Record<Bucket, string> = {
  banKick: 'bans/kicks',
  channelDelete: 'channel deletions',
  roleDelete: 'role deletions',
};

/** `${guildId}:${userId}:${bucket}` → action timestamps within the window. */
const windows = new Map<string, number[]>();
/** `${guildId}:${userId}` → ms until which this actor is already sanctioned (dedupe). */
const sanctionedUntil = new Map<string, number>();

export async function handleAuditEntryForAntiNuke(
  entry: GuildAuditLogsEntry,
  guild: Guild,
  ctx: BotContext,
): Promise<void> {
  const bucket = WATCHED[entry.action];
  if (!bucket || !entry.executorId) return;

  if (!(await ctx.config.isEnabled(guild.id, 'AUTOMOD'))) return;
  const { antiNuke } = await ctx.config.getConfig(guild.id, 'AUTOMOD');
  if (!antiNuke.enabled) return;

  const executorId = entry.executorId;
  if (
    executorId === guild.ownerId ||
    executorId === ctx.client.user?.id ||
    antiNuke.exemptUserIds.includes(executorId)
  ) {
    return;
  }

  const now = Date.now();
  const key = `${guild.id}:${executorId}:${bucket}`;
  const cutoff = now - antiNuke.windowSeconds * 1000;
  const stamps = [...(windows.get(key) ?? []).filter((ts) => ts > cutoff), now];
  windows.set(key, stamps);
  if (stamps.length < antiNuke[THRESHOLD_KEY[bucket]]) return;

  // Threshold crossed — sanction once per window, not once per extra action.
  const dedupeKey = `${guild.id}:${executorId}`;
  if (now < (sanctionedUntil.get(dedupeKey) ?? 0)) return;
  sanctionedUntil.set(dedupeKey, now + antiNuke.windowSeconds * 1000);
  windows.delete(key);

  const reason = `Anti-nuke: ${stamps.length} ${BUCKET_LABEL[bucket]} in ${antiNuke.windowSeconds}s`;
  const member = await guild.members.fetch(executorId).catch(() => null);

  let outcome = 'alert only (member not found)';
  try {
    if (antiNuke.action === 'ban') {
      if (member ? member.bannable : guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        await guild.members.ban(executorId, { reason, deleteMessageSeconds: 0 });
        outcome = 'banned';
        await createModerationCase({
          guildId: guild.id,
          type: 'BAN',
          targetId: executorId,
          moderatorId: ctx.client.user?.id ?? 'system',
          reason,
        });
      } else {
        outcome = 'alert only (cannot ban — check role position)';
      }
    } else if (antiNuke.action === 'kick' && member) {
      if (member.kickable) {
        await member.kick(reason);
        outcome = 'kicked';
        await createModerationCase({
          guildId: guild.id,
          type: 'KICK',
          targetId: executorId,
          moderatorId: ctx.client.user?.id ?? 'system',
          reason,
        });
      } else {
        outcome = 'alert only (cannot kick — check role position)';
      }
    } else if (member) {
      // strip-roles (default): remove every role the bot can manage so the
      // account loses its permissions but stays for investigation.
      const removable = member.roles.cache.filter(
        (role) => role.editable && role.id !== guild.roles.everyone.id,
      );
      if (removable.size > 0) {
        await member.roles.remove(removable, reason);
        outcome = `stripped ${removable.size} role${removable.size === 1 ? '' : 's'}`;
      } else {
        outcome = 'alert only (no removable roles — check role position)';
      }
      await createModerationCase({
        guildId: guild.id,
        type: 'NOTE',
        targetId: executorId,
        moderatorId: ctx.client.user?.id ?? 'system',
        reason: `${reason} — ${outcome}`,
      });
    }
  } catch (err) {
    ctx.logger.warn({ err, guildId: guild.id, executorId }, 'Anti-nuke sanction failed');
    outcome = 'alert only (sanction failed)';
  }

  const embed = brandedEmbed({
    kind: 'danger',
    title: '🚨 Anti-nuke triggered',
  }).setDescription(
    [
      `**Account:** <@${executorId}> (\`${executorId}\`)`,
      `**Tripped:** ${stamps.length} ${BUCKET_LABEL[bucket]} in ${antiNuke.windowSeconds}s`,
      `**Action taken:** ${outcome}`,
      '',
      'If this account is compromised, secure it before restoring any roles.',
    ].join('\n'),
  );
  if (antiNuke.alertChannelId) {
    const channel =
      guild.channels.cache.get(antiNuke.alertChannelId) ??
      (await guild.channels.fetch(antiNuke.alertChannelId).catch(() => null));
    if (channel?.isTextBased() && !channel.isDMBased()) {
      await channel.send({ embeds: [embed] }).catch(() => undefined);
      return;
    }
  }
  await sendLog(ctx, guild.id, 'member', embed, { userId: executorId });
}
