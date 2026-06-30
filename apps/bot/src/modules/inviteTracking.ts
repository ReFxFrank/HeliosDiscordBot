import type { Collection, Guild, GuildMember, Invite } from 'discord.js';
import { prisma } from '@helios/database';
import {
  diffInviteUse,
  parseModuleConfig,
  type InviteSnapshot,
  type InviteTrackingConfig,
} from '@helios/shared';
import { brandedEmbed } from '../lib/embeds';
import type { Logger } from '../logger';

/** Per-shard cache of each guild's invite use-counts, used to diff on join. */
const inviteCache = new Map<string, InviteSnapshot[]>();

function toSnapshots(invites: Collection<string, Invite>): InviteSnapshot[] {
  return [...invites.values()].map((invite) => ({
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id ?? null,
  }));
}

async function fetchSnapshots(guild: Guild): Promise<InviteSnapshot[] | null> {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null; // missing Manage Server / no access
  const snaps = toSnapshots(invites);
  if (guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    if (vanity) {
      snaps.push({ code: guild.vanityURLCode, uses: vanity.uses ?? 0, inviterId: null });
    }
  }
  return snaps;
}

export async function cacheGuildInvites(guild: Guild): Promise<void> {
  const snaps = await fetchSnapshots(guild);
  if (snaps) inviteCache.set(guild.id, snaps);
}

export function onInviteCreate(invite: Invite): void {
  const guildId = invite.guild?.id;
  if (!guildId) return;
  const snaps = inviteCache.get(guildId) ?? [];
  inviteCache.set(guildId, [
    ...snaps.filter((snap) => snap.code !== invite.code),
    { code: invite.code, uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null },
  ]);
}

export function onInviteDelete(guildId: string | undefined, code: string): void {
  if (!guildId) return;
  const snaps = inviteCache.get(guildId);
  if (snaps)
    inviteCache.set(
      guildId,
      snaps.filter((snap) => snap.code !== code),
    );
}

async function getState(
  guildId: string,
): Promise<{ enabled: boolean; config: InviteTrackingConfig }> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'INVITE_TRACKING' } },
    select: { enabled: true, config: true },
  });
  return {
    enabled: row?.enabled ?? false,
    config: parseModuleConfig('INVITE_TRACKING', row?.config ?? {}),
  };
}

/**
 * Per-guild promise chain so concurrent joins are processed serially: each
 * join's diff sees the previous join's cache update as its baseline, instead of
 * two joins racing on the same stale snapshot.
 */
const guildLocks = new Map<string, Promise<unknown>>();

/**
 * On a member join: diff the guild's invites to find who invited them, record
 * it, and optionally post to the log channel. Serialized per guild.
 */
export async function handleInviteJoin(member: GuildMember, logger: Logger): Promise<void> {
  const guildId = member.guild.id;
  const tail = (guildLocks.get(guildId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => resolveAndRecordJoin(member, logger));
  guildLocks.set(guildId, tail);
  void tail.finally(() => {
    if (guildLocks.get(guildId) === tail) guildLocks.delete(guildId);
  });
  await tail;
}

async function resolveAndRecordJoin(member: GuildMember, logger: Logger): Promise<void> {
  const { enabled, config } = await getState(member.guild.id);
  if (!enabled) return;

  const guild = member.guild;
  // `has` distinguishes "genuinely no invites" from "never cached" (e.g. the
  // bot lacked Manage Server at startup). Without a baseline, every existing
  // invite looks incremented against [], so we can't attribute — record unknown.
  const hasBaseline = inviteCache.has(guild.id);
  const before = inviteCache.get(guild.id) ?? [];
  const after = await fetchSnapshots(guild);
  if (after) inviteCache.set(guild.id, after); // keep cache fresh regardless

  if (member.user.bot) return;
  if (!after) return; // can't determine without invite access

  const resolved = hasBaseline ? diffInviteUse(before, after) : null;
  await prisma.guild.upsert({ where: { id: guild.id }, update: {}, create: { id: guild.id } });
  await prisma.inviteUse.create({
    data: {
      guildId: guild.id,
      inviterId: resolved?.inviterId ?? null,
      invitedUserId: member.id,
      code: resolved?.code ?? null,
    },
  });

  if (!config.logChannelId) return;
  const channel =
    guild.channels.cache.get(config.logChannelId) ??
    (await guild.channels.fetch(config.logChannelId).catch(() => null));
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

  let description: string;
  if (resolved?.inviterId) {
    const count = await prisma.inviteUse.count({
      where: { guildId: guild.id, inviterId: resolved.inviterId },
    });
    description = `📥 <@${member.id}> joined — invited by <@${resolved.inviterId}> (${count} invite${count === 1 ? '' : 's'})`;
  } else {
    description = `📥 <@${member.id}> joined — inviter couldn't be determined${resolved?.code ? ' (vanity link)' : ''}`;
  }
  await channel
    .send({ embeds: [brandedEmbed({ kind: 'info', description })], allowedMentions: { parse: [] } })
    .catch((err: unknown) => logger.warn({ err, guildId: guild.id }, 'Invite-join log failed'));
}

/** Cache invites for every guild this shard owns (startup). Best-effort. */
export async function cacheAllGuildInvites(guilds: Iterable<Guild>): Promise<void> {
  for (const guild of guilds) await cacheGuildInvites(guild);
}
