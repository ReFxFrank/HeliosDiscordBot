import { prisma } from '@solari/database';
import type { Client, Guild } from 'discord.js';

/** Upsert a guild's metadata mirror (§4.4) from a gateway Guild object. */
export async function upsertGuildMeta(guild: Guild): Promise<void> {
  const data = {
    name: guild.name,
    icon: guild.icon,
    ownerId: guild.ownerId,
    memberCount: guild.memberCount,
    // We're in this guild right now — clear any stale "bot was kicked" marker
    // (set by guildDelete) so the dashboard offers it again after a re-invite.
    leftAt: null,
  };
  await prisma.guild.upsert({
    where: { id: guild.id },
    update: data,
    create: { id: guild.id, joinedAt: guild.joinedAt ?? new Date(), ...data },
  });
}

/**
 * Backfill the guild-metadata mirror for every guild this shard is currently in.
 * `guildCreate` only fires for joins that happen while the bot is online, so a
 * guild the bot was already in at startup would otherwise have no `Guild` row —
 * which makes the dashboard show "Invite" for a server the bot is actually in.
 * Run on ClientReady. Per-guild failures are isolated so one bad row can't abort
 * the rest.
 */
export async function syncAllGuilds(client: Client): Promise<void> {
  const guilds = [...client.guilds.cache.values()];
  await Promise.all(guilds.map((guild) => upsertGuildMeta(guild).catch(() => undefined)));
}

/**
 * Debounced member-count refresh. Member add/remove can burst, so we coalesce
 * updates per guild. This is a best-effort cache refresh, NOT a durable
 * scheduled effect, so an in-memory timer is appropriate here (it does not need
 * to survive a restart — the count is re-read on the next event or guildCreate).
 */
const pending = new Map<string, NodeJS.Timeout>();

export function scheduleMemberCountSync(guild: Guild, delayMs = 30_000): void {
  const existing = pending.get(guild.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pending.delete(guild.id);
    void prisma.guild
      .update({ where: { id: guild.id }, data: { memberCount: guild.memberCount } })
      .catch(() => {
        /* guild row may not exist yet; guildCreate will create it */
      });
  }, delayMs);
  timer.unref();
  pending.set(guild.id, timer);
}
