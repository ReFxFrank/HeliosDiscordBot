import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@helios/database';
import { isValidMonthDay, parseModuleConfig } from '@helios/shared';
import { brandedEmbed, errorEmbed, successEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import { scheduleNextBirthdayRun } from '../../modules/birthdays';
import type { Command } from '../../framework/command';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Manage your birthday.')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set your birthday.')
        .addIntegerOption((o) =>
          o
            .setName('month')
            .setDescription('Month (1–12)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o
            .setName('day')
            .setDescription('Day (1–31)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31),
        ),
    )
    .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday.'))
    .addSubcommand((s) => s.setName('list').setDescription('Upcoming birthdays this month.')),
  module: 'BIRTHDAYS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const month = interaction.options.getInteger('month', true);
      const day = interaction.options.getInteger('day', true);
      if (!isValidMonthDay(month, day)) {
        await interaction.reply({
          embeds: [errorEmbed('That isn’t a valid date.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await prisma.guild.upsert({
        where: { id: interaction.guildId },
        update: {},
        create: { id: interaction.guildId },
      });
      await prisma.birthday.upsert({
        where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
        update: { month, day },
        create: { guildId: interaction.guildId, userId: interaction.user.id, month, day },
      });
      // Ensure the daily job is armed for this guild.
      const config = parseModuleConfig(
        'BIRTHDAYS',
        (
          await prisma.guildModuleConfig.findUnique({
            where: { guildId_module: { guildId: interaction.guildId, module: 'BIRTHDAYS' } },
            select: { config: true },
          })
        )?.config ?? {},
      );
      await scheduleNextBirthdayRun(interaction.guildId, config, ctx.jobs);
      await interaction.reply({
        embeds: [successEmbed(`Birthday set to **${MONTHS[month - 1]} ${day}**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'remove') {
      await prisma.birthday.deleteMany({
        where: { guildId: interaction.guildId, userId: interaction.user.id },
      });
      await interaction.reply({
        embeds: [successEmbed('Birthday removed.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // list — this month, ordered by day
    const month = new Date().getUTCMonth() + 1;
    const rows = await prisma.birthday.findMany({
      where: { guildId: interaction.guildId, month },
      orderBy: { day: 'asc' },
      take: 50,
    });
    await interaction.reply({
      embeds: [
        brandedEmbed({
          title: `🎂 Birthdays in ${MONTHS[month - 1]}`,
          description: rows.length
            ? rows
                .map((row) => `**${row.day}** — <@${row.userId}>`)
                .join('\n')
                .slice(0, 4000)
            : 'No birthdays set for this month yet.',
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
