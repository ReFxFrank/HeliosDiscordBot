import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import { xpProgress } from '@refx/shared';
import { brandedEmbed } from '../../lib/embeds';
import { renderRankCard } from '../../lib/rankCard';
import { RequireGuild } from '../../lib/permissions';
import type { Command } from '../../framework/command';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and XP.')
    .addUserOption((o) => o.setName('user').setDescription('Whose rank to show')),
  module: 'LEVELING',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user') ?? interaction.user;

    const userLevel = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: target.id } },
    });
    if (!userLevel) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'info',
            description: `${target.username} hasn’t earned any XP yet.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rank =
      (await prisma.userLevel.count({
        where: { guildId: interaction.guildId, xp: { gt: userLevel.xp } },
      })) + 1;
    const { level, current, needed } = xpProgress(userLevel.xp);

    const fallbackEmbed = brandedEmbed({
      kind: 'info',
      title: `${target.username} — Level ${level}`,
      description: [
        `**Rank:** #${rank}`,
        `**Progress:** ${current} / ${needed} XP`,
        `**Total XP:** ${userLevel.xp}`,
        `**Messages:** ${userLevel.messages}`,
      ].join('\n'),
    });

    const config = await ctx.config.getConfig(interaction.guildId, 'LEVELING');
    if (!config.cardEnabled) {
      await interaction.reply({ embeds: [fallbackEmbed] });
      return;
    }

    await interaction.deferReply();
    try {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      const png = await renderRankCard({
        displayName: member?.displayName ?? target.displayName ?? target.username,
        username: target.username,
        avatarUrl: (member ?? target).displayAvatarURL({ extension: 'png', size: 256 }),
        level,
        rank,
        currentXp: current,
        neededXp: needed,
        totalXp: userLevel.xp,
      });
      await interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'rank.png' })] });
    } catch (err) {
      // A canvas/render/network failure must never swallow the command.
      ctx.logger.warn({ err, guildId: interaction.guildId }, 'Rank card render failed');
      await interaction.editReply({ embeds: [fallbackEmbed] });
    }
  },
};

export default command;
