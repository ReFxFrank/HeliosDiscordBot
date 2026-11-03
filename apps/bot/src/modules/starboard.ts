import type { Message, MessageReaction, PartialMessageReaction } from 'discord.js';
import { prisma } from '@refx/database';
import { starboardAction, type StarboardConfig } from '@refx/shared';
import { brandedEmbed } from '../lib/embeds';
import type { BotContext } from '../framework/context';

function emojiMatches(
  emoji: { id: string | null; name: string | null },
  configured: string,
): boolean {
  const idMatch = configured.match(/(\d{17,})/);
  if (idMatch) return emoji.id === idMatch[1];
  return emoji.name === configured;
}

function buildEmbed(message: Message) {
  const embed = brandedEmbed({ description: message.content || undefined })
    .setAuthor({
      name: message.author?.tag ?? 'Unknown',
      iconURL: message.author?.displayAvatarURL(),
    })
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})` })
    .setTimestamp(message.createdAt);
  const image = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (image) embed.setImage(image.url);
  return embed;
}

/** Recompute a message's star count and create/update/remove its board entry. */
export async function handleStarReaction(
  reaction: MessageReaction | PartialMessageReaction,
  ctx: BotContext,
): Promise<void> {
  let full: MessageReaction | PartialMessageReaction = reaction;
  if (full.partial) {
    const fetched = await full.fetch().catch(() => null);
    if (!fetched) return;
    full = fetched;
  }

  let message = full.message;
  if (message.partial) {
    const fetched = await message.fetch().catch(() => null);
    if (!fetched) return;
    message = fetched;
  }
  if (!message.guild) return;

  const guildId = message.guild.id;
  if (!(await ctx.config.isEnabled(guildId, 'STARBOARD'))) return;
  const config: StarboardConfig = await ctx.config.getConfig(guildId, 'STARBOARD');
  if (!config.channelId) return;
  if (!emojiMatches(full.emoji, config.emoji)) return;
  if (message.channelId === config.channelId) return; // don't star the board itself
  if (config.ignoredChannelIds.includes(message.channelId)) return;

  let count = full.count ?? 0;
  if (!config.selfStar && message.author) {
    const users = await full.users.fetch().catch(() => null);
    if (users?.has(message.author.id)) count -= 1;
  }
  count = Math.max(0, count);

  const existing = await prisma.starboardMessage.findUnique({
    where: { guildId_sourceMessageId: { guildId, sourceMessageId: message.id } },
  });
  const action = starboardAction(count, config.threshold, Boolean(existing));
  if (action === 'none') return;

  const board =
    message.guild.channels.cache.get(config.channelId) ??
    (await message.guild.channels.fetch(config.channelId).catch(() => null));
  if (!board || !board.isTextBased() || board.isDMBased()) return;

  if (action === 'remove') {
    if (existing?.starboardMessageId) {
      await board.messages.delete(existing.starboardMessageId).catch(() => undefined);
    }
    if (existing)
      await prisma.starboardMessage.delete({ where: { id: existing.id } }).catch(() => undefined);
    return;
  }

  const content = `${config.emoji} **${count}** · <#${message.channelId}>`;
  const fullMessage = message as Message;
  const embed = buildEmbed(fullMessage);

  if (action === 'update' && existing?.starboardMessageId) {
    const boardMessage = await board.messages.fetch(existing.starboardMessageId).catch(() => null);
    if (boardMessage) {
      await boardMessage.edit({ content, embeds: [embed] }).catch(() => undefined);
      await prisma.starboardMessage.update({ where: { id: existing.id }, data: { count } });
      return;
    }
  }

  const sent = await board.send({ content, embeds: [embed] }).catch(() => null);
  if (!sent) return;
  await prisma.starboardMessage.upsert({
    where: { guildId_sourceMessageId: { guildId, sourceMessageId: message.id } },
    update: { starboardMessageId: sent.id, count, sourceChannelId: message.channelId },
    create: {
      guildId,
      sourceMessageId: message.id,
      sourceChannelId: message.channelId,
      starboardMessageId: sent.id,
      count,
    },
  });
}
