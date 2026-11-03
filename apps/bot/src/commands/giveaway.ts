import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { QUEUE_NAMES } from '@refx/jobs';
import { prisma } from '@refx/database';
import { brandedEmbed, errorEmbed } from '../lib/embeds';
import { RequireGuild, RequireUserPermissions } from '../lib/permissions';
import { parseDuration, formatDuration } from '../lib/parsing';
import { giveawayJobId } from '../services/jobs';
import { buildGiveawayMessage, endGiveaway, rerollGiveaway } from '../modules/giveaway';
import type { Command } from '../framework/command';

const MAX_SECONDS = 60 * 60 * 24 * 60; // 60 days

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways.')
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Start a giveaway in this channel.')
        .addStringOption((o) =>
          o.setName('prize').setDescription('What to give away').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('duration').setDescription('Duration, e.g. 1h, 2d').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('winners')
            .setDescription('Number of winners (default 1)')
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addRoleOption((o) => o.setName('required_role').setDescription('Role required to enter')),
    )
    .addSubcommand((s) =>
      s
        .setName('end')
        .setDescription('End a giveaway now.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Giveaway message ID').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('Reroll a giveaway’s winners.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Giveaway message ID').setRequired(true),
        ),
    ),
  module: 'GIVEAWAYS',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ManageGuild)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({
          embeds: [errorEmbed('Use this in a server text channel.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const prize = interaction.options.getString('prize', true);
      const durationSeconds = parseDuration(interaction.options.getString('duration', true));
      if (durationSeconds === null || durationSeconds <= 0 || durationSeconds > MAX_SECONDS) {
        await interaction.reply({
          embeds: [errorEmbed('Invalid duration. Try `1h`, `2d`, `1w` (max 60 days).')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const winnerCount = interaction.options.getInteger('winners') ?? 1;
      const requiredRole = interaction.options.getRole('required_role');
      const endsAt = new Date(Date.now() + durationSeconds * 1000);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const giveaway = await prisma.giveaway.create({
        data: {
          guildId: interaction.guildId,
          channelId: channel.id,
          prize,
          winnerCount,
          requirements: requiredRole ? { roleIds: [requiredRole.id] } : {},
          endsAt,
          createdBy: interaction.user.id,
        },
      });

      const sent = await channel
        .send(
          buildGiveawayMessage({
            giveawayId: giveaway.id,
            prize,
            winnerCount,
            endsAt,
            ended: false,
          }),
        )
        .catch(() => null);
      if (!sent) {
        await interaction.editReply({
          embeds: [errorEmbed('I couldn’t post the giveaway message.')],
        });
        return;
      }
      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: sent.id } });
      await ctx.jobs.schedule(
        QUEUE_NAMES.giveawayEnd,
        'giveawayEnd',
        { giveawayId: giveaway.id },
        { delayMs: durationSeconds * 1000, jobId: giveawayJobId(giveaway.id) },
      );

      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            description: `Giveaway for **${prize}** started — ends in ${formatDuration(durationSeconds)}.`,
          }),
        ],
      });
      return;
    }

    const idInput = interaction.options.getString('id', true).trim();
    const giveaway = await prisma.giveaway.findFirst({
      where: { guildId: interaction.guildId, OR: [{ id: idInput }, { messageId: idInput }] },
    });
    if (!giveaway) {
      await interaction.reply({
        embeds: [errorEmbed('No giveaway found with that ID.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (sub === 'end') {
      await ctx.jobs.cancel(QUEUE_NAMES.giveawayEnd, giveawayJobId(giveaway.id));
      await endGiveaway(giveaway.id, { client: ctx.client, logger: ctx.logger });
      await interaction.editReply({
        embeds: [brandedEmbed({ kind: 'success', description: 'Giveaway ended.' })],
      });
    } else {
      const winners = await rerollGiveaway(giveaway.id, { client: ctx.client, logger: ctx.logger });
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            description: winners.length
              ? 'Rerolled — new winners announced.'
              : 'No entries to reroll.',
          }),
        ],
      });
    }
  },
};

export default command;
