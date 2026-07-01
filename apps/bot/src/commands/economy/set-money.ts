import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium, RequireUserPermissions } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, setBalance, type BalanceField } from '../../lib/economy';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('set-money')
    .setDescription('Set a member’s balance to an exact amount (admin).')
    .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('New balance')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(1_000_000_000),
    )
    .addStringOption((o) =>
      o
        .setName('where')
        .setDescription('Cash or bank (default: cash)')
        .addChoices({ name: 'Cash', value: 'cash' }, { name: 'Bank', value: 'bank' }),
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
    const field: BalanceField =
      interaction.options.getString('where') === 'bank' ? 'bank' : 'wallet';
    const where = field === 'wallet' ? 'cash' : 'bank';
    if (target.bot) {
      await interaction.reply({
        embeds: [errorEmbed('Bots can’t hold a balance.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    await setBalance(interaction.guildId, target.id, amount, field, config.startingBalance);
    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: `✅ Set ${target}'s ${where} to ${formatMoney(amount, config)}.`,
        }),
      ],
    });
  },
};

export default command;
