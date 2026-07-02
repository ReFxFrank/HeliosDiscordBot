import { type GuildMember } from 'discord.js';
import {
  evaluateJoinRate,
  isAccountTooNew,
  type AutomodConfig,
  type GateAction,
} from '@solari/shared';
import { createModerationCase } from '../lib/cases';
import { brandedEmbed } from '../lib/embeds';
import { sendLog } from '../lib/logging';
import { lockdownServer } from './lockdown';
import type { BotContext } from '../framework/context';

/**
 * Raid protection. Runs on member join (always the guild's own shard, so the
 * per-guild in-memory state below is consistent). Two gates:
 *   1. Account-age floor — reject throwaway alts immediately.
 *   2. Join-rate window — when joins spike, arm "raid mode" for a cooldown and
 *      sanction every joiner until it expires (catches the trailing wave).
 * State is per-shard and rebuilt naturally after a restart; nothing is durable
 * because the only delayed read (raid-mode expiry) is evaluated lazily on the
 * next join, so no timer/job is needed.
 */

/** guildId → recent join timestamps (ms), pruned to the configured window. */
const joinWindows = new Map<string, number[]>();
/** guildId → ms timestamp until which raid mode stays armed. */
const raidModeUntil = new Map<string, number>();
/** guildId → the `raidModeUntil` value we've already alerted moderators about. */
const raidAlerted = new Map<string, number>();
/** guildId → the `raidModeUntil` value we've already auto-locked down for. */
const raidLockedFor = new Map<string, number>();

async function applyGateAction(
  member: GuildMember,
  action: GateAction,
  timeoutMinutes: number,
  reason: string,
  ctx: BotContext,
): Promise<void> {
  const fullReason = `Raid protection: ${reason}`;
  const botId = ctx.client.user?.id ?? 'system';
  try {
    if (action === 'ban' && member.bannable) {
      await member.ban({ reason: fullReason, deleteMessageSeconds: 0 });
      await createModerationCase({
        guildId: member.guild.id,
        type: 'BAN',
        targetId: member.id,
        moderatorId: botId,
        reason,
      });
    } else if (action === 'kick' && member.kickable) {
      await member.kick(fullReason);
      await createModerationCase({
        guildId: member.guild.id,
        type: 'KICK',
        targetId: member.id,
        moderatorId: botId,
        reason,
      });
    } else if (action === 'timeout' && member.moderatable) {
      await member.timeout(timeoutMinutes * 60_000, fullReason);
      await createModerationCase({
        guildId: member.guild.id,
        type: 'MUTE',
        targetId: member.id,
        moderatorId: botId,
        reason,
        durationSeconds: timeoutMinutes * 60,
      });
    } else {
      ctx.logger.warn(
        { guildId: member.guild.id, action, targetId: member.id },
        'Raid action skipped: member outranks the bot or lacks the needed permission',
      );
    }
  } catch (err) {
    ctx.logger.warn({ err, guildId: member.guild.id, action }, 'Raid action failed');
  }
}

/** Alert moderators once per raid episode that raid mode has engaged. */
async function alertOnce(
  member: GuildMember,
  raid: AutomodConfig['raid'],
  ctx: BotContext,
): Promise<void> {
  const until = raidModeUntil.get(member.guild.id) ?? 0;
  if (raidAlerted.get(member.guild.id) === until) return;
  raidAlerted.set(member.guild.id, until);

  const minutes = Math.round(raid.raidModeDurationSeconds / 60);
  const embed = brandedEmbed({
    kind: 'danger',
    title: '🛡️ Raid protection engaged',
  }).setDescription(
    `A join flood was detected. New members will be **${raid.raidAction}ed** for the next ` +
      `~${minutes} minute${minutes === 1 ? '' : 's'} unless the wave stops sooner.` +
      (raid.lockdownOnRaid
        ? '\n\n🔒 The server has been **locked down**. Run `/lockdown end` once the raid is over.'
        : ''),
  );

  if (raid.alertChannelId) {
    const channel =
      member.guild.channels.cache.get(raid.alertChannelId) ??
      (await member.guild.channels.fetch(raid.alertChannelId).catch(() => null));
    if (channel?.isTextBased() && !channel.isDMBased()) {
      await channel.send({ embeds: [embed] }).catch(() => undefined);
      return;
    }
  }
  await sendLog(ctx, member.guild.id, 'member', embed, { userId: member.id });
}

/**
 * Evaluate the raid gates for a joining member. Returns whether it sanctioned
 * the member (so the caller can skip welcome/autorole/join-log). The caller is
 * responsible for the module-enabled check.
 */
export async function handleRaidJoin(member: GuildMember, ctx: BotContext): Promise<boolean> {
  const { raid } = await ctx.config.getConfig(member.guild.id, 'AUTOMOD');
  if (!raid.enabled || member.user.bot) return false;
  const now = Date.now();

  // Every join feeds the rate window first — a flood is a flood regardless of
  // why any individual member is (or isn't) separately sanctioned, so a mix of
  // fresh alts and aged accounts still trips raid mode and catches the aged
  // ones the age gate would otherwise let through.
  const stamps = [...(joinWindows.get(member.guild.id) ?? []), now];
  const { recent, raid: tripped } = evaluateJoinRate(
    stamps,
    raid.joinWindowSeconds,
    raid.joinThreshold,
    now,
  );
  joinWindows.set(member.guild.id, recent);
  if (tripped) {
    // Overwrite is monotonic (now grows), so this only ever extends the window.
    const until = now + raid.raidModeDurationSeconds * 1000;
    raidModeUntil.set(member.guild.id, until);
    if (raid.pauseInvites) {
      // Discord's own incident action: invites stay paused until the raid
      // window ends and lift automatically — nothing to undo on our side.
      await member.guild
        .setIncidentActions({ invitesDisabledUntil: new Date(until) })
        .catch((err: unknown) =>
          ctx.logger.warn(
            { err, guildId: member.guild.id },
            'Could not pause invites (needs Manage Server)',
          ),
        );
    }
    // Auto-lockdown once per raid episode. Unlike invite-pause this stays until
    // staff run `/lockdown end`, so the server can't reopen mid-raid. Announce
    // is off here to avoid posting in every channel during an active flood.
    if (raid.lockdownOnRaid && raidLockedFor.get(member.guild.id) !== until) {
      raidLockedFor.set(member.guild.id, until);
      await lockdownServer(member.guild, ctx.client.user?.id ?? 'system', 'Automatic raid lockdown', {
        announce: false,
      }).catch((err: unknown) =>
        ctx.logger.warn({ err, guildId: member.guild.id }, 'Auto raid-lockdown failed'),
      );
    }
  }
  const armed = now < (raidModeUntil.get(member.guild.id) ?? 0);
  if (armed) await alertOnce(member, raid, ctx);

  // Gate 1: account age — sanctioned on its own merits with its own action,
  // independent of raid mode.
  if (isAccountTooNew(member.user.createdTimestamp, raid.minAccountAgeHours, now)) {
    await applyGateAction(
      member,
      raid.accountAgeAction,
      raid.timeoutMinutes,
      'Account younger than the minimum age',
      ctx,
    );
    return true;
  }

  // Gate 2: raid mode active — sanction this joiner as part of the flood.
  if (armed) {
    await applyGateAction(member, raid.raidAction, raid.timeoutMinutes, 'Join flood detected', ctx);
    return true;
  }
  return false;
}

/** Test/Reset hook — clears the per-shard raid state (used by reconcile/tests). */
export function resetRaidState(): void {
  joinWindows.clear();
  raidModeUntil.clear();
  raidAlerted.clear();
  raidLockedFor.clear();
}
