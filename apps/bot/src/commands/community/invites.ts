import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@helios/database';
import { brandedEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite tracking.')
    .addSubcommand((s) =>
      s
        .setName('count')
        .setDescription('How many members someone has invited.')
        .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
    )
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Top inviters in this server.')),
  module: 'INVITE_TRACKING',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'count') {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const count = await prisma.inviteUse.count({
        where: { guildId: interaction.guildId, inviterId: user.id },
      });
      await interaction.reply({
        embeds: [
          brandedEmbed({
            description: `<@${user.id}> has invited **${count}** member${count === 1 ? '' : 's'}.`,
          }),
        ],
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const grouped = await prisma.inviteUse.groupBy({
      by: ['inviterId'],
      where: { guildId: interaction.guildId, inviterId: { not: null } },
      _count: { inviterId: true },
      orderBy: { _count: { inviterId: 'desc' } },
      take: 10,
    });
    const lines = grouped.map(
      (row, index) => `**${index + 1}.** <@${row.inviterId}> — ${row._count.inviterId}`,
    );
    await interaction.reply({
      embeds: [
        brandedEmbed({
          title: '📨 Invite leaderboard',
          description: lines.length ? lines.join('\n') : 'No tracked invites yet.',
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
