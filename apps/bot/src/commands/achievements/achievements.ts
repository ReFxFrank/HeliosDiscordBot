import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ACHIEVEMENT_TYPE_LABELS } from '@solari/shared';
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

    if (config.achievements.length === 0) {
      await interaction.reply({
        embeds: [brandedEmbed({ kind: 'info', description: 'No achievements have been set up yet.' })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { stats, unlocked } = await getAchievementStatus(interaction.guildId, target.id);
    const lines = config.achievements.map((a) => {
      const done = unlocked.has(a.id);
      const current = Math.min(statForType(a.type, stats), a.threshold);
      const progress = done
        ? '✅'
        : `\`${current.toLocaleString('en-US')}/${a.threshold.toLocaleString('en-US')}\``;
      return `${done ? '🏆' : '▫️'} **${a.name}** — ${ACHIEVEMENT_TYPE_LABELS[a.type]} ${a.threshold.toLocaleString('en-US')} · ${progress}`;
    });
    const unlockedCount = config.achievements.filter((a) => unlocked.has(a.id)).length;

    await interaction.reply({
      embeds: [
        brandedEmbed({
          kind: 'default',
          title: `🏆 ${target.username}'s achievements`,
          description: lines.join('\n'),
        }).setFooter({ text: `${unlockedCount}/${config.achievements.length} unlocked` }),
      ],
    });
  },
};

export default command;
