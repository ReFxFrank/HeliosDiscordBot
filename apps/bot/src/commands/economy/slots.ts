import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, getEconomyUser, resolveBet, settleBet } from '../../lib/economy';

const REELS = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];

function spin(): string[] {
  return [0, 1, 2].map(() => REELS[Math.floor(Math.random() * REELS.length)] ?? '🍒');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine.')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const amount = interaction.options.getInteger('amount', true);
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    if (!config.casino.slots) {
      await interaction.reply({
        embeds: [errorEmbed('Slots is disabled on this server.')],
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

    const reels = spin();
    const [a, b, c] = reels;
    // Payout = TOTAL returned: 3-of-a-kind and any-pair multipliers are configurable.
    let payout = 0;
    if (a === b && b === c) payout = Math.floor(amount * config.casino.slotsTripleMultiplier);
    else if (a === b || b === c || a === c) payout = Math.floor(amount * config.casino.slotsPairMultiplier);

    // Escrow the bet and pay out atomically.
    if (!(await settleBet(interaction.guildId, interaction.user.id, amount, payout))) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have that much in your wallet.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const net = payout - amount;
    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: net > 0 ? 'success' : net === 0 ? 'info' : 'danger',
          title: `🎰  ${reels.join('  ')}`,
          description:
            net > 0
              ? `You won ${formatMoney(net, config)}!`
              : net === 0
                ? 'You broke even — bet returned.'
                : `You lost ${formatMoney(amount, config)}.`,
        }),
      ],
    });
  },
};

export default command;
