import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  ACHIEVEMENT_TIER_EMOJI,
  ACHIEVEMENT_TIER_LABELS,
  ACHIEVEMENT_TYPE_LABELS,
  isTieredAchievement,
  tierAt,
} from '@refx/shared';
import type { Command } from '../../framework/command';
import { RequireGuild } from '../../lib/permissions';
import { brandedEmbed } from '../../lib/embeds';
import { getAchievementStatus, statForType } from '../../modules/achievements';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription("Show a member's achievements and progress.")
    .addUserOption((o) => o.setName('user').setDescription('Whose achievements (defaults to you)')),
  module: 'ACHIEVEMENTS',
  preconditions: [RequireGuild],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const target = interaction.options.getUser('user') ?? interaction.user;
    const config = await ctx.config.getConfig(interaction.guildId, 'ACHIEVEMENTS');
    const achievements = config.achievements.filter((a) => a.enabled !== false);

    if (achievements.length === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({ kind: 'info', description: 'No achievements have been set up yet.' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { stats, unlocked } = await getAchievementStatus(interaction.guildId, target.id);
    let unlockedTiers = 0;
    let totalTiers = 0;

    const lines = achievements.map((a) => {
      const value = statForType(a.type, stats);
      const tiered = isTieredAchievement(a);
      totalTiers += a.tiers.length;

      // Badges for each tier (earned → medal, locked → ▫️) and the next target.
      const badges = a.tiers
        .map((_, i) => {
          const done = unlocked.has(`${a.id}:${i}`);
          if (done) unlockedTiers += 1;
          return done ? ACHIEVEMENT_TIER_EMOJI[tierAt(i)] : '▫️';
        })
        .join('');

      const nextIndex = a.tiers.findIndex((tier, i) => !unlocked.has(`${a.id}:${i}`));
      let progress: string;
      if (nextIndex === -1) {
        progress = 'Complete ✅';
      } else {
        const next = a.tiers[nextIndex]!;
        const label = tiered ? `${ACHIEVEMENT_TIER_LABELS[tierAt(nextIndex)]}: ` : '';
        progress = `${label}\`${Math.min(value, next.threshold).toLocaleString('en-US')}/${next.threshold.toLocaleString('en-US')}\``;
      }

      return `${tiered ? badges : unlocked.has(`${a.id}:0`) ? '🏆' : '▫️'} **${a.name}** — ${ACHIEVEMENT_TYPE_LABELS[a.type]} · ${progress}`;
    });

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: `🏆 ${target.username}'s achievements`,
          description: lines.join('\n'),
        }).setFooter({ text: `${unlockedTiers}/${totalTiers} tiers unlocked` }),
      ],
    });
  },
};

export default command;
