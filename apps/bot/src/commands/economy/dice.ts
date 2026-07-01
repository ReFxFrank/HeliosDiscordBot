import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, getEconomyUser, resolveBet, settleBet } from '../../lib/economy';
import { renderDice, rollDice } from '../../lib/casino';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll two dice against the house — highest total wins.')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const amount = interaction.options.getInteger('amount', true);
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    if (!config.casino.dice) {
      await interaction.reply({
        embeds: [errorEmbed('Dice is disabled on this server.')],
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

    const you = rollDice();
    const house = rollDice();
    // Higher total wins 2×; a tie goes to the house (the house edge).
    const won = you.total > house.total;
    const payout = won ? amount * 2 : 0;

    if (!(await settleBet(interaction.guildId, interaction.user.id, amount, payout))) {
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
          title: '🎲 Dice',
          description: won
            ? `**You won ${formatMoney(amount, config)}!** 🎉`
            : `**You lost ${formatMoney(amount, config)}.**`,
        }).addFields(
          { name: 'Your Roll', value: `${renderDice(you.dice)}\n**Total:** ${you.total}`, inline: true },
          {
            name: 'House Roll',
            value: `${renderDice(house.dice)}\n**Total:** ${house.total}`,
            inline: true,
          },
        ),
      ],
    });
  },
};

export default command;
