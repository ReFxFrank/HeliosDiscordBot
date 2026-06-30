import type { Client, Message } from 'discord.js';
import { prisma } from '@helios/database';
import { brandedEmbed } from '../lib/embeds';

/**
 * Per-shard set of `${guildId}:${userId}` who are currently AFK, so the message
 * listener decides with an O(1) lookup instead of a query per message. Loaded
 * on boot by `reconcileAfk` and kept in sync by set/clear.
 */
const afkKeys = new Set<string>();
const key = (guildId: string, userId: string): string => `${guildId}:${userId}`;

export async function setAfk(
  guildId: string,
  userId: string,
  reason: string | null,
): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  await prisma.afk.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { reason, since: new Date() },
    create: { guildId, userId, reason },
  });
  afkKeys.add(key(guildId, userId));
}

export async function reconcileAfk(client: Client): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  if (guildIds.length === 0) return;
  const rows = await prisma.afk.findMany({
    where: { guildId: { in: guildIds } },
    select: { guildId: true, userId: true },
  });
  afkKeys.clear();
  for (const row of rows) afkKeys.add(key(row.guildId, row.userId));
}

/**
 * On a guild message: clear the author's AFK if set (welcome back), and notify
 * about any AFK users they mentioned. Cheap — only touches the DB on a set hit.
 */
export async function handleAfkMessage(message: Message<true>): Promise<void> {
  const authorKey = key(message.guildId, message.author.id);
  if (afkKeys.has(authorKey)) {
    afkKeys.delete(authorKey);
    const removed = await prisma.afk
      .deleteMany({ where: { guildId: message.guildId, userId: message.author.id } })
      .catch(() => ({ count: 0 }));
    if (removed.count > 0) {
      await message
        .reply({
          embeds: [
            brandedEmbed({ kind: 'success', description: `Welcome back — removed your AFK.` }),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
    }
  }

  const mentioned = message.mentions.users.filter((user) =>
    afkKeys.has(key(message.guildId, user.id)),
  );
  if (mentioned.size === 0) return;
  const ids = [...mentioned.keys()].slice(0, 5);
  const records = await prisma.afk.findMany({
    where: { guildId: message.guildId, userId: { in: ids } },
    select: { userId: true, reason: true },
  });
  if (records.length === 0) return;
  const lines = records.map(
    (record) => `💤 <@${record.userId}> is AFK${record.reason ? `: ${record.reason}` : ''}`,
  );
  await message
    .reply({
      embeds: [brandedEmbed({ description: lines.join('\n') })],
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
}
