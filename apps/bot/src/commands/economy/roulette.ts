import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import { renderRouletteSpin, ROULETTE_SPIN_MS } from '../../lib/rouletteWheel';

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
    if (!config.casino.roulette) {
      await interaction.reply({
        embeds: [errorEmbed('Roulette is disabled on this server.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const eco = await getEconomyUser(guildId, userId, config.startingBalance);

    const bet = resolveBet(amount, eco.wallet, config.casino.maxBet, config.casino.minBet);
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

    let btn;
    try {
      btn = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === userId,
        time: BET_TIMEOUT_MS,
      });
    } catch {
      await interaction.editReply({
        embeds: [
          brandedEmbed({ kind: 'info', title: '🎡 Roulette', description: 'No bet placed — timed out.' }),
        ],
        components: [],
      });
      return;
    }
    const choice = btn.customId as RouletteBet;

    {
      const pocket = spinRoulette();
      const payout = amount * roulettePayout(choice, pocket);
      // Escrow + payout atomically BEFORE the animation (guards against a
      // concurrent spend since the command started).
      if (!(await settleBet(guildId, userId, amount, payout))) {
        await btn.update({
          embeds: [errorEmbed("You don't have that much in your wallet anymore.")],
          components: [],
        });
        return;
      }

      // The reveal happens inside the GIF: the wheel decelerates and the ball
      // lands on the real pocket, then the last frame holds. Rendered once per
      // pocket and cached, so this is instant after the first spin.
      const wheel = new AttachmentBuilder(renderRouletteSpin(pocket), { name: 'roulette.gif' });
      await btn.update({
        embeds: [
          brandedEmbed({
            kind: 'default',
            title: '🎡 Spinning…',
            description: `You bet ${formatMoney(amount, config)} on **${ROULETTE_BET_LABEL[choice]}**.`,
          }).setImage('attachment://roulette.gif'),
        ],
        files: [wheel],
        components: [],
      });

      // Let the animation play out before revealing the numbers.
      await new Promise((r) => setTimeout(r, ROULETTE_SPIN_MS + 300));

      const won = payout > 0;
      const net = payout - amount;
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: won ? 'success' : 'danger',
            title: '🎡 Roulette',
            description: won
              ? `**You won ${formatMoney(net, config)}!** 🎉`
              : `**You lost ${formatMoney(amount, config)}.**`,
          })
            .addFields(
              { name: 'Your Bet', value: ROULETTE_BET_LABEL[choice], inline: true },
              {
                name: 'Landed On',
                value: `${rouletteEmoji(pocket)} **${pocket}** (${rouletteColor(pocket)})`,
                inline: true,
              },
            )
            .setImage('attachment://roulette.gif')
            .setFooter({ text: `Bet ${amount.toLocaleString('en-US')}` }),
        ],
        components: [],
      });
    }
  },
};

export default command;
