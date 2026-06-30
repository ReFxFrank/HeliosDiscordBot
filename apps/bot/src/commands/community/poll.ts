import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { QUEUE_NAMES } from '@helios/jobs';
import { prisma, type Prisma } from '@helios/database';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { parseDuration, formatDuration } from '../../lib/parsing';
import { pollJobId } from '../../services/jobs';
import { MAX_POLL_OPTIONS, buildPollMessage, endPoll } from '../../modules/polls';
import type { Command } from '../../framework/command';

const MAX_SECONDS = 60 * 60 * 24 * 14; // 14 days

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage polls.')
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a poll in this channel.')
        .addStringOption((o) =>
          o.setName('question').setDescription('The poll question').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('options').setDescription('Options separated by | (2–10)').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('duration').setDescription('Auto-close after, e.g. 1h, 2d'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('end')
        .setDescription('Close a poll now.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Poll message ID').setRequired(true),
        ),
    ),
  module: 'POLLS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'end') {
      const idInput = interaction.options.getString('id', true).trim();
      const poll = await prisma.poll.findFirst({
        where: { guildId: interaction.guildId, OR: [{ id: idInput }, { messageId: idInput }] },
      });
      if (!poll) {
        await interaction.reply({
          embeds: [errorEmbed('No poll found with that ID.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await ctx.jobs.cancel(QUEUE_NAMES.pollEnd, pollJobId(poll.id));
      await endPoll(poll.id, { client: ctx.client, logger: ctx.logger });
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'success', description: 'Poll closed.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({
        embeds: [errorEmbed('Use this in a server text channel.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const question = interaction.options.getString('question', true);
    const options = interaction.options
      .getString('options', true)
      .split('|')
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, MAX_POLL_OPTIONS);
    if (options.length < 2) {
      await interaction.reply({
        embeds: [errorEmbed('Provide at least 2 options separated by `|`.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const durationInput = interaction.options.getString('duration');
    let endsAt: Date | null = null;
    if (durationInput) {
      const seconds = parseDuration(durationInput);
      if (seconds === null || seconds <= 0 || seconds > MAX_SECONDS) {
        await interaction.reply({
          embeds: [errorEmbed('Invalid duration. Try `1h`, `2d` (max 14 days).')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      endsAt = new Date(Date.now() + seconds * 1000);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const poll = await prisma.poll.create({
      data: {
        guildId: interaction.guildId,
        channelId: channel.id,
        question,
        options: options as unknown as Prisma.InputJsonValue,
        endsAt,
        createdBy: interaction.user.id,
      },
    });
    const sent = await channel
      .send(
        buildPollMessage({ pollId: poll.id, question, options, votes: [], ended: false, endsAt }),
      )
      .catch(() => null);
    if (!sent) {
      await interaction.editReply({ embeds: [errorEmbed('I couldn’t post the poll message.')] });
      return;
    }
    await prisma.poll.update({ where: { id: poll.id }, data: { messageId: sent.id } });
    if (endsAt) {
      await ctx.jobs.schedule(
        QUEUE_NAMES.pollEnd,
        'pollEnd',
        { pollId: poll.id },
        { delayMs: endsAt.getTime() - Date.now(), jobId: pollJobId(poll.id) },
      );
    }
    await interaction.editReply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: endsAt
            ? `Poll created — closes in ${formatDuration(Math.floor((endsAt.getTime() - Date.now()) / 1000))}.`
            : 'Poll created.',
        }),
      ],
    });
  },
};

export default command;
