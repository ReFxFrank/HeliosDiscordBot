import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { t } from '@solari/shared';
import type { Command } from '../../framework/command';
import { env } from '../../env';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { addWallet, formatDuration, formatMoney, getEconomyUser } from '../../lib/economy';

/** top.gg lets each user vote once per 12 hours. */
const VOTE_WINDOW_MS = 12 * 3_600_000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for the bot on top.gg and claim your reward.'),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    const voteUrl = `https://top.gg/bot/${env.TOPGG_BOT_ID ?? env.DISCORD_CLIENT_ID}/vote`;
    const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Vote on top.gg').setURL(voteUrl),
    );

    const vote = await ctx.prisma.topggVote.findFirst({
      where: {
        userId: interaction.user.id,
        votedAt: { gte: new Date(Date.now() - VOTE_WINDOW_MS) },
      },
      orderBy: { votedAt: 'desc' },
    });

    if (!vote) {
      const rewardLine =
        config.voteReward > 0
          ? `Come back after voting to claim **${formatMoney(config.voteReward, config)}** (double on weekends).`
          : 'Thanks for supporting the bot!';
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'info',
            title: '🗳️ Vote for Solari',
            description: `You can vote once every 12 hours. ${rewardLine}`,
          }),
        ],
        components: [linkRow],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (config.voteReward <= 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            description: 'Thanks for voting! Vote rewards are disabled on this server.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Guarded array push — a concurrent /vote can't claim the same vote twice
    // in one guild (the NOT/has filter makes the update match at most once).
    const claimed = await ctx.prisma.topggVote.updateMany({
      where: { id: vote.id, NOT: { claimedGuilds: { has: interaction.guildId } } },
      data: { claimedGuilds: { push: interaction.guildId } },
    });
    if (claimed.count === 0) {
      const nextAt = vote.votedAt.getTime() + VOTE_WINDOW_MS;
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'warning',
            description: t(interaction.locale, 'voteAlreadyClaimed', {
              time: formatDuration(nextAt - Date.now()),
            }),
          }),
        ],
        components: [linkRow],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const payout = config.voteReward * (vote.isWeekend ? 2 : 1);
    // Ensure the balance row exists before the atomic increment.
    await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);
    await addWallet(interaction.guildId, interaction.user.id, payout);
    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description:
            t(interaction.locale, 'voteThanks', { amount: formatMoney(payout, config) }) +
            (vote.isWeekend ? '\n_(weekend vote — doubled!)_' : ''),
        }),
      ],
    });
  },
};

export default command;
