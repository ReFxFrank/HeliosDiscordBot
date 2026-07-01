import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@solari/database';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('achievements-reset')
    .setDescription('Reset achievement progress for a member and/or a specific achievement (admin).')
    .addUserOption((o) => o.setName('user').setDescription('Reset only this member'))
    .addStringOption((o) =>
      o.setName('achievement_id').setDescription('Reset only this achievement id'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  module: 'ACHIEVEMENTS',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ManageGuild)],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const user = interaction.options.getUser('user');
    const achievementId = interaction.options.getString('achievement_id')?.trim();
    if (!user && !achievementId) {
      await interaction.reply({
        embeds: [errorEmbed('Provide a member and/or an achievement id to reset.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const where = {
      guildId: interaction.guildId,
      ...(user ? { userId: user.id } : {}),
      ...(achievementId ? { achievementId } : {}),
    };
    const { count } = await prisma.userAchievement.deleteMany({ where });

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description:
            `🗑️ Reset **${count.toLocaleString('en-US')}** achievement unlock${count === 1 ? '' : 's'}` +
            `${user ? ` for ${user}` : ''}${achievementId ? ` (\`${achievementId}\`)` : ''}.`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
