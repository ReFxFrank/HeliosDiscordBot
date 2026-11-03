import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { QUEUE_NAMES } from '@refx/jobs';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { Cooldown, RequireGuild } from '../../lib/permissions';
import { parseDuration } from '../../lib/parsing';
import { reminderJobId } from '../../services/jobs';
import type { Command } from '../../framework/command';

const MIN_SECONDS = 10;
const MAX_SECONDS = 60 * 60 * 24 * 365; // 1 year
const MAX_ACTIVE_PER_USER = 25;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set personal reminders.')
    .addSubcommand((s) =>
      s
        .setName('me')
        .setDescription('Remind me after a delay.')
        .addStringOption((o) =>
          o.setName('when').setDescription('When, e.g. 10m, 2h, 1d').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('text').setDescription('What to remind you about').setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List your pending reminders.'))
    .addSubcommand((s) =>
      s
        .setName('cancel')
        .setDescription('Cancel a pending reminder.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Reminder ID (from /remind list)').setRequired(true),
        ),
    ),
  preconditions: [RequireGuild, Cooldown(5)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'me') {
      const seconds = parseDuration(interaction.options.getString('when', true));
      if (seconds === null || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
        await interaction.reply({
          embeds: [errorEmbed('Invalid time. Try `10m`, `2h`, `1d` (10s – 365d).')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const content = interaction.options.getString('text', true).slice(0, 1500);

      const active = await prisma.reminder.count({
        where: { guildId: interaction.guildId, userId: interaction.user.id },
      });
      if (active >= MAX_ACTIVE_PER_USER) {
        await interaction.reply({
          embeds: [errorEmbed(`You already have ${MAX_ACTIVE_PER_USER} reminders here.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const remindAt = new Date(Date.now() + seconds * 1000);
      const reminder = await prisma.reminder.create({
        data: {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          content,
          remindAt,
        },
      });
      await ctx.jobs.schedule(
        QUEUE_NAMES.reminder,
        'reminder',
        { reminderId: reminder.id },
        { delayMs: seconds * 1000, jobId: reminderJobId(reminder.id) },
      );

      await interaction.reply({
        embeds: [successEmbed(`I'll remind you <t:${Math.floor(remindAt.getTime() / 1000)}:R>.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'list') {
      const reminders = await prisma.reminder.findMany({
        where: { guildId: interaction.guildId, userId: interaction.user.id },
        orderBy: { remindAt: 'asc' },
        take: MAX_ACTIVE_PER_USER,
      });
      if (reminders.length === 0) {
        await interaction.reply({
          embeds: [brandedEmbed({ description: 'You have no pending reminders.' })],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const lines = reminders.map(
        (reminder) =>
          `\`${reminder.id.slice(-6)}\` · <t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R> — ${reminder.content.slice(0, 80)}`,
      );
      await interaction.reply({
        embeds: [brandedEmbed({ title: 'Your reminders', description: lines.join('\n') })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // cancel
    const idInput = interaction.options.getString('id', true).trim();
    const reminder = await prisma.reminder.findFirst({
      where: {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        OR: [{ id: idInput }, { id: { endsWith: idInput } }],
      },
    });
    if (!reminder) {
      await interaction.reply({
        embeds: [errorEmbed('No reminder of yours matches that ID.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await ctx.jobs.cancel(QUEUE_NAMES.reminder, reminderJobId(reminder.id));
    await prisma.reminder.delete({ where: { id: reminder.id } });
    await interaction.reply({
      embeds: [successEmbed('Reminder cancelled.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
