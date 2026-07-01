import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { isController } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume (0–150).')
    .addIntegerOption((o) =>
      o.setName('percent').setDescription('Volume percent').setMinValue(0).setMaxValue(150).setRequired(true),
    ),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const player = ctx.music?.getPlayer(interaction.guildId);
    if (!player) {
      await interaction.reply({
        embeds: [errorEmbed('Nothing is playing right now.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    if (!isController(interaction.member, config)) {
      await interaction.reply({
        embeds: [errorEmbed('Only DJs can change the volume.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const percent = interaction.options.getInteger('percent', true);
    await player.setVolume(percent);
    await interaction.reply({ embeds: [brandedEmbed({ kind: 'success', description: `🔊 Volume set to **${percent}%**.` })] });
  },
};

export default command;
