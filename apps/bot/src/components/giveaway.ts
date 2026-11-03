import { MessageFlags } from 'discord.js';
import { prisma } from '@refx/database';
import { defineComponent } from '../framework/component';
import { bumpMemberStat } from '../lib/memberStats';
import { evaluateAchievements } from '../modules/achievements';

export default defineComponent({
  module: 'giveaway',
  async handle(interaction, parsed, ctx) {
    // Modals route through this registry too; this module only owns components.
    if (interaction.isModalSubmit()) return;
    if (parsed.action !== 'enter' || !interaction.inCachedGuild()) return;
    const giveawayId = parsed.args[0];
    if (!giveawayId) return;

    const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway || giveaway.guildId !== interaction.guildId) {
      await interaction.reply({
        content: 'This giveaway no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (giveaway.ended) {
      await interaction.reply({
        content: 'This giveaway has ended.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const requirements = (giveaway.requirements as { roleIds?: string[] }) ?? {};
    const requiredRoleIds = requirements.roleIds ?? [];
    if (requiredRoleIds.length > 0) {
      const memberRoles = interaction.member.roles.cache;
      const meetsRequirement = requiredRoleIds.every((id) => memberRoles.has(id));
      if (!meetsRequirement) {
        await interaction.reply({
          content: `You need ${requiredRoleIds.map((id) => `<@&${id}>`).join(', ')} to enter.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
    }

    try {
      await prisma.giveawayEntry.create({
        data: { giveawayId: giveaway.id, userId: interaction.user.id },
      });
      await interaction.reply({
        content: '🎉 You’re entered. Good luck!',
        flags: MessageFlags.Ephemeral,
      });
      if (await ctx.config.isEnabled(interaction.guildId, 'ACHIEVEMENTS')) {
        await bumpMemberStat(interaction.guildId, interaction.user.id, 'giveawaysJoined');
        await evaluateAchievements(interaction.guildId, interaction.user.id, ctx);
      }
    } catch {
      // unique violation — already entered
      await interaction.reply({
        content: 'You’re already entered.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
});
