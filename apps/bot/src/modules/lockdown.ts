import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type NewsChannel,
  type Role,
  type TextChannel,
} from 'discord.js';
import { prisma } from '@solari/database';
import { brandedEmbed } from '../lib/embeds';

/**
 * Channel lockdown (§8). `/lock` and a server-wide `/lockdown` deny @everyone
 * Send Messages; each locked channel records the @everyone SendMessages state
 * it had beforehand (a ChannelLock row) so unlocking restores it exactly rather
 * than clearing a permission the server had set on purpose. Only SendMessages is
 * touched — the canonical lock — and server admins (Administrator bypasses
 * overwrites) can always still talk.
 */

type LockableChannel = TextChannel | NewsChannel;
type SendState = 'allow' | 'deny' | 'neutral';

function isLockable(channel: GuildBasedChannel): channel is LockableChannel {
  return (
    channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement
  );
}

/** The bot needs Manage Roles (guild-wide) to edit @everyone overwrites at all. */
export function botCanLockdown(guild: Guild): boolean {
  return guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
}

function botCanManageChannel(guild: Guild, channel: LockableChannel): boolean {
  const me = guild.members.me;
  return (
    me?.permissionsIn(channel).has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageRoles,
    ]) ?? false
  );
}

function everyoneSendState(channel: LockableChannel, everyoneId: string): SendState {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  if (!overwrite) return 'neutral';
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) return 'allow';
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) return 'deny';
  return 'neutral';
}

async function restoreOverwrite(
  channel: LockableChannel,
  everyone: Role,
  prevState: string,
): Promise<boolean> {
  const value = prevState === 'allow' ? true : prevState === 'deny' ? false : null;
  try {
    await channel.permissionOverwrites.edit(everyone, { SendMessages: value }, { reason: 'Unlock' });
    return true;
  } catch {
    return false;
  }
}

async function postNotice(
  channel: LockableChannel,
  locked: boolean,
  reason?: string | null,
): Promise<void> {
  const embed = brandedEmbed({
    kind: locked ? 'danger' : 'success',
    title: locked ? '🔒 Channel locked' : '🔓 Channel unlocked',
    description: locked
      ? `This channel has been locked by the moderators.${reason ? `\n**Reason:** ${reason}` : ''}`
      : 'This channel has been unlocked. Thanks for your patience.',
  });
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

/** Lock a single channel (idempotent — an already-locked channel is a no-op). */
async function lockOne(
  channel: LockableChannel,
  everyone: Role,
  moderatorId: string,
  reason: string | null,
  bulk: boolean,
): Promise<'locked' | 'already' | 'failed'> {
  const existing = await prisma.channelLock.findUnique({
    where: { guildId_channelId: { guildId: channel.guild.id, channelId: channel.id } },
    select: { id: true },
  });
  if (existing) return 'already';

  const prevState = everyoneSendState(channel, everyone.id);
  try {
    await channel.permissionOverwrites.edit(
      everyone,
      { SendMessages: false },
      { reason: `Lockdown${reason ? `: ${reason}` : ''}` },
    );
  } catch {
    return 'failed';
  }
  await prisma.channelLock.create({
    data: { guildId: channel.guild.id, channelId: channel.id, moderatorId, reason, prevState, bulk },
  });
  return 'locked';
}

export type LockChannelResult = 'locked' | 'already' | 'failed' | 'noperm' | 'unsupported';

/** Lock one channel via `/lock`. */
export async function lockChannel(
  channel: GuildBasedChannel,
  moderatorId: string,
  reason: string | null,
): Promise<LockChannelResult> {
  if (!isLockable(channel)) return 'unsupported';
  if (!botCanManageChannel(channel.guild, channel)) return 'noperm';
  const result = await lockOne(channel, channel.guild.roles.everyone, moderatorId, reason, false);
  if (result === 'locked') await postNotice(channel, true, reason);
  return result;
}

export type UnlockChannelResult = 'unlocked' | 'notlocked';

/** Unlock one channel via `/unlock`, restoring its prior @everyone state. */
export async function unlockChannel(
  guild: Guild,
  channelId: string,
): Promise<UnlockChannelResult> {
  const row = await prisma.channelLock.findUnique({
    where: { guildId_channelId: { guildId: guild.id, channelId } },
  });
  if (!row) return 'notlocked';

  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (channel && isLockable(channel)) {
    const restored = await restoreOverwrite(channel, guild.roles.everyone, row.prevState);
    if (restored) await postNotice(channel, false);
  }
  // Delete the row regardless — the lock is being lifted, and a missing/edited
  // channel just means there's nothing left to restore.
  await prisma.channelLock.delete({ where: { id: row.id } });
  return 'unlocked';
}

/**
 * Lock every eligible text/announcement channel the bot can manage. Skips
 * channels already locked or out of reach. `announce` posts a per-channel notice
 * (on for manual/dashboard lockdowns, off for auto raid lockdowns to avoid
 * amplifying load mid-raid).
 */
export async function lockdownServer(
  guild: Guild,
  moderatorId: string,
  reason: string | null,
  opts: { announce?: boolean } = {},
): Promise<{ locked: number; skipped: number }> {
  const everyone = guild.roles.everyone;
  let locked = 0;
  let skipped = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel)) continue;
    if (!botCanManageChannel(guild, channel)) {
      skipped += 1;
      continue;
    }
    const result = await lockOne(channel, everyone, moderatorId, reason, true);
    if (result === 'locked') {
      locked += 1;
      if (opts.announce) await postNotice(channel, true, reason);
    } else {
      skipped += 1;
    }
  }
  return { locked, skipped };
}

/** Lift every lock in the guild (single + bulk), restoring each channel. */
export async function endLockdown(
  guild: Guild,
  opts: { announce?: boolean } = {},
): Promise<{ restored: number }> {
  const rows = await prisma.channelLock.findMany({ where: { guildId: guild.id } });
  const everyone = guild.roles.everyone;
  let restored = 0;
  for (const row of rows) {
    const channel =
      guild.channels.cache.get(row.channelId) ??
      (await guild.channels.fetch(row.channelId).catch(() => null));
    if (channel && isLockable(channel)) {
      const ok = await restoreOverwrite(channel, everyone, row.prevState);
      if (ok) {
        restored += 1;
        if (opts.announce) await postNotice(channel, false);
      }
    }
  }
  await prisma.channelLock.deleteMany({ where: { guildId: guild.id } });
  return { restored };
}

/** Whether the guild currently has any active locks (for raid dedupe + status). */
export async function isLockedDown(guildId: string): Promise<boolean> {
  const count = await prisma.channelLock.count({ where: { guildId, bulk: true } });
  return count > 0;
}
