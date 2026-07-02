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
  CARD_BACK,
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

interface Hand {
  cards: Card[];
  stake: number;
  done: boolean;
}

function controls(canDouble: boolean, canSplit: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
  );
  if (canDouble) {
    row.addComponents(
      new ButtonBuilder().setCustomId('double').setLabel('Double Down').setStyle(ButtonStyle.Success),
    );
  }
  if (canSplit) {
    row.addComponents(
      new ButtonBuilder().setCustomId('split').setLabel('Split').setStyle(ButtonStyle.Success),
    );
  }
  return row;
}

function handName(index: number, total: number): string {
  return total > 1 ? `Hand ${index + 1}` : 'Your Hand';
}

function handField(name: string, cards: Card[], value: number | string) {
  return { name, value: `${renderHand(cards)}\n**Value:** ${value}`, inline: true };
}

function activeEmbed(
  hands: Hand[],
  activeIndex: number,
  dealer: Card[],
  config: EconomyConfig,
) {
  const totalStake = hands.reduce((sum, hand) => sum + hand.stake, 0);
  return brandedEmbed({ kind: 'default', title: '🃏 Blackjack' })
    .setDescription(
      `Bet: ${formatMoney(totalStake, config)} · ${hands.length > 1 ? `playing **Hand ${activeIndex + 1}**` : 'your move'}.`,
    )
    .addFields(
      ...hands.map((hand, index) =>
        handField(
          `${index === activeIndex ? '▶ ' : ''}${handName(index, hands.length)}`,
          hand.cards,
          handValue(hand.cards),
        ),
      ),
      {
        name: 'Dealer Hand',
        value: `${renderHand([dealer[0] as Card])} ${CARD_BACK}\n**Value:** ?`,
        inline: true,
      },
    );
}

function finalEmbed(
  hands: { cards: Card[]; stake: number; payout: number }[],
  dealer: Card[],
  config: EconomyConfig,
  titleOverride?: { kind: 'success' | 'info' | 'danger'; title: string },
) {
  const totalStake = hands.reduce((sum, hand) => sum + hand.stake, 0);
  const totalPayout = hands.reduce((sum, hand) => sum + hand.payout, 0);
  const net = totalPayout - totalStake;
  const meta =
    titleOverride ??
    (net > 0
      ? ({ kind: 'success', title: '🃏 You win! 🎉' } as const)
      : net === 0
        ? ({ kind: 'info', title: '🃏 Push' } as const)
        : ({ kind: 'danger', title: '🃏 Dealer wins' } as const));
  const line =
    net > 0
      ? `**You won ${formatMoney(net, config)}!**`
      : net === 0
        ? 'Your bet was returned.'
        : `**You lost ${formatMoney(-net, config)}.**`;
  return brandedEmbed({ kind: meta.kind, title: meta.title })
    .setDescription(line)
    .addFields(
      ...hands.map((hand, index) =>
        handField(handName(index, hands.length), hand.cards, handValue(hand.cards)),
      ),
      handField('Dealer Hand', dealer, handValue(dealer)),
    );
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
    if (!config.casino.blackjack) {
      await interaction.reply({
        embeds: [errorEmbed('Blackjack is disabled on this server.')],
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
    // Escrow the bet up-front so it can't be double-spent by a concurrent command.
    if (!(await trySpendWallet(guildId, userId, amount))) {
      await interaction.reply({
        embeds: [errorEmbed("You don't have that much in your wallet.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const deck = shuffle(createDeck());
    const firstCards: Card[] = [deck.pop() as Card, deck.pop() as Card];
    const dealer: Card[] = [deck.pop() as Card, deck.pop() as Card];

    // Natural blackjack resolves immediately (pays 3:2, or pushes vs a dealer natural).
    if (isBlackjack(firstCards)) {
      const dealerNatural = isBlackjack(dealer);
      const payout = dealerNatural ? amount : Math.floor(amount * config.casino.blackjackMultiplier);
      await addWallet(guildId, userId, payout);
      await interaction.reply({
        embeds: [
          finalEmbed(
            [{ cards: firstCards, stake: amount, payout }],
            dealer,
            config,
            dealerNatural
              ? { kind: 'info', title: '🃏 Push' }
              : { kind: 'success', title: '🃏 Blackjack! 🎉' },
          ),
        ],
      });
      return;
    }

    const hands: Hand[] = [{ cards: firstCards, stake: amount, done: false }];
    let split = false;

    await interaction.reply({
      embeds: [activeEmbed(hands, 0, dealer, config)],
      components: [controls(eco.wallet >= amount * 2, false)],
    });
    const message = await interaction.fetchReply();

    // Resolve every hand against one dealer draw and pay the total return.
    const resolveAll = async (btn: ButtonInteraction | null): Promise<void> => {
      playDealer(dealer, deck);
      const settled = hands.map((hand) => {
        if (isBust(hand.cards)) return { ...hand, payout: 0 };
        const outcome = settleBlackjack(hand.cards, dealer);
        // A 2-card 21 AFTER a split is a normal win (not a natural) — pays 1:1.
        const payout =
          outcome === 'player_win' || outcome === 'player_blackjack'
            ? hand.stake * 2
            : outcome === 'push'
              ? hand.stake
              : 0;
        return { ...hand, payout };
      });
      const totalPayout = settled.reduce((sum, hand) => sum + hand.payout, 0);
      if (totalPayout > 0) await addWallet(guildId, userId, totalPayout);
      const embed = finalEmbed(settled, dealer, config);
      if (btn) await btn.update({ embeds: [embed], components: [] });
      else await interaction.editReply({ embeds: [embed], components: [] });
    };

    let timedOut = false;
    for (let index = 0; index < hands.length && !timedOut; index++) {
      const hand = hands[index]!;
      let firstDecision = index === 0 && !split;
      while (!hand.done && !timedOut) {
        const pair =
          hand.cards.length === 2 && hand.cards[0]!.rank === hand.cards[1]!.rank && !split;
        const fresh = await getEconomyUser(guildId, userId, config.startingBalance);
        await interaction.editReply({
          embeds: [activeEmbed(hands, index, dealer, config)],
          components: [
            controls(firstDecision && fresh.wallet >= amount, pair && fresh.wallet >= amount),
          ],
        });

        let btn: ButtonInteraction;
        try {
          btn = await message.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === userId,
            time: DECISION_TIMEOUT_MS,
          });
        } catch {
          timedOut = true; // stand on everything left
          break;
        }
        firstDecision = false;

        if (btn.customId === 'hit') {
          hand.cards.push(deck.pop() as Card);
          if (isBust(hand.cards) || handValue(hand.cards) === 21) hand.done = true;
          await btn.deferUpdate();
        } else if (btn.customId === 'double') {
          // Match the original bet, take exactly one card, then stand.
          if (!(await trySpendWallet(guildId, userId, amount))) {
            await btn.reply({
              embeds: [errorEmbed('Not enough in your wallet to double.')],
              flags: MessageFlags.Ephemeral,
            });
            continue;
          }
          hand.stake += amount;
          hand.cards.push(deck.pop() as Card);
          hand.done = true;
          await btn.deferUpdate();
        } else if (btn.customId === 'split') {
          // Second stake, one pair card per hand, fresh card each. Split aces
          // get exactly one card and stand (classic rule); no re-splitting.
          if (!(await trySpendWallet(guildId, userId, amount))) {
            await btn.reply({
              embeds: [errorEmbed('Not enough in your wallet to split.')],
              flags: MessageFlags.Ephemeral,
            });
            continue;
          }
          split = true;
          const [left, right] = hand.cards as [Card, Card];
          const aces = left.rank === 'A';
          hand.cards = [left, deck.pop() as Card];
          hand.done = aces;
          hands.push({ cards: [right, deck.pop() as Card], stake: amount, done: aces });
          await btn.deferUpdate();
        } else {
          hand.done = true; // stand
          await btn.deferUpdate();
        }
      }
    }

    await resolveAll(null);
  },
};

export default command;
