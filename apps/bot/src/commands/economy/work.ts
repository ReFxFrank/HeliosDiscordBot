import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from '@solari/shared';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { cooldownRemaining, formatDuration, formatMoney, getEconomyUser, tryClaimWork } from '../../lib/economy';
import { evaluateAchievements } from '../../modules/achievements';

const FLAVOURS = [
  'You delivered pizzas',
  'You walked some dogs',
  'You fixed a bug in production',
  'You streamed for a few hours',
  'You mowed the lawn',
  'You wrote some code',
  'You sold lemonade',
];

const command: Command = {
  data: new SlashCommandBuilder().setName('work').setDescription('Work for some quick cash.'),
  module: 'ECONOMY',
  preconditions: [RequireGuild, RequirePremium('ECONOMY')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const config = await ctx.config.getConfig(interaction.guildId, 'ECONOMY');
    await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);

    const min = config.workMin;
    const max = Math.max(config.workMin, config.workMax);
    const earned = min + Math.floor(Math.random() * (max - min + 1));
    const flavour = FLAVOURS[Math.floor(Math.random() * FLAVOURS.length)] ?? 'You worked hard';

    // Cooldown check + payout in one guarded write — concurrent /work can't double-pay.
    if (!(await tryClaimWork(interaction.guildId, interaction.user.id, earned, config.workCooldownSeconds))) {
      const eco = await getEconomyUser(interaction.guildId, interaction.user.id, config.startingBalance);
      await interaction.reply({
        embeds: [
          brandedEmbed({
            kind: 'warning',
            description: t(interaction.locale, 'workCooldown', {
              time: formatDuration(cooldownRemaining(eco.lastWork, config.workCooldownSeconds)),
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
          description: `🛠️ ${flavour} and earned ${formatMoney(earned, config)}.`,
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
