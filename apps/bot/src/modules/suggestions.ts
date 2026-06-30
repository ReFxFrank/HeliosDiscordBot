import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type BaseMessageOptions,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';
import { prisma, type SuggestionStatus } from '@helios/database';
import { parseModuleConfig, type SuggestionsConfig } from '@helios/shared';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';
import type { Logger } from '../logger';

export interface SuggestionDeps {
  client: Client;
  logger: Logger;
}

type EmbedKind = 'info' | 'success' | 'danger';
const STATUS_META: Record<SuggestionStatus, { label: string; emoji: string; kind: EmbedKind }> = {
  PENDING: { label: 'Pending', emoji: '🗳️', kind: 'info' },
  APPROVED: { label: 'Approved', emoji: '✅', kind: 'success' },
  DENIED: { label: 'Denied', emoji: '⛔', kind: 'danger' },
  IMPLEMENTED: { label: 'Implemented', emoji: '🚀', kind: 'success' },
};

export async function getSuggestionsConfig(guildId: string): Promise<SuggestionsConfig> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'SUGGESTIONS' } },
    select: { config: true },
  });
  return parseModuleConfig('SUGGESTIONS', row?.config ?? {});
}

export interface SuggestionView {
  id: string;
  number: number;
  authorId: string;
  content: string;
  status: SuggestionStatus;
  up: number;
  down: number;
  staffId: string | null;
  staffReason: string | null;
}

export function buildSuggestionMessage(
  suggestion: SuggestionView,
  anonymous: boolean,
): BaseMessageOptions {
  const meta = STATUS_META[suggestion.status];
  const embed = brandedEmbed({
    kind: meta.kind,
    title: `Suggestion #${suggestion.number} — ${meta.emoji} ${meta.label}`,
  })
    .setDescription(suggestion.content.slice(0, 4000))
    .addFields({
      name: 'Votes',
      value: `👍 ${suggestion.up}  👎 ${suggestion.down}`,
      inline: true,
    });
  if (!anonymous) embed.addFields({ name: 'By', value: `<@${suggestion.authorId}>`, inline: true });
  if (suggestion.staffId) {
    embed.addFields({
      name: `${meta.label} by`,
      value:
        `<@${suggestion.staffId}>${suggestion.staffReason ? ` — ${suggestion.staffReason}` : ''}`.slice(
          0,
          1024,
        ),
    });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('suggestion', 'up', suggestion.id))
      .setEmoji('👍')
      .setLabel(String(suggestion.up))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildCustomId('suggestion', 'down', suggestion.id))
      .setEmoji('👎')
      .setLabel(String(suggestion.down))
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
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

async function tallyVotes(suggestionId: string): Promise<{ up: number; down: number }> {
  const votes = await prisma.suggestionVote.findMany({
    where: { suggestionId },
    select: { value: true },
  });
  let up = 0;
  let down = 0;
  for (const vote of votes) {
    if (vote.value > 0) up += 1;
    else down += 1;
  }
  return { up, down };
}

async function refreshSuggestionMessage(suggestionId: string, deps: SuggestionDeps): Promise<void> {
  const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion || !suggestion.messageId) return;
  const { up, down } = await tallyVotes(suggestionId);
  const { anonymous } = await getSuggestionsConfig(suggestion.guildId);
  const channel = await resolveChannel(deps.client, suggestion.guildId, suggestion.channelId);
  if (!channel) return;
  const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
  if (!message) return;
  await message
    .edit(buildSuggestionMessage({ ...suggestion, up, down }, anonymous))
    .catch(() => undefined);
}

/** Create a suggestion, post it, and return its per-guild number (or null). */
export async function createSuggestion(
  guildId: string,
  channelId: string,
  authorId: string,
  content: string,
  anonymous: boolean,
  deps: SuggestionDeps,
): Promise<number | null> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  const { suggestionCounter: number } = await prisma.guild.update({
    where: { id: guildId },
    data: { suggestionCounter: { increment: 1 } },
    select: { suggestionCounter: true },
  });

  const suggestion = await prisma.suggestion.create({
    data: { guildId, channelId, number, authorId, content },
  });

  const channel = await resolveChannel(deps.client, guildId, channelId);
  if (!channel) return number;
  const sent = await channel
    .send(buildSuggestionMessage({ ...suggestion, up: 0, down: 0 }, anonymous))
    .catch(() => null);
  if (sent)
    await prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: sent.id } });
  return number;
}

/** Cast or change a vote (+1/-1) on a suggestion, then refresh the message. */
export async function voteSuggestion(
  suggestionId: string,
  userId: string,
  value: 1 | -1,
  deps: SuggestionDeps,
): Promise<void> {
  await prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    update: { value },
    create: { suggestionId, userId, value },
  });
  await refreshSuggestionMessage(suggestionId, deps);
}

/** Move a suggestion to a new status (staff action), then refresh the message. */
export async function setSuggestionStatus(
  guildId: string,
  number: number,
  status: SuggestionStatus,
  staffId: string,
  reason: string | null,
  deps: SuggestionDeps,
): Promise<boolean> {
  const suggestion = await prisma.suggestion.findUnique({
    where: { guildId_number: { guildId, number } },
  });
  if (!suggestion) return false;
  await prisma.suggestion.update({
    where: { id: suggestion.id },
    data: { status, staffId, staffReason: reason },
  });
  await refreshSuggestionMessage(suggestion.id, deps);
  return true;
}
