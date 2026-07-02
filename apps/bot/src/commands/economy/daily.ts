import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from '@solari/shared';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { cooldownRemaining, formatDuration, formatMoney, getEconomyUser, tryClaimDaily } from '../../lib/economy';
import { evaluateAchievements } from '../../modules/achievements';

const DAY_SECONDS = 86_400;

const command: Command = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward.'),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    // Ensure the row exists so the atomic claim can match it.
    await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);

    // Income-role bonuses stack on top of the base daily payout.
    const bonus = config.incomeRoles.reduce(
      (sum, role) => (interaction.member.roles.cache.has(role.roleId) ? sum + role.dailyBonus : sum),
      0,
    );
    const payout = config.dailyAmount + bonus;

    // Cooldown check + grant in one guarded write — concurrent /daily can't double-claim.
    if (!(await tryClaimDaily(interaction.guildId, interaction.user.id, payout, DAY_SECONDS))) {
      const eco = await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'warning',
            description: t(interaction.locale, 'dailyAlreadyClaimed', {
              time: formatDuration(cooldownRemaining(eco.lastDaily, DAY_SECONDS)),
            }),
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'success',
          description:
            t(interaction.locale, 'dailyClaimed', { amount: formatMoney(payout, config) }) +
            (bonus > 0
              ? `\n${t(interaction.locale, 'dailyBonusNote', { amount: formatMoney(bonus, config) })}`
              : ''),
        }),
      ],
    });
    await evaluateAchievements(interaction.guildId, interaction.user.id, {
      client: ctx.client,
      logger: ctx.logger,
    });
  },
};

export default command;
