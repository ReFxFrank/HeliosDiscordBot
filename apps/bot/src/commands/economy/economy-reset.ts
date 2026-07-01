import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { resetGuildEconomy } from '../../lib/economy';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('economy-reset')
    .setDescription('Wipe ALL economy balances on this server (admin).')
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('This cannot be undone — set to true to proceed.')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  module: 'ECONOMY',
  preconditions: [
    RequireGuild,
    RequirePremium('ECONOMY'),
    RequireUserPermissions(PermissionFlagsBits.ManageGuild),
  ],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.options.getBoolean('confirm', true)) {
      await interaction.reply({
        embeds: [errorEmbed('Reset cancelled — set `confirm` to true to wipe all balances.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const { count } = await resetGuildEconomy(interaction.guildId);
    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: `🗑️ Reset **${count.toLocaleString('en-US')}** economy balance${count === 1 ? '' : 's'} to zero.`,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
