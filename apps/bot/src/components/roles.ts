import { MessageFlags } from 'discord.js';
import { prisma } from '@refx/database';
import type { RolePanelMode, RolePanelOption } from '@refx/shared';
import { defineComponent } from '../framework/component';
import { buttonRoleChange, selectRoleChange, type RoleChange } from '../modules/roles';

export default defineComponent({
  module: 'roles',
  async handle(interaction, parsed, ctx) {
    // Modals route through this registry too; this module only owns components.
    if (interaction.isModalSubmit()) return;
    if (!interaction.inCachedGuild()) return;
    const panelId = parsed.args[0];
    if (!panelId) return;

    const panel = await prisma.reactionRolePanel.findUnique({ where: { id: panelId } });
    if (!panel || panel.guildId !== interaction.guildId) {
      await interaction.reply({
        content: 'This role panel no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const options = panel.options as RolePanelOption[];
    const panelRoleIds = options.map((option) => option.roleId);
    const current = new Set(interaction.member.roles.cache.keys());

    let change: RoleChange;
    if (parsed.action === 'btn') {
      const roleId = parsed.args[1];
      if (!roleId) return;
      change = buttonRoleChange(panel.mode as RolePanelMode, panelRoleIds, current, roleId);
    } else if (parsed.action === 'sel' && interaction.isStringSelectMenu()) {
      change = selectRoleChange(
        panel.mode as RolePanelMode,
        panelRoleIds,
        current,
        interaction.values,
      );
    } else {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const exists = (ids: string[]): string[] =>
      ids.filter((id) => interaction.guild.roles.cache.has(id));

    try {
      if (change.remove.length)
        await interaction.member.roles.remove(exists(change.remove), 'Role panel');
      if (change.add.length) await interaction.member.roles.add(exists(change.add), 'Role panel');
    } catch (err) {
      ctx.logger.warn({ err, guildId: interaction.guildId }, 'Role panel apply failed');
      await interaction.editReply({
        content: 'I couldn’t update your roles — check that my role is above the panel roles.',
      });
      return;
    }

    const summary =
      [
        ...change.add.map((id) => `added <@&${id}>`),
        ...change.remove.map((id) => `removed <@&${id}>`),
      ].join(', ') || 'No changes.';
    await interaction.editReply({ content: summary, allowedMentions: { parse: [] } });
  },
});
