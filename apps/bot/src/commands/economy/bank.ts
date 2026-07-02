import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, getEconomyUser, tryMoveMoney } from '../../lib/economy';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Move money between your wallet and bank.')
    .addSubcommand((s) =>
      s
        .setName('deposit')
        .setDescription('Wallet → bank.')
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('How much (leave empty for all)').setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('withdraw')
        .setDescription('Bank → wallet.')
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('How much (leave empty for all)').setMinValue(1),
        ),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const deposit = interaction.options.getSubcommand() === 'deposit';
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    const eco = await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);

    // No amount = move everything on that side. (If the balance changes between
    // this read and the move, tryMoveMoney simply fails safely below.)
    const amount = interaction.options.getInteger('amount') ?? (deposit ? eco.wallet : eco.bank);
    if (amount <= 0) {
      await interaction.reply({
        embeds: [
          errorEmbed(deposit ? 'Your wallet is empty.' : 'Your bank is empty.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await tryMoveMoney(interaction.guildId, interaction.user.id, amount, deposit))) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            deposit
              ? "You don't have that much in your wallet."
              : "You don't have that much in your bank.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description: deposit
            ? `🏦 Deposited ${formatMoney(amount, config)} into your bank.`
            : `🏦 Withdrew ${formatMoney(amount, config)} to your wallet.`,
        }),
      ],
    });
  },
};

export default command;
