import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { formatMoney, getEconomyUser, resolveBet, settleBet } from '../../lib/economy';
import {
  ROULETTE_BET_LABEL,
  rouletteColor,
  rouletteEmoji,
  roulettePayout,
  spinRoulette,
  type RouletteBet,
} from '../../lib/casino';

const BET_TIMEOUT_MS = 30_000;

function betControls(): ActionRowBuilder<ButtonBuilder>[] {
  const button = (bet: RouletteBet): ButtonBuilder =>
    new ButtonBuilder()
      .setCustomId(bet)
      .setLabel(ROULETTE_BET_LABEL[bet])
      .setStyle(
        bet === 'red'
          ? ButtonStyle.Danger
          : bet === 'green'
            ? ButtonStyle.Success
            : ButtonStyle.Secondary,
      );
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('red'),
      button('black'),
      button('green'),
      button('even'),
      button('odd'),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(button('low'), button('high')),
  ];
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Spin the roulette wheel — pick a bet and watch it land.')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const { guildId } = interaction;
    const userId = interaction.user.id;
    const amount = interaction.options.getInteger('amount', true);
    const config = await ctx.config.getConfig(guildId, 'ECONOMY');
    const eco = await getEconomyUser(guildId, userId, config.startingBalance);

    const bet = resolveBet(amount, eco.wallet, config.maxBet);
    if (!bet.ok) {
      await interaction.reply({ embeds: [errorEmbed(bet.error)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: '🎡 Roulette',
          description: `Bet ${formatMoney(amount, config)} — pick where it lands.`,
        }),
      ],
      components: betControls(),
    });
    const message = await interaction.fetchReply();

    let choice: RouletteBet | null = null;
    try {
      const btn = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === userId,
        time: BET_TIMEOUT_MS,
      });
      choice = btn.customId as RouletteBet;
      await btn.update({
        embeds: [
          brandedEmbed({
            kind: 'default',
            title: '🎡 Spinning…',
            description: `You bet ${formatMoney(amount, config)} on **${ROULETTE_BET_LABEL[choice]}**.`,
          }),
        ],
        components: [],
      });
    } catch {
      await interaction.editReply({
        embeds: [brandedEmbed({ kind: 'info', title: '🎡 Roulette', description: 'No bet placed — timed out.' })],
        components: [],
      });
      return;
    }

    const pocket = spinRoulette();
    const payout = amount * roulettePayout(choice, pocket);
    // Escrow + payout atomically (guards against a concurrent spend since the command started).
    if (!(await settleBet(guildId, userId, amount, payout))) {
      await interaction.editReply({
        embeds: [errorEmbed("You don't have that much in your wallet anymore.")],
        components: [],
      });
      return;
    }

    // Brief cosmetic pause so the wheel feels like it spins (not a durable effect).
    await new Promise((r) => setTimeout(r, 1100));

    const won = payout > 0;
    const net = payout - amount;
    await interaction.editReply({
      embeds: [
        brandedEmbed({
          kind: won ? 'success' : 'danger',
          title: `${rouletteEmoji(pocket)} It landed on ${pocket} (${rouletteColor(pocket)})`,
          description: won
            ? `Your **${ROULETTE_BET_LABEL[choice]}** bet hit — you won ${formatMoney(net, config)}! 🎉`
            : `Your **${ROULETTE_BET_LABEL[choice]}** bet missed — you lost ${formatMoney(amount, config)}.`,
        }),
      ],
      components: [],
    });
  },
};

export default command;
