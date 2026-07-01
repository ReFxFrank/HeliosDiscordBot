import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, getEconomyUser, resolveBet, settleBet } from '../../lib/economy';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Bet on a coin flip — double or nothing.')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1),
    )
    .addStringOption((o) =>
      o
        .setName('side')
        .setDescription('Heads or tails')
        .setRequired(true)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const amount = interaction.options.getInteger('amount', true);
    const side = interaction.options.getString('side', true);
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    if (!config.casino.coinflip) {
      await interaction.reply({
        embeds: [errorEmbed('Coinflip is disabled on this server.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const eco = await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);

    const bet = resolveBet(amount, eco.wallet, config.casino.maxBet, config.casino.minBet);
    if (!bet.ok) {
      await interaction.reply({ embeds: [errorEmbed(bet.error)], flags: MessageFlags.Ephemeral });
      return;
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === side;
    // Escrow the bet and pay out the win atomically (debit + credit in one tx).
    if (!(await settleBet(interaction.guildId, interaction.user.id, amount, won ? amount * 2 : 0))) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have that much in your wallet.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: won ? 'success' : 'danger',
          title: `🪙 The coin landed on ${result === 'heads' ? 'Heads' : 'Tails'}`,
          description: won
            ? `You won ${formatMoney(amount, config)}! 🎉`
            : `You lost ${formatMoney(amount, config)}.`,
        }),
      ],
    });
  },
};

export default command;
