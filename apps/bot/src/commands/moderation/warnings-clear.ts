import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { prisma } from '@refx/database';
import type { Command } from '../../framework/command';
import { RequireGuild, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { postModLog } from '../../lib/moderation';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings-clear')
    .setDescription('Clear a member’s active warnings (history is kept, escalations reset).')
    .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('Why the warnings are being cleared'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  module: 'MODERATION',
  preconditions: [RequireGuild, RequireUserPermissions(PermissionFlagsBits.ModerateMembers)],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    // Deactivate rather than delete: /warnings still shows the full history,
    // but the active count (which drives automod escalations) drops to zero.
    const { count } = await prisma.moderationCase.updateMany({
      where: { guildId: interaction.guildId, targetId: target.id, type: 'WARN', active: true },
      data: { active: false },
    });

    if (count === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'info',
            description: `${target} has no active warnings to clear.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = brandedEmbed({
      kind: 'success',
      title: '🧹 Warnings cleared',
      description: [
        `**User:** ${target.tag} (\`${target.id}\`)`,
        `**Cleared:** ${count} active warning${count === 1 ? '' : 's'}`,
        `**Moderator:** ${interaction.user.tag}`,
        `**Reason:** ${reason}`,
      ].join('\n'),
    });
    await interaction.reply({ embeds: [embed] });

    const config = await ctx.config.getConfig(interaction.guildId, 'MODERATION');
    await postModLog(ctx, interaction.guildId, config, embed);
  },
};

export default command;
