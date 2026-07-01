import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
} from 'discord.js';
import type { EconomyConfig } from '@solari/shared';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { addWallet, formatMoney, getEconomyUser, resolveBet, trySpendWallet } from '../../lib/economy';
import {
  createDeck,
  handValue,
  isBlackjack,
  isBust,
  playDealer,
  renderHand,
  settleBlackjack,
  shuffle,
  type Card,
} from '../../lib/casino';

const DECISION_TIMEOUT_MS = 60_000;

function controls(canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
  );
  if (canDouble) {
    row.addComponents(
      new ButtonBuilder().setCustomId('double').setLabel('Double').setStyle(ButtonStyle.Success),
    );
  }
  return row;
}

function activeEmbed(player: Card[], dealer: Card[], config: EconomyConfig, stake: number) {
  return brandedEmbed({
    kind: 'default',
    title: '🃏 Blackjack',
    description:
      `**Your hand** (${handValue(player)})\n${renderHand(player)}\n\n` +
      `**Dealer shows**\n${renderHand([dealer[0] as Card])}  🂠\n\n` +
      `Bet: ${formatMoney(stake, config)} · Make your move.`,
  });
}

const OUTCOME_TEXT = {
  player_blackjack: { kind: 'success' as const, title: '🃏 Blackjack! 🎉' },
  player_win: { kind: 'success' as const, title: '🃏 You win! 🎉' },
  push: { kind: 'info' as const, title: '🃏 Push — bet returned.' },
  dealer_win: { kind: 'danger' as const, title: '🃏 Dealer wins.' },
};

function finalEmbed(
  player: Card[],
  dealer: Card[],
  outcome: keyof typeof OUTCOME_TEXT,
  stake: number,
  payout: number,
  config: EconomyConfig,
) {
  const net = payout - stake;
  const meta = OUTCOME_TEXT[outcome];
  const line =
    net > 0
      ? `You won ${formatMoney(net, config)}!`
      : net === 0
        ? 'Your bet was returned.'
        : `You lost ${formatMoney(stake, config)}.`;
  return brandedEmbed({
    kind: meta.kind,
    title: meta.title,
    description:
      `**Your hand** (${handValue(player)})\n${renderHand(player)}\n\n` +
      `**Dealer** (${handValue(dealer)})\n${renderHand(dealer)}\n\n${line}`,
  });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack against the dealer.')
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
    // Escrow the bet up-front so it can't be double-spent by a concurrent command.
    if (!(await trySpendWallet(guildId, userId, amount))) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have that much in your wallet.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const deck = shuffle(createDeck());
    const player: Card[] = [deck.pop() as Card, deck.pop() as Card];
    const dealer: Card[] = [deck.pop() as Card, deck.pop() as Card];
    let stake = amount;

    // Natural blackjack resolves immediately (pays 3:2, or pushes vs a dealer natural).
    if (isBlackjack(player)) {
      const dealerNatural = isBlackjack(dealer);
      const payout = dealerNatural ? amount : Math.floor(amount * 2.5);
      await addWallet(guildId, userId, payout);
      await interaction.reply({
        embeds: [
          finalEmbed(player, dealer, dealerNatural ? 'push' : 'player_blackjack', amount, payout, config),
        ],
      });
      return;
    }

    // Resolve the round: dealer draws, we score, and pay the total return atomically.
    const resolve = async (btn: ButtonInteraction | null): Promise<void> => {
      playDealer(dealer, deck);
      const outcome = settleBlackjack(player, dealer);
      const payout = outcome === 'player_win' ? stake * 2 : outcome === 'push' ? stake : 0;
      await addWallet(guildId, userId, payout);
      const embed = finalEmbed(player, dealer, outcome, stake, payout, config);
      if (btn) await btn.update({ embeds: [embed], components: [] });
      else await interaction.editReply({ embeds: [embed], components: [] });
    };

    const canAffordDouble = eco.wallet >= amount * 2;
    await interaction.reply({
      embeds: [activeEmbed(player, dealer, config, stake)],
      components: [controls(canAffordDouble)],
    });
    const message = await interaction.fetchReply();

    let finished = false;
    while (!finished) {
      let btn: ButtonInteraction;
      try {
        btn = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === userId,
          time: DECISION_TIMEOUT_MS,
        });
      } catch {
        break; // timed out → auto-stand below
      }

      if (btn.customId === 'hit') {
        player.push(deck.pop() as Card);
        if (isBust(player)) {
          await resolve(btn);
          finished = true;
        } else {
          await btn.update({
            embeds: [activeEmbed(player, dealer, config, stake)],
            components: [controls(false)],
          });
        }
      } else if (btn.customId === 'double') {
        // Match the original bet, take exactly one card, then stand.
        if (!(await trySpendWallet(guildId, userId, amount))) {
          await btn.reply({
            embeds: [errorEmbed('Not enough in your wallet to double.')],
            flags: MessageFlags.Ephemeral,
          });
          continue;
        }
        stake += amount;
        player.push(deck.pop() as Card);
        await resolve(btn);
        finished = true;
      } else {
        // stand
        await resolve(btn);
        finished = true;
      }
    }
    if (!finished) await resolve(null); // timeout → stand with the current hand
  },
};

export default command;
