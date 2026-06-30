import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type BaseMessageOptions,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';
import { prisma } from '@helios/database';
import { pollBar, tallyPoll } from '@helios/shared';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';
import type { Logger } from '../logger';

export interface PollDeps {
  client: Client;
  logger: Logger;
}

export const POLL_LETTERS = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'] as const;
export const MAX_POLL_OPTIONS = POLL_LETTERS.length;

export function buildPollMessage(params: {
  pollId: string;
  question: string;
  options: string[];
  votes: { optionIndex: number }[];
  ended: boolean;
  endsAt?: Date | null;
}): BaseMessageOptions {
  const { pollId, question, options, votes, ended, endsAt } = params;
  const tally = tallyPoll(options, votes);
  const showResults = ended || votes.length > 0;

  const lines = tally.map((entry) => {
    const head = `${POLL_LETTERS[entry.index]} **${entry.label}**`;
    return showResults
      ? `${head}\n\`${pollBar(entry.percent)}\` ${entry.percent}% (${entry.count})`
      : head;
  });

  const embed = brandedEmbed({
    kind: ended ? 'default' : 'info',
    title: `📊 ${question}`,
  }).setDescription(lines.join('\n\n').slice(0, 4000));
  if (ended)
    embed.setFooter({ text: `Poll closed · ${votes.length} vote${votes.length === 1 ? '' : 's'}` });
  else if (endsAt)
    embed.addFields({ name: '​', value: `Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>` });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < options.length; start += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = start; i < Math.min(start + 5, options.length); i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId('poll', 'vote', pollId, String(i)))
          .setEmoji(POLL_LETTERS[i] as string)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ended),
      );
    }
    rows.push(row);
  }

  return { embeds: [embed], components: ended ? [] : rows };
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

/** Close a poll: mark ended, edit the message with final results. Idempotent. */
export async function endPoll(pollId: string, deps: PollDeps): Promise<void> {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { votes: { select: { optionIndex: true } } },
  });
  if (!poll || poll.ended) return;
  await prisma.poll.update({ where: { id: pollId }, data: { ended: true } });

  const channel = await resolveChannel(deps.client, poll.guildId, poll.channelId);
  if (!channel || !poll.messageId) return;
  const message = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (!message) return;
  await message
    .edit(
      buildPollMessage({
        pollId: poll.id,
        question: poll.question,
        options: poll.options as string[],
        votes: poll.votes,
        ended: true,
      }),
    )
    .catch(() => undefined);
}
