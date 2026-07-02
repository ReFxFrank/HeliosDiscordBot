import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type Message,
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

const JOIN_WINDOW_MS = 45_000;
const TURN_TIMEOUT_MS = 30_000;
const MAX_PLAYERS = 6;

/** One table per channel — a second /blackjack-table there is refused. */
const activeTables = new Set<string>();

type HandState = 'playing' | 'stand' | 'bust' | 'blackjack';

interface SeatHand {
  cards: Card[];
  state: HandState;
}

interface Seat {
  userId: string;
  /** Splitting adds a second hand (each carrying the table bet). */
  hands: SeatHand[];
}

function handSuffix(hand: SeatHand): string {
  return hand.state === 'bust'
    ? ' · **BUST**'
    : hand.state === 'blackjack'
      ? ' · **BLACKJACK**'
      : hand.state === 'stand'
        ? ' · stands'
        : '';
}

function seatLines(seat: Seat, active: { seat: Seat; hand: number } | null): string[] {
  return seat.hands.map((hand, index) => {
    const isActive = active !== null && active.seat === seat && active.hand === index;
    const marker = isActive ? '▶ ' : '';
    const label = seat.hands.length > 1 ? ` (hand ${index + 1})` : '';
    return `${marker}<@${seat.userId}>${label} — ${renderHand(hand.cards)} (**${handValue(hand.cards)}**)${handSuffix(hand)}`;
  });
}

function tableEmbed(
  seats: Seat[],
  dealer: Card[],
  config: EconomyConfig,
  bet: number,
  active: { seat: Seat; hand: number } | null,
  revealDealer: boolean,
) {
  const dealerLine = revealDealer
    ? `${renderHand(dealer)} (**${handValue(dealer)}**)`
    : `${renderHand([dealer[0] as Card])} ${CARD_BACK} (**?**)`;
  return brandedEmbed({ kind: 'default', title: '🃏 Blackjack Table' })
    .setDescription(
      [
        `Bet: ${formatMoney(bet, config)} per hand`,
        '',
        `**Dealer:** ${dealerLine}`,
        '',
        ...seats.flatMap((seat) => seatLines(seat, active)),
      ].join('\n'),
    )
    .setFooter({
      text: active === null ? 'Dealer plays…' : 'Hit, Stand, or Split — 30s per turn',
    });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack-table')
    .setDescription('Open a multiplayer blackjack table — friends join and play the same dealer.')
    .addIntegerOption((o) =>
      o.setName('bet').setDescription('Bet per player').setRequired(true).setMinValue(1),
    ),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const { guildId, channelId } = interaction;
    const hostId = interaction.user.id;
    const bet = interaction.options.getInteger('bet', true);
    const config = await ctx.config.getConfig(guildId, 'ECONOMY');
    if (!config.casino.blackjack) {
      await interaction.reply({
        embeds: [errorEmbed('Blackjack is disabled on this server.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (activeTables.has(channelId)) {
      await interaction.reply({
        embeds: [errorEmbed('There is already a blackjack table running in this channel.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const hostEco = await getEconomyUser(guildId, hostId, config.startingBalance);
    const betCheck = resolveBet(bet, hostEco.wallet, config.casino.maxBet, config.casino.minBet);
    if (!betCheck.ok) {
      await interaction.reply({ embeds: [errorEmbed(betCheck.error)], flags: MessageFlags.Ephemeral });
      return;
    }

    activeTables.add(channelId);
    try {
      // ── Lobby ───────────────────────────────────────────────────────────
      const joined = new Set<string>([hostId]);
      const lobbyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('bj-join').setLabel('Join table').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj-start').setLabel('Deal now').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bj-cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      );
      const lobbyEmbed = () =>
        brandedEmbed({ kind: 'info', title: '🃏 Blackjack Table — taking seats' }).setDescription(
          [
            `<@${hostId}> opened a table. Bet: **${formatMoney(bet, config)}** per player.`,
            '',
            `**Players (${joined.size}/${MAX_PLAYERS}):** ${[...joined].map((id) => `<@${id}>`).join(' ')}`,
            '',
            `Dealing in ${Math.round(JOIN_WINDOW_MS / 1000)}s — or when the host hits **Deal now**.`,
          ].join('\n'),
        );
      await interaction.reply({ embeds: [lobbyEmbed()], components: [lobbyRow] });
      const message: Message = await interaction.fetchReply();

      const cancelled = await new Promise<boolean>((resolve) => {
        const collector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: JOIN_WINDOW_MS,
        });
        collector.on('collect', (press: ButtonInteraction) => {
          void (async () => {
            if (press.customId === 'bj-join') {
              if (joined.has(press.user.id)) {
                await press.reply({ content: 'You already have a seat.', flags: MessageFlags.Ephemeral });
                return;
              }
              if (joined.size >= MAX_PLAYERS) {
                await press.reply({ content: 'The table is full.', flags: MessageFlags.Ephemeral });
                return;
              }
              const eco = await getEconomyUser(guildId, press.user.id, config.startingBalance);
              if (eco.wallet < bet) {
                await press.reply({
                  content: `You need ${formatMoney(bet, config)} in your wallet to sit down.`,
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              joined.add(press.user.id);
              await press.update({ embeds: [lobbyEmbed()], components: [lobbyRow] });
              if (joined.size >= MAX_PLAYERS) collector.stop('start');
              return;
            }
            if (press.user.id !== hostId) {
              await press.reply({ content: 'Only the host can do that.', flags: MessageFlags.Ephemeral });
              return;
            }
            collector.stop(press.customId === 'bj-cancel' ? 'cancel' : 'start');
            await press.deferUpdate();
          })().catch(() => undefined);
        });
        collector.on('end', (_collected, reason) => resolve(reason === 'cancel'));
      });

      if (cancelled) {
        await interaction.editReply({
          embeds: [brandedEmbed({ kind: 'info', title: '🃏 Blackjack Table', description: 'Table cancelled.' })],
          components: [],
        });
        return;
      }

      // ── Escrow every seat (drop anyone whose wallet no longer covers it) ─
      const seats: Seat[] = [];
      const dropped: string[] = [];
      for (const userId of joined) {
        if (await trySpendWallet(guildId, userId, bet)) {
          seats.push({ userId, hands: [] });
        } else {
          dropped.push(userId);
        }
      }
      if (seats.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed('Nobody could cover the bet — table closed.')],
          components: [],
        });
        return;
      }

      // ── Deal ─────────────────────────────────────────────────────────────
      // One deck per two players keeps the shoe from running out (splits included).
      const deck = shuffle(
        Array.from({ length: Math.max(1, Math.ceil(seats.length / 2) + 1) }, createDeck).flat(),
      );
      const dealer: Card[] = [deck.pop() as Card, deck.pop() as Card];
      for (const seat of seats) {
        const cards: Card[] = [deck.pop() as Card, deck.pop() as Card];
        seat.hands = [{ cards, state: isBlackjack(cards) ? 'blackjack' : 'playing' }];
      }

      // ── Turns, in join order (a split hand plays right after the first) ──
      const baseRow = () =>
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('bj-hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('bj-stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
        );
      for (const seat of seats) {
        for (let handIndex = 0; handIndex < seat.hands.length; handIndex++) {
          const hand = seat.hands[handIndex]!;
          while (hand.state === 'playing') {
            const canSplit =
              seat.hands.length === 1 &&
              hand.cards.length === 2 &&
              hand.cards[0]!.rank === hand.cards[1]!.rank &&
              (await getEconomyUser(guildId, seat.userId, config.startingBalance)).wallet >= bet;
            const row = baseRow();
            if (canSplit) {
              row.addComponents(
                new ButtonBuilder().setCustomId('bj-split').setLabel('Split').setStyle(ButtonStyle.Success),
              );
            }
            await interaction.editReply({
              embeds: [tableEmbed(seats, dealer, config, bet, { seat, hand: handIndex }, false)],
              components: [row],
            });
            const press = await message
              .awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (i) => i.user.id === seat.userId && i.customId.startsWith('bj-'),
                time: TURN_TIMEOUT_MS,
              })
              .catch(() => null);
            if (!press || press.customId === 'bj-stand') {
              hand.state = 'stand'; // timeout auto-stands
              if (press) await press.deferUpdate();
              continue;
            }
            await press.deferUpdate();
            if (press.customId === 'bj-split') {
              // Second stake for the second hand; split aces take one card each.
              if (!canSplit || !(await trySpendWallet(guildId, seat.userId, bet))) continue;
              const [left, right] = hand.cards as [Card, Card];
              const aces = left.rank === 'A';
              hand.cards = [left, deck.pop() as Card];
              if (aces) hand.state = 'stand';
              seat.hands.push({
                cards: [right, deck.pop() as Card],
                state: aces ? 'stand' : 'playing',
              });
              continue;
            }
            // hit
            hand.cards.push(deck.pop() as Card);
            if (isBust(hand.cards)) hand.state = 'bust';
            else if (handValue(hand.cards) === 21) hand.state = 'stand';
          }
        }
      }

      // ── Dealer + settlement (each hand carries the table bet) ────────────
      playDealer(dealer, deck);
      const lines: string[] = [];
      for (const seat of seats) {
        let stakeTotal = 0;
        let payoutTotal = 0;
        for (const hand of seat.hands) {
          stakeTotal += bet;
          if (hand.state === 'bust') continue;
          if (hand.state === 'blackjack') {
            payoutTotal += isBlackjack(dealer) ? bet : Math.floor(bet * config.casino.blackjackMultiplier);
            continue;
          }
          const outcome = settleBlackjack(hand.cards, dealer);
          // A 2-card 21 after a split is a normal win, not a natural.
          payoutTotal +=
            outcome === 'player_win' || outcome === 'player_blackjack'
              ? bet * 2
              : outcome === 'push'
                ? bet
                : 0;
        }
        if (payoutTotal > 0) await addWallet(guildId, seat.userId, payoutTotal);
        const net = payoutTotal - stakeTotal;
        lines.push(
          net > 0
            ? `🎉 <@${seat.userId}> **+${formatMoney(net, config)}**`
            : net === 0
              ? `↔️ <@${seat.userId}> push`
              : `💥 <@${seat.userId}> −${formatMoney(-net, config)}`,
        );
      }
      if (dropped.length > 0) {
        lines.push(`⚠️ Couldn't cover the bet: ${dropped.map((id) => `<@${id}>`).join(' ')}`);
      }

      await interaction.editReply({
        embeds: [
          tableEmbed(seats, dealer, config, bet, null, true)
            .setTitle('🃏 Blackjack Table — results')
            .addFields({ name: 'Results', value: lines.join('\n') }),
        ],
        components: [],
      });
    } finally {
      activeTables.delete(channelId);
    }
  },
};

export default command;
