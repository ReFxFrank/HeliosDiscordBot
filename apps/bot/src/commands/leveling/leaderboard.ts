import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { xpProgress } from '@refx/shared';
import { brandedEmbed } from '../../lib/embeds';
import { RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top members by XP.'),
  module: 'LEVELING',
  preconditions: [RequireGuild],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const top = await prisma.userLevel.findMany({
      where: { guildId: interaction.guildId },
      orderBy: { xp: 'desc' },
      take: 10,
    });
    if (top.length === 0) {
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'info', description: 'No one has earned XP yet.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = top.map((entry, index) => {
      const { level } = xpProgress(entry.xp);
      return `**${index + 1}.** <@${entry.userId}> — Level ${level} \`${entry.xp} XP\``;
    });

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: `🏆 ${interaction.guild.name} — Leaderboard`,
          description: lines.join('\n'),
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
