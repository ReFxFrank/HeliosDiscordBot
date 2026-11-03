import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type BaseMessageOptions,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';
import { prisma } from '@refx/database';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';
import type { Logger } from '../logger';

export interface GiveawayDeps {
  client: Client;
  logger: Logger;
}

/** Fisher–Yates pick of up to `count` distinct winners. */
export function pickWinners(entryUserIds: string[], count: number): string[] {
  const pool = [...new Set(entryUserIds)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  return pool.slice(0, Math.max(0, count));
}

export function buildGiveawayMessage(params: {
  giveawayId: string;
  prize: string;
  winnerCount: number;
  endsAt: Date;
  ended: boolean;
  winners?: string[];
}): BaseMessageOptions {
  const { giveawayId, prize, winnerCount, endsAt, ended, winners = [] } = params;
  const embed = brandedEmbed({ title: `🎉 ${prize}` });
  if (ended) {
    embed.setDescription(
      winners.length
        ? `**Winner${winners.length > 1 ? 's' : ''}:** ${winners.map((id) => `<@${id}>`).join(', ')}`
        : 'Ended — no valid entries.',
    );
  } else {
    embed.setDescription(
      [
        'Click 🎉 below to enter!',
        '',
        `**Winners:** ${winnerCount}`,
        `**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
      ].join('\n'),
    );
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('giveaway', 'enter', giveawayId))
      .setLabel('Enter')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(ended),
  );
  return { embeds: [embed], components: [row] };
}

async function resolveChannel(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
}

/** End a giveaway: draw winners, mark ended, edit the message, announce. Idempotent. */
export async function endGiveaway(giveawayId: string, deps: GiveawayDeps): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: { entries: { select: { userId: true } } },
  });
  if (!giveaway || giveaway.ended) return;

  const winners = pickWinners(
    giveaway.entries.map((entry) => entry.userId),
    giveaway.winnerCount,
  );
  await prisma.giveaway.update({ where: { id: giveawayId }, data: { ended: true } });

  const channel = await resolveChannel(deps.client, giveaway.guildId, giveaway.channelId);
  if (!channel) return;

  if (giveaway.messageId) {
    const original = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (original) {
      await original
        .edit(
          buildGiveawayMessage({
            giveawayId: giveaway.id,
            prize: giveaway.prize,
            winnerCount: giveaway.winnerCount,
            endsAt: giveaway.endsAt,
            ended: true,
            winners,
          }),
        )
        .catch(() => undefined);
    }
  }

  const announcement = winners.length
    ? `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`
    : `No valid entries for **${giveaway.prize}**.`;
  await channel
    .send({ content: announcement, allowedMentions: { users: winners } })
    .catch(() => undefined);
}

/** Reroll a (typically ended) giveaway and announce the new winners. */
export async function rerollGiveaway(giveawayId: string, deps: GiveawayDeps): Promise<string[]> {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: { entries: { select: { userId: true } } },
  });
  if (!giveaway) return [];

  const winners = pickWinners(
    giveaway.entries.map((entry) => entry.userId),
    giveaway.winnerCount,
  );
  const channel = await resolveChannel(deps.client, giveaway.guildId, giveaway.channelId);
  if (channel) {
    const announcement = winners.length
      ? `🎉 Reroll! New winner${winners.length > 1 ? 's' : ''}: ${winners.map((id) => `<@${id}>`).join(', ')} — **${giveaway.prize}**`
      : `No entries to reroll for **${giveaway.prize}**.`;
    await channel
      .send({ content: announcement, allowedMentions: { users: winners } })
      .catch(() => undefined);
  }
  return winners;
}
