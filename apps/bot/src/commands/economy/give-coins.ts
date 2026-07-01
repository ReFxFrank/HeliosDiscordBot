import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { addWallet, formatMoney, getEconomyUser } from '../../lib/economy';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('give-coins')
    .setDescription('Grant coins to a member (admin).')
    .addUserOption((o) => o.setName('user').setDescription('Who to grant coins to').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How many coins').setRequired(true).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  module: 'ECONOMY',
  preconditions: [
    RequireGuild,
    RequirePremium('ECONOMY'),
    RequireUserPermissions(PermissionFlagsBits.ManageGuild),
  ],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (target.bot) {
      await interaction.reply({
        embeds: [errorEmbed('Bots can’t hold a balance.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    // Ensure the row exists, then credit it.
    await getEconomyUser(interaction.guildId, target.id, config.startingBalance);
    await addWallet(interaction.guildId, target.id, amount);

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: `✅ Granted ${formatMoney(amount, config)} to ${target}.`,
        }),
      ],
    });
  },
};

export default command;
