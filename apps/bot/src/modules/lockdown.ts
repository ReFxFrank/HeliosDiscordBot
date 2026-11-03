import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type NewsChannel,
  type Role,
  type TextChannel,
} from 'discord.js';
import { prisma, type ChannelLock, type Prisma } from '@refx/database';
import { brandedEmbed } from '../lib/embeds';

/**
 * Channel lockdown (§8). `/lock` and a server-wide `/lockdown` deny @everyone
 * Send Messages; each locked channel records the @everyone SendMessages state
 * it had beforehand (a ChannelLock row) so unlocking restores it exactly rather
 * than clearing a permission the server had set on purpose.
 *
 * Exempt roles stay able to talk: they're granted an explicit Send Messages
 * allow (which overrides the @everyone deny), and their prior state is recorded
 * alongside so unlock restores them too. Only SendMessages is touched, and
 * server admins (Administrator bypasses overwrites) can always still talk.
 */

type LockableChannel = TextChannel | NewsChannel;
type SendState = 'allow' | 'deny' | 'neutral';

/** One exempt role's SendMessages state before the lock, for exact restore. */
interface ExemptState {
  roleId: string;
  prevState: SendState;
}

function isLockable(channel: GuildBasedChannel): channel is LockableChannel {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

/** The bot needs Manage Roles (guild-wide) to edit @everyone overwrites at all. */
export function botCanLockdown(guild: Guild): boolean {
  return guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false;
}

function botCanManageChannel(guild: Guild, channel: LockableChannel): boolean {
  const me = guild.members.me;
  return (
    me
      ?.permissionsIn(channel)
      .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageRoles]) ?? false
  );
}

/** Current @everyone/role SendMessages overwrite on a channel. */
function sendState(channel: LockableChannel, targetId: string): SendState {
  const overwrite = channel.permissionOverwrites.cache.get(targetId);
  if (!overwrite) return 'neutral';
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) return 'allow';
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) return 'deny';
  return 'neutral';
}

async function applySendState(
  channel: LockableChannel,
  target: Role,
  state: SendState,
  reason: string,
): Promise<boolean> {
  const value = state === 'allow' ? true : state === 'deny' ? false : null;
  try {
    await channel.permissionOverwrites.edit(target, { SendMessages: value }, { reason });
    return true;
  } catch {
    return false;
  }
}

/** Resolve the exempt role ids to real, assignable, non-@everyone roles. */
function resolveExemptRoles(guild: Guild, exemptRoleIds: string[]): Role[] {
  const everyoneId = guild.roles.everyone.id;
  const seen = new Set<string>();
  const roles: Role[] = [];
  for (const id of exemptRoleIds) {
    if (id === everyoneId || seen.has(id)) continue;
    const role = guild.roles.cache.get(id);
    if (role && !role.managed) {
      seen.add(id);
      roles.push(role);
    }
  }
  return roles;
}

function parseExemptStates(raw: unknown): ExemptState[] {
  if (!Array.isArray(raw)) return [];
  const out: ExemptState[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as ExemptState).roleId === 'string' &&
      ['allow', 'deny', 'neutral'].includes((entry as ExemptState).prevState)
    ) {
      out.push(entry as ExemptState);
    }
  }
  return out;
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
  exemptRoles: Role[],
): Promise<'locked' | 'already' | 'failed'> {
  const existing = await prisma.channelLock.findUnique({
    where: { guildId_channelId: { guildId: channel.guild.id, channelId: channel.id } },
    select: { id: true },
  });
  if (existing) return 'already';

  const prevState = sendState(channel, everyone.id);
  const exemptStates: ExemptState[] = exemptRoles.map((role) => ({
    roleId: role.id,
    prevState: sendState(channel, role.id),
  }));

  const editReason = `Lockdown${reason ? `: ${reason}` : ''}`;
  const denied = await applySendState(channel, everyone, 'deny', editReason);
  if (!denied) return 'failed';
  // Keep exempt roles talking. A failure here isn't fatal — the channel is
  // already locked — so just carry on; the row still records what we recorded.
  for (const role of exemptRoles) {
    await applySendState(channel, role, 'allow', editReason);
  }

  await prisma.channelLock.create({
    data: {
      guildId: channel.guild.id,
      channelId: channel.id,
      moderatorId,
      reason,
      prevState,
      exemptStates: exemptStates as unknown as Prisma.InputJsonValue,
      bulk,
    },
  });
  return 'locked';
}

/** Restore a channel from its lock row: @everyone and every exempt role. */
async function restoreFromRow(
  channel: LockableChannel,
  everyone: Role,
  row: ChannelLock,
): Promise<void> {
  await applySendState(channel, everyone, row.prevState as SendState, 'Unlock');
  for (const exempt of parseExemptStates(row.exemptStates)) {
    const role = channel.guild.roles.cache.get(exempt.roleId);
    if (role) await applySendState(channel, role, exempt.prevState, 'Unlock');
  }
}

export type LockChannelResult = 'locked' | 'already' | 'failed' | 'noperm' | 'unsupported';

/** Lock one channel via `/lock`. */
export async function lockChannel(
  channel: GuildBasedChannel,
  moderatorId: string,
  reason: string | null,
  exemptRoleIds: string[] = [],
): Promise<LockChannelResult> {
  if (!isLockable(channel)) return 'unsupported';
  if (!botCanManageChannel(channel.guild, channel)) return 'noperm';
  const exemptRoles = resolveExemptRoles(channel.guild, exemptRoleIds);
  const result = await lockOne(
    channel,
    channel.guild.roles.everyone,
    moderatorId,
    reason,
    false,
    exemptRoles,
  );
  if (result === 'locked') await postNotice(channel, true, reason);
  return result;
}

export type UnlockChannelResult = 'unlocked' | 'notlocked';

/** Unlock one channel via `/unlock`, restoring @everyone + exempt roles. */
export async function unlockChannel(guild: Guild, channelId: string): Promise<UnlockChannelResult> {
  const row = await prisma.channelLock.findUnique({
    where: { guildId_channelId: { guildId: guild.id, channelId } },
  });
  if (!row) return 'notlocked';

  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (channel && isLockable(channel)) {
    await restoreFromRow(channel, guild.roles.everyone, row);
    await postNotice(channel, false);
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
 * amplifying load mid-raid). `exemptRoleIds` stay able to talk.
 */
export async function lockdownServer(
  guild: Guild,
  moderatorId: string,
  reason: string | null,
  opts: { announce?: boolean; exemptRoleIds?: string[] } = {},
): Promise<{ locked: number; skipped: number }> {
  const everyone = guild.roles.everyone;
  const exemptRoles = resolveExemptRoles(guild, opts.exemptRoleIds ?? []);
  let locked = 0;
  let skipped = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel)) continue;
    if (!botCanManageChannel(guild, channel)) {
      skipped += 1;
      continue;
    }
    const result = await lockOne(channel, everyone, moderatorId, reason, true, exemptRoles);
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
      await restoreFromRow(channel, everyone, row);
      restored += 1;
      if (opts.announce) await postNotice(channel, false);
    }
  }
  await prisma.channelLock.deleteMany({ where: { guildId: guild.id } });
  return { restored };
}

/** Whether the guild currently has any active bulk lock (for raid dedupe/status). */
export async function isLockedDown(guildId: string): Promise<boolean> {
  const count = await prisma.channelLock.count({ where: { guildId, bulk: true } });
  return count > 0;
}
