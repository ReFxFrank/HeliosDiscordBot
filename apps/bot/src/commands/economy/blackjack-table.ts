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

interface Seat {
  userId: string;
  name: string;
  cards: Card[];
  /** 'playing' while it's (or will be) their turn. */
  state: 'playing' | 'stand' | 'bust' | 'blackjack';
}

function seatLine(seat: Seat, active: boolean): string {
  const marker = active ? '▶ ' : '';
  const status =
    seat.state === 'bust'
      ? ' · **BUST**'
      : seat.state === 'blackjack'
        ? ' · **BLACKJACK**'
        : seat.state === 'stand'
          ? ' · stands'
          : '';
  return `${marker}<@${seat.userId}> — ${renderHand(seat.cards)} (**${handValue(seat.cards)}**)${status}`;
}

function tableEmbed(
  seats: Seat[],
  dealer: Card[],
  config: EconomyConfig,
  bet: number,
  activeIndex: number | null,
  revealDealer: boolean,
) {
  const dealerLine = revealDealer
    ? `${renderHand(dealer)} (**${handValue(dealer)}**)`
    : `${renderHand([dealer[0] as Card])} ${CARD_BACK} (**?**)`;
  return brandedEmbed({ kind: 'default', title: '🃏 Blackjack Table' })
    .setDescription(
      [
        `Bet: ${formatMoney(bet, config)} per player`,
        '',
        `**Dealer:** ${dealerLine}`,
        '',
        ...seats.map((seat, index) => seatLine(seat, index === activeIndex)),
      ].join('\n'),
    )
    .setFooter({
      text: activeIndex === null ? 'Dealer plays…' : 'Hit or Stand — 30s per turn',
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
      const joined = new Map<string, string>([[hostId, interaction.user.displayName]]);
      const lobbyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('bj-join').setLabel('Join table').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj-start').setLabel('Deal now').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bj-cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      );
      const lobbyEmbed = () =>
        brandedEmbed({ kind: 'info', title: '🃏 Blackjack Table — taking seats' })
          .setDescription(
            [
              `<@${hostId}> opened a table. Bet: **${formatMoney(bet, config)}** per player.`,
              '',
              `**Players (${joined.size}/${MAX_PLAYERS}):** ${[...joined.keys()].map((id) => `<@${id}>`).join(' ')}`,
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
              joined.set(press.user.id, press.user.displayName);
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
      for (const [userId, name] of joined) {
        if (await trySpendWallet(guildId, userId, bet)) {
          seats.push({ userId, name, cards: [], state: 'playing' });
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
      // One deck per two players keeps the shoe from running out.
      const deck = shuffle(
        Array.from({ length: Math.max(1, Math.ceil(seats.length / 2)) }, createDeck).flat(),
      );
      const dealer: Card[] = [deck.pop() as Card, deck.pop() as Card];
      for (const seat of seats) {
        seat.cards = [deck.pop() as Card, deck.pop() as Card];
        if (isBlackjack(seat.cards)) seat.state = 'blackjack';
      }

      // ── Turns, in join order ─────────────────────────────────────────────
      const turnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('bj-hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj-stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
      );
      for (let index = 0; index < seats.length; index++) {
        const seat = seats[index]!;
        if (seat.state !== 'playing') continue; // natural blackjack sits out

        let turnOver = false;
        while (!turnOver) {
          await interaction.editReply({
            embeds: [tableEmbed(seats, dealer, config, bet, index, false)],
            components: [turnRow],
          });
          const press = await message
            .awaitMessageComponent({
              componentType: ComponentType.Button,
              filter: (i) =>
                i.user.id === seat.userId && (i.customId === 'bj-hit' || i.customId === 'bj-stand'),
              time: TURN_TIMEOUT_MS,
            })
            .catch(() => null);
          if (!press || press.customId === 'bj-stand') {
            seat.state = 'stand'; // timeout auto-stands
            turnOver = true;
            if (press) await press.deferUpdate();
            continue;
          }
          await press.deferUpdate();
          seat.cards.push(deck.pop() as Card);
          if (isBust(seat.cards)) {
            seat.state = 'bust';
            turnOver = true;
          } else if (handValue(seat.cards) === 21) {
            seat.state = 'stand';
            turnOver = true;
          }
        }
      }

      // ── Dealer + settlement ──────────────────────────────────────────────
      playDealer(dealer, deck);
      const lines: string[] = [];
      for (const seat of seats) {
        let payout: number;
        if (seat.state === 'bust') {
          payout = 0;
        } else if (seat.state === 'blackjack') {
          payout = isBlackjack(dealer) ? bet : Math.floor(bet * config.casino.blackjackMultiplier);
        } else {
          const outcome = settleBlackjack(seat.cards, dealer);
          payout = outcome === 'player_win' ? bet * 2 : outcome === 'push' ? bet : 0;
        }
        if (payout > 0) await addWallet(guildId, seat.userId, payout);
        const net = payout - bet;
        lines.push(
          net > 0
            ? `🎉 <@${seat.userId}> **+${formatMoney(net, config)}**`
            : net === 0
              ? `↔️ <@${seat.userId}> push`
              : `💥 <@${seat.userId}> −${formatMoney(bet, config)}`,
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
